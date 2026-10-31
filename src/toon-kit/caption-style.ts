import type React from 'react';
/** Single source for both presentation and measured ink reservation. */
export const CAPTION_STYLE = Object.freeze({
  fontSize: 68,
  bottom: 80,
  fontFamily: '"Arial Black", "Impact", "Montserrat Black", sans-serif',
  strokeWidth: 4,
  punch: 1.18,
  letterSpacing: 2,
  lineHeight: 1.1,
  shadowOffset: 3,
  shadowY: 6,
  shadowBlur: 14
});
export interface CaptionStyle {
  fontSize: number;
  bottom: number | string;
  fontFamily: string;
  strokeWidth: number;
  scalePunch: boolean;
  wrap?: boolean;
  maxWidth?: number;
}
export function captionStyles(s: CaptionStyle, scale: number): {
  container: React.CSSProperties;
  text: React.CSSProperties;
} {
  return {
    container: {
      position: 'absolute',
      bottom: typeof s.bottom === 'number' ? `${s.bottom}px` : s.bottom,
      left: '50%',
      transform: `translateX(-50%) scale(${scale})`,
      transformOrigin: 'center bottom',
      pointerEvents: 'none',
      textAlign: 'center',
      zIndex: 9999,
      width: s.maxWidth ? `${s.maxWidth}px` : '90%',
      userSelect: 'none'
    },
    text: {
      fontFamily: s.fontFamily,
      fontSize: `${s.fontSize}px`,
      fontWeight: 900,
      textTransform: 'uppercase',
      color: '#ffffff',
      WebkitTextStroke: `${s.strokeWidth}px #000000`,
      letterSpacing: `${CAPTION_STYLE.letterSpacing}px`,
      lineHeight: CAPTION_STYLE.lineHeight,
      textShadow: `${-CAPTION_STYLE.shadowOffset}px ${-CAPTION_STYLE.shadowOffset}px 0 #000, ${CAPTION_STYLE.shadowOffset}px ${-CAPTION_STYLE.shadowOffset}px 0 #000, ${-CAPTION_STYLE.shadowOffset}px ${CAPTION_STYLE.shadowOffset}px 0 #000, ${CAPTION_STYLE.shadowOffset}px ${CAPTION_STYLE.shadowOffset}px 0 #000, 0px ${CAPTION_STYLE.shadowY}px ${CAPTION_STYLE.shadowBlur}px rgba(0, 0, 0, 0.75)`,
      display: 'inline-block',
      ...(s.wrap ? {
        maxWidth: '100%',
        overflowWrap: 'anywhere' as const
      } : {})
    }
  };
}
export function captionPunch(age: number, enabled: boolean) {
  return enabled && age >= 0 && age <= 6 ? 1 + (CAPTION_STYLE.punch - 1) * (1 - age / 6) : 1;
}
