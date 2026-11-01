'use strict';

// Persistent completed artifacts are separate from disposable workspace scratch.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const {
  spawn,
  execFileSync
} = require('node:child_process');
const {
  productionPolicy: policy
} = require('./render-policy.cjs');
const {
  createMemoryGuard
} = require('./linux-memory.cjs');
const {
  monitor
} = require('./render-monitor.cjs');
function bytes(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, {
    withFileTypes: true
  })) {
    const f = path.join(dir, e.name);
    if (e.isSymbolicLink()) fail('MANIFEST_PATH', 'No redirected segment files');
    n += e.isDirectory() ? bytes(f) : fs.statSync(f).size;
  }
  return n;
}
const root = path.resolve(__dirname, '..');
const persistentLimit = 512 * 1024 * 1024;
function fail(code, message) {
  throw Object.assign(new Error(message), {
    diagnostic: {
      code,
      message
    }
  });
}
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function fileHash(file) {
  // In particular, never load an entire FFmpeg binary or video into the Node heap.
  const digest = crypto.createHash('sha256'),
    buffer = Buffer.allocUnsafe(64 * 1024),
    fd = fs.openSync(file, 'r');
  try {
    for (;;) {
      const n = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      digest.update(buffer.subarray(0, n));
    }
    return digest.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}
function canonical(file) {
  if (!fs.existsSync(file) || fs.realpathSync(file) !== file || !fs.statSync(file).isFile()) fail('MANIFEST_PATH', 'Missing or redirected artifact: ' + file);
  return file;
}
function atomic(file, value) {
  const temp = file + '.next';
  if (fs.existsSync(temp)) canonical(temp);
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
function sourceDigest() {
  const h = crypto.createHash('sha256');
  function visit(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), {
      withFileTypes: true
    }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.join(dir, entry.name),
        full = path.join(root, rel);
      if (entry.isSymbolicLink()) fail('INPUT_REDIRECT', 'Source trees may not contain symlinks');
      if (entry.isDirectory()) visit(rel);else {
        h.update(rel.replaceAll('\\', '/'));
        h.update(fs.readFileSync(full));
      }
    }
  }
  for (const dir of ['src', 'scripts']) visit(dir);
  for (const f of ['package.json', 'package-lock.json', 'tsconfig.json']) h.update(fs.readFileSync(path.join(root, f)));
  return h.digest('hex');
}
function executable(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const f = path.join(dir, name + (process.platform === 'win32' ? '.exe' : ''));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return fs.realpathSync(f);
  }
  fail('MEDIA_TOOL_MISSING', 'Install full FFmpeg and ffprobe on PATH');
}
function probe(file, countFrames = true) {
  canonical(file);
  const admission = createMemoryGuard(policy).admission();
  if (!admission.admitted) fail('MEMORY_ADMISSION', admission.reason);
  return JSON.parse(execFileSync(executable('ffprobe'), ['-v', 'error', ...(countFrames ? ['-count_frames'] : []), '-show_streams', '-show_data', '-show_format', '-of', 'json', file], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: policy.timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024
  }));
}
function videoSignature(p, expected) {
  const streams = p.streams,
    v = streams.find(s => s.codec_type === 'video');
  if (!v || v.codec_name !== 'h264' || v.width !== expected.width || v.height !== expected.height || v.r_frame_rate !== '30/1' || Number(v.nb_read_frames) !== expected.frames || streams.some(s => s.codec_type === 'audio')) fail('SEGMENT_MEDIA', 'Segment must be exact-frame, silent H264 at the requested resolution/30fps');
  return JSON.stringify(Object.fromEntries(['codec_name', 'profile', 'width', 'height', 'pix_fmt', 'level', 'r_frame_rate', 'time_base', 'extradata_size', 'extradata', 'sample_aspect_ratio', 'color_range', 'color_space', 'color_transfer', 'color_primaries'].map(k => [k, v[k]])));
}
async function guardedTool(binary, args, scratch, cancelled) {
  const guard = createMemoryGuard(policy),
    admission = guard.admission();
  if (!admission.admitted) fail('MEMORY_ADMISSION', admission.reason);
  if (cancelled()) fail('AUTHORING_CANCELLED', 'Cancelled before media assembly');
  const child = spawn(binary, args, {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', b => {
    stderr = (stderr + b.toString()).slice(-12000);
  });
  const stop = () => child.kill('SIGKILL');
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const watcher = monitor(child.pid, scratch, policy, stop, guard);
  let error;
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('Media assembly exited ' + code + ': ' + stderr)));
    });
  } catch (e) {
    error = e;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
  const stats = await watcher.stop();
  if (stats.limitExceeded || error || cancelled()) fail('ASSEMBLY_FAILED', stats.limitExceeded || String(error || 'Cancelled'));
  return stats;
}
async function renderSegments({
  job,
  compiled,
  files,
  planSHA256,
  planStorySegments,
  cancelled
}) {
  const segments = planStorySegments(compiled),
    fps = compiled.timeline.plan.fps;
  if (fps !== 30) fail('INVALID_TIMEBASE', 'Long stories require 30fps');
  const ffmpeg = executable('ffmpeg');
  // ffprobe is an explicit preflight prerequisite, never an assumed Remotion option.
  let probeVersion;
  try {
    probeVersion = execFileSync(executable('ffprobe'), ['-version'], {
      encoding: 'utf8',
      windowsHide: true
    }).split('\n')[0];
  } catch {
    fail('FFPROBE_MISSING', 'Install FFmpeg with ffprobe on PATH before long-story rendering');
  }
  for (const f of files) {
    const p = probe(f.file, false),
      stream = p.streams.find(s => s.codec_type === 'audio'),
      duration = Number(stream?.duration ?? p.format?.duration);
    if (!stream || !Number.isFinite(duration) || Math.abs(duration - compiled.timeline.audio.assets[f.id].durationInSeconds) > 1 / fps) fail('AUDIO_DURATION_MISMATCH', 'Missing/corrupt audio or duration mismatch: ' + f.id);
    for (const clip of compiled.timeline.audio.clips.filter(c => c.asset === f.id)) if ((clip.trimBeforeFrames + clip.endFrame - clip.startFrame) / fps > duration + 1e-8) fail('AUDIO_DURATION_MISMATCH', 'Clip trim exceeds measured playable source: ' + clip.id);
  }
  const ffmpegVersion = execFileSync(ffmpeg, ['-version'], {
    encoding: 'utf8',
    windowsHide: true
  }).split('\n')[0];
  const filters = execFileSync(ffmpeg, ['-hide_banner', '-filters'], {
    encoding: 'utf8',
    windowsHide: true
  });
  for (const name of ['asplit', 'amix', 'atrim', 'apad', 'adelay', 'aresample', 'aformat', 'asetpts', 'volume']) if (!new RegExp('\\b' + name + '\\b').test(filters)) fail('MEDIA_TOOL_FILTER', 'Full FFmpeg build must include ' + name);
  const input = {
    version: 1,
    planSHA256,
    sourceSHA256: sourceDigest(),
    policy,
    video: compiled.document.video,
    fps,
    node: process.version,
    renderer: require('@remotion/renderer/package.json').version,
    ffmpegSHA256: fileHash(ffmpeg),
    ffmpegVersion,
    probeSHA256: fileHash(executable('ffprobe')),
    probeVersion,
    assets: files.map(f => ({
      id: f.id,
      sha256: fileHash(f.file)
    })),
    font: fileHash(path.join(root, 'public/fonts/noto-devanagari/NotoSansDevanagari.ttf')),
    license: fileHash(path.join(root, 'public/fonts/noto-devanagari/OFL.txt'))
  };
  const fingerprint = hash(JSON.stringify(input)),
    dir = job.output + '.segments',
    manifestFile = path.join(dir, 'manifest.json');
  if (fs.existsSync(dir)) {
    if (fs.realpathSync(dir) !== dir || !fs.statSync(dir).isDirectory()) fail('MANIFEST_PATH', 'Segment directory may not be redirected');
  } else fs.mkdirSync(dir, {
    recursive: true
  });
  let manifest;
  if (fs.existsSync(manifestFile)) {
    canonical(manifestFile);
    manifest = JSON.parse(fs.readFileSync(manifestFile));
    if (manifest.version !== 1 || manifest.fingerprint !== fingerprint || manifest.output !== job.output || JSON.stringify(manifest.segments.map(({
      index,
      startFrame,
      endFrame
    }) => ({
      index,
      startFrame,
      endFrame
    }))) !== JSON.stringify(segments)) fail('RESUME_INPUT_MISMATCH', 'Plan, code, assets or render settings changed. Use a new output path; existing completed segments are preserved.');
  } else {
    if (fs.readdirSync(dir).length) fail('MANIFEST_PATH', 'Refusing to adopt a nonempty unowned segment directory');
    manifest = {
      version: 1,
      fingerprint,
      input,
      output: job.output,
      status: 'incomplete',
      segments: segments.map(s => ({
        ...s,
        status: 'pending'
      }))
    };
    atomic(manifestFile, manifest);
  }
  const owned = name => {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) canonical(f);
    return f;
  };
  let signature;
  const reports = [];
  let peakPersistentBytes = bytes(dir),
    diskFailure = false;
  const diskTick = () => {
    try {
      peakPersistentBytes = Math.max(peakPersistentBytes, bytes(dir));
      if (peakPersistentBytes > persistentLimit) {
        diskFailure = true;
        process.emit('SIGTERM');
      }
    } catch {
      diskFailure = true;
      process.emit('SIGTERM');
    }
  };
  const diskTimer = setInterval(diskTick, 1000);
  try {
    for (const s of manifest.segments) {
      if (cancelled()) fail('AUTHORING_CANCELLED', 'Cancelled; completed segments retained');
      if (bytes(dir) > persistentLimit) fail('SEGMENT_DISK_BUDGET', 'Persistent segment storage exceeds workspace temporary budget');
      const name = 'segment-' + s.index + '.mp4',
        file = owned(name),
        expected = {
          ...input.video,
          frames: s.endFrame - s.startFrame
        };
      if (s.status === 'complete') {
        if (!fs.existsSync(file) || fileHash(file) !== s.sha256) fail('RESUME_SEGMENT_INVALID', 'Completed segment is missing or modified: ' + name + '; use a new output path');
        const sig = videoSignature(probe(file), expected);
        if (signature && sig !== signature) fail('SEGMENT_COMPATIBILITY', 'Segment stream parameters differ');
        signature = sig;
        reports.push({
          index: s.index,
          reused: true
        });
        continue;
      }
      const partial = owned('segment-' + s.index + '.partial.mp4'),
        report = owned('segment-' + s.index + '.report.json');
      s.status = 'rendering';
      manifest.status = 'incomplete';
      atomic(manifestFile, manifest);
      await require('./render.cjs').runProductionRender({
        entry: 'src/index.ts',
        composition: 'AuthoredStory',
        frames: expected.frames,
        ...input.video,
        output: partial,
        report,
        inputProps: {
          document: compiled.document,
          segmentIndex: s.index,
          verify: job.verify ?? false
        }
      });
      if (cancelled()) fail('AUTHORING_CANCELLED', 'Cancelled; partial segment is not reusable');
      const sig = videoSignature(probe(partial), expected);
      if (signature && sig !== signature) fail('SEGMENT_COMPATIBILITY', 'Segment stream parameters differ');
      signature = sig;
      fs.renameSync(partial, file);
      Object.assign(s, {
        status: 'complete',
        sha256: fileHash(file),
        bytes: fs.statSync(file).size,
        signature: sig
      });
      atomic(manifestFile, manifest);
      reports.push({
        index: s.index,
        reused: false,
        report
      });
    }
    if (diskFailure) fail('SEGMENT_DISK_BUDGET', 'Persistent workspace segment budget exceeded');
    if (job.plan && fileHash(job.plan) !== planSHA256 || fileHash(path.join(root, 'public/fonts/noto-devanagari/NotoSansDevanagari.ttf')) !== input.font || fileHash(path.join(root, 'public/fonts/noto-devanagari/OFL.txt')) !== input.license || sourceDigest() !== input.sourceSHA256 || files.some(f => fileHash(f.file) !== input.assets.find(a => a.id === f.id).sha256)) fail('INPUT_CHANGED', 'Source or audio changed during rendering; no final output published');
    const concat = owned('concat.txt');
    fs.writeFileSync(concat, manifest.segments.map(s => `file 'segment-${s.index}.mp4'`).join('\n'));
    const joined = owned('joined.partial.mp4');
    const mergeStats = await guardedTool(ffmpeg, ['-hide_banner', '-y', '-threads', '2', '-f', 'concat', '-safe', '1', '-i', concat, '-map', '0:v:0', '-an', '-c:v', 'copy', joined], job.scratch, cancelled);
    videoSignature(probe(joined), {
      ...input.video,
      frames: compiled.timeline.plan.durationInFrames
    });
    let final = joined,
      audioStats = null;
    if (compiled.timeline.audio.clips.length) {
      const clips = compiled.timeline.audio.clips,
        assets = Object.entries(compiled.timeline.audio.assets);
      const args = ['-hide_banner', '-y', '-threads', '2', '-i', joined];
      for (const [id] of assets) args.push('-i', files.find(f => f.id === id).file);
      const filters = [];
      for (const [ai, [id]] of assets.entries()) {
        const uses = clips.map((c, i) => ({
          c,
          i
        })).filter(({
          c
        }) => c.asset === id);
        filters.push(`[${ai + 1}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=${uses.length}` + uses.map(({
          i
        }) => `[src${i}]`).join(''));
      }
      for (const [i, c] of clips.entries()) filters.push(`[src${i}]atrim=start_sample=${c.trimBeforeFrames * 1600}:end_sample=${(c.trimBeforeFrames + c.endFrame - c.startFrame) * 1600},asetpts=PTS-STARTPTS,volume=${c.volume},adelay=${c.startFrame * 1600}S:all=1[a${i}]`);
      const samples = compiled.timeline.plan.durationInFrames * 1600;
      filters.push(clips.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad=whole_len=${samples},atrim=end_sample=${samples}[mix]`);
      final = owned('final.partial.mp4');
      args.push('-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k', '-threads', '2', '-movflags', '+faststart', final);
      audioStats = await guardedTool(ffmpeg, args, job.scratch, cancelled);
    }
    const media = probe(final),
      v = media.streams.find(s => s.codec_type === 'video'),
      a = media.streams.find(s => s.codec_type === 'audio');
    if (Number(v?.nb_read_frames) !== compiled.timeline.plan.durationInFrames || Math.abs(Number(v?.duration) - compiled.timeline.plan.durationInFrames / 30) > 1 / 48000 || !!a !== !!compiled.timeline.audio.clips.length || a && (a.sample_rate !== '48000' || a.channels !== 2 || Math.abs(Number(a.duration) - compiled.timeline.plan.durationInFrames / 30) > 1 / 48000)) fail('FINAL_MEDIA_INVALID', 'Frame count/duration or audio sample timebase mismatch; final not published');
    diskTick();
    if (diskFailure) fail('SEGMENT_DISK_BUDGET', 'Persistent workspace segment budget exceeded');
    if (cancelled()) fail('AUTHORING_CANCELLED', 'Cancelled before publication');
    // Atomic same-volume publication. An incomplete video is never the output path.
    const finalSHA256 = fileHash(final);
    fs.renameSync(final, job.output);
    delete manifest.failure;
    Object.assign(manifest, {
      status: 'complete',
      finalSHA256,
      completedAt: new Date().toISOString()
    });
    atomic(manifestFile, manifest);
    const result = {
      segmented: true,
      manifest: manifestFile,
      output: job.output,
      frames: compiled.timeline.plan.durationInFrames,
      segments: reports,
      media,
      mergeStats,
      audioStats,
      retainedBytes: bytes(dir),
      peakPersistentBytes,
      persistentLimit,
      input
    };
    fs.mkdirSync(path.dirname(job.report), {
      recursive: true
    });
    fs.writeFileSync(job.report, JSON.stringify(result, null, 2));
    // Remove only fixed, checked, private assembly files. Retain validated segments/reports.
    for (const name of ['concat.txt', 'joined.partial.mp4', 'final.partial.mp4']) {
      const f = owned(name);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    return result;
  } catch (e) {
    manifest.status = 'incomplete';
    manifest.failure = String(e);
    atomic(manifestFile, manifest);
    throw e;
  } finally {
    clearInterval(diskTimer);
  }
}
module.exports = {
  renderSegments,
  probe,
  videoSignature,
  sourceDigest,
  hash,
  atomic
};
