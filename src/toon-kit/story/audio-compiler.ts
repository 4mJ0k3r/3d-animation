import { freezeData } from '../characters/pose';
import { generateWordTimings } from '../captions';
import type { CaptionWord } from '../captions';
import type { StoryPlan, StoryCue } from './types';
import { storyFail } from './types';
import type { CompiledAudioClip, StoryAudioAsset } from './audio-types';
import { AUDIO_LIMITS } from './audio-types';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: unknown, fields: readonly string[]) => {
  if (!object(v) || Object.keys(v).some(k => !fields.includes(k))) storyFail('INVALID_AUDIO', 'Invalid/unknown audio fields');
};
const id = (v: unknown) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(v)) storyFail('INVALID_AUDIO', 'Invalid audio identifier');
};
export function validateAudioAsset(a: StoryAudioAsset) {
  keys(a, ['src', 'durationInSeconds']);
  if (typeof a.src !== 'string' || a.src.length > 256 || !/^audio\/(?:[\p{L}\p{N}_ -]+\/)*[\p{L}\p{N}_ -]+\.(?:wav|mp3|m4a|ogg)$/u.test(a.src) || !Number.isFinite(a.durationInSeconds) || a.durationInSeconds <= 0 || a.durationInSeconds > AUDIO_LIMITS.sourceSeconds) storyFail('INVALID_AUDIO_ASSET', 'Use a local public/audio WAV, MP3, M4A or Ogg file and finite duration <=120s');
}
/** Nearest integer boundary; the same rule applies to starts and ends. Never stretch tiny words. */
export function speechSecondsToFrame(seconds: number, fps: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > AUDIO_LIMITS.sourceSeconds || !Number.isInteger(fps) || fps < 1 || fps > 60) storyFail('INVALID_ALIGNMENT', 'Invalid timestamp/timebase');
  return Math.round(seconds * fps);
}
export function compileStoryAudio(plan: StoryPlan, cues: readonly StoryCue[], cueIds: readonly string[]) {
  const audio = plan.audio,
    assets = audio?.assets ?? {},
    clips: CompiledAudioClip[] = [],
    words: CaptionWord[] = [],
    timing: {
      id: string;
      source: 'supplied' | 'estimated' | 'authored';
      clip?: string;
    }[] = [];
  if (audio) {
    keys(audio, ['assets', 'clips', 'alignments']);
    if (!object(audio.assets) || !Object.keys(audio.assets).length || Object.keys(audio.assets).length > AUDIO_LIMITS.assets || !Array.isArray(audio.clips) || !audio.clips.length || audio.clips.length > AUDIO_LIMITS.clips || audio.alignments !== undefined && !Array.isArray(audio.alignments)) storyFail('INVALID_AUDIO', 'Invalid audio registry or budget');
    for (const [key, a] of Object.entries(assets)) {
      id(key);
      validateAudioAsset(a);
    }
    const ids = new Set<string>();
    for (const c of audio.clips) {
      keys(c, ['id', 'kind', 'asset', 'speaker', 'startFrame', 'endFrame', 'trimBeforeFrames', 'volume']);
      id(c.id);
      id(c.asset);
      const trim = c.trimBeforeFrames ?? 0,
        volume = c.volume ?? 1,
        asset = assets[c.asset];
      if (ids.has(c.id) || !asset || !['narration', 'dialogue'].includes(c.kind) || !Number.isInteger(c.startFrame) || !Number.isInteger(c.endFrame) || c.startFrame < 0 || c.endFrame <= c.startFrame || c.endFrame > plan.durationInFrames || !Number.isInteger(trim) || trim < 0 || trim + c.endFrame - c.startFrame > asset.durationInSeconds * plan.fps + 1e-8 || !Number.isFinite(volume) || volume < 0 || volume > 1) storyFail('INVALID_AUDIO_CLIP', 'Invalid/duplicate clip, placement, trim or volume', {
        details: c.id
      });
      if (c.speaker !== undefined) id(c.speaker);
      if (c.kind === 'dialogue' && (!c.speaker || !Object.hasOwn(plan.characters, c.speaker))) storyFail('INVALID_AUDIO_SPEAKER', 'Dialogue needs a declared actor speaker');
      ids.add(c.id);
      clips.push({
        ...c,
        trimBeforeFrames: trim,
        volume
      });
    }
    for (const name of Object.keys(assets)) if (!clips.some(c => c.asset === name)) storyFail('UNUSED_AUDIO', 'Unused assets are not loaded');
    clips.sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
    for (let i = 0; i < clips.length; i++) for (let j = i + 1; j < clips.length; j++) if (clips[j].startFrame < clips[i].endFrame && clips[i].startFrame < clips[j].endFrame && (clips[i].kind === 'narration' && clips[j].kind === 'narration' || clips[i].speaker !== undefined && clips[i].speaker === clips[j].speaker)) storyFail('AUDIO_CONFLICT', 'Overlapping narration or same-speaker clips');
    for (let frame = 0; frame < plan.durationInFrames; frame++) if (clips.filter(c => frame >= c.startFrame && frame < c.endFrame).reduce((n, c) => n + c.volume, 0) > 1 + 1e-8) storyFail('AUDIO_GAIN_LIMIT', 'Combined track gain exceeds 1; set explicit lower volumes', {
      frame
    });
  }
  const alignments = audio?.alignments ?? [],
    used = new Set<string>();
  if (alignments.length > cues.length) storyFail('INVALID_ALIGNMENT', 'Unused alignment entries');
  for (const a of alignments) {
    keys(a, ['alignmentId', 'clip', 'text', 'language', 'speaker', 'words']);
    id(a.alignmentId);
    id(a.clip);
    if (used.has(a.alignmentId)) storyFail('INVALID_ALIGNMENT', 'Duplicate alignment');
    used.add(a.alignmentId);
  }
  for (const [i, cue] of cues.entries()) {
    const alignment = alignments.find(a => a.alignmentId === cueIds[i]);
    if (cue.timing === 'supplied') {
      if (cue.mode !== 'words' || !alignment) storyFail('MISSING_ALIGNMENT', 'Supplied word captions need an alignment entry', {
        details: cueIds[i]
      });
      const clip = clips.find(c => c.id === alignment.clip),
        tokens = cue.text.trim().split(/\s+/u);
      if (!clip || cue.kind === 'dialogue' && clip.kind !== 'dialogue' || alignment.text !== cue.text || alignment.language !== cue.language || alignment.speaker !== cue.speaker || clip.speaker !== alignment.speaker || !Array.isArray(alignment.words) || alignment.words.length !== tokens.length || cue.startFrame < clip.startFrame || cue.endFrame > clip.endFrame) storyFail('ALIGNMENT_MISMATCH', 'Cue, speaker, language, text and audio clip must agree', {
        details: cueIds[i]
      });
      let end = 0;
      for (const [j, w] of alignment.words.entries()) {
        keys(w, ['text', 'startSeconds', 'endSeconds']);
        if (w.text !== tokens[j] || !Number.isFinite(w.startSeconds) || !Number.isFinite(w.endSeconds) || w.startSeconds < end || w.endSeconds <= w.startSeconds || w.endSeconds > assets[clip.asset].durationInSeconds || w.startSeconds * plan.fps < clip.trimBeforeFrames - 1e-8 || w.endSeconds * plan.fps > clip.trimBeforeFrames + clip.endFrame - clip.startFrame + 1e-8) storyFail('INVALID_ALIGNMENT', 'Word order, punctuation or source timestamps do not match playable audio', {
          details: {
            id: cueIds[i],
            word: j
          }
        });
        const startFrame = clip.startFrame + speechSecondsToFrame(w.startSeconds, plan.fps) - clip.trimBeforeFrames,
          endFrame = clip.startFrame + speechSecondsToFrame(w.endSeconds, plan.fps) - clip.trimBeforeFrames;
        if (endFrame <= startFrame || startFrame < cue.startFrame || endFrame > cue.endFrame) storyFail('ALIGNMENT_QUANTIZATION', 'Word collapses or falls outside cue after frame quantization');
        words.push({
          text: w.text,
          startFrame,
          endFrame
        });
        end = w.endSeconds;
      }
      timing.push({
        id: cueIds[i],
        source: 'supplied',
        clip: clip.id
      });
      used.delete(cueIds[i]);
    } else {
      if (alignment) storyFail('ALIGNMENT_MISMATCH', 'Alignment present but cue is not explicitly supplied');
      if (cue.mode === 'words' && cue.timing !== 'estimated') storyFail('TIMING_REQUIRED', 'Equal-spacing word captions require timing:"estimated"; use supplied timestamps for speech sync');
      words.push(...(cue.mode === 'words' ? generateWordTimings(cue.text, cue.startFrame, cue.endFrame - cue.startFrame) : [{
        text: cue.text,
        startFrame: cue.startFrame,
        endFrame: cue.endFrame
      }]));
      timing.push({
        id: cueIds[i],
        source: cue.mode === 'words' ? 'estimated' : 'authored'
      });
    }
  }
  if (used.size) storyFail('INVALID_ALIGNMENT', 'Unmatched alignment IDs');
  // Precomputed immutable active lists: no media work or audio allocations during sampling.
  const byFrame = Array.from({
    length: plan.durationInFrames
  }, (_, frame) => clips.filter(c => frame >= c.startFrame && frame < c.endFrame));
  return freezeData({
    assets,
    clips,
    byFrame,
    captionWords: words,
    captionTiming: timing
  });
}
