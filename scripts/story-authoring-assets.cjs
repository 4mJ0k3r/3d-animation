'use strict';

const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const {
  validateStoryAudioFiles
} = require('./story-audio-assets.cjs');
function fail(code, message) {
  throw Object.assign(new Error(message), {
    diagnostic: {
      code,
      message
    }
  });
}
function validateAuthoredAssets(compiled, publicDir, font) {
  const fontFile = path.resolve(publicDir, font.src),
    license = path.resolve(publicDir, font.license);
  for (const file of [fontFile, license]) if (!fs.existsSync(file) || fs.realpathSync(file) !== file || !fs.statSync(file).isFile()) fail('FONT_UNAVAILABLE', 'Restore bundled font and OFL license: ' + file);
  if (fs.statSync(fontFile).size !== font.bytes || fs.statSync(license).size > 16384 || crypto.createHash('sha256').update(fs.readFileSync(fontFile)).digest('hex') !== font.sha256) fail('FONT_INTEGRITY', 'Restore pinned Noto Sans Devanagari and its OFL license');
  return validateStoryAudioFiles(compiled.timeline.plan.audio, publicDir);
}
module.exports = {
  validateAuthoredAssets
};
