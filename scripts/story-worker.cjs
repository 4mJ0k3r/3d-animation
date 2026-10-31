'use strict';

const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto'),
  {
    execFileSync
  } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  job = JSON.parse(fs.readFileSync(process.argv[2]));
let cancelled = false;
process.on('message', m => {
  if (m?.abort) {
    cancelled = true;
    process.emit('SIGTERM');
  }
});
function fail(code, message) {
  throw Object.assign(new Error(message), {
    diagnostic: {
      code,
      message
    }
  });
}
async function main() {
  if (os.tmpdir() !== job.scratch || !['TMPDIR', 'TMP', 'TEMP'].every(k => process.env[k] === job.scratch)) fail('TEMP_BOOTSTRAP', 'Workspace temp bootstrap failed');
  if (job.command === 'render') {
    const p = require('./render-policy.cjs').productionPolicy,
      a = require('./linux-memory.cjs').createMemoryGuard(p).admission();
    if (!a.admitted) fail('MEMORY_ADMISSION', a.reason);
  }
  const compiledDir = path.join(job.scratch, 'compiled');
  execFileSync(process.execPath, [path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc'), '-p', 'scripts/tsconfig.authoring.json', '--outDir', compiledDir], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true
  });
  await new Promise(setImmediate);
  if (cancelled) fail('AUTHORING_CANCELLED', 'Cancelled before rendering');
  let data, planSHA256;
  try {
    const text = fs.readFileSync(job.plan, 'utf8');
    planSHA256 = crypto.createHash('sha256').update(text).digest('hex');
    data = JSON.parse(text);
  } catch {
    fail('PLAN_JSON', 'Plan must be valid UTF-8 JSON');
  }
  const {
      compileStoryDocument
    } = require(path.join(compiledDir, 'toon-kit', 'authoring', 'document.js')),
    {
      STORY_FONT
    } = require(path.join(compiledDir, 'toon-kit', 'authoring', 'font.js')),
    compiled = compileStoryDocument(data);
  const files = require('./story-authoring-assets.cjs').validateAuthoredAssets(compiled, path.join(root, 'public'), STORY_FONT);
  const result = {
    valid: true,
    scope: 'Schema, semantic slots and local-file integrity; decode/framing certified in render preparation',
    fps: compiled.timeline.plan.fps,
    frames: compiled.timeline.plan.durationInFrames,
    video: compiled.document.video,
    layouts: compiled.document.layouts,
    captionTiming: compiled.timeline.captionTiming,
    audioAssets: files.length,
    font: {
      src: STORY_FONT.src,
      sha256: STORY_FONT.sha256
    },
    temp: os.tmpdir()
  };
  if (job.command === 'render') {
    await new Promise(setImmediate);
    if (cancelled) fail('AUTHORING_CANCELLED', 'Cancelled before rendering');
    await require('./render.cjs').runProductionRender({
      entry: 'src/index.ts',
      composition: 'AuthoredStory',
      frames: result.frames,
      width: result.video.width,
      height: result.video.height,
      output: job.output,
      report: job.report,
      inputProps: {
        document: compiled.document,
        verify: job.verify ?? false
      }
    });
    result.output = job.output;
    result.report = job.report;
    const report = JSON.parse(fs.readFileSync(job.report));
    report.authoring = {
      ...result,
      planSHA256
    };
    fs.writeFileSync(job.report, JSON.stringify(report, null, 2));
  }
  fs.writeFileSync(path.join(job.scratch, 'result.json'), JSON.stringify(result));
}
main().catch(e => {
  console.error(JSON.stringify({
    error: e.diagnostic ?? {
      code: 'AUTHORING_FAILED',
      message: String(e),
      hint: 'Check AUDIT_AUTHORING_ERROR and the production report for contact/visibility diagnostics.'
    }
  }));
  process.exitCode = 1;
}).finally(() => {
  if (process.connected) process.disconnect();
});
