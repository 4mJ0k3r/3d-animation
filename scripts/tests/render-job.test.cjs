'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const J = require('../render-job.cjs');
const root = path.resolve(__dirname, '..', '..'), work = path.join(root, 'out', 'test-render-job');
const code = (fn, expected) => {try {fn();} catch (e) {assert.equal(e.diagnostic?.code, expected, JSON.stringify(e.diagnostic)); return e.diagnostic;} assert.fail('expected ' + expected);};
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
let pkg;
const clone = (name) => {const d = path.join(work, name); fs.rmSync(d, {recursive: true, force: true}); fs.cpSync(pkg.directory, d, {recursive: true}); return d;};
const manifestOf = (d) => JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8'));
const writeManifest = (d, m, rehash = true) => {if (rehash) m.jobId = J.jobIdOf(m); fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(m, null, 2));};

test.before(async () => {
  fs.rmSync(work, {recursive: true, force: true});
  fs.mkdirSync(work, {recursive: true});
  pkg = await J.packageJob({plan: 'examples/render-job-demo.story.json', out: path.join(work, 'outbox')});
});
test.after(() => fs.rmSync(work, {recursive: true, force: true}));

test('package contains only story, manifest and referenced assets with checksums and a stable input-derived ID', async () => {
  const m = pkg.manifest;
  assert.match(m.jobId, /^tk-[0-9a-f]{24}$/);
  assert.equal(path.basename(pkg.directory), m.jobId);
  assert.deepEqual(m.assets.map(a => [a.src, a.file]), [['audio/phase5e/naina_01.mp3', 'assets/audio/phase5e/naina_01.mp3']]);
  assert.equal(m.assets[0].sha256, sha(fs.readFileSync(path.join(root, 'public/audio/phase5e/naina_01.mp3'))));
  assert.deepEqual(m.output, {container: 'mp4', videoCodec: 'h264', width: 720, height: 1280, fps: 30, frames: 30, audio: true});
  assert.equal(m.engine.digest, J.engineDigest());
  assert.equal(m.runtime.nodeMajor, Number(process.versions.node.split('.')[0]));
  const files = []; const walk = (d, b = '') => {for (const e of fs.readdirSync(d, {withFileTypes: true})) {const r = b ? b + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else files.push(r);}};
  walk(pkg.directory);
  assert.deepEqual(files.sort(), ['assets/audio/phase5e/naina_01.mp3', 'manifest.json', 'story.json']);
  // portable: forward-slash relative paths only, no absolute machine paths anywhere in the manifest
  const text = fs.readFileSync(path.join(pkg.directory, 'manifest.json'), 'utf8');
  assert.ok(!text.includes(root) && !text.includes(root.replaceAll('\\', '\\\\')) && !/[A-Za-z]:\\\\/.test(text), 'no absolute paths');
  // stable: packaging the same inputs again reuses the identical job
  const again = await J.packageJob({plan: 'examples/render-job-demo.story.json', out: path.join(work, 'outbox')});
  assert.equal(again.jobId, m.jobId); assert.equal(again.reused, true);
  assert.equal(J.verifyJob(pkg.directory).manifest.jobId, m.jobId);
});

test('packages verify from any location and reject tampering, missing files and extra content', () => {
  // moved package (simulated transfer) still verifies: nothing depends on the original path
  const moved = clone('moved/inbox-copy');
  assert.equal(J.verifyJob(moved).manifest.jobId, pkg.jobId);
  const asset = (d) => path.join(d, 'assets', 'audio', 'phase5e', 'naina_01.mp3');
  let d = clone('tamper-asset'); const buf = fs.readFileSync(asset(d)); buf[100] ^= 0xff; fs.writeFileSync(asset(d), buf);
  code(() => J.verifyJob(d), 'JOB_ASSET_MODIFIED');
  d = clone('missing-asset'); fs.unlinkSync(asset(d));
  code(() => J.verifyJob(d), 'JOB_ASSET_MISSING');
  d = clone('tamper-story'); fs.appendFileSync(path.join(d, 'story.json'), ' ');
  code(() => J.verifyJob(d), 'JOB_STORY_MODIFIED');
  d = clone('extra-file'); fs.writeFileSync(path.join(d, 'run.sh'), 'echo hi');
  code(() => J.verifyJob(d), 'JOB_UNEXPECTED_FILE');
  d = clone('missing-manifest'); fs.unlinkSync(path.join(d, 'manifest.json'));
  code(() => J.verifyJob(d), 'JOB_ASSET_MISSING');
  d = clone('bad-json'); fs.writeFileSync(path.join(d, 'manifest.json'), '{');
  code(() => J.verifyJob(d), 'JOB_MANIFEST');
  d = clone('edited-id'); {const m = manifestOf(d); m.jobId = 'tk-' + '0'.repeat(24); writeManifest(d, m, false);}
  code(() => J.verifyJob(d), 'JOB_MANIFEST');
  d = clone('unknown-field'); {const m = manifestOf(d); m.command = 'rm -rf /'; writeManifest(d, m, false);}
  code(() => J.verifyJob(d), 'JOB_MANIFEST');
  d = clone('future-version'); {const m = manifestOf(d); m.version = 2; writeManifest(d, m, false);}
  code(() => J.verifyJob(d), 'JOB_VERSION');
  // a story that references an asset the manifest omits
  d = clone('asset-set'); {const m = manifestOf(d); m.assets = []; writeManifest(d, m);}
  code(() => J.verifyJob(d), 'JOB_ASSET_SET');
});

