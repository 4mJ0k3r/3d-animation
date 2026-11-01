'use strict';

/**
 * Phase 7A portable render jobs. A job is a directory containing exactly
 *   manifest.json, story.json and assets/<public-relative audio files>.
 * `package` builds one from a workspace story; `verify` checks one; `run` renders one
 * through the existing guarded pipeline (scripts/story.cjs). No code from a package is
 * executed: the worker only reads JSON and copies hashed files.
 */
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const FORMAT = 'toonkit-render-job', VERSION = 1;
const LIMITS = Object.freeze({manifestBytes: 64 * 1024, storyBytes: 256 * 1024, assets: 32, assetBytes: 16 * 1024 * 1024, totalAssetBytes: 32 * 1024 * 1024});
const BLOCKING = new Set(['ENGINE_MISMATCH', 'RUNTIME_UNSUPPORTED', 'MEMORY_ADMISSION', 'AUTHORING_BUSY', 'WORKER_BUSY', 'MEDIA_TOOL_MISSING', 'FONT_UNAVAILABLE', 'FONT_INTEGRITY', 'STAGING_CONFLICT']);
const AUDIO_SRC = /^audio\/(?:[\p{L}\p{N}_ -]+\/)*[\p{L}\p{N}_ -]+\.(wav|mp3|m4a|ogg)$/u;
const JOB_ID = /^tk-[0-9a-f]{24}$/;
function fail(code, message, details) {
  throw Object.assign(new Error(message), {diagnostic: {code, message, ...(details === undefined ? {} : {details})}});
}
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fileSha(file) {
  const h = crypto.createHash('sha256'), buf = Buffer.allocUnsafe(64 * 1024), fd = fs.openSync(file, 'r');
  try {for (;;) {const n = fs.readSync(fd, buf, 0, buf.length, null); if (!n) break; h.update(buf.subarray(0, n));}} finally {fs.closeSync(fd);}
  return h.digest('hex');
}
/** Line-ending-normalized digest of engine code, so Windows and Linux checkouts of one commit match. */
function engineDigest() {
  const h = crypto.createHash('sha256');
  const add = (rel) => {
    const data = fs.readFileSync(path.join(root, rel));
    h.update(rel + '\0');
    h.update(data.includes(0) ? data : Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n')));
  };
  const visit = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const rel = dir + '/' + e.name;
      if (e.isSymbolicLink()) fail('ENGINE_MISMATCH', 'Engine source trees may not contain symlinks: ' + rel);
      if (e.isDirectory()) visit(rel); else add(rel);
    }
  };
  visit('src'); visit('scripts');
  for (const f of ['package.json', 'package-lock.json', 'tsconfig.json', 'remotion.config.ts']) add(f);
  return h.digest('hex');
}
function engineInfo() {
  let commit = null, dirty = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']}).trim();
    dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'remotion.config.ts'], {cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']}).trim() !== '';
  } catch {}
  return {name: 'toon-kit', packageVersion: require('../package.json').version, digest: engineDigest(), commit, dirty};
}
const runtimeInfo = () => ({nodeMajor: Number(process.versions.node.split('.')[0]), remotion: require('@remotion/renderer/package.json').version});
function only(v, keys, where) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('JOB_MANIFEST', where + ' must be an object');
  const extra = Object.keys(v).filter(k => !keys.includes(k)), missing = keys.filter(k => !Object.hasOwn(v, k));
  if (extra.length || missing.length) fail('JOB_MANIFEST', `${where}: ${extra.length ? 'unexpected ' + extra.join(', ') : ''}${extra.length && missing.length ? '; ' : ''}${missing.length ? 'missing ' + missing.join(', ') : ''}`);
}
function jobIdOf(m) {
  return 'tk-' + sha(JSON.stringify({story: m.story.sha256, assets: m.assets.map(a => [a.src, a.sha256]), output: m.output, engine: m.engine.digest})).slice(0, 24);
}
function audioSources(story) {
  const assets = story?.story?.audio?.assets;
  if (assets === undefined) return [];
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) fail('JOB_STORY', 'story.audio.assets must be an object');
  return Object.entries(assets).map(([id, a]) => {
    if (typeof a?.src !== 'string' || !AUDIO_SRC.test(a.src) || a.src.split('/').some(s => s === '..' || s === '.' || s.trim() !== s)) fail('JOB_ASSET_PATH', `Asset ${id}: use a public/audio relative path such as audio/name.mp3`);
    return a.src;
  });
}
/** Resolve a forward-slash relative path strictly inside a directory, rejecting links. */
function strictInside(dir, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\\') || rel.includes('\0') || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.split('/').some(s => !s || s === '.' || s === '..')) fail('JOB_PATH', 'Unsafe package path: ' + JSON.stringify(rel));
  const full = path.join(dir, ...rel.split('/'));
  let p = dir;
  for (const part of rel.split('/')) {
    p = path.join(p, part);
    let st;
    try {st = fs.lstatSync(p);} catch {fail('JOB_ASSET_MISSING', 'Missing package file: ' + rel);}
    if (st.isSymbolicLink()) fail('JOB_PATH', 'Symlinks/junctions are not allowed in a job package: ' + rel);
  }
  if (fs.realpathSync(full) !== full || !fs.statSync(full).isFile()) fail('JOB_PATH', 'Package entry must be a plain file: ' + rel);
  return full;
}
function listFiles(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, ...base.split('/').filter(Boolean)), {withFileTypes: true})) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isSymbolicLink()) fail('JOB_PATH', 'Symlinks/junctions are not allowed in a job package: ' + rel);
    if (e.isDirectory()) out.push(...listFiles(dir, rel)); else out.push(rel);
  }
  return out;
}
function canonicalDir(input, code) {
  const dir = path.resolve(input);
  let st;
  try {st = fs.lstatSync(dir);} catch {fail(code, 'Directory not found: ' + input);}
  if (st.isSymbolicLink() || !st.isDirectory() || fs.realpathSync(dir) !== dir) fail(code, 'Use a real, non-redirected directory: ' + input);
  return dir;
}
async function packageJob({plan, out}) {
  if (typeof plan !== 'string' || typeof out !== 'string') fail('JOB_ARGUMENT', 'Use package --plan=examples/name.story.json --out=<directory>');
  const validated = await require('./story.cjs').runAuthoredStory({command: 'validate', plan});
  const planFile = path.resolve(root, plan), text = fs.readFileSync(planFile, 'utf8');
  if (Buffer.byteLength(text) > LIMITS.storyBytes) fail('JOB_STORY', 'Story JSON exceeds 256 KiB');
  const story = JSON.parse(text), sources = [...new Set(audioSources(story))].sort();
  if (sources.length > LIMITS.assets) fail('JOB_BUDGET', `At most ${LIMITS.assets} assets`);
  const publicDir = path.join(root, 'public'), assets = [];
  let total = 0;
  for (const src of sources) {
    const file = strictInside(publicDir, src), bytes = fs.statSync(file).size;
    total += bytes;
    if (bytes > LIMITS.assetBytes || total > LIMITS.totalAssetBytes) fail('JOB_BUDGET', '16 MiB per asset, 32 MiB total');
    assets.push({src, file: 'assets/' + src, sha256: fileSha(file), bytes});
  }
  const hasAudio = Array.isArray(story.story?.audio?.clips) && story.story.audio.clips.length > 0;
  const manifest = {
    format: FORMAT, version: VERSION, jobId: '',
    story: {file: 'story.json', sha256: sha(Buffer.from(text, 'utf8')), bytes: Buffer.byteLength(text)},
    assets,
    output: {container: 'mp4', videoCodec: 'h264', width: validated.video.width, height: validated.video.height, fps: validated.fps, frames: validated.frames, audio: hasAudio},
    engine: engineInfo(),
    runtime: runtimeInfo()
  };
  manifest.jobId = jobIdOf(manifest);
  const parent = path.resolve(out);
  fs.mkdirSync(parent, {recursive: true});
  canonicalDir(parent, 'JOB_OUTPUT');
  const dest = path.join(parent, manifest.jobId);
  if (fs.existsSync(dest)) {
    verifyJob(dest);
    const existing = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
    if (JSON.stringify(existing) !== JSON.stringify(manifest)) fail('JOB_EXISTS', 'A different job already exists at ' + dest);
    return {jobId: manifest.jobId, directory: dest, reused: true, manifest};
  }
  const staging = dest + '.partial-' + crypto.randomUUID();
  fs.mkdirSync(staging);
  try {
    fs.writeFileSync(path.join(staging, 'story.json'), text);
    for (const a of assets) {
      const target = path.join(staging, ...a.file.split('/'));
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.copyFileSync(path.join(publicDir, ...a.src.split('/')), target, fs.constants.COPYFILE_EXCL);
      if (fileSha(target) !== a.sha256) fail('JOB_ASSET_MODIFIED', 'Asset changed while packaging: ' + a.src);
    }
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    verifyJob(staging, {expectedId: manifest.jobId});
    fs.renameSync(staging, dest);
  } catch (e) {
    fs.rmSync(staging, {recursive: true, force: true});
    throw e;
  }
  return {jobId: manifest.jobId, directory: dest, reused: false, manifest};
}
/** Structural and integrity validation; never trusts the directory name. */
function verifyJob(input, {expectedId} = {}) {
  const dir = canonicalDir(input, 'JOB_PATH');
  const manifestFile = strictInside(dir, 'manifest.json');
  if (fs.statSync(manifestFile).size > LIMITS.manifestBytes) fail('JOB_MANIFEST', 'manifest.json exceeds 64 KiB');
  let m;
  try {m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));} catch {fail('JOB_MANIFEST', 'manifest.json is not valid JSON');}
  only(m, ['format', 'version', 'jobId', 'story', 'assets', 'output', 'engine', 'runtime'], 'manifest');
  if (m.format !== FORMAT || m.version !== VERSION) fail('JOB_VERSION', `Unsupported package format ${m.format}@${m.version}; this worker reads ${FORMAT}@${VERSION}`);
  only(m.story, ['file', 'sha256', 'bytes'], 'manifest.story');
  if (m.story.file !== 'story.json') fail('JOB_MANIFEST', 'story.file must be story.json');
  only(m.output, ['container', 'videoCodec', 'width', 'height', 'fps', 'frames', 'audio'], 'manifest.output');
  if (m.output.container !== 'mp4' || m.output.videoCodec !== 'h264' || ![m.output.width, m.output.height, m.output.fps, m.output.frames].every(Number.isInteger) || typeof m.output.audio !== 'boolean') fail('JOB_MANIFEST', 'output must request mp4/h264 with integer width, height, fps and frames');
  only(m.engine, ['name', 'packageVersion', 'digest', 'commit', 'dirty'], 'manifest.engine');
  if (m.engine.name !== 'toon-kit' || !/^[0-9a-f]{64}$/.test(m.engine.digest)) fail('JOB_MANIFEST', 'engine must name toon-kit with a sha256 digest');
  only(m.runtime, ['nodeMajor', 'remotion'], 'manifest.runtime');
  if (!Array.isArray(m.assets) || m.assets.length > LIMITS.assets) fail('JOB_MANIFEST', 'assets must be an array of at most ' + LIMITS.assets);
  if (typeof m.jobId !== 'string' || !JOB_ID.test(m.jobId) || m.jobId !== jobIdOf(m) || expectedId && m.jobId !== expectedId) fail('JOB_MANIFEST', 'jobId does not match the manifest inputs');
  const storyFile = strictInside(dir, 'story.json'), storyBuf = fs.readFileSync(storyFile);
  if (storyBuf.length !== m.story.bytes || storyBuf.length > LIMITS.storyBytes || sha(storyBuf) !== m.story.sha256) fail('JOB_STORY_MODIFIED', 'story.json does not match the manifest checksum');
  let story;
  try {story = JSON.parse(storyBuf.toString('utf8'));} catch {fail('JOB_STORY', 'story.json is not valid JSON');}
  const referenced = [...new Set(audioSources(story))].sort(), listed = m.assets.map(a => a?.src);
  if (JSON.stringify(referenced) !== JSON.stringify(listed)) fail('JOB_ASSET_SET', 'Manifest assets must list exactly the files the story references', {referenced, listed});
  let total = 0;
  for (const a of m.assets) {
    only(a, ['src', 'file', 'sha256', 'bytes'], 'manifest asset');
    if (a.file !== 'assets/' + a.src) fail('JOB_PATH', 'Asset file must be assets/<src>: ' + a.src);
    const file = strictInside(dir, a.file), bytes = fs.statSync(file).size;
    total += bytes;
    if (bytes !== a.bytes || bytes > LIMITS.assetBytes || total > LIMITS.totalAssetBytes) fail('JOB_ASSET_MODIFIED', 'Asset size differs or exceeds budget: ' + a.src);
    if (fileSha(file) !== a.sha256) fail('JOB_ASSET_MODIFIED', 'Asset checksum differs: ' + a.src);
  }
  const allowed = new Set(['manifest.json', 'story.json', ...m.assets.map(a => a.file)]);
  const extra = listFiles(dir).filter(f => !allowed.has(f));
  if (extra.length) fail('JOB_UNEXPECTED_FILE', 'Packages may contain only manifest.json, story.json and listed assets', {extra: extra.slice(0, 10)});
  return {dir, manifest: m, story, storyText: storyBuf.toString('utf8')};
}
function compatibility(m) {
  const local = runtimeInfo();
  if (local.nodeMajor < 24 || local.nodeMajor !== m.runtime.nodeMajor) fail('RUNTIME_UNSUPPORTED', `Package needs Node ${m.runtime.nodeMajor}; worker has ${process.versions.node}`);
  if (local.remotion !== m.runtime.remotion) fail('RUNTIME_UNSUPPORTED', `Package needs Remotion ${m.runtime.remotion}; worker has ${local.remotion}`);
  const digest = engineDigest();
  if (digest !== m.engine.digest) fail('ENGINE_MISMATCH', `Worker engine differs from the packaging engine (package commit ${m.engine.commit ?? 'unknown'}). Check out that commit with clean src/scripts and run npm ci`, {packageDigest: m.engine.digest, workerDigest: digest, packageCommit: m.engine.commit});
  return {digest, ...local};
}
function readJSON(file) {try {return JSON.parse(fs.readFileSync(file, 'utf8'));} catch {return null;}}
function atomicJSON(file, value) {
  const temp = file + '.next';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}
