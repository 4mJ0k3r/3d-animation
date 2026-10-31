import React from 'react';
import { CAPTION_STYLE, captionStyles, captionPunch } from './caption-style';
import type { CaptionLayout } from './caption-layout';
import { useCurrentFrame, useVideoConfig } from 'remotion';
export interface CaptionWord {
  text: string;
  startFrame: number;
  endFrame: number;
}
export interface ToonCaptionsProps {
  layout?: CaptionLayout;
  sourceFrame?: number;
  words?: CaptionWord[];
  text?: string;
  fontSize?: number;
  bottom?: number | string;
  fontFamily?: string;
  strokeWidth?: number;
  scalePunch?: boolean;
}

/**
 * Deterministic pseudo-random number generator (Mulberry32)
 * Ensures 100% deterministic generation with no Math.random() clock variance.
 */
export function deterministicRandom(seed: number): number {
  let s = Math.imul(seed ^ 0x6d2b79f5, 1);
  s = Math.imul(s ^ s >>> 15 | 1, 1);
  s ^= s + Math.imul(s ^ s >>> 7, s | 61);
  return ((s ^ s >>> 14) >>> 0) / 4294967296;
}

/**
 * Automatically splits a phrase into equal duration 1-word-at-a-time chunks
 */
export function generateWordTimings(sentence: string, startFrame: number, durationInFrames: number): CaptionWord[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const framesPerWord = Math.max(1, Math.floor(durationInFrames / words.length));
  return words.map((text, i) => {
    const s = startFrame + i * framesPerWord;
    const e = i === words.length - 1 ? startFrame + durationInFrames : s + framesPerWord;
    return {
      text,
      startFrame: s,
      endFrame: e
    };
  });
}

/**
 * ToonCaptions:
 * Heavy white font with thick black ink stroke, bottom-center positioned,
 * displaying exactly 1 word at a time with a punchy cartoon kinetic scale pop.
 */
export const ToonCaptions: React.FC<ToonCaptionsProps> = ({
  words,
  text,
  layout,
  sourceFrame,
  fontSize = CAPTION_STYLE.fontSize,
  bottom = CAPTION_STYLE.bottom,
  fontFamily = CAPTION_STYLE.fontFamily,
  strokeWidth = CAPTION_STYLE.strokeWidth,
  scalePunch = true
}) => {
  const remotionFrame = useCurrentFrame();
  const frame = sourceFrame ?? remotionFrame;
  const {
    durationInFrames
  } = useVideoConfig();

  // If raw text is provided instead of explicit word timings, distribute evenly
  const resolvedWords: CaptionWord[] = React.useMemo(() => {
    if (layout) return layout.words.map(w => ({
      text: w.text,
      startFrame: w.startFrame,
      endFrame: w.endFrame
    }));
    if (words && words.length > 0) return words;
    if (text) return generateWordTimings(text, 0, durationInFrames);
    return [];
  }, [layout, words, text, durationInFrames]);

  // Find active single word for the current frame
  const activeWord = resolvedWords.find(w => frame >= w.startFrame && frame < w.endFrame);
  if (!activeWord) {
    return null;
  }
  const style = layout?.style ?? {
    fontSize,
    bottom,
    fontFamily,
    strokeWidth,
    scalePunch
  };
  const scale = captionPunch(frame - activeWord.startFrame, style.scalePunch);
  const {
    container: containerStyle,
    text: textStyle
  } = captionStyles(style, scale);
  return <div style={containerStyle}>
      <span style={textStyle}>{activeWord.text}</span>
    </div>;
};
