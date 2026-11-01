'use strict';

/**
 * Phase 7B-A private render relay. Moves Phase 7A job packages and results through
 * one private S3-compatible bucket. Muse runs `submit` and `fetch` (no polling). The
 * single trusted worker runs `worker`. Layout under <prefix>/:
 *   pending/<jobId>/manifest.json, story.json, assets/..., READY.json (written last)
 *   results/<jobId>/video.mp4, video.mp4.sha256, result.json (written last)
 * Nothing is ever deleted from the bucket by this code.
 */
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const J = require('./render-job.cjs');
const root = path.resolve(__dirname, '..');
const READY_FORMAT = 'toonkit-relay-ready', RESULT_FORMAT = 'toonkit-relay-result';
// Videos are uploaded as one signed PUT (well below the 5 GiB single-object limit).
const CAPS = Object.freeze({jsonBytes: 256 * 1024, videoBytes: 512 * 1024 * 1024, files: J.LIMITS.assets + 2});
const STATUSES = ['COMPLETED', 'BLOCKED', 'FAILED'];
function fail(code, message, details) {
  throw Object.assign(new Error(message), {diagnostic: {code, message, ...(details === undefined ? {} : {details})}});
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, v) => crypto.createHmac('sha256', k).update(v).digest();
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// ---------- configuration (never printed) ----------
const CONFIG_FILE = '.toonkit-relay.json';
function loadConfig(env = process.env) {
  let file = {};
  const configPath = env.TOONKIT_RELAY_CONFIG ? path.resolve(env.TOONKIT_RELAY_CONFIG) : path.join(root, CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    try {file = JSON.parse(fs.readFileSync(configPath, 'utf8'));} catch {fail('RELAY_CONFIG', 'Relay config file is not valid JSON: ' + path.basename(configPath));}
    if (process.platform !== 'win32' && (fs.statSync(configPath).mode & 0o077)) fail('RELAY_CONFIG', `Restrict the relay config file: chmod 600 ${path.basename(configPath)}`);
  }
  const pick = (envKey, fileKey) => env[envKey] ?? file[fileKey];
  const cfg = {
    transport: pick('TOONKIT_RELAY_TRANSPORT', 'transport') ?? 's3',
    endpoint: pick('TOONKIT_RELAY_ENDPOINT', 'endpoint'),
    region: pick('TOONKIT_RELAY_REGION', 'region'),
    bucket: pick('TOONKIT_RELAY_BUCKET', 'bucket'),
    prefix: pick('TOONKIT_RELAY_PREFIX', 'prefix') ?? 'toonkit',
    pathStyle: String(pick('TOONKIT_RELAY_PATH_STYLE', 'pathStyle') ?? 'true') !== 'false',
    accessKeyId: pick('TOONKIT_RELAY_ACCESS_KEY_ID', 'accessKeyId'),
    secretAccessKey: pick('TOONKIT_RELAY_SECRET_ACCESS_KEY', 'secretAccessKey'),
    dir: pick('TOONKIT_RELAY_DIR', 'dir')
  };
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(cfg.prefix)) fail('RELAY_CONFIG', 'prefix must be a short lowercase name such as toonkit');
  if (cfg.transport === 'dir') {
    if (typeof cfg.dir !== 'string' || !cfg.dir) fail('RELAY_CONFIG', 'Directory transport needs TOONKIT_RELAY_DIR');
    return Object.freeze({...cfg, accessKeyId: undefined, secretAccessKey: undefined});
  }
  if (cfg.transport !== 's3') fail('RELAY_CONFIG', 'transport must be s3 (or dir for isolated tests)');
  const missing = ['endpoint', 'region', 'bucket', 'accessKeyId', 'secretAccessKey'].filter(k => typeof cfg[k] !== 'string' || !cfg[k]);
  if (missing.length) fail('RELAY_NOT_CONFIGURED', 'Set TOONKIT_RELAY_' + missing.map(k => k.replace(/[A-Z]/g, c => '_' + c).toUpperCase()).join(', TOONKIT_RELAY_') + ' or the gitignored ' + CONFIG_FILE + '. See RENDER_JOBS.md');
  let url;
  try {url = new URL(cfg.endpoint);} catch {fail('RELAY_CONFIG', 'endpoint must be a URL such as https://<account>.r2.cloudflarestorage.com');}
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) fail('RELAY_CONFIG', 'endpoint must use https (plain http is allowed only for a loopback test server)');
  if (url.pathname !== '/' || url.search || url.username || url.password) fail('RELAY_CONFIG', 'endpoint must be a bare origin without path, query or credentials');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(cfg.bucket)) fail('RELAY_CONFIG', 'bucket must be a valid S3 bucket name');
  return Object.freeze(cfg);
}
/** Safe description for logs: no keys or secrets. */
const describeConfig = (c) => c.transport === 'dir' ? {transport: 'dir', prefix: c.prefix} : {transport: 's3', endpoint: c.endpoint, region: c.region, bucket: c.bucket, prefix: c.prefix, pathStyle: c.pathStyle, credentials: 'configured'};