function measurements(report) {
  const s = report?.stats;
  return s ? {peakProcessTreeRSSBytes: s.peakProcessTreeRSS ?? null, peakWorkspaceTemporaryBytes: s.peakWorkspaceTemporaryBytes ?? null, minimumAvailableMemoryBytes: s.minimumAvailableMemoryBytes ?? null, limitExceeded: s.limitExceeded ?? null} : null;
}
async function runJob({job, verify = false}) {
  const started = Date.now();
  const base = {jobId: null, inputFingerprint: null, engine: null, status: 'FAILED', output: null, outputSHA256: null, frames: null, durationSeconds: null, preflight: null, resources: null, error: null};
  let outDir, checked;
  const finish = (result) => {
    result.wallMs = Date.now() - started;
    // A busy worker must not overwrite the result file of the run that holds the lock.
    if (outDir && result.error?.code !== 'WORKER_BUSY') atomicJSON(path.join(outDir, 'result.json'), result);
    return result;
  };
  try {
    if (typeof job !== 'string') fail('JOB_ARGUMENT', 'Use run --job=<package directory> [--verify=true]');
    checked = verifyJob(job);
  } catch (e) {
    return finish({...base, error: e.diagnostic ?? {code: 'JOB_INVALID', message: String(e)}});
  }
  const m = checked.manifest;
  Object.assign(base, {jobId: m.jobId, inputFingerprint: m.jobId, engine: {digest: m.engine.digest, commit: m.engine.commit}});
  outDir = path.join(root, 'out', 'jobs', m.jobId);
  fs.mkdirSync(outDir, {recursive: true});
  canonicalDir(outDir, 'JOB_OUTPUT');
  const output = path.join(outDir, 'video.mp4'), report = path.join(outDir, 'report.json'), planFile = path.join(outDir, 'story.json');
  const { fileHash, probe } = require('./story-segments.cjs');
  try {
    compatibility(m);
    const previous = readJSON(path.join(outDir, 'result.json'));
    if (previous?.status === 'COMPLETED' && previous.jobId === m.jobId && fs.existsSync(output) && fileHash(output) === previous.outputSHA256) return finish({...previous, resumed: 'already-complete'});
  } catch (e) {
    const d = e.diagnostic ?? {code: 'WORKER_FAILED', message: String(e)};
    return finish({...base, status: BLOCKING.has(d.code) ? 'BLOCKED' : 'FAILED', error: d});
  }
  const scratchRoot = path.join(root, '.remotion-tmp');
  fs.mkdirSync(scratchRoot, {recursive: true});
  const lock = path.join(scratchRoot, 'render-job.lock'), owner = crypto.randomUUID();
  let fd, stagedAudio;
  try {
    try {fd = fs.openSync(lock, 'wx');} catch {fail('WORKER_BUSY', 'Another render job holds .remotion-tmp/render-job.lock; wait for it or inspect it with its owner PID. Never delete a live lock');}
    fs.writeFileSync(fd, JSON.stringify({id: owner, pid: process.pid, jobId: m.jobId}));
    // Stage assets in a worker-owned public subtree; never overwrite a different file.
    stagedAudio = path.join(root, 'public', 'audio', 'jobs', m.jobId);
    const story = JSON.parse(checked.storyText);
    for (const a of m.assets) {
      const rel = a.src.slice('audio/'.length), target = path.join(stagedAudio, ...rel.split('/'));
      fs.mkdirSync(path.dirname(target), {recursive: true});
      if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isSymbolicLink() || fileHash(target) !== a.sha256) fail('STAGING_CONFLICT', 'A different file occupies ' + path.relative(root, target));
      } else fs.copyFileSync(path.join(checked.dir, ...a.file.split('/')), target, fs.constants.COPYFILE_EXCL);
      if (fileHash(target) !== a.sha256) fail('JOB_ASSET_MODIFIED', 'Staged asset checksum differs: ' + a.src);
    }
    if (m.assets.length) fs.writeFileSync(path.join(stagedAudio, '.owner.json'), JSON.stringify({jobId: m.jobId}));
    for (const a of Object.values(story.story?.audio?.assets ?? {})) a.src = 'audio/jobs/' + m.jobId + '/' + a.src.slice('audio/'.length);
    // Deterministic staged plan keeps the existing segment-resume fingerprint stable across runs.
    const planText = JSON.stringify(story, null, 2) + '\n';
    if (!fs.existsSync(planFile) || fs.readFileSync(planFile, 'utf8') !== planText) fs.writeFileSync(planFile, planText);
    const rendered = await require('./story.cjs').runAuthoredStory({command: 'render', plan: path.relative(root, planFile), output: path.relative(root, output), report: path.relative(root, report), verify});
    // Verify the published file independently; a run is never COMPLETED on exit status alone.
    const p = probe(output), video = p.streams.find(s => s.codec_type === 'video'), audio = p.streams.some(s => s.codec_type === 'audio');
    const frames = Number(video?.nb_read_frames);
    if (!video || video.codec_name !== 'h264' || video.width !== m.output.width || video.height !== m.output.height || video.r_frame_rate !== m.output.fps + '/1' || frames !== m.output.frames || audio !== m.output.audio) fail('OUTPUT_VERIFICATION', 'Rendered MP4 does not match the requested format', {codec: video?.codec_name, width: video?.width, height: video?.height, rate: video?.r_frame_rate, frames, audio});
    const renderReport = readJSON(report), preflightReport = readJSON(report + '.preflight.json');
    return finish({
      ...base,
      status: 'COMPLETED',
      engine: {digest: m.engine.digest, commit: m.engine.commit, workerCommit: engineInfo().commit},
      output,
      outputSHA256: fileHash(output),
      outputBytes: fs.statSync(output).size,
      frames,
      durationSeconds: frames / m.output.fps,
      audio,
      preflight: {pass: true, report: report + '.preflight.json', resources: measurements(preflightReport)},
      resources: measurements(renderReport),
      segments: rendered.orchestration ? (rendered.orchestration.segments ?? null) : null,
      report
    });
  } catch (e) {
    const d = e.diagnostic ?? {code: 'WORKER_FAILED', message: String(e)};
    // Never leave an unverified MP4 at the success path.
    if (fs.existsSync(output) && !fs.lstatSync(output).isSymbolicLink()) fs.renameSync(output, output + '.incomplete');
    const preflightReport = readJSON(report + '.preflight.json');
    return finish({...base, status: BLOCKING.has(d.code) ? 'BLOCKED' : 'FAILED', error: d, preflight: preflightReport ? {report: report + '.preflight.json', resources: measurements(preflightReport)} : null, retained: fs.existsSync(output + '.segments') ? output + '.segments' : null});
  } finally {
    if (stagedAudio && fs.existsSync(path.join(stagedAudio, '.owner.json')) && readJSON(path.join(stagedAudio, '.owner.json'))?.jobId === m.jobId && fs.realpathSync(stagedAudio) === stagedAudio) {
      fs.rmSync(stagedAudio, {recursive: true, maxRetries: 5, retryDelay: 100});
      const jobsDir = path.dirname(stagedAudio);
      if (fs.existsSync(jobsDir) && !fs.readdirSync(jobsDir).length) fs.rmdirSync(jobsDir);
    }
    if (fd !== undefined) {
      fs.closeSync(fd);
      if (readJSON(lock)?.id === owner) fs.unlinkSync(lock);
    }
  }
}
module.exports = {packageJob, verifyJob, runJob, engineDigest, jobIdOf, LIMITS, FORMAT, VERSION};
if (require.main === module) {
  const [command, ...rest] = process.argv.slice(2), args = {};
  const usage = 'Usage: node scripts/render-job.cjs package --plan=examples/name.story.json --out=<dir> | verify --job=<dir> | run --job=<dir> [--verify=true]';
  const print = (tag, v) => console.log(tag + ' ' + JSON.stringify(v));
  (async () => {
    for (const a of rest) {
      const m = /^--(plan|out|job|verify)=(.+)$/.exec(a);
      if (!m || Object.hasOwn(args, m[1])) fail('JOB_ARGUMENT', 'Unknown/duplicate argument ' + a + '. ' + usage);
      args[m[1]] = m[1] === 'verify' ? m[2] === 'true' : m[2];
    }
    if (command === 'package') {const r = await packageJob(args); print('RENDER_JOB_PACKAGED', {jobId: r.jobId, directory: r.directory, reused: r.reused, assets: r.manifest.assets.length, frames: r.manifest.output.frames});}
    else if (command === 'verify') {const r = verifyJob(args.job); const c = (() => {try {compatibility(r.manifest); return {compatible: true};} catch (e) {return {compatible: false, error: e.diagnostic};}})(); print('RENDER_JOB_VERIFIED', {jobId: r.manifest.jobId, assets: r.manifest.assets.length, frames: r.manifest.output.frames, ...c}); if (!c.compatible) process.exitCode = 2;}
    else if (command === 'run') {const r = await runJob(args); print('RENDER_JOB_RESULT', r); process.exitCode = r.status === 'COMPLETED' ? 0 : r.status === 'BLOCKED' ? 2 : 1;}
    else fail('JOB_ARGUMENT', usage);
  })().catch(e => {console.error(JSON.stringify({error: e.diagnostic ?? {code: 'JOB_FAILED', message: String(e)}})); process.exitCode = 1;});
}
