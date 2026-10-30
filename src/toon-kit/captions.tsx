import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

export interface CaptionWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface ToonCaptionsProps {
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
  s = Math.imul((s ^ (s >>> 15)) | 1, 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}

/**
 * Automatically splits a phrase into equal duration 1-word-at-a-time chunks
 */
export function generateWordTimings(
  sentence: string,
  startFrame: number,
  durationInFrames: number
): CaptionWord[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const framesPerWord = Math.max(1, Math.floor(durationInFrames / words.length));

  return words.map((text, i) => {
    const s = startFrame + i * framesPerWord;
    const e = i === words.length - 1 ? startFrame + durationInFrames : s + framesPerWord;
    return { text, startFrame: s, endFrame: e };
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
  fontSize = 68,
  bottom = 80,
  fontFamily = '"Arial Black", "Impact", "Montserrat Black", sans-serif',
  strokeWidth = 4,
  scalePunch = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // If raw text is provided instead of explicit word timings, distribute evenly
  const resolvedWords: CaptionWord[] = React.useMemo(() => {
    if (words && words.length > 0) return words;
    if (text) return generateWordTimings(text, 0, durationInFrames);
    return [];
  }, [words, text, durationInFrames]);

  // Find active single word for the current frame
  const activeWord = resolvedWords.find(
    (w) => frame >= w.startFrame && frame < w.endFrame
  );

  if (!activeWord) {
    return null;
  }

  // Punchy deterministic cartoon spring pop on word entry
  const framesSinceStart = frame - activeWord.startFrame;
  let scale = 1.0;
  if (scalePunch && framesSinceStart >= 0 && framesSinceStart <= 6) {
    // 1.18 -> 1.0 decay over 6 frames
    const decay = 1 - framesSinceStart / 6;
    scale = 1.0 + 0.18 * decay;
  }

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: typeof bottom === 'number' ? `${bottom}px` : bottom,
    left: '50%',
    transform: `translateX(-50%) scale(${scale})`,
    transformOrigin: 'center bottom',
    pointerEvents: 'none',
    textAlign: 'center',
    zIndex: 9999,
    width: '90%',
    userSelect: 'none',
  };

  const textStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${fontSize}px`,
    fontWeight: 900,
    textTransform: 'uppercase',
    color: '#ffffff',
    WebkitTextStroke: `${strokeWidth}px #000000`,
    letterSpacing: '2px',
    lineHeight: 1.1,
    textShadow: `
      -3px -3px 0 #000,  
       3px -3px 0 #000,
      -3px  3px 0 #000,
       3px  3px 0 #000,
       0px  6px 14px rgba(0, 0, 0, 0.75)
    `,
    display: 'inline-block',
  };

  return (
    <div style={containerStyle}>
      <span style={textStyle}>{activeWord.text}</span>
    </div>
  );
};

