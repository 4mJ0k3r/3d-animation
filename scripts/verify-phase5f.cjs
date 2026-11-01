'use strict';

// Integration evidence only; run npm run test:authoring first to compile the contracts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'examples/phase5e-nikalna-v3.story.json')));
const visual = {...doc, story: {...doc.story, audio: undefined,
  scenes: doc.story.scenes.map(({cues, ...scene}) => scene)}};
assert.equal(crypto.createHash('sha256').update(JSON.stringify(visual)).digest('hex'),
  'a393cc4ea678e2f69e0141840c1cda99a699ae064cfc3a77e7e75783b72e35bd', 'silent v3 visuals changed');
const {compileStoryDocument} = require('../out/character-tests/toon-kit/authoring/document.js');
const compiled = compileStoryDocument(doc);
const audio = doc.story.audio;
assert.equal(audio.clips.length, 5);
assert.deepEqual(audio.clips.map(c => c.speaker), ['naina', 'naina', 'arjun', 'naina', 'arjun']);
assert.equal(compiled.timeline.captionTiming.filter(c => c.source === 'supplied').length, 5);
for (const clip of audio.clips) {
  const source = path.join(root, 'assests/audio', clip.asset + '.mp3');
  const published = path.join(root, 'public', audio.assets[clip.asset].src);
  assert.deepEqual(fs.readFileSync(source), fs.readFileSync(published), 'recording must be copied unchanged');
  const alignment = audio.alignments.find(a => a.clip === clip.id);
  assert.match(alignment.alignmentId, /estimated-words$/);
  assert.equal(clip.endFrame - clip.startFrame, Math.floor(audio.assets[clip.asset].durationInSeconds * 30));
}
for (let i = 1; i < audio.clips.length; i++) assert.ok(audio.clips[i].startFrame >= audio.clips[i - 1].endFrame);
if (process.argv.includes('--plan-only')) {
  console.log('PHASE5F_PLAN_PASS: unchanged visuals; five unchanged assets; correct speakers; bounded explicit word estimates; no overlap');
  process.exit(0);
}
const video = path.join(root, 'out/phase5e-nikalna-v3-narrated.mp4');
const run = (command, args) => execFileSync(command, args, {cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024});
const metadata = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', video]));
const v = metadata.streams.find(s => s.codec_type === 'video');
const a = metadata.streams.find(s => s.codec_type === 'audio');
assert.equal(v.codec_name, 'h264');
assert.equal(v.nb_read_frames, '840');
assert.equal(v.width, 720); assert.equal(v.height, 1280); assert.equal(v.avg_frame_rate, '30/1');
assert.equal(a.codec_name, 'aac'); assert.equal(a.sample_rate, '48000');
assert.ok(Math.abs(Number(metadata.format.duration) - 28) < 1 / 30);
const pcm = (file, seconds) => {
  const args = ['-v', 'error', '-threads', '2', '-i', file, '-map', '0:a:0'];
  if (seconds !== undefined) args.push('-t', String(seconds));
  // Match the production mono-to-stereo conversion before comparing mono PCM.
  const b = run('ffmpeg', [...args, '-af', 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo',
    '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1']);
  return Float32Array.from({length: b.length / 2}, (_, i) => b.readInt16LE(i * 2) / 32768);
};
const actual = pcm(video);
const correlation = audio.clips.map(clip => {
  const expected = pcm(path.join(root, 'public', audio.assets[clip.asset].src), (clip.endFrame - clip.startFrame) / 30);
  const offset = Math.round(clip.startFrame / 30 * 16000);
  let best = {correlation: -1, lagSamples: 0};
  for (let lag = -534; lag <= 534; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i < expected.length; i += 8) {
      const x = expected[i], y = actual[offset + i + lag] ?? 0;
      xy += x * y; xx += x * x; yy += y * y;
    }
    const score = xy / Math.sqrt(xx * yy);
    if (score > best.correlation) best = {correlation: score, lagSamples: lag, gain: Math.sqrt(yy / xx)};
  }
  assert.ok(best.correlation > .95, clip.id + ': source/export waveform differs');
  assert.ok(Math.abs(best.lagSamples) < 534, clip.id + ': audio shifted by a frame');
  assert.ok(Math.abs(best.gain - 1) < .08, clip.id + ': unexpected gain');
  return {clip: clip.id, ...best, lagMs: best.lagSamples / 16};
});
run('ffmpeg', ['-v', 'error', '-threads', '2', '-i', video, '-f', 'null', '-']);
const evidence = {visualsUnchanged: true, frames: 840, durationSeconds: 28, video: 'h264', audio: 'aac',
  correlation, wordTiming: 'Explicit duration/pause-guided estimates; no forced alignment or lip-sync certification'};
fs.mkdirSync(path.join(root, 'out/phase5f'), {recursive: true});
fs.writeFileSync(path.join(root, 'out/phase5f/verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
