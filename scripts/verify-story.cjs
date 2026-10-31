'use strict';

const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  {
    spawn,
    execFileSync
  } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'out', 'phase4a');
async function main() {
  if (process.argv.length > 3 || process.argv[2] !== undefined && process.argv[2] !== 'stills') throw new Error('Use no argument or stills');
  fs.mkdirSync(out, {
    recursive: true
  });
  const video = path.join(out, 'story-excerpt.mp4'),
    report = path.join(out, 'production-report.json'),
    log = path.join(out, 'render.log');
  if (process.argv[2] !== 'stills') {
    const fd = fs.openSync(log, 'w');
    try {
      await new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [path.join(__dirname, 'render.cjs'), '--entry=src/index.ts', '--composition=StoryTimelineValidation', '--frames=60', '--width=720', '--height=1280', '--inputProps={"verify":true}', `--output=${video}`, `--report=${report}`], {
          cwd: root,
          windowsHide: true,
          stdio: ['ignore', fd, fd]
        });
        c.once('error', reject);
        c.once('exit', code => code === 0 ? resolve() : reject(new Error('Story validation failed; inspect ' + log)));
      });
    } finally {
      fs.closeSync(fd);
    }
  }
  const r = JSON.parse(fs.readFileSync(report)),
    line = fs.readFileSync(log, 'utf8').split(/\r?\n/).find(x => x.startsWith('AUDIT_STORY_RESULTS:'));
  if (!line || !r.worker?.renderer?.length || r.worker.renderer.some(x => !/SwiftShader/i.test(x.renderer) || x.quality !== 'software-safe')) throw new Error('Missing software rendering proof');
  const results = JSON.parse(line.slice('AUDIT_STORY_RESULTS:'.length));
  if (results.length !== 70 || results.some(x => !x.pass)) throw new Error('Story assertions failed');
  fs.writeFileSync(path.join(out, 'validation-results.json'), JSON.stringify({
    results
  }, null, 2));
  const base = path.join(root, '.remotion-tmp'),
    id = crypto.randomUUID(),
    scratch = path.join(base, 'story-extract-' + id);
  if (fs.realpathSync(base) !== base) throw new Error('Redirected temp');
  fs.mkdirSync(scratch);
  fs.writeFileSync(path.join(scratch, 'owner.json'), JSON.stringify({
    id
  }));
  const old = Object.fromEntries(['TMPDIR', 'TMP', 'TEMP'].map(k => [k, process.env[k]]));
  try {
    for (const k of Object.keys(old)) process.env[k] = scratch;
    const {
        RenderInternals
      } = require('@remotion/renderer'),
      ffmpeg = RenderInternals.getExecutablePath({
        type: 'ffmpeg',
        binariesDirectory: null,
        indent: false,
        logLevel: 'error'
      });
    for (const [i, f] of [0, 10, 25, 39, 49, 50, 59].entries()) execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '2', '-ss', Math.max(0, f / 30 - .0001).toFixed(6), '-i', video, '-frames:v', '1', '-threads', '1', path.join(out, 'story-' + i + '.png')], {
      cwd: root,
      env: {
        ...process.env,
        TMPDIR: scratch,
        TMP: scratch,
        TEMP: scratch
      },
      windowsHide: true
    });
  } finally {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete process.env[k];else process.env[k] = v;
    }
    if (path.dirname(scratch) === base && fs.realpathSync(scratch) === scratch && JSON.parse(fs.readFileSync(path.join(scratch, 'owner.json'))).id === id) fs.rmSync(scratch, {
      recursive: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
  console.log('STORY_PASS ' + JSON.stringify(r.worker.runs));
  console.log('STORY_ARTIFACTS ' + out);
}
async function run() {
  const base = path.join(root, '.remotion-tmp');
  fs.mkdirSync(base, {
    recursive: true
  });
  if (fs.realpathSync(base) !== base || fs.existsSync(path.join(base, 'active.lock'))) throw new Error('Run serially with ordinary workspace temp');
  const lock = path.join(base, 'story-validation.lock'),
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
run().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
