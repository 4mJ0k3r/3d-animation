'use strict';

// Focused fixture verifier: no browser, speech recognition or temporary media files.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  {
    execFileSync
  } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  output = path.resolve(root, process.argv[2] || 'out/phase4cb/long-story.mp4');
const {
  probe
} = require('./story-segments.cjs');
const media = probe(output),
  video = media.streams.find(s => s.codec_type === 'video'),
  audio = media.streams.find(s => s.codec_type === 'audio');
if (video.nb_read_frames !== '810' || video.duration !== '27.000000' || audio.duration !== '27.000000' || audio.sample_rate !== '48000') throw Error('Wrong final frame/audio clock');
const base = path.join(root, '.remotion-tmp'),
  dir = path.join(base, 'signal-check-' + crypto.randomUUID());
fs.mkdirSync(dir, {
  recursive: true
});
try {
  const run = args => execFileSync('ffmpeg', ['-v', 'error', '-threads', '2', ...args], {
    windowsHide: true,
    env: {
      ...process.env,
      TMPDIR: dir,
      TMP: dir,
      TEMP: dir
    },
    maxBuffer: 16 * 1024 * 1024
  });
  const decoded = run(['-i', output, '-vn', '-ac', '2', '-ar', '48000', '-f', 'f32le', '-']);
  const reference = run(['-i', path.join(root, 'public/audio/long-story-signal.wav'), '-af', 'aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.3', '-ac', '2', '-ar', '48000', '-f', 'f32le', '-']);
  const actual = new Float32Array(decoded.buffer, decoded.byteOffset, decoded.byteLength / 4),
    expected = new Float32Array(reference.buffer, reference.byteOffset, reference.byteLength / 4);
  const windows = [9, 18].map(seconds => {
    const start = (seconds * 48000 - 4800) * 2,
      end = (seconds * 48000 + 4800) * 2;
    let squared = 0,
      signal = 0,
      bestLag = 0,
      best = Infinity;
    for (let lag = -8; lag <= 8; lag++) {
      let e = 0;
      for (let i = start; i < end; i++) {
        const delta = actual[i + lag * 2] - expected[i];
        e += delta * delta;
      }
      if (e < best) {
        best = e;
        bestLag = lag;
      }
    }
    for (let i = start; i < end; i++) {
      squared += (actual[i] - expected[i]) ** 2;
      signal += expected[i] ** 2;
    }
    const relativeRMSE = Math.sqrt(squared / signal);
    if (bestLag !== 0 || relativeRMSE > 0.03) throw Error('Audio boundary discontinuity at ' + seconds + 's: ' + JSON.stringify({
      bestLag,
      relativeRMSE
    }));
    return {
      seconds,
      bestLagSamples: bestLag,
      relativeRMSE
    };
  });
  const result = {
    frames: Number(video.nb_read_frames),
    durationSeconds: Number(video.duration),
    sampleRate: Number(audio.sample_rate),
    timelineSamples: 27 * 48000,
    decodedSamples: actual.length / 2,
    codecTailSamples: actual.length / 2 - 27 * 48000,
    windows
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (fs.realpathSync(dir) !== dir || path.dirname(dir) !== base) throw Error('Unsafe owned verification cleanup');
  fs.rmSync(dir, {
    recursive: true
  });
}
