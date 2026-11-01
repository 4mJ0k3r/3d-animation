import * as T from 'three';
import { STORY_FONT } from './font';
import { storyFail } from '../story/types';

/** One immutable, engine-owned texture per configured display. No frame work. */
export function createDisplayMaterial(text: string, background = '#206d80') {
  if (typeof document === 'undefined') storyFail('DISPLAY_DOM_REQUIRED', 'Prepare display text in the browser after prepareStoryFont()');
  if (!Array.from(document.fonts).some(f => f.family === STORY_FONT.family && f.status === 'loaded') || !document.fonts.check(`900 44px "${STORY_FONT.family}"`, text)) storyFail('FONT_UNAVAILABLE', 'Load the bundled story font before building text displays');
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 704;
  const ctx = canvas.getContext('2d');
  if (!ctx) storyFail('DISPLAY_CANVAS', 'A 2D canvas is required for display text');
  const pad = 64,
    available = canvas.width - pad * 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let size = 80; size >= 44; size -= 4) {
    ctx.font = `900 ${size}px "${STORY_FONT.family}"`;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/u).filter(Boolean)) {
        const next = line ? line + ' ' + word : word;
        if (line && ctx.measureText(next).width > available) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    if (lines.length > 4 || lines.some(line => ctx.measureText(line).width > available)) continue;
    const metrics = lines.map(line => ctx.measureText(line || 'हिन्दी English'));
    const ascent = Math.max(...metrics.map(m => m.actualBoundingBoxAscent)),
      descent = Math.max(...metrics.map(m => m.actualBoundingBoxDescent)),
      step = Math.max(size * 1.4, ascent + descent + size * .2),
      height = ascent + descent + (lines.length - 1) * step;
    if (!Number.isFinite(height) || height > canvas.height - pad * 2) continue;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff6e5';
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, (canvas.height - height) / 2 + ascent + i * step));
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.generateMipmaps = false;
    map.minFilter = map.magFilter = T.LinearFilter;
    const material = new T.MeshBasicMaterial({
      map,
      toneMapped: false
    });
    material.name = 'ToonKitDisplayText';
    return material;
  }
  storyFail('DISPLAY_TEXT_TOO_DENSE', 'Display text must fit four readable lines; shorten it or add sensible spaces/newlines');
}
