'use strict';

// Bootstrap imports only Node builtins. Child env is fixed before TS/Remotion imports.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  {
    spawn
  } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function fail(code, message) {
  throw Object.assign(new Error(message), {
    diagnostic: {
      code,
      message
    }
  });
}
function inside(file) {
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) fail('WORKSPACE_PATH', 'Use paths inside the project workspace');
  return full;
}
async function runAuthoredStory(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('AUTHORING_ARGUMENT', 'Pass an authoring options object');
  const allowed = ['command', 'plan', 'output', 'report', 'verify'];
  for (const k of Object.keys(options)) if (!allowed.includes(k)) fail('AUTHORING_ARGUMENT', 'Unsupported option ' + k);
  if (!['validate', 'render'].includes(options.command) || typeof options.plan !== 'string') fail('AUTHORING_ARGUMENT', 'Use story validate|render --plan=examples/name.story.json [--output=out/name.mp4] [--report=out/name.json] [--verify=true]');
  if (options.verify !== undefined && typeof options.verify !== 'boolean') fail('AUTHORING_ARGUMENT', 'verify must be boolean');
  if (options.command === 'render') {
    const policy = require('./render-policy.cjs').productionPolicy,
      admission = require('./linux-memory.cjs').createMemoryGuard(policy).admission();
    if (!admission.admitted) fail('MEMORY_ADMISSION', admission.reason);
  }
  const plan = inside(options.plan);
  let stat;
  try {
    stat = fs.statSync(plan);
  } catch {
    fail('PLAN_MISSING', 'Plan file not found: ' + options.plan);
  }
  if (fs.realpathSync(plan) !== plan || !stat.isFile() || stat.size > 256 * 1024) fail('PLAN_FILE', 'Use a canonical JSON file <=256 KiB inside the workspace');
  const output = inside(options.output ?? 'out/authored-story.mp4'),
    report = inside(options.report ?? 'out/authored-story-report.json');
  if (!output.startsWith(path.join(root, 'out') + path.sep) || !output.endsWith('.mp4') || !report.startsWith(path.join(root, 'out') + path.sep) || !report.endsWith('.json')) fail('OUTPUT_PATH', 'Output/report must be .mp4/.json paths under out/');
  for (const file of [output, report]) {
    if (file === plan) fail('OUTPUT_PATH', 'Never overwrite the input plan');
    let parent = path.dirname(file);
    while (!fs.existsSync(parent)) parent = path.dirname(parent);
    if (fs.realpathSync(parent) !== parent || fs.existsSync(file) && (fs.realpathSync(file) !== file || !fs.statSync(file).isFile())) fail('OUTPUT_PATH', 'Output parents/files may not be redirected');
  }
  const base = path.join(root, '.remotion-tmp');
  fs.mkdirSync(base, {
    recursive: true
  });
  if (fs.realpathSync(base) !== base) fail('WORKSPACE_PATH', 'Scratch root may not be redirected');
  const lock = path.join(base, 'authoring.lock'),
    id = crypto.randomUUID();
  let fd;
  try {
    fd = fs.openSync(lock, 'wx');
  } catch {
    fail('AUTHORING_BUSY', 'An authoring job is active; never remove a live lock');
  }
  fs.writeFileSync(fd, JSON.stringify({
    id,
    pid: process.pid
  }));
  const scratch = path.join(base, 'authoring-' + id);
  let child;
  try {
    if (fs.existsSync(path.join(base, 'active.lock'))) fail('AUTHORING_BUSY', 'A production render is active');
    fs.mkdirSync(scratch);
    fs.writeFileSync(path.join(scratch, 'owner.json'), JSON.stringify({
      id
    }));
    const job = {
      ...options,
      plan,
      output,
      report,
      scratch
    };
    fs.writeFileSync(path.join(scratch, 'job.json'), JSON.stringify(job));
    const policy = require('./render-policy.cjs').productionPolicy;
    child = spawn(process.execPath, [path.join(__dirname, 'story-worker.cjs'), path.join(scratch, 'job.json')], {
      cwd: root,
      env: {
        ...process.env,
        TMPDIR: scratch,
        TMP: scratch,
        TEMP: scratch,
        NODE_OPTIONS: `--max-old-space-size=${policy.nodeHeapMB}`
      },
      windowsHide: true,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    const cancel = () => {
      try {
        if (child.connected) child.send({
          abort: true
        }, () => {});
      } catch {}
    };
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    try {
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(Object.assign(new Error('Authoring failed; inspect the structured diagnostic above and render report'), {
          diagnostic: {
            code: 'AUTHORING_FAILED',
            message: 'No completed MP4; inspect the preceding diagnostic/report'
          }
        })));
      });
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
    }
    return JSON.parse(fs.readFileSync(path.join(scratch, 'result.json')));
  } finally {
    const marker = path.join(scratch, 'owner.json');
    if (fs.existsSync(marker) && JSON.parse(fs.readFileSync(marker)).id === id && fs.realpathSync(scratch) === scratch && path.dirname(scratch) === base) fs.rmSync(scratch, {
      recursive: true,
      maxRetries: 5,
      retryDelay: 100
    });
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(lock) && JSON.parse(fs.readFileSync(lock)).id === id) fs.unlinkSync(lock);
  }
}
module.exports = {
  runAuthoredStory
};
if (require.main === module) {
  const options = {
    command: process.argv[2]
  };
  try {
    for (const arg of process.argv.slice(3)) {
      const m = /^--(plan|output|report|verify)=(.+)$/.exec(arg);
      if (!m || Object.hasOwn(options, m[1])) fail('AUTHORING_ARGUMENT', 'Unknown/duplicate argument: ' + arg);
      options[m[1]] = m[1] === 'verify' ? m[2] === 'true' ? true : m[2] === 'false' ? false : m[2] : m[2];
    }
    runAuthoredStory(options).then(r => console.log('STORY_RESULT ' + JSON.stringify(r))).catch(e => {
      console.error(JSON.stringify({
        error: e.diagnostic ?? {
          code: 'AUTHORING_FAILED',
          message: String(e)
        }
      }));
      process.exitCode = 1;
    });
  } catch (e) {
    console.error(JSON.stringify({
      error: e.diagnostic ?? {
        code: 'AUTHORING_ARGUMENT',
        message: String(e)
      }
    }));
    process.exitCode = 1;
  }
}