test('cross-platform path rules reject traversal, absolute, drive, backslash and linked entries', () => {
  for (const [name, file] of [['traversal', 'assets/../../secret.mp3'], ['absolute', '/etc/passwd'], ['drive', 'C:/Windows/win.ini'], ['backslash', 'assets\\audio\\phase5e\\naina_01.mp3'], ['dot', 'assets/./audio/phase5e/naina_01.mp3']]) {
    const d = clone('path-' + name), m = manifestOf(d); m.assets[0].file = file; writeManifest(d, m);
    const diag = code(() => J.verifyJob(d), 'JOB_PATH'); assert.ok(diag.message.length > 10, name);
  }
  // story asset sources are validated the same way
  const d = clone('story-traversal'), story = JSON.parse(fs.readFileSync(path.join(d, 'story.json'), 'utf8'));
  story.story.audio.assets.voice.src = 'audio/../../package.json';
  const text = JSON.stringify(story); fs.writeFileSync(path.join(d, 'story.json'), text);
  const m = manifestOf(d); m.story.sha256 = sha(Buffer.from(text)); m.story.bytes = Buffer.byteLength(text); writeManifest(d, m);
  code(() => J.verifyJob(d), 'JOB_ASSET_PATH');
  // a junction (no admin needed on Windows) or symlink inside the package is rejected
  const linked = clone('junction'), outside = path.join(work, 'outside'); fs.mkdirSync(outside, {recursive: true});
  fs.symlinkSync(outside, path.join(linked, 'assets', 'evil'), 'junction');
  code(() => J.verifyJob(linked), 'JOB_PATH');
  const linkedRoot = path.join(work, 'linked-root'); fs.rmSync(linkedRoot, {recursive: true, force: true}); fs.symlinkSync(pkg.directory, linkedRoot, 'junction');
  code(() => J.verifyJob(linkedRoot), 'JOB_PATH');
});

test('worker reports BLOCKED for incompatible engines or a busy worker, FAILED for invalid jobs, and never overwrites another run', async () => {
  const invalid = await J.runJob({job: path.join(work, 'does-not-exist')});
  assert.equal(invalid.status, 'FAILED'); assert.equal(invalid.error.code, 'JOB_PATH'); assert.equal(invalid.output, null);
  const d = clone('engine-mismatch'), m = manifestOf(d); m.engine.digest = 'f'.repeat(64); writeManifest(d, m);
  const blocked = await J.runJob({job: d});
  assert.equal(blocked.status, 'BLOCKED'); assert.equal(blocked.error.code, 'ENGINE_MISMATCH'); assert.equal(blocked.outputSHA256, null);
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'out', 'jobs', m.jobId, 'result.json'), 'utf8'));
  assert.equal(saved.status, 'BLOCKED');
  const r = clone('runtime-mismatch'), rm = manifestOf(r); rm.runtime.remotion = '0.0.0'; writeManifest(r, rm);
  assert.equal((await J.runJob({job: r})).error.code, 'RUNTIME_UNSUPPORTED');
  // a held worker lock blocks without touching the holder's result or staging
  const lock = path.join(root, '.remotion-tmp', 'render-job.lock');
  assert.ok(!fs.existsSync(lock), 'no live worker');
  fs.mkdirSync(path.dirname(lock), {recursive: true});
  // a distinct job ID, so it cannot short-circuit as an already-completed job
  const busyJob = clone('busy'), bm = manifestOf(busyJob); bm.output.frames = 31; writeManifest(busyJob, bm);
  const resultFile = path.join(root, 'out', 'jobs', bm.jobId, 'result.json'), before = fs.existsSync(resultFile) ? fs.readFileSync(resultFile, 'utf8') : null;
  fs.writeFileSync(lock, JSON.stringify({id: 'holder', pid: process.pid}));
  try {
    const busy = await J.runJob({job: busyJob});
    assert.equal(busy.status, 'BLOCKED'); assert.equal(busy.error.code, 'WORKER_BUSY');
    assert.equal(fs.existsSync(resultFile) ? fs.readFileSync(resultFile, 'utf8') : null, before, 'holder result untouched');
    assert.ok(fs.existsSync(lock), 'the holder lock is never removed by another run');
  } finally {fs.unlinkSync(lock);}
  assert.ok(!fs.existsSync(path.join(root, 'public', 'audio', 'jobs')), 'no staged assets left behind');
  for (const id of [m.jobId, rm.jobId, bm.jobId]) fs.rmSync(path.join(root, 'out', 'jobs', id), {recursive: true, force: true});
});

test('packaging rejects missing assets and unsupported references', async () => {
  const plan = path.join(work, 'missing-asset.story.json'), story = JSON.parse(fs.readFileSync(path.join(root, 'examples/render-job-demo.story.json'), 'utf8'));
  story.story.audio.assets.voice.src = 'audio/phase5e/not-here.mp3';
  fs.writeFileSync(plan, JSON.stringify(story));
  await assert.rejects(J.packageJob({plan: path.relative(root, plan), out: path.join(work, 'outbox')}), e => /ASSET|MISSING/.test(e.diagnostic?.code ?? ''));
  await assert.rejects(J.packageJob({plan: '../outside.story.json', out: path.join(work, 'outbox')}), e => e.diagnostic?.code === 'WORKSPACE_PATH');
});
