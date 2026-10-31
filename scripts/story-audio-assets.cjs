'use strict';

// Node-side companion to browser preparation. Call before the ordinary production launcher.
const fs = require('node:fs'),
  path = require('node:path');
function fail(code, message) {
  const error = new Error(code + ': ' + message);
  error.name = 'StoryAudioAssetError';
  error.diagnostic = {
    code,
    message
  };
  throw error;
}
function validateStoryAudioFiles(audio, publicDir) {
  const requested = path.resolve(publicDir);
  let root;
  try {
    root = fs.realpathSync(requested);
  } catch {
    fail('AUDIO_ASSET_MISSING', 'Public audio root is missing');
  }
  if (root !== requested) fail('INVALID_AUDIO_ASSET', 'Public root must not be redirected through symlinks or junctions');
  let total = 0;
  const seen = new Set();
  const result = [];
  for (const [id, asset] of Object.entries(audio?.assets ?? {})) {
    if (typeof asset.src !== 'string' || !/^audio\/(?:[\p{L}\p{N}_ -]+\/)*[\p{L}\p{N}_ -]+\.(wav|mp3|m4a|ogg)$/u.test(asset.src)) fail('INVALID_AUDIO_ASSET', 'public/audio relative path required');
    const file = path.resolve(root, asset.src);
    let actual, stat;
    try {
      actual = fs.realpathSync(file);
      stat = fs.statSync(actual);
    } catch {
      fail('AUDIO_ASSET_MISSING', asset.src);
    }
    if (actual !== file || !actual.startsWith(root + path.sep) || !stat.isFile()) fail('INVALID_AUDIO_ASSET', 'symlink, junction or non-file');
    if (!seen.has(actual)) {
      total += stat.size;
      seen.add(actual);
    }
    if (stat.size < 1 || stat.size > 16 * 1024 * 1024 || total > 32 * 1024 * 1024) fail('AUDIO_BUDGET', '16 MiB per asset, 32 MiB total');
    result.push({
      id,
      file,
      bytes: stat.size
    });
  }
  return result;
}
module.exports = {
  validateStoryAudioFiles
};
