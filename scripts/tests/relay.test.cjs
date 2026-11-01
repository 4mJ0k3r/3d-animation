'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const J = require('../render-job.cjs'), R = require('../relay.cjs');
const root = path.resolve(__dirname, '..', '..'), work = path.join(root, 'out', 'test-relay');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const code = async (p, expected) => {try {await p;} catch (e) {assert.equal(e.diagnostic?.code, expected, JSON.stringify(e.diagnostic)); return e.diagnostic;} assert.fail('expected ' + expected);};
let pkg, n = 0;
const fresh = () => {const d = path.join(work, 'store-' + ++n); return {cfg: R.loadConfig({TOONKIT_RELAY_TRANSPORT: 'dir', TOONKIT_RELAY_DIR: d}), dir: d};};
const objectFile = (dir, key) => path.join(dir, ...key.split('/'));
const stub = (status, extra = {}) => async ({job}) => ({status, jobId: J.verifyJob(job).manifest.jobId, error: status === 'COMPLETED' ? null : {code: status === 'BLOCKED' ? 'ENGINE_MISMATCH' : 'STORY_EVALUATION_FAILED', message: 'stub'}, wallMs: 1, ...extra});

test.before(async () => {
  fs.rmSync(work, {recursive: true, force: true});
  fs.mkdirSync(work, {recursive: true});
  pkg = await J.packageJob({plan: 'examples/render-job-demo.story.json', out: path.join(work, 'outbox')});
});
test.after(() => fs.rmSync(work, {recursive: true, force: true}));

