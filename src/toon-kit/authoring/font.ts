import { staticFile } from 'remotion';
import type { CartoonEngine } from '../engine';
import { storyFail } from '../story/types';
export const STORY_FONT = Object.freeze({
  family: 'ToonKit Story Devanagari',
  src: 'fonts/noto-devanagari/NotoSansDevanagari.ttf',
  sha256: '14ec4af41f27482216d1c2229f417ff9b1425e1babb014e57d1d40d03229853e',
  bytes: 641944,
  license: 'fonts/noto-devanagari/OFL.txt'
});
export function prepareStoryFont(engine: Pick<CartoonEngine, 'signal' | 'registerReady' | 'registerCleanup'>) {
  const promise = (async () => {
    engine.signal.throwIfAborted();
    const response = await fetch(staticFile(STORY_FONT.src), {
      signal: engine.signal,
      redirect: 'error'
    });
    if (!response.ok || !response.body) storyFail('FONT_UNAVAILABLE', 'Restore bundled ' + STORY_FONT.src + ' and OFL.txt');
    const reader = response.body.getReader(),
      chunks: Uint8Array<ArrayBuffer>[] = [];
    let count = 0;
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        count += r.value.length;
        if (count > STORY_FONT.bytes) storyFail('FONT_INTEGRITY', 'Bundled font has changed; restore the pinned file');
        chunks.push(r.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    if (digest !== STORY_FONT.sha256) storyFail('FONT_INTEGRITY', 'Bundled font checksum differs; restore the pinned OFL font');
    const face = new FontFace(STORY_FONT.family, bytes, {
      weight: '100 900'
    });
    await face.load();
    engine.signal.throwIfAborted();
    document.fonts.add(face);
    engine.registerCleanup(() => {
      document.fonts.delete(face);
    });
    await document.fonts.ready;
    engine.signal.throwIfAborted();
    if (!document.fonts.check(`900 32px "${STORY_FONT.family}"`, 'हिन्दी Hello')) storyFail('FONT_UNAVAILABLE', 'Bundled Devanagari font did not become ready');
    return STORY_FONT.family;
  })();
  return engine.registerReady(promise);
}
