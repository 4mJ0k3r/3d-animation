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
  if (job.command !== 'validate') {
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
  const {planStorySegments} = require(path.join(compiledDir, 'toon-kit', 'authoring', 'segments.js'));
  const segments = planStorySegments(compiled);
  const result = {
    valid: true,
    scope: 'Schema, slots, files and static risk warnings only; full camera/actor validation requires guarded preparation',
    visibilityValidated: false,
    warnings: compiled.warnings,
    fps: compiled.timeline.plan.fps,
    frames: compiled.timeline.plan.durationInFrames,
    video: compiled.document.video,
    layouts: compiled.document.layouts,
    captionTiming: compiled.timeline.captionTiming,
    audioAssets: files.length,
    segments,
    font: {
      src: STORY_FONT.src,
      sha256: STORY_FONT.sha256
    },
    temp: os.tmpdir()
  };
  if (job.command !== 'validate') {
    await new Promise(setImmediate);
    if (cancelled) fail('AUTHORING_CANCELLED', 'Cancelled before rendering');
    result.preflightReport = await require('./render.cjs').runProductionRender({
      mode: 'prepare', entry: 'src/index.ts', composition: 'AuthoredStory',
      report: job.report + '.preflight.json',
      inputProps: {document: compiled.document}
    });
    result.visibilityValidated = true;
    if (cancelled) fail('AUTHORING_CANCELLED', 'Cancelled after whole-story preparation');
    if (job.command === 'prepare') {
      result.scope = 'Guarded whole-story camera/actor preparation passed; no video encoded';
      result.report = result.preflightReport;
      fs.writeFileSync(path.join(job.scratch, 'result.json'), JSON.stringify(result));
      return;
    }
    if(result.frames > 600) {
      result.orchestration = await require('./story-segments.cjs').renderSegments({job,compiled,files,planSHA256,planStorySegments,cancelled:()=>cancelled});
    } else await require('./render.cjs').runProductionRender({
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
  // Preserve the structured cause for the parent CLI/programmatic caller, not
  // merely the child console log. The private bootstrap owns and removes it.
  const diagnostic = e.diagnostic ?? {code:'AUTHORING_FAILED',message:String(e),hint:'Inspect the guarded production/preflight report.'};
  try { fs.writeFileSync(path.join(job.scratch, 'error.json'), JSON.stringify(diagnostic)); } catch {}
  console.error(JSON.stringify({error:diagnostic}));
  process.exitCode = 1;
}).finally(() => {
  if (process.connected) process.disconnect();
});
