'use strict';
// This launcher imports no Remotion code. Environment is fixed BEFORE Node,
// Chromium and FFmpeg children start, for CLI and programmatic entry points.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawn,execFile} = require('node:child_process');
const {productionPolicy: policy} = require('./render-policy.cjs');
const {monitor,processes} = require('./render-monitor.cjs');
const {createMemoryGuard} = require('./linux-memory.cjs');

async function runProductionRender(job = {}) {
  const allowed = new Set(['mode','entry','composition','output','width','height','frames','quality','backend','inputProps','report']);
  for (const key of Object.keys(job)) if (!allowed.has(key)) throw new Error(`Unsupported production override: ${key}`);
  if(job.mode && !['render','cli','audit','benchmark','prepare'].includes(job.mode)) throw new Error('Invalid render mode');
  const root = path.resolve(__dirname, '..');
  const authoringLock = path.join(root, '.remotion-tmp', 'authoring.lock');
  if (fs.existsSync(authoringLock) && JSON.parse(fs.readFileSync(authoringLock)).id !== process.env.TOON_AUTHORING_OWNER) throw new Error('An authoring job owns the production pipeline; wait for it to finish');
  const memoryGuard = createMemoryGuard(policy);
  const admission = memoryGuard.admission();
  if (!admission.admitted) {
    const report = path.resolve(root, job.report || `out/phase1.3/admission-${crypto.randomUUID()}.json`);
    fs.mkdirSync(path.dirname(report), {recursive:true});
    fs.writeFileSync(report, JSON.stringify({job, policy, admission, failure:admission.reason, launched:false}, null, 2));
    throw new Error(admission.reason + ' Report: ' + report);
  }
  const base = path.join(root, '.remotion-tmp'); fs.mkdirSync(base, {recursive: true});
  if (fs.realpathSync(base) !== path.resolve(base)) throw new Error('Scratch root must not be a symlink/junction');
  const backend = job.backend || policy.backend;
  if (!['swangle','swiftshader'].includes(backend)) throw new Error('Only software WebGL backends are allowed');
  if (job.quality && !['software-safe','balanced','high'].includes(job.quality)) throw new Error('Invalid quality');
  const lock = path.join(base, 'active.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx'); } catch { throw new Error('A production job is active (or active.lock needs operator inspection after a crash). Never delete a live lock.'); }
  const id = crypto.randomUUID(); const scratch = path.join(base, id);
  const env = {...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch,
    NODE_OPTIONS: `--max-old-space-size=${policy.nodeHeapMB}`,
    TOON_GL: backend, TOON_SCRATCH: scratch, TOON_PRODUCTION: '1',
    OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '1'};
  const report = path.resolve(root, job.report || `out/phase1.1/${id}.json`);
  let child, stats, failure;
  try {
    fs.writeFileSync(fd, JSON.stringify({pid: process.pid, id, scratch}));
    fs.mkdirSync(scratch); fs.writeFileSync(path.join(scratch, 'owner.json'), JSON.stringify({id, pid: process.pid}));
    const free = fs.statfsSync(root);
    if (Number(free.bavail) * Number(free.bsize) < 12 * 1024 ** 3) throw new Error('Workspace needs at least 12 GiB free before rendering');
    fs.writeFileSync(path.join(scratch, 'job.json'), JSON.stringify({...job, backend, quality: job.quality || 'software-safe'}));
    child = spawn(process.execPath, [path.join(__dirname, 'render-worker.cjs'), path.join(scratch, 'job.json')], {cwd: root, env, stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32'});
    const stop = () => terminate(child);
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const watcher = monitor(child.pid, scratch, policy, stop, memoryGuard);
    try {
      await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Render worker exited ${code ?? signal}`)));});
    } catch (error) {failure = String(error);} finally {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      stats = await watcher.stop();
    }
    const workerReport = path.join(scratch, 'worker-report.json');
    const worker = fs.existsSync(workerReport) ? JSON.parse(fs.readFileSync(workerReport)) : null;
    fs.mkdirSync(path.dirname(report), {recursive: true});
    fs.writeFileSync(report, JSON.stringify({job, backend, policy, admission, host: {platform: process.platform, node: process.version, cpus: os.availableParallelism(), totalRAM: os.totalmem(), originalTemp: os.tmpdir()}, scratch, stats, worker, failure}, null, 2));
    console.log('PRODUCTION_REPORT ' + report);
    if (failure || stats.limitExceeded) throw Object.assign(new Error(stats.limitExceeded || failure), !stats.limitExceeded && worker?.diagnostic ? {diagnostic:{...worker.diagnostic,report}} : {});
    return report;
  } finally {
    if (child && child.exitCode === null && !child.signalCode) terminate(child);
    // Verify ownership in the live command line, not merely a previously seen PID.
    for (const processInfo of await processes()) if (processInfo.command?.includes(`--user-data-dir=${scratch}`)) {
      if (process.platform === 'win32') await new Promise((resolve) => execFile('taskkill',['/pid',String(processInfo.pid),'/t','/f'],{windowsHide:true},()=>resolve()));
      else {try {process.kill(processInfo.pid,'SIGKILL');} catch {}}
    }
    // Delete only this UUID directory, with checked owner marker and real path.
    const marker = path.join(scratch, 'owner.json');
    if (fs.existsSync(marker) && JSON.parse(fs.readFileSync(marker)).id === id && fs.realpathSync(scratch) === path.resolve(scratch) && path.dirname(scratch) === base) fs.rmSync(scratch, {recursive: true, maxRetries: 5, retryDelay: 100});
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(lock)) {
      try {if (JSON.parse(fs.readFileSync(lock)).id === id) fs.unlinkSync(lock);} catch {console.error('Lock cleanup needs operator inspection: '+lock);}
    }
  }
}
function terminate(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {windowsHide: true, stdio: 'ignore'});
  else {try {process.kill(-child.pid, 'SIGKILL');} catch {}}
}
module.exports = {runProductionRender};
if (require.main === module) {
  const job = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (!match) throw new Error('Use --key=value arguments; safety overrides are rejected');
    job[match[1]] = match[1] === 'inputProps' ? JSON.parse(match[2]) : ['width','height','frames'].includes(match[1]) ? Number(match[2]) : match[2];
  }
  runProductionRender(job).catch((error) => {console.error(error); process.exitCode = 1;});
}
