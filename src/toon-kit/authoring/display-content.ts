import { storyFail } from '../story/types';
export function validateDisplayText(text: unknown): asserts text is string {
  if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 160 || /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(text) || text.split('\n').length > 4) storyFail('INVALID_DISPLAY_TEXT', 'Use 1..160 characters of plain text, up to four lines; no control characters');
  // Repertoire of the pinned Noto font: no OS-dependent emoji/script fallback.
  if (/[^\n\u0020-\u007e\u0900-\u097f\u200c-\u200d\u2013-\u2014\u2018-\u2019\u201c-\u201d\u2022\u2026\u20b9]/u.test(text) || !text.replace(/[\u200c\u200d]/gu, '').trim()) storyFail('DISPLAY_UNSUPPORTED_GLYPH', 'Use Hindi/Devanagari, English and supported punctuation; emoji/other scripts are not bundled');
}