test('SigV4 signing matches the published AWS S3 example and config never exposes secrets', () => {
  const s = R.signRequest({method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), headers: {range: 'bytes=0-9'}, payloadHash: sha(''), accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', now: new Date('2013-05-24T00:00:00Z')});
  assert.equal(s.signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  assert.throws(() => R.loadConfig({TOONKIT_RELAY_CONFIG: path.join(work, 'none.json')}), e => e.diagnostic.code === 'RELAY_NOT_CONFIGURED' && !/secret[^A]/i.test(e.message.replace('SECRET_ACCESS_KEY', '')));
  const env = {TOONKIT_RELAY_CONFIG: path.join(work, 'none.json'), TOONKIT_RELAY_ENDPOINT: 'https://acct.r2.cloudflarestorage.com', TOONKIT_RELAY_REGION: 'auto', TOONKIT_RELAY_BUCKET: 'toonkit-private', TOONKIT_RELAY_ACCESS_KEY_ID: 'AKIDTEST', TOONKIT_RELAY_SECRET_ACCESS_KEY: 'super-secret-value'};
  const cfg = R.loadConfig(env), shown = JSON.stringify(R.describeConfig(cfg));
  assert.ok(!shown.includes('super-secret-value') && !shown.includes('AKIDTEST'));
  for (const bad of ['http://example.com', 'https://example.com/path', 'https://user:pw@example.com', 'not a url']) assert.throws(() => R.loadConfig({...env, TOONKIT_RELAY_ENDPOINT: bad}), e => e.diagnostic.code === 'RELAY_CONFIG', bad);
  assert.ok(R.loadConfig({...env, TOONKIT_RELAY_ENDPOINT: 'http://127.0.0.1:9000'}), 'loopback http allowed for tests only');
  assert.throws(() => R.loadConfig({...env, TOONKIT_RELAY_BUCKET: 'Bad_Bucket'}), e => e.diagnostic.code === 'RELAY_CONFIG');
});

test('submit publishes READY last, is idempotent and resumes an interrupted upload', async () => {
  const {cfg, dir} = fresh(), base = R.openTransport(cfg), puts = [];
  const recording = {...base, put: async (k, b) => {puts.push(k); return base.put(k, b);}};
  const r = await R.submit({job: pkg.directory}, cfg, recording);
  assert.equal(r.jobId, pkg.jobId); assert.equal(r.status, 'PENDING'); assert.equal(r.uploaded, 3);
  assert.ok(puts.at(-1).endsWith('/READY.json'), 'READY is written after every package file');
  assert.equal((await R.fetchResult({job: pkg.jobId, download: false}, cfg, base)).status, 'PENDING');
  const again = await R.submit({job: pkg.directory}, cfg, recording);
  assert.equal(again.uploaded, 0); assert.equal(puts.length, 4, 'duplicate submission uploads nothing');
  // interrupted transfer: the network dies after the first object
  const s2 = fresh(), b2 = R.openTransport(s2.cfg);
  let left = 1;
  const flaky = {...b2, put: async (k, b) => {if (left-- <= 0) throw Object.assign(new Error('net'), {diagnostic: {code: 'RELAY_NETWORK', message: 'simulated'}}); return b2.put(k, b);}};
  await code(R.submit({job: pkg.directory}, s2.cfg, flaky), 'RELAY_NETWORK');
  assert.equal((await R.fetchResult({job: pkg.jobId, download: false}, s2.cfg, b2)).status, 'INCOMPLETE');
  assert.equal(await R.workOnce({}, s2.cfg, b2, stub('COMPLETED')), null, 'worker ignores a package without READY');
  const resumed = await R.submit({job: pkg.directory}, s2.cfg, b2);
  assert.equal(resumed.skipped, 1); assert.equal(resumed.uploaded, 2);
  // a tampered local package is never uploaded
  const bad = path.join(work, 'tampered'); fs.cpSync(pkg.directory, bad, {recursive: true}); fs.appendFileSync(path.join(bad, 'story.json'), ' ');
  await code(R.submit({job: bad}, cfg, base), 'JOB_STORY_MODIFIED');
  await code(R.fetchResult({job: '../../etc'}, cfg, base), 'RELAY_ARGUMENT');
});

test('worker rejects tampered remote packages and publishes FAILED/BLOCKED without any video', async () => {
  const {cfg, dir} = fresh(), t = R.openTransport(cfg), k = R.keys(cfg, pkg.jobId);
  await R.submit({job: pkg.directory}, cfg, t);
  const asset = objectFile(dir, k.pending + 'assets/audio/phase5e/naina_01.mp3'), buf = fs.readFileSync(asset); buf[50] ^= 1; fs.writeFileSync(asset, buf);
  let calls = 0;
  const r = await R.workOnce({}, cfg, t, async (a) => {calls++; return stub('COMPLETED')(a);});
  assert.equal(r.status, 'FAILED'); assert.equal(r.error.code, 'RELAY_PACKAGE_INVALID'); assert.equal(calls, 0, 'nothing renders from a tampered package');
  assert.equal(await t.head(k.video), null);
  // unsafe path inside READY
  const u = fresh(), ut = R.openTransport(u.cfg), uk = R.keys(u.cfg, pkg.jobId);
  await R.submit({job: pkg.directory}, u.cfg, ut);
  const ready = JSON.parse(fs.readFileSync(objectFile(u.dir, uk.ready), 'utf8')); ready.files.push({path: '../../outside.txt', sha256: '0'.repeat(64), bytes: 1});
  fs.writeFileSync(objectFile(u.dir, uk.ready), JSON.stringify(ready));
  const ur = await R.workOnce({}, u.cfg, ut, stub('COMPLETED'));
  assert.equal(ur.status, 'FAILED'); assert.equal(ur.error.code, 'RELAY_PACKAGE_INVALID');
  // BLOCKED is reported, not retried immediately, then retried after the window
  const b = fresh(), bt = R.openTransport(b.cfg);
  await R.submit({job: pkg.directory}, b.cfg, bt);
  assert.equal((await R.workOnce({}, b.cfg, bt, stub('BLOCKED'))).status, 'BLOCKED');
  const status = await R.fetchResult({job: pkg.jobId}, b.cfg, bt);
  assert.equal(status.status, 'BLOCKED'); assert.equal(status.verified, false); assert.equal(status.error.code, 'ENGINE_MISMATCH');
  assert.equal(await R.workOnce({}, b.cfg, bt, stub('BLOCKED')), null, 'recent BLOCKED is not retried');
  assert.equal((await R.workOnce({retryBlockedMinutes: 0}, b.cfg, bt, stub('BLOCKED'))).status, 'BLOCKED', 'retried after the window');
  // FAILED is final until the submitter explicitly retries with a new submission
  const f = fresh(), ft = R.openTransport(f.cfg);
  await R.submit({job: pkg.directory}, f.cfg, ft);
  assert.equal((await R.workOnce({}, f.cfg, ft, stub('FAILED'))).status, 'FAILED');
  assert.equal(await R.workOnce({retryBlockedMinutes: 0}, f.cfg, ft, stub('FAILED')), null);
  assert.equal((await R.submit({job: pkg.directory}, f.cfg, ft)).uploaded, 0, 'plain resubmit of a processed job is a no-op');
  const retried = await R.submit({job: pkg.directory, retry: true}, f.cfg, ft);
  assert.equal(retried.status, 'PENDING'); assert.equal(retried.uploaded, 0, 'retry reuses uploaded files, new READY only');
  assert.equal((await R.workOnce({}, f.cfg, ft, stub('FAILED'))).status, 'FAILED', 'retried submission is processed again');
  // a network failure during download publishes nothing and leaves the job pending
  const net = fresh(), nb = R.openTransport(net.cfg);
  await R.submit({job: pkg.directory}, net.cfg, nb);
  const down = {...nb, getToFile: async () => {throw Object.assign(new Error('x'), {diagnostic: {code: 'RELAY_NETWORK', message: 'simulated'}});}};
  await code(R.workOnce({}, net.cfg, down, stub('COMPLETED')), 'RELAY_NETWORK');
  assert.equal((await R.fetchResult({job: pkg.jobId, download: false}, net.cfg, nb)).status, 'PENDING');
  // exactly one worker
  const lock = path.join(root, '.remotion-tmp', 'relay-worker.lock'); fs.writeFileSync(lock, JSON.stringify({id: 'other', pid: 1}));
  try {await code(R.workOnce({}, net.cfg, nb, stub('COMPLETED')), 'WORKER_BUSY'); assert.ok(fs.existsSync(lock));} finally {fs.unlinkSync(lock);}
  assert.ok(!fs.readdirSync(path.join(root, '.remotion-tmp')).some(x => x.startsWith('relay-')), 'worker scratch removed by its owner');
});

/** Minimal private S3-compatible server on loopback: path style, SigV4 header required, payload hash enforced. */
function fakeS3(bucket) {
  const objects = new Map(), stats = {requests: 0, failNext: 0, unauthorized: 0};
  const server = http.createServer((req, res) => {
    stats.requests++;
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x'), parts = url.pathname.split('/').slice(1).map(decodeURIComponent);
      const auth = req.headers.authorization ?? '';
      if (!/^AWS4-HMAC-SHA256 Credential=AKIDLOCAL\/\d{8}\/auto\/s3\/aws4_request,SignedHeaders=[a-z0-9;-]+,Signature=[0-9a-f]{64}$/.test(auth) || !req.headers['x-amz-date']) {stats.unauthorized++; res.writeHead(403); return res.end('<Error><Code>AccessDenied</Code></Error>');}
      if (stats.failNext > 0) {stats.failNext--; res.writeHead(503); return res.end('<Error><Code>SlowDown</Code></Error>');}
      if (parts[0] !== bucket) {res.writeHead(404); return res.end('<Error><Code>NoSuchBucket</Code></Error>');}
      const key = parts.slice(1).join('/'), body = Buffer.concat(chunks);
      if (req.method === 'PUT') {
        if (req.headers['x-amz-content-sha256'] !== sha(body)) {res.writeHead(400); return res.end('<Error><Code>XAmzContentSHA256Mismatch</Code></Error>');}
        objects.set(key, {body, sha256: req.headers['x-amz-meta-sha256'], at: new Date()}); res.writeHead(200); return res.end();
      }
      if (req.method === 'GET' && !key && url.searchParams.get('list-type') === '2') {
        const all = [...objects.keys()].filter(k => k.startsWith(url.searchParams.get('prefix') ?? '')).sort(), start = Number(url.searchParams.get('continuation-token') ?? 0), page = all.slice(start, start + 2);
        const more = start + 2 < all.length;
        res.writeHead(200, {'content-type': 'application/xml'});
        return res.end(`<ListBucketResult>${page.map(k => `<Contents><Key>${k.replace(/&/g, '&amp;')}</Key><LastModified>${objects.get(k).at.toISOString()}</LastModified></Contents>`).join('')}<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + 2}</NextContinuationToken>` : ''}</ListBucketResult>`);
      }
      const o = objects.get(key);
      if (!o) {res.writeHead(404); return res.end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>');}
      res.writeHead(200, {'content-length': o.body.length, ...(o.sha256 ? {'x-amz-meta-sha256': o.sha256} : {})});
      res.end(req.method === 'HEAD' ? undefined : o.body);
    });
  });
  return {server, objects, stats};
}

test('end to end through a loopback S3-compatible server: submit, real guarded render, verified fetch and tamper rejection', async () => {
  const s3 = fakeS3('toonkit-test');
  await new Promise(r => s3.server.listen(0, '127.0.0.1', r));
  try {
    const cfg = R.loadConfig({TOONKIT_RELAY_CONFIG: path.join(work, 'none.json'), TOONKIT_RELAY_ENDPOINT: `http://127.0.0.1:${s3.server.address().port}`, TOONKIT_RELAY_REGION: 'auto', TOONKIT_RELAY_BUCKET: 'toonkit-test', TOONKIT_RELAY_ACCESS_KEY_ID: 'AKIDLOCAL', TOONKIT_RELAY_SECRET_ACCESS_KEY: 'local-secret'});
    const t = R.s3Transport(cfg, {baseDelayMs: 5});
    s3.stats.failNext = 1; // transient 503 is retried
    const sub = await R.submit({job: pkg.directory}, cfg, t);
    assert.equal(sub.status, 'PENDING'); assert.equal(s3.stats.unauthorized, 0);
    assert.equal((await R.fetchResult({job: pkg.jobId}, cfg, t)).status, 'PENDING');
    const res = await R.workOnce({}, cfg, t);
    assert.equal(res.status, 'COMPLETED', JSON.stringify(res.error));
    const remote = s3.objects.get(R.keys(cfg, pkg.jobId).result.slice(0)).body.toString();
    assert.ok(!remote.includes(root) && !remote.includes(root.replaceAll('\\', '\\\\')) && !remote.includes('local-secret'), 'published result has no local paths or secrets');
    assert.equal(await R.workOnce({}, cfg, t), null, 'completed jobs are not reprocessed');
    const outA = path.join(work, 'fetched-a'), got = await R.fetchResult({job: pkg.jobId, out: outA}, cfg, t);
    assert.equal(got.status, 'COMPLETED'); assert.equal(got.verified, true);
    assert.equal(J.fileSha(got.video), res.outputSHA256);
    assert.equal(sha(fs.readFileSync(path.join(root, 'out', 'jobs', pkg.jobId, 'video.mp4'))), res.outputSHA256);
    assert.equal((await R.fetchResult({job: pkg.jobId, out: outA}, cfg, t)).reused, true);
    assert.equal((await R.submit({job: pkg.directory}, cfg, t)).status, 'COMPLETED');
    // a corrupted remote video is discarded, never left at the output path
    const vk = R.keys(cfg, pkg.jobId).video, v = s3.objects.get(vk); const corrupt = Buffer.from(v.body); corrupt[1000] ^= 0xff; s3.objects.set(vk, {...v, body: corrupt});
    const outB = path.join(work, 'fetched-b');
    await code(R.fetchResult({job: pkg.jobId, out: outB}, cfg, t), 'RESULT_CHECKSUM');
    assert.ok(!fs.existsSync(path.join(outB, 'video.mp4')) && !fs.readdirSync(outB).some(f => f.includes('.partial-')));
    // wrong credentials surface as an auth error without retries or secret leakage
    const bad = R.s3Transport({...cfg, accessKeyId: 'WRONG'}, {baseDelayMs: 5});
    const d = await code(bad.head('toonkit/x'), 'RELAY_AUTH'); assert.ok(!d.message.includes('local-secret'));
  } finally {await new Promise(r => s3.server.close(r));}
});
