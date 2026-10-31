/** Seconds refer to the untrimmed source file. Text retains punctuation/case. */
export interface SpeechWord {
  readonly text: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}
export interface SpeechContent {
  readonly text: string;
  readonly language: 'hi' | 'en';
  readonly speaker?: string;
  readonly words: readonly SpeechWord[];
}
export interface StoryAudioAsset {
  /** Relative path under public/audio; URLs, traversal and symlinks are unsupported. */
  readonly src: string;
  readonly durationInSeconds: number;
}
/** Provider-neutral output contract. No TTS/ASR implementation is included. */
export interface SpeechRecording extends SpeechContent {
  readonly asset: StoryAudioAsset;
}
export interface StoryAudioClip {
  readonly id: string;
  readonly kind: 'narration' | 'dialogue';
  readonly asset: string;
  readonly speaker?: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly trimBeforeFrames?: number;
  readonly volume?: number;
}
export interface StorySpeechAlignment extends SpeechContent {
  readonly alignmentId: string;
  readonly clip: string;
}
export interface StoryAudioPlan {
  readonly assets: Readonly<Record<string, StoryAudioAsset>>;
  readonly clips: readonly StoryAudioClip[];
  readonly alignments?: readonly StorySpeechAlignment[];
}
export interface CompiledAudioClip extends StoryAudioClip {
  readonly trimBeforeFrames: number;
  readonly volume: number;
}
export const AUDIO_LIMITS = Object.freeze({
  assets: 16,
  clips: 64,
  bytesPerAsset: 16 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  sourceSeconds: 120
});
