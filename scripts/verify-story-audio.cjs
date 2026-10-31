'use strict';

const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  {
    spawn,
    spawnSync,
    execFileSync
  } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'out', 'phase4b');
async function main() {
  if (process.argv.length > 3 || process.argv[2] !== undefined && process.argv[2] !== 'analyze') throw new Error('Use no argument, or analyze to inspect the existing MP4 without rendering');
  fs.mkdirSync(out, {
    recursive: true
  });
  execFileSync(process.execPath, [path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc'), '-p', 'scripts/tsconfig.characters.json'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true
  });
  const {
      AUDIO_STORY,
      NARRATION_SEGMENTS
    } = require('../out/character-tests/toon-kit-tests/story-audio-plan'),
    {
      validateStoryAudioFiles
    } = require('./story-audio-assets.cjs'),
    {
      compileStory
    } = require('../out/character-tests/toon-kit/story');
  const timeline = compileStory(AUDIO_STORY),
    files = validateStoryAudioFiles(AUDIO_STORY.audio, path.join(root, 'public')),
    video = path.join(out, 'narrated-story.mp4'),
    report = path.join(out, 'production-report.json'),
    log = path.join(out, 'render.log');
  if (process.argv[2] !== 'analyze') {
    const fd = fs.openSync(log, 'w');
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, 'render.cjs'), '--entry=src/index.ts', '--composition=StoryAudioValidation', '--frames=288', '--width=720', '--height=1280', '--inputProps={"verify":true}', `--output=${video}`, `--report=${report}`], {
          cwd: root,
          windowsHide: true,
          stdio: ['ignore', fd, fd]
        });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error('Audio render failed; inspect ' + log)));
      });
    } finally {
      fs.closeSync(fd);
    }
  }
  const production = JSON.parse(fs.readFileSync(report)),
    lines = fs.readFileSync(log, 'utf8').split(/\r?\n/),
    assertionsLine = lines.filter(x => x.startsWith('AUDIT_STORY_AUDIO_RESULTS:')).at(-1);
  if (!assertionsLine || !production.worker?.renderer?.length || production.worker.renderer.some(x => !/SwiftShader/i.test(x.renderer) || x.quality !== 'software-safe')) throw new Error('No software renderer/browser proof');
  const assertions = JSON.parse(assertionsLine.slice('AUDIT_STORY_AUDIO_RESULTS:'.length));
  if (![27, 32].includes(assertions.length) || assertions.some(x => !x.pass)) throw new Error('Browser assertions failed');
  const base = path.join(root, '.remotion-tmp'),
    id = crypto.randomUUID(),
    scratch = path.join(base, 'audio-analysis-' + id);
  fs.mkdirSync(scratch);
  fs.writeFileSync(path.join(scratch, 'owner.json'), JSON.stringify({
    id
  }));
  const previous = Object.fromEntries(['TMP', 'TEMP', 'TMPDIR'].map(k => [k, process.env[k]]));
  try {
    for (const k of Object.keys(previous)) process.env[k] = scratch;
    const {
        RenderInternals
      } = require('@remotion/renderer'),
      ffmpeg = RenderInternals.getExecutablePath({
        type: 'ffmpeg',
        binariesDirectory: null,
        indent: false,
        logLevel: 'error'
      });
    const run = args => {
      const r = spawnSync(ffmpeg, ['-hide_banner', '-threads', '2', ...args], {
        cwd: root,
        env: {
          ...process.env,
          TMP: scratch,
          TEMP: scratch,
          TMPDIR: scratch
        },
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      });
      if (r.error || r.status !== 0) throw new Error('FFmpeg analysis failed: ' + (r.error ?? r.stderr));
      return r;
    };
    const expected = run(['-i', files[0].file, '-t', '9.6', '-vn', '-af', 'volume=0.9', '-ac', '2', '-ar', '16000', '-f', 'wav', 'pipe:1']),
      actual = run(['-i', video, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '16000', '-f', 'wav', 'pipe:1']);
    const metadata = actual.stderr.toString();
    fs.writeFileSync(path.join(out, 'streams.txt'), metadata);
    if (!/Video: h264/.test(metadata) || !/Audio: aac/.test(metadata) || !/720x1280/.test(metadata) || !/30 fps/.test(metadata) || !/Duration: 00:00:09\.60/.test(metadata)) throw new Error('Unexpected exported audio/video streams');
    const floats = buffer => {
        let at = 12;
        while (at + 8 < buffer.length) {
          const id = buffer.toString('ascii', at, at + 4),
            size = buffer.readUInt32LE(at + 4);
          if (id === 'data') {
            const start = at + 8,
              channels = buffer.readUInt16LE(22);
            return Float32Array.from({
              length: Math.floor((buffer.length - start) / (2 * channels))
            }, (_, i) => {
              let sum = 0;
              for (let c = 0; c < channels; c++) sum += buffer.readInt16LE(start + (i * channels + c) * 2);
              return sum / (32768 * channels);
            });
          }
          at += 8 + size + size % 2;
        }
        throw new Error('Missing WAV data');
      },
      reference = floats(expected.stdout),
      decoded = floats(actual.stdout);
    if (reference.length < 153599 || decoded.length < 153599) throw new Error('Truncated audio stream');
    function correlate(seconds) {
      const start = Math.round(seconds * 16000),
        length = 4096;
      let best = {
        correlation: -1,
        lagSamples: 0,
        gain: 0
      };
      for (let lag = -1600; lag <= 1600; lag++) {
        let xy = 0,
          xx = 0,
          yy = 0;
        for (let i = 0; i < length; i += 4) {
          const a = reference[start + i],
            b = decoded[start + i + lag];
          xy += a * b;
          xx += a * a;
          yy += b * b;
        }
        const correlation = xy / Math.sqrt(xx * yy);
        if (correlation > best.correlation) best = {
          correlation,
          lagSamples: lag,
          gain: Math.sqrt(yy / xx)
        };
      }
      return {
        seconds,
        ...best,
        lagMs: best.lagSamples / 16
      };
    }
    const sync = [.6, 5.3, 8.8].map(correlate);
    if (sync.some(s => s.correlation < .95 || Math.abs(s.lagMs) > 1000 / 30 || Math.abs(s.gain - 1) > .08)) throw new Error('Audio trim/gain/sync correlation failed: ' + JSON.stringify(sync));
    for (const [i, f] of [0, 80, 144, 192, 275, 287].entries()) run(['-loglevel', 'error', '-y', '-ss', Math.max(0, f / 30 - .0001).toFixed(6), '-i', video, '-frames:v', '1', '-threads', '1', path.join(out, 'audio-' + i + '.png')]);
    const quantile = (v, p) => {
        const a = [...v].sort((a, b) => a - b);
        return a[Math.ceil(p * a.length) - 1];
      },
      storyMs = production.worker.frames.filter(f => f.frame >= 2).map(f => f.storyMs);
    const evidence = {
      assertions,
      source: {
        src: AUDIO_STORY.audio.assets.narrator.src,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(files[0].file)).digest('hex'),
        bytes: files[0].bytes
      },
      streams: {
        video: 'h264',
        audio: 'aac',
        fps: 30,
        width: 720,
        height: 1280,
        durationSeconds: 9.6,
        sourceSamples: reference.length,
        decodedSamples: decoded.length
      },
      audioCorrelation: sync,
      captionTiming: timeline.captionTiming,
      sentenceBoundaries: NARRATION_SEGMENTS.map(s => ({
        startFrame: Math.round(s.startSeconds * 30),
        endFrame: Math.round(s.endSeconds * 30),
        startQuantizationMs: (Math.round(s.startSeconds * 30) / 30 - s.startSeconds) * 1000,
        endQuantizationMs: (Math.round(s.endSeconds * 30) / 30 - s.endSeconds) * 1000
      })),
      wordAccuracy: 'NOT CERTIFIED: user supplied sentence timestamps only; within-sentence word timing explicitly estimated',
      storyEvaluation: {
        medianMs: quantile(storyMs, .5),
        p95Ms: quantile(storyMs, .95)
      },
      analysisTemp: scratch
    };
    fs.writeFileSync(path.join(out, 'validation-results.json'), JSON.stringify(evidence, null, 2));
    console.log('AUDIO_PASS ' + JSON.stringify({
      assertions: assertions.length,
      sync,
      storyEvaluation: evidence.storyEvaluation
    }));
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];else process.env[k] = v;
    }
    if (path.dirname(scratch) === base && fs.realpathSync(scratch) === scratch && JSON.parse(fs.readFileSync(path.join(scratch, 'owner.json'))).id === id) fs.rmSync(scratch, {
      recursive: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}
async function locked() {
  const base = path.join(root, '.remotion-tmp');
  fs.mkdirSync(base, {
    recursive: true
  });
  if (fs.realpathSync(base) !== base || fs.existsSync(path.join(base, 'active.lock'))) throw new Error('Run serially with workspace temp');
  const lock = path.join(base, 'audio-validation.lock'),
    id = crypto.randomUUID(),
    fd = fs.openSync(lock, 'wx');
  fs.writeFileSync(fd, JSON.stringify({
    id,
    pid: process.pid
  }));
  try {
    await main();
  } finally {
    fs.closeSync(fd);
    if (JSON.parse(fs.readFileSync(lock)).id === id) fs.unlinkSync(lock);
  }
}
locked().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