// ---------- AWS Signature Version 4 ----------
function signRequest({method, url, headers = {}, payloadHash, accessKeyId, secretAccessKey, region, now = new Date()}) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = amzDate.slice(0, 8);
  const all = {};
  for (const [k, v] of Object.entries({...headers, host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate})) all[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  const names = Object.keys(all).sort(), signedHeaders = names.join(';');
  const query = [...url.searchParams].map(([k, v]) => [rfc3986(k), rfc3986(v)]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0).map(([k, v]) => k + '=' + v).join('&');
  const canonical = [method, url.pathname, query, names.map(n => n + ':' + all[n] + '\n').join(''), signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return {...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`, signature};
}
const EMPTY = sha('');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function s3Transport(cfg, {attempts = 4, baseDelayMs = 500, timeoutMs = 120000} = {}) {
  const origin = new URL(cfg.endpoint);
  const urlFor = (key, query) => {
    const encoded = key ? '/' + key.split('/').map(rfc3986).join('/') : '/';
    const u = cfg.pathStyle ? new URL('/' + rfc3986(cfg.bucket) + (key ? encoded : ''), origin) : new URL(encoded, `${origin.protocol}//${cfg.bucket}.${origin.host}`);
    for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
    return u;
  };
  async function request(method, key, {query, body, payloadHash = EMPTY, headers = {}, okMissing = false} = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const url = urlFor(key, query), signed = signRequest({method, url, headers, payloadHash, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region});
        const {host, signature, ...send} = signed;
        if (body) send['content-length'] = String(body.length);
        const res = await fetch(url, {method, headers: send, body, signal: AbortSignal.timeout(timeoutMs), redirect: 'error'});
        if (res.status === 404 && okMissing) {await res.arrayBuffer().catch(() => {}); return null;}
        if (res.ok) return res;
        const text = (await res.text().catch(() => '')).slice(0, 2000), s3code = /<Code>([^<]{1,64})<\/Code>/.exec(text)?.[1] ?? 'HTTP' + res.status;
        if (res.status === 401 || res.status === 403) fail('RELAY_AUTH', `Storage rejected the credentials or permissions (${s3code}). Check the key's bucket/prefix scope`);
        if (res.status === 404) fail('RELAY_MISSING', `Object or bucket not found (${s3code})`);
        if (res.status < 500 && res.status !== 429) fail('RELAY_REQUEST', `Storage rejected ${method} (${s3code})`);
        lastError = new Error(s3code);
      } catch (e) {
        if (e.diagnostic) throw e;
        lastError = e;
      }
      if (attempt < attempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
    fail('RELAY_NETWORK', `Storage request failed after ${attempts} attempts: ${String(lastError?.message ?? lastError).slice(0, 200)}`);
  }
  return {
    async head(key) {
      const r = await request('HEAD', key, {okMissing: true});
      return r ? {size: Number(r.headers.get('content-length')), sha256: r.headers.get('x-amz-meta-sha256')} : null;
    },
    async put(key, buffer) {
      const hash = sha(buffer);
      // A signed payload hash makes the store reject any corrupted or truncated body.
      await request('PUT', key, {body: buffer, payloadHash: hash, headers: {'x-amz-meta-sha256': hash, 'content-type': 'application/octet-stream'}});
      return hash;
    },
    async getBuffer(key, maxBytes) {
      const r = await request('GET', key, {okMissing: true});
      if (!r) return null;
      return readCapped(r.body, maxBytes, key);
    },
    async getToFile(key, file, maxBytes) {
      const r = await request('GET', key);
      return writeCapped(r.body, file, maxBytes, key);
    },
    async list(prefix) {
      const out = [];
      let token;
      for (let page = 0; page < 1000; page++) {
        const r = await request('GET', '', {query: {'list-type': '2', prefix, ...(token ? {'continuation-token': token} : {})}});
        const xml = await r.text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = xmlText(/<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1]), modified = /<LastModified>([^<]+)<\/LastModified>/.exec(m[1])?.[1];
          if (key) out.push({key, lastModified: Date.parse(modified ?? '') || 0});
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xmlText(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]) : undefined;
        if (!token) return out;
      }
      fail('RELAY_REQUEST', 'Listing exceeded 1000 pages');
    }
  };
}
const xmlText = (s) => s === undefined ? undefined : s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function readCapped(stream, maxBytes, key) {
  const chunks = [];
  let n = 0;
  for await (const c of stream) {
    n += c.length;
    if (n > maxBytes) fail('RELAY_OBJECT_TOO_LARGE', `${key} exceeds ${maxBytes} bytes`);
    chunks.push(Buffer.from(c));
  }
  return Buffer.concat(chunks);
}
async function writeCapped(stream, file, maxBytes, key) {
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  const fd = fs.openSync(file, 'wx', 0o600);
  let n = 0;
  try {
    for await (const c of stream) {
      n += c.length;
      if (n > maxBytes) fail('RELAY_OBJECT_TOO_LARGE', `${key} exceeds ${maxBytes} bytes`);
      fs.writeSync(fd, Buffer.from(c));
    }
  } finally {fs.closeSync(fd);}
  return {size: n};
}
/** Isolated test transport with object-store semantics: whole-object atomic writes. */
function dirTransport(cfg) {
  const base = path.resolve(cfg.dir);
  fs.mkdirSync(base, {recursive: true});
  const fileOf = (key) => {
    if (!J.safeRelative(key)) fail('RELAY_REQUEST', 'Unsafe object key ' + JSON.stringify(key));
    return path.join(base, ...key.split('/'));
  };
  return {
    async head(key) {
      const f = fileOf(key);
      return fs.existsSync(f) && fs.statSync(f).isFile() ? {size: fs.statSync(f).size, sha256: J.fileSha(f)} : null;
    },
    async put(key, buffer) {
      const f = fileOf(key), t = f + '.upload-' + crypto.randomUUID();
      fs.mkdirSync(path.dirname(f), {recursive: true});
      fs.writeFileSync(t, buffer);
      fs.renameSync(t, f);
      return sha(buffer);
    },
    async getBuffer(key, maxBytes) {
      const f = fileOf(key);
      if (!fs.existsSync(f)) return null;
      if (fs.statSync(f).size > maxBytes) fail('RELAY_OBJECT_TOO_LARGE', `${key} exceeds ${maxBytes} bytes`);
      return fs.readFileSync(f);
    },
    async getToFile(key, file, maxBytes) {
      const f = fileOf(key);
      if (!fs.existsSync(f)) fail('RELAY_MISSING', 'Object not found: ' + key);
      return writeCapped(fs.createReadStream(f), file, maxBytes, key);
    },
    async list(prefix) {
      const out = [], walk = (dir, rel) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
          const k = rel ? rel + '/' + e.name : e.name;
          if (e.isDirectory()) walk(path.join(dir, e.name), k);
          else if (k.startsWith(prefix) && !e.name.includes('.upload-')) out.push({key: k, lastModified: fs.statSync(path.join(dir, e.name)).mtimeMs});
        }
      };
      walk(base, '');
      return out;
    }
  };
}
const openTransport = (cfg, options) => cfg.transport === 'dir' ? dirTransport(cfg) : s3Transport(cfg, options);

