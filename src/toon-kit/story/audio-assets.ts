import { staticFile } from 'remotion';
import type { CartoonEngine } from '../engine';
import type { CompiledStory } from './compiler';
import { AUDIO_LIMITS } from './audio-types';
import type { StoryAudioAsset } from './audio-types';
import { StoryError, storyFail } from './types';
export interface AudioAssetMetadata {
  readonly durationInSeconds: number;
  readonly bytes: number;
  readonly src: string;
}
export interface PreparedStoryAudio {
  readonly timeline: CompiledStory;
  readonly assets: Readonly<Record<string, AudioAssetMetadata>>;
  assertReady(timeline?: CompiledStory, owner?: Pick<CartoonEngine, 'signal'>): void;
  dispose(): void;
}
const mime = (src: string) => ({
  'wav': 'audio/wav',
  'mp3': 'audio/mpeg',
  'm4a': 'audio/mp4',
  'ogg': 'audio/ogg'
})[src.split('.').at(-1)!]!;
/** One bounded fetch and one short-lived metadata/decoder probe per distinct asset. */
export async function probeStoryAudioAsset(asset: StoryAudioAsset, signal: AbortSignal): Promise<AudioAssetMetadata> {
  signal.throwIfAborted();
  if (typeof document === 'undefined') storyFail('AUDIO_BROWSER_REQUIRED', 'Prepare media inside the Remotion browser before capture');
  const src = staticFile(asset.src),
    expected = new URL(src, location.href);
  if (expected.origin !== location.origin) storyFail('INVALID_AUDIO_ASSET', 'Audio must be served by the local workspace bundle');
  const response = await fetch(src, {
    signal,
    redirect: 'error'
  });
  if (!response.ok || !response.body) storyFail('AUDIO_ASSET_MISSING', `Cannot load ${asset.src}: HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > AUDIO_LIMITS.bytesPerAsset) {
    await response.body.cancel();
    storyFail('AUDIO_BUDGET', 'Audio file exceeds 16 MiB');
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > AUDIO_LIMITS.bytesPerAsset) storyFail('AUDIO_BUDGET', 'Audio file exceeds 16 MiB');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!bytes) storyFail('INVALID_AUDIO_ASSET', 'Empty audio file');
  const url = URL.createObjectURL(new Blob(chunks, {
    type: mime(asset.src)
  }));
  try {
    const durationInSeconds = await new Promise<number>((resolve, reject) => {
      const media = document.createElement('audio');
      let done = false;
      const finish = (error?: unknown) => {
        if (done) return;
        done = true;
        const duration = media.duration;
        signal.removeEventListener('abort', abort);
        media.removeEventListener('loadeddata', ready);
        media.removeEventListener('error', fail);
        media.pause();
        media.removeAttribute('src');
        media.load();
        if (error) reject(error);else if (!Number.isFinite(duration) || duration <= 0) reject(new StoryError({
          code: 'INVALID_AUDIO_ASSET',
          message: 'Invalid media duration'
        }));else resolve(duration);
      };
      const abort = () => finish(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      const ready = () => finish();
      const fail = () => finish(new StoryError({
        code: 'INVALID_AUDIO_ASSET',
        message: `Unsupported/corrupt media: ${asset.src}`,
        details: media.error?.code
      }));
      signal.addEventListener('abort', abort, {
        once: true
      });
      media.addEventListener('loadeddata', ready);
      media.addEventListener('error', fail);
      if (signal.aborted) {
        abort();
        return;
      }
      if (!media.canPlayType(mime(asset.src))) {
        fail();
        return;
      }
      media.preload = 'auto';
      media.src = url;
      media.load();
    });
    return Object.freeze({
      durationInSeconds,
      bytes,
      src
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
/** Attach to the existing readiness barrier; disposal aborts work without waiting. */
export function prepareStoryAudio(engine: Pick<CartoonEngine, 'signal' | 'registerReady' | 'registerCleanup'>, timeline: CompiledStory): Promise<PreparedStoryAudio> {
  const controller = new AbortController();
  let dead = false;
  const dispose = () => {
    if (dead) return;
    dead = true;
    engine.signal.removeEventListener('abort', dispose);
    controller.abort(new DOMException('Story audio disposed', 'AbortError'));
  };
  engine.signal.addEventListener('abort', dispose, {
    once: true
  });
  engine.registerCleanup(dispose);
  if (engine.signal.aborted) dispose();
  const promise = (async () => {
    const metadata: Record<string, AudioAssetMetadata> = {},
      cache = new Map<string, AudioAssetMetadata>();
    let total = 0;
    try {
      for (const [id, a] of Object.entries(timeline.audio.assets)) {
        controller.signal.throwIfAborted();
        const fresh = !cache.has(a.src),
          result = cache.get(a.src) ?? (await probeStoryAudioAsset(a, controller.signal));
        if (Math.abs(result.durationInSeconds - a.durationInSeconds) > 1 / timeline.plan.fps) storyFail('AUDIO_DURATION_MISMATCH', `Declared and measured duration differ: ${a.src}`, {
          details: {
            declared: a.durationInSeconds,
            measured: result.durationInSeconds
          }
        });
        for (const c of timeline.audio.clips.filter(c => c.asset === id)) if ((c.trimBeforeFrames + c.endFrame - c.startFrame) / timeline.plan.fps > result.durationInSeconds + 1e-8) storyFail('AUDIO_DURATION_MISMATCH', 'Trim exceeds measured playable duration');
        if (fresh) {
          total += result.bytes;
          cache.set(a.src, result);
        }
        if (total > AUDIO_LIMITS.totalBytes) storyFail('AUDIO_BUDGET', 'Audio registry exceeds 32 MiB');
        metadata[id] = result;
      }
      controller.signal.throwIfAborted();
      return Object.freeze({
        timeline,
        assets: Object.freeze(metadata),
        assertReady(expected?: CompiledStory, owner?: Pick<CartoonEngine, 'signal'>) {
          if (dead) storyFail('AUDIO_DISPOSED', 'Audio preparation has been disposed');
          if (expected && expected !== timeline) storyFail('AUDIO_TIMELINE_MISMATCH', 'Prepared audio belongs to another compiled story');
          if (owner && owner !== engine) storyFail('AUDIO_OWNER_MISMATCH', 'Prepared audio belongs to another engine');
        },
        dispose
      });
    } catch (error) {
      dispose();
      if (error instanceof StoryError || engine.signal.aborted) throw error;
      throw new StoryError({
        code: 'AUDIO_LOAD_FAILED',
        message: 'Audio preparation failed',
        details: String(error)
      });
    }
  })();
  return engine.registerReady(promise);
}
