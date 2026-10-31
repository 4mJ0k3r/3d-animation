import type { CaptionWord } from './captions';
import { CAPTION_STYLE, captionStyles } from './caption-style';
import type { CaptionStyle } from './caption-style';
import { freezeData } from './characters/pose';
import { directionFail } from './direction/types';
export interface ScreenRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}
export interface CaptionLayout {
  readonly width: number;
  readonly height: number;
  readonly style: Readonly<CaptionStyle>;
  readonly words: readonly (Readonly<CaptionWord> & {
    readonly rect: ScreenRect;
  })[];
}
export interface CaptionLayoutOptions {
  width: number;
  height: number;
  words: readonly CaptionWord[];
  fontSize?: number;
  fontFamily?: string;
  strokeWidth?: number;
  bottom?: number | string;
  scalePunch?: boolean;
}
export function captionInkRect(box: ScreenRect, width: number, height: number, stroke: number, scale: number): ScreenRect {
  const x = (CAPTION_STYLE.shadowBlur * 2 + CAPTION_STYLE.shadowOffset + stroke) * scale,
    y = (CAPTION_STYLE.shadowBlur * 2 + CAPTION_STYLE.shadowY + stroke) * scale;
  return {
    left: box.left - x / width,
    right: box.right + x / width,
    top: box.top - y / height,
    bottom: box.bottom + y / height
  };
}
export function captionAt(layout: CaptionLayout, frame: number) {
  return layout.words.find(w => frame >= w.startFrame && frame < w.endFrame);
}
export function rectsIntersect(a: ScreenRect, b: ScreenRect, padding = 0) {
  return a.left < b.right + padding && a.right > b.left - padding && a.top < b.bottom + padding && a.bottom > b.top - padding;
}
export async function createCaptionLayout(o: CaptionLayoutOptions, signal?: AbortSignal): Promise<CaptionLayout> {
  if (!Number.isFinite(o.width) || !Number.isFinite(o.height) || o.width < 1 || o.height < 1 || o.words.length > 256) directionFail('INVALID_CAPTION_LAYOUT', 'Invalid viewport or word budget');
  const style: CaptionStyle = {
    fontSize: o.fontSize ?? CAPTION_STYLE.fontSize,
    bottom: o.bottom ?? CAPTION_STYLE.bottom,
    fontFamily: o.fontFamily ?? CAPTION_STYLE.fontFamily,
    strokeWidth: o.strokeWidth ?? CAPTION_STYLE.strokeWidth,
    scalePunch: o.scalePunch ?? true,
    wrap: true
  };
  if (!Number.isFinite(style.fontSize) || style.fontSize <= 0 || !Number.isFinite(style.strokeWidth) || style.strokeWidth < 0 || (typeof style.bottom === 'number' ? !Number.isFinite(style.bottom) || style.bottom < 0 : typeof style.bottom !== 'string' || !/^\d+(?:\.\d+)?(?:%|px)$/.test(style.bottom))) directionFail('INVALID_CAPTION_LAYOUT', 'Invalid font/stroke/bottom');
  const maxScale = style.scalePunch ? CAPTION_STYLE.punch : 1;
  style.maxWidth = (o.width * .94 - 2 * (CAPTION_STYLE.shadowBlur * 2 + CAPTION_STYLE.shadowOffset + style.strokeWidth) * maxScale) / maxScale;
  if (style.maxWidth <= 0) directionFail('CAPTION_OUTSIDE_IMAGE', 'Viewport too small for caption ink');
  let end = 0;
  for (const w of o.words) {
    if (!w.text.trim() || !Number.isInteger(w.startFrame) || !Number.isInteger(w.endFrame) || w.startFrame < end || w.endFrame <= w.startFrame) directionFail('INVALID_CAPTION_TIMING', 'Words must be ordered, nonoverlapping integer intervals');
    end = w.endFrame;
  }
  if (typeof document === 'undefined') directionFail('CAPTION_DOM_REQUIRED', 'Real font/layout measurement requires the browser');
  signal?.throwIfAborted();
  await document.fonts.load(`900 ${style.fontSize}px ${style.fontFamily}`);
  await document.fonts.ready;
  signal?.throwIfAborted();
  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${o.width}px`,
    height: `${o.height}px`,
    visibility: 'hidden',
    contain: 'layout style paint'
  });
  document.body.append(host);
  try {
    const container = document.createElement('div'),
      span = document.createElement('span'),
      scale = style.scalePunch ? CAPTION_STYLE.punch : 1,
      css = captionStyles(style, scale);
    Object.assign(container.style, css.container);
    Object.assign(span.style, css.text);
    container.append(span);
    host.append(container);
    const words = o.words.map(word => {
      span.textContent = word.text;
      const r = span.getBoundingClientRect(),
        h = host.getBoundingClientRect(),
        rect = captionInkRect({
          left: (r.left - h.left) / o.width,
          right: (r.right - h.left) / o.width,
          top: (r.top - h.top) / o.height,
          bottom: (r.bottom - h.top) / o.height
        }, o.width, o.height, style.strokeWidth, scale);
      if (rect.left < 0 || rect.right > 1 || rect.top < 0 || rect.bottom > 1) directionFail('CAPTION_OUTSIDE_IMAGE', `Caption ink does not fit: ${word.text}`);
      return {
        ...word,
        rect
      };
    });
    return freezeData({
      width: o.width,
      height: o.height,
      style,
      words
    });
  } finally {
    host.remove();
  }
}