// ---------- relay protocol ----------
const keys = (cfg, id) => ({pending: `${cfg.prefix}/pending/${id}/`, ready: `${cfg.prefix}/pending/${id}/READY.json`, results: `${cfg.prefix}/results/${id}/`, result: `${cfg.prefix}/results/${id}/result.json`, video: `${cfg.prefix}/results/${id}/video.mp4`, checksum: `${cfg.prefix}/results/${id}/video.mp4.sha256`});
const checkId = (id) => {if (typeof id !== 'string' || !J.JOB_ID.test(id)) fail('RELAY_ARGUMENT', 'Use a job ID such as tk-0123456789abcdef01234567'); return id;};
async function getJSON(t, key) {
  const b = await t.getBuffer(key, CAPS.jsonBytes);
  if (!b) return null;
  try {return JSON.parse(b.toString('utf8'));} catch {fail('RELAY_REMOTE_INVALID', 'Remote JSON is malformed: ' + key.split('/').slice(-1)[0]);}
}
function validateReady(ready, id) {
  if (!ready || ready.format !== READY_FORMAT || ready.version !== 1 || ready.jobId !== id || typeof ready.submissionId !== 'string' || !/^[0-9a-f-]{36}$/.test(ready.submissionId) || !Array.isArray(ready.files) || !ready.files.length || ready.files.length > CAPS.files) fail('RELAY_PACKAGE_INVALID', 'READY marker is malformed');
  const seen = new Set();
  let total = 0;
  for (const f of ready.files) {
    if (!f || Object.keys(f).sort().join() !== 'bytes,path,sha256' || !J.safeRelative(f.path) || !(f.path === 'manifest.json' || f.path === 'story.json' || f.path.startsWith('assets/audio/')) || seen.has(f.path) || !/^[0-9a-f]{64}$/.test(f.sha256) || !Number.isInteger(f.bytes) || f.bytes < 1) fail('RELAY_PACKAGE_INVALID', 'READY lists an unsafe or invalid file: ' + JSON.stringify(f?.path));
    seen.add(f.path);
    total += f.bytes;
  }
  if (!seen.has('manifest.json') || !seen.has('story.json') || total > J.LIMITS.totalAssetBytes + J.LIMITS.storyBytes + J.LIMITS.manifestBytes) fail('RELAY_PACKAGE_INVALID', 'READY must list manifest.json and story.json within the package budget');
  return ready;
}
function validateResult(r, id) {
  if (!r || r.format !== RESULT_FORMAT || r.version !== 1 || r.jobId !== id || !STATUSES.includes(r.status)) fail('RELAY_REMOTE_INVALID', 'Remote result.json is malformed or belongs to another job');
  if (r.status === 'COMPLETED' && (!/^[0-9a-f]{64}$/.test(r.outputSHA256 ?? '') || !Number.isInteger(r.outputBytes) || r.outputBytes < 1 || r.outputBytes > CAPS.videoBytes)) fail('RELAY_REMOTE_INVALID', 'COMPLETED result lacks a valid output checksum');
  return r;
}
/** Upload a verified Phase 7A package; idempotent and resumable. */
async function submit({job, retry = false}, cfg, t) {
  const {dir, manifest} = J.verifyJob(job), id = manifest.jobId, k = keys(cfg, id);
  const files = ['manifest.json', 'story.json', ...manifest.assets.map(a => a.file)].map(p => {
    const f = path.join(dir, ...p.split('/'));
    return {path: p, sha256: J.fileSha(f), bytes: fs.statSync(f).size};
  });
  const existing = await getJSON(t, k.result);
  if (existing) validateResult(existing, id);
  if (existing?.status === 'COMPLETED') return {jobId: id, status: 'COMPLETED', uploaded: 0, note: 'Already rendered; run fetch'};
  const ready = await getJSON(t, k.ready);
  const sameFiles = ready && JSON.stringify(validateReady(ready, id).files) === JSON.stringify(files);
  if (sameFiles && !(retry && existing)) return {jobId: id, status: existing?.status ?? 'PENDING', uploaded: 0, note: existing ? 'Already processed; use --retry=true to request another attempt' : 'Already submitted'};
  let uploaded = 0, skipped = 0;
  for (const f of files) {
    const h = await t.head(k.pending + f.path);
    if (h && h.size === f.bytes && h.sha256 === f.sha256) {skipped++; continue;}
    await t.put(k.pending + f.path, fs.readFileSync(path.join(dir, ...f.path.split('/'))));
    uploaded++;
  }
  // The marker is published only after every file is present; a new submissionId requests a new attempt.
  await t.put(k.ready, Buffer.from(JSON.stringify({format: READY_FORMAT, version: 1, jobId: id, submissionId: crypto.randomUUID(), files}, null, 2)));
  return {jobId: id, status: 'PENDING', uploaded, skipped, files: files.length};
}
/** Muse-side status/fetch. Never polls; one call per invocation. */
async function fetchResult({job, out, download = true}, cfg, t) {
  const id = checkId(job), k = keys(cfg, id);
  const r = await getJSON(t, k.result);
  if (!r) {
    if (await t.head(k.ready)) return {jobId: id, status: 'PENDING'};
    if (await t.head(k.pending + 'manifest.json')) return {jobId: id, status: 'INCOMPLETE', note: 'Upload was interrupted before READY; rerun submit with the same package'};
    return {jobId: id, status: 'NOT_FOUND'};
  }
  validateResult(r, id);
  if (r.status !== 'COMPLETED' || !download) return {jobId: id, status: r.status, verified: false, error: r.error ?? null, result: r};
  const dest = path.resolve(out ?? path.join(root, 'out', 'relay', id));
  fs.mkdirSync(dest, {recursive: true, mode: 0o700});
  const final = path.join(dest, 'video.mp4'), partial = final + '.partial-' + crypto.randomUUID();
  if (fs.existsSync(final) && J.fileSha(final) === r.outputSHA256) return {jobId: id, status: 'COMPLETED', verified: true, video: final, outputSHA256: r.outputSHA256, reused: true, result: r};
  const sidecar = (await t.getBuffer(k.checksum, 1024))?.toString('utf8').trim().split(/\s+/)[0];
  try {
    await t.getToFile(k.video, partial, r.outputBytes);
    const got = J.fileSha(partial), size = fs.statSync(partial).size;
    if (got !== r.outputSHA256 || sidecar !== r.outputSHA256 || size !== r.outputBytes) fail('RESULT_CHECKSUM', 'Downloaded video does not match the published checksum; it was discarded', {expected: r.outputSHA256, received: got, sidecar: sidecar ?? null});
    fs.renameSync(partial, final);
  } finally {
    if (fs.existsSync(partial)) fs.unlinkSync(partial);
  }
  fs.writeFileSync(path.join(dest, 'result.json'), JSON.stringify(r, null, 2) + '\n');
  return {jobId: id, status: 'COMPLETED', verified: true, video: final, outputSHA256: r.outputSHA256, result: r};
}
function remoteResult(local, ready, workerCommit) {
  // Publish no local absolute paths or host details; only portable result fields.
  const strip = (m) => m && {peakProcessTreeRSSBytes: m.peakProcessTreeRSSBytes ?? null, peakWorkspaceTemporaryBytes: m.peakWorkspaceTemporaryBytes ?? null};
  return {
    format: RESULT_FORMAT, version: 1,
    jobId: local.jobId ?? ready.jobId, submissionId: ready.submissionId, status: local.status,
    inputFingerprint: local.inputFingerprint ?? null, engine: local.engine ? {digest: local.engine.digest, commit: local.engine.commit ?? null, workerCommit} : null,
    output: local.status === 'COMPLETED' ? 'video.mp4' : null, outputSHA256: local.status === 'COMPLETED' ? local.outputSHA256 : null, outputBytes: local.status === 'COMPLETED' ? local.outputBytes : null,
    frames: local.frames ?? null, durationSeconds: local.durationSeconds ?? null, audio: local.audio ?? null,
    preflight: local.preflight ? {pass: !!local.preflight.pass, resources: strip(local.preflight.resources)} : null,
    resources: strip(local.resources), error: local.error ?? null, wallMs: local.wallMs ?? null, processedAt: new Date().toISOString()
  };
}
async function publish(t, k, result, videoFile) {
  if (result.status === 'COMPLETED') {
    if (!videoFile || J.fileSha(videoFile) !== result.outputSHA256 || fs.statSync(videoFile).size !== result.outputBytes) fail('OUTPUT_VERIFICATION', 'Local video no longer matches its verified checksum; nothing was published');
    const h = await t.head(k.video);
    if (!(h && h.size === result.outputBytes && h.sha256 === result.outputSHA256)) await t.put(k.video, fs.readFileSync(videoFile));
    await t.put(k.checksum, Buffer.from(result.outputSHA256 + '  video.mp4\n'));
  }
  // result.json is the completion marker and is always written last.
  await t.put(k.result, Buffer.from(JSON.stringify(result, null, 2) + '\n'));
}
/** Process at most one job. Returns null when nothing is eligible. */
async function workOnce({job, retryBlockedMinutes = 10, verify = false} = {}, cfg, t, run = J.runJob) {
  const base = path.join(root, '.remotion-tmp');
  fs.mkdirSync(base, {recursive: true});
  const lock = path.join(base, 'relay-worker.lock'), owner = crypto.randomUUID();
  let fd;
  try {fd = fs.openSync(lock, 'wx');} catch {fail('WORKER_BUSY', 'Another relay worker holds .remotion-tmp/relay-worker.lock; run exactly one worker. Never delete a live lock');}
  fs.writeFileSync(fd, JSON.stringify({id: owner, pid: process.pid}));
  let scratch;
  try {
    let candidates;
    if (job) candidates = [{id: checkId(job), forced: true}];
    else {
      const markers = (await t.list(cfg.prefix + '/pending/')).filter(o => o.key.endsWith('/READY.json')).map(o => ({id: o.key.split('/').slice(-2)[0], lastModified: o.lastModified})).filter(c => J.JOB_ID.test(c.id));
      candidates = markers.sort((a, b) => a.lastModified - b.lastModified || (a.id < b.id ? -1 : 1));
    }
    let pick;
    for (const c of candidates) {
      const k = keys(cfg, c.id), ready = await getJSON(t, k.ready);
      if (!ready) {if (c.forced) fail('RELAY_MISSING', 'No READY marker for ' + c.id); continue;}
      const prior = await getJSON(t, k.result);
      if (!c.forced && prior) {
        validateResult(prior, c.id);
        const resubmitted = prior.submissionId !== ready.submissionId;
        const blockedRetry = prior.status === 'BLOCKED' && Date.now() - Date.parse(prior.processedAt) > retryBlockedMinutes * 60000;
        if (prior.status === 'COMPLETED' || !resubmitted && !blockedRetry) continue;
      }
      pick = {id: c.id, k, ready};
      break;
    }
    if (!pick) return null;
    const {id, k} = pick;
    let ready;
    try {ready = validateReady(pick.ready, id);} catch (e) {
      const r = remoteResult({status: 'FAILED', error: e.diagnostic}, {jobId: id, submissionId: pick.ready?.submissionId ?? null}, null);
      await t.put(k.result, Buffer.from(JSON.stringify(r, null, 2) + '\n'));
      return r;
    }
    scratch = path.join(base, 'relay-' + owner);
    fs.mkdirSync(scratch, {mode: 0o700});
    fs.writeFileSync(path.join(scratch, 'owner.json'), JSON.stringify({id: owner}));
    const dir = path.join(scratch, id);
    let local;
    try {
      for (const f of ready.files) {
        const file = path.join(dir, ...f.path.split('/'));
        await t.getToFile(k.pending + f.path, file, f.bytes);
        if (J.fileSha(file) !== f.sha256 || fs.statSync(file).size !== f.bytes) fail('RELAY_PACKAGE_INVALID', 'Downloaded file does not match READY: ' + f.path);
      }
      J.verifyJob(dir); // full Phase 7A integrity check before anything renders
    } catch (e) {
      if (e.diagnostic?.code === 'RELAY_NETWORK') throw e; // transient: leave pending, publish nothing
      local = {status: 'FAILED', jobId: id, error: e.diagnostic ?? {code: 'RELAY_PACKAGE_INVALID', message: String(e)}};
    }
    local ??= await run({job: dir, verify});
    const result = remoteResult(local, ready, local.engine?.workerCommit ?? null);
    await publish(t, k, result, local.status === 'COMPLETED' ? local.output : null);
    return result;
  } finally {
    if (scratch && fs.existsSync(path.join(scratch, 'owner.json')) && JSON.parse(fs.readFileSync(path.join(scratch, 'owner.json'), 'utf8')).id === owner && path.dirname(scratch) === base) fs.rmSync(scratch, {recursive: true, maxRetries: 5, retryDelay: 100});
    fs.closeSync(fd);
    try {if (JSON.parse(fs.readFileSync(lock, 'utf8')).id === owner) fs.unlinkSync(lock);} catch {}
  }
}
/** Bounded unattended mode for the worker machine only. */
async function workLoop({intervalSeconds = 60, maxJobs = 10, maxMinutes = 60, verify = false, retryBlockedMinutes = 10} = {}, cfg, t, log = () => {}) {
  if (!(intervalSeconds >= 10 && intervalSeconds <= 3600 && maxJobs >= 1 && maxJobs <= 1000 && maxMinutes >= 1 && maxMinutes <= 24 * 60)) fail('RELAY_ARGUMENT', 'Use --interval=10..3600 seconds, --max-jobs=1..1000, --max-minutes=1..1440');
  const stopAt = Date.now() + maxMinutes * 60000, done = [];
  let stop = false;
  const onSignal = () => {stop = true;};
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    while (!stop && done.length < maxJobs && Date.now() < stopAt) {
      let r = null;
      try {r = await workOnce({verify, retryBlockedMinutes}, cfg, t);} catch (e) {log({error: e.diagnostic ?? {code: 'RELAY_FAILED', message: String(e)}}); if (e.diagnostic?.code === 'WORKER_BUSY' || e.diagnostic?.code === 'RELAY_AUTH') break;}
      if (r) {done.push({jobId: r.jobId, status: r.status}); log({processed: r.jobId, status: r.status}); continue;}
      for (let waited = 0; waited < intervalSeconds && !stop && Date.now() < stopAt; waited++) await sleep(1000);
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
  return {processed: done, stoppedBy: stop ? 'signal' : done.length >= maxJobs ? 'max-jobs' : 'max-minutes'};
}
module.exports = {loadConfig, describeConfig, signRequest, s3Transport, dirTransport, openTransport, submit, fetchResult, workOnce, workLoop, keys, READY_FORMAT, RESULT_FORMAT};
