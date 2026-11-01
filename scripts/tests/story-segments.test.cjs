'use strict';

const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  {
    execFileSync
  } = require('node:child_process');
const D = require('../../out/character-tests/toon-kit/authoring');
const example = () => JSON.parse(fs.readFileSync('examples/long-story.json', 'utf8'));
const error = (f, code) => assert.throws(f, e => !!e.diagnostic && (!code || e.diagnostic.code === code));
test('27-second global plan has deterministic scene-cut segments and unchanged 600-frame compiler limit', () => {
  const c = D.compileStoryDocument(example());
  assert.deepEqual(D.planStorySegments(c), [{
    index: 0,
    startFrame: 0,
    endFrame: 270
  }, {
    index: 1,
    startFrame: 270,
    endFrame: 540
  }, {
    index: 2,
    startFrame: 540,
    endFrame: 810
  }]);
  assert.deepEqual(D.planStorySegments(c), D.planStorySegments(D.compileStoryDocument(example())));
  error(() => require('../../out/character-tests/toon-kit/story/compiler').compileStory(c.document.story), 'INVALID_TIMEBASE');
  const frames = D.planStorySegments(c).flatMap(s => Array.from({
    length: s.endFrame - s.startFrame
  }, (_, f) => s.startFrame + f));
  assert.deepEqual(frames, Array.from({
    length: 810
  }, (_, i) => i));
  for (const n of [1801, 2000]) {
    const d = example();
    d.story.durationInFrames = n;
    error(() => D.compileStoryDocument(d), 'INVALID_TIMEBASE');
  }
  const d = example();
  d.story.fps = 24;
  error(() => D.compileStoryDocument(d), 'INVALID_TIMEBASE');
});
test('60 seconds uses six bounded scenes without raising any renderer limit; long seamless scenes reject', () => {
  const d = example();
  delete d.story.audio;
  const template = d.story.scenes[0];
  d.story.scenes = Array.from({
    length: 6
  }, (_, i) => ({
    ...structuredClone(template),
    id: 'minute-' + i,
    startFrame: i * 300,
    endFrame: (i + 1) * 300,
    beats: [],
    cues: [],
    shots: [{
      id: 'still',
      type: 'twoShot',
      subjects: template.axis,
      startFrame: i * 300,
      endFrame: (i + 1) * 300
    }]
  }));
  d.story.durationInFrames = 1800;
  const c = D.compileStoryDocument(d);
  assert.equal(D.planStorySegments(c).length, 6);
  for (let i = 0; i < 6; i++) {
    const local = D.compileStorySegment(c, i);
    assert.equal(local.timeline.plan.durationInFrames, 300);
    assert.equal(local.timeline.plan.scenes.length, 1);
    assert.equal(local.timeline.sample(0).scene.id, 'minute-' + i);
  }
  d.story.scenes[0].endFrame = 601;
  error(() => D.compileStoryDocument(d), 'SEGMENT_BOUNDARY');
});
test('absolute-to-local actions, shot endpoints and complete intents are pure in arbitrary frame order', () => {
  const c = D.compileStoryDocument(example());
  for (const s of D.planStorySegments(c)) {
    const local = D.compileStorySegment(c, s.index),
      fresh = D.compileStorySegment(D.compileStoryDocument(example()), s.index);
    assert.equal(local.timeline.plan.scenes[0].startFrame, 0);
    assert.equal(local.timeline.plan.scenes[0].endFrame, s.endFrame - s.startFrame);
    const samples = [0, 80, 20, 80, 0, 269].map(f => JSON.stringify(local.timeline.sample(f)));
    assert.equal(samples[0], samples[4]);
    assert.equal(samples[1], samples[3]);
    assert.deepEqual(local.timeline.sample(80), fresh.timeline.sample(80));
    for (const f of [0, 80, 120, 269]) {
      const global = c.timeline.sample(s.startFrame + f),
        l = local.timeline.sample(f);
      assert.equal(global.shot.id, l.shot.id);
      for (const [id, intent] of Object.entries(global.poses)) {
        const normalize = v => {
          if (v && typeof v === 'object' && 'startFrame' in v) return {
            ...v,
            startFrame: v.startFrame - s.startFrame,
            endFrame: v.endFrame - s.startFrame
          };
          return v;
        };
        assert.deepEqual(l.poses[id], Object.fromEntries(Object.entries(intent).map(([k, v]) => [k, normalize(v)])));
      }
    }
  }
  error(() => D.compileStorySegment(c, -1), 'INVALID_SEGMENT');
});
test('cross-cut caption words are neither omitted nor duplicated on the global clock', () => {
  const c = D.compileStoryDocument(example());
  for (let frame = 0; frame < 810; frame++) {
    const s = D.planStorySegments(c).find(s => frame >= s.startFrame && frame < s.endFrame),
      local = D.compileStorySegment(c, s.index);
    assert.deepEqual(local.timeline.captionWords.filter(w => frame - s.startFrame >= w.startFrame && frame - s.startFrame < w.endFrame).map(w => w.text), c.timeline.captionWords.filter(w => frame >= w.startFrame && frame < w.endFrame).map(w => w.text));
  }
  const before = c.timeline.captionWords.find(w => w.startFrame === 264);
  assert.deepEqual(before, {
    text: 'सुनो!',
    startFrame: 264,
    endFrame: 282
  });
});
test('supplied Hindi word alignment spanning a segment cut retains its exact original timing', () => {
  const d = example(),
    cue = d.story.scenes[0].cues.at(-1);
  cue.mode = 'words';
  cue.timing = 'supplied';
  cue.alignmentId = 'boundary';
  d.story.audio.alignments = [{
    alignmentId: 'boundary',
    clip: 'test-signal',
    text: cue.text,
    language: 'hi',
    words: [{
      text: cue.text,
      startSeconds: 8.8,
      endSeconds: 9.4
    }]
  }];
  const c = D.compileStoryDocument(d);
  assert.equal(c.timeline.captionTiming.find(x => x.id === 'boundary').source, 'supplied');
  assert.deepEqual(D.compileStorySegment(c, 0).timeline.captionWords.at(-1), {
    text: 'सुनो!',
    startFrame: 264,
    endFrame: 270
  });
  assert.deepEqual(D.compileStorySegment(c, 1).timeline.captionWords[0], {
    text: 'सुनो!',
    startFrame: 0,
    endFrame: 12
  });
  assert.deepEqual(c.timeline.sample(269).audio, c.timeline.sample(270).audio); // one uninterrupted clip, no segment trim/rounding
});
test('short authoring remains the same compiler and no audio is dropped from the short path', () => {
  const c = D.compileStoryDocument(JSON.parse(fs.readFileSync('examples/office-idea.story.json', 'utf8')));
  assert.equal(c.timeline.plan.durationInFrames, 240);
  assert.equal(D.planStorySegments(c).length, 1);
});
test('interrupted rendering retains hash-validated completed work and resumes; mismatches never reuse', async () => {
  const {
      renderSegments,
      probe
    } = require('../story-segments.cjs'),
    render = require('../render.cjs');
  const root = path.resolve('out/segment-recovery-test-' + process.pid),
    scratch = path.join(root, 'scratch');
  fs.mkdirSync(scratch, {
    recursive: true
  });
  const original = render.runProductionRender,
    env = Object.fromEntries(['TMPDIR', 'TMP', 'TEMP'].map(k => [k, process.env[k]]));
  for (const k of Object.keys(env)) process.env[k] = scratch;
  const ffmpeg = 'ffmpeg';
  const inputDocument = example();
  inputDocument.story.audio.clips = [{
    id: 'first',
    kind: 'narration',
    asset: 'signal',
    startFrame: 0,
    endFrame: 400,
    volume: 0.3
  }, {
    id: 'second',
    kind: 'dialogue',
    speaker: 'arun',
    asset: 'signal',
    startFrame: 400,
    endFrame: 810,
    trimBeforeFrames: 400,
    volume: 0.3
  }];
  const c = D.compileStoryDocument(inputDocument),
    compiled = {
      ...c,
      document: {
        ...c.document,
        video: {
          width: 16,
          height: 16
        }
      }
    };
  const job = {
      output: path.join(root, 'story.mp4'),
      report: path.join(root, 'report.json'),
      scratch
    },
    args = {
      job,
      compiled,
      files: [{
        id: 'signal',
        file: path.resolve('public/audio/long-story-signal.wav')
      }],
      planSHA256: 'test',
      planStorySegments: D.planStorySegments,
      cancelled: () => false
    };
  let calls = 0,
    interrupt = true;
  render.runProductionRender = async j => {
    calls++;
    if (interrupt && calls === 2) throw Error('simulated interrupted second render');
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'nullsrc=s=16x16:r=30', '-frames:v', String(j.frames), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', j.output], {
      windowsHide: true
    });
    fs.writeFileSync(j.report, '{}');
  };
  try {
    await assert.rejects(renderSegments(args), /simulated interrupted/);
    assert.equal(fs.existsSync(job.output), false);
    const mp = job.output + '.segments/manifest.json',
      first = JSON.parse(fs.readFileSync(mp));
    assert.equal(first.segments[0].status, 'complete');
    assert.equal(first.status, 'incomplete');
    const sha = first.segments[0].sha256;
    interrupt = false;
    const result = await renderSegments(args);
    assert.equal(calls, 4);
    assert.equal(result.segments[0].reused, true);
    assert.equal(JSON.parse(fs.readFileSync(mp)).segments[0].sha256, sha);
    const p = probe(job.output);
    assert.equal(p.streams.find(s => s.codec_type === 'video').nb_read_frames, '810');
    assert.equal(p.streams.find(s => s.codec_type === 'audio').duration, '27.000000');
    await assert.rejects(renderSegments({
      ...args,
      planSHA256: 'changed'
    }), e => e.diagnostic?.code === 'RESUME_INPUT_MISMATCH');
    fs.appendFileSync(path.join(job.output + '.segments', 'segment-0.mp4'), 'tamper');
    await assert.rejects(renderSegments(args), e => e.diagnostic?.code === 'RESUME_SEGMENT_INVALID');
  } finally {
    render.runProductionRender = original;
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];else process.env[k] = v;
    assert.ok(root.startsWith(path.resolve('out') + path.sep) && fs.realpathSync(root) === root);
    fs.rmSync(root, {
      recursive: true
    });
  }
});
test('production launcher rejects unrelated work for the entire authoring reservation', async () => {
  const lock = path.resolve('.remotion-tmp/authoring.lock');
  assert.equal(fs.existsSync(lock), false);
  fs.writeFileSync(lock, JSON.stringify({
    id: 'other-owner'
  }));
  try {
    await assert.rejects(require('../render.cjs').runProductionRender({}), /authoring job owns/);
  } finally {
    fs.unlinkSync(lock);
  }
});
test('segment-local actions preserve GLOBAL automatic blink, gesture, expression and camera state', () => {
  const T = require('three'),
    {
      ResourceOwner
    } = require('../../out/character-tests/toon-kit/internal/resources'),
    {
      createStory
    } = require('../../out/character-tests/toon-kit/story/player');
  const d = example();
  delete d.story.audio;
  d.story.scenes = d.story.scenes.slice(0, 2);
  d.story.durationInFrames = 300;
  for (const s of d.story.scenes) {
    s.cues = [];
    s.beats = [];
  }
  const second = d.story.scenes[1];
  second.endFrame = 300;
  second.shots[0].endFrame = 300;
  second.beats = [{
    id: 'act',
    startFrame: 275,
    endFrame: 295,
    actions: [{
      actor: 'rhea',
      type: 'expression',
      name: 'happy',
      transitionFrames: 4
    }, {
      actor: 'arun',
      type: 'gesture',
      name: 'wave'
    }]
  }];
  const source = D.compileStoryDocument(d),
    window = D.compileStorySegment(source, 1),
    owners = [];
  const make = (compiled, offset) => {
    const resources = new ResourceOwner(),
      a = new AbortController(),
      clean = [];
    const e = {
      profile: 'software-safe',
      scene: new T.Scene(),
      camera: new T.PerspectiveCamera(40, 9 / 16, .1, 100),
      signal: a.signal,
      track: o => resources.track(o),
      registerCleanup: f => clean.push(f)
    };
    owners.push(() => {
      a.abort();
      clean.forEach(f => f());
      resources.dispose();
    });
    const p = createStory(e, {
      timeline: compiled.timeline,
      settings: D.createStoryEnvironments(e, compiled),
      globalFrameOffset: offset
    });
    p.prepare();
    return {
      p,
      e
    };
  };
  try {
    const full = make(source, 0),
      local = make(window, 270);
    for (const frame of [270, 290, 280, 290, 270, 299]) {
      const expected = full.p.applyFrame(frame),
        actual = local.p.applyFrame(frame - 270);
      assert.deepEqual(actual.cast, expected.cast);
      assert.deepEqual(local.e.camera.position.toArray(), full.e.camera.position.toArray());
      assert.deepEqual(local.e.camera.quaternion.toArray(), full.e.camera.quaternion.toArray());
    }
  } finally {
    owners.reverse().forEach(f => f());
  }
});
test('selected settings preserve their original global layout placement', () => {
  const T = require('three'),
    {
      ResourceOwner
    } = require('../../out/character-tests/toon-kit/internal/resources');
  const resources = new ResourceOwner(),
    a = new AbortController(),
    clean = [],
    engine = {
      scene: new T.Scene(),
      profile: 'software-safe',
      track: o => resources.track(o),
      signal: a.signal,
      registerCleanup: f => clean.push(f)
    };
  try {
    const c = D.compileStoryDocument(JSON.parse(fs.readFileSync('examples/office-idea.story.json', 'utf8'))),
      settings = D.createStoryEnvironments(engine, c, ['earlier-layout', 'workspace']);
    assert.equal(settings.workspace.root.position.x, 20);
  } finally {
    a.abort();
    clean.forEach(f => f());
    resources.dispose();
  }
});

test('stream-copy compatibility includes codec headers and color metadata, not just dimensions',()=>{
 const {videoSignature}=require('../story-segments.cjs'),stream={codec_type:'video',codec_name:'h264',width:720,height:1280,r_frame_rate:'30/1',nb_read_frames:'30',extradata:'header-a',color_range:'pc'},expected={width:720,height:1280,frames:30};
 const baseline=videoSignature({streams:[stream]},expected);
 assert.notEqual(videoSignature({streams:[{...stream,extradata:'header-b'}]},expected),baseline);
 assert.notEqual(videoSignature({streams:[{...stream,color_range:'tv'}]},expected),baseline);
});

test('measured source trims reject even a subframe-short audio file before rendering', async()=>{
 const dir=path.resolve('out/segment-short-audio-'+process.pid);fs.mkdirSync(dir,{recursive:true});
 try{const source=fs.readFileSync('public/audio/long-story-signal.wav'),short=source.subarray(0,source.length-320);short.writeUInt32LE(short.length-8,4);short.writeUInt32LE(short.length-44,40);const file=path.join(dir,'short.wav');fs.writeFileSync(file,short);
  await assert.rejects(require('../story-segments.cjs').renderSegments({job:{output:path.join(dir,'never.mp4')},compiled:D.compileStoryDocument(example()),files:[{id:'signal',file}],planSHA256:'test',planStorySegments:D.planStorySegments,cancelled:()=>false}),e=>e.diagnostic?.code==='AUDIO_DURATION_MISMATCH');
  assert.equal(fs.existsSync(path.join(dir,'never.mp4')),false);
 }finally{assert.ok(dir.startsWith(path.resolve('out')+path.sep)&&fs.realpathSync(dir)===dir);fs.rmSync(dir,{recursive:true});}
});
