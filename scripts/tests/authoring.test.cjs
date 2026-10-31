'use strict';

const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  T = require('three');
const D = require('../../out/character-tests/toon-kit/authoring'),
  {
    ResourceOwner
  } = require('../../out/character-tests/toon-kit/internal/resources'),
  {
    validateAuthoredAssets
  } = require('../story-authoring-assets.cjs');
const example = () => JSON.parse(fs.readFileSync('examples/office-idea.story.json', 'utf8'));
const bad = (f, code) => assert.throws(f, e => !!e.diagnostic && (!code || e.diagnostic.code === code));
test('canonical document delegates its only timeline to compileStory and freezes copied inputs', () => {
  const raw = example(),
    c = D.compileStoryDocument(raw);
  assert.equal(c.timeline.plan.durationInFrames, 240);
  assert.equal(c.timeline.plan, c.document.story);
  assert.ok(Object.isFrozen(c.document.layouts));
  raw.story.characters.meera.expression = 'happy';
  assert.equal(c.timeline.plan.characters.meera.expression, 'worried');
  assert.deepEqual(c.timeline.sample(80), D.compileStoryDocument(example()).timeline.sample(80));
});
test('unknown layouts and manual environment math fail before GPU work', () => {
  for (const edit of [d => d.layouts.workspace.preset = 'castle', d => d.layouts.workspace.position = [1, 2, 3], d => d.layouts = {}, d => d.story.scenes[0].setting = 'unknown']) {
    const d = example();
    edit(d);
    bad(() => D.compileStoryDocument(d));
  }
});
test('wrong characters/actions, invalid timing and conflicting gestures retain structured diagnostics', () => {
  for (const edit of [d => d.story.scenes[0].beats[0].actions[0].actor = 'ghost', d => d.story.scenes[0].beats[0].actions[0].type = 'fly', d => d.story.durationInFrames = 601, d => d.story.scenes[0].beats[0].endFrame = -1, d => d.story.scenes[0].beats[1].actions.push({
    actor: 'meera',
    type: 'gesture',
    name: 'wave'
  })]) {
    const d = example();
    edit(d);
    bad(() => D.compileStoryDocument(d));
  }
});
test('slot names AND kinds are checked for stances, floors, paths and gaze', () => {
  for (const edit of [d => d.story.scenes[0].characters.meera.stance.at = 'chair', d => d.story.scenes[0].characters.kabir.stance.floor = 'ocean', d => d.story.scenes[0].beats[0].actions[0].path = 'highway', d => d.story.scenes[0].beats[1].actions[0].target = 'absent']) {
    const d = example();
    edit(d);
    bad(() => D.compileStoryDocument(d), 'UNKNOWN_SLOT');
  }
});
test('camera subjects/props and semantic motion endpoints reject unknown targets', () => {
  for (const edit of [d => d.story.scenes[0].shots[0].subject = 'ghost', d => d.story.scenes[0].shots[0] = {
    id: 'bad',
    type: 'objectFocus',
    subject: 'missing',
    startFrame: 0,
    endFrame: 60
  }, d => d.story.scenes[0].shots[0].motion = {
    type: 'pan',
    from: {
      subject: 'meera'
    },
    to: {
      subject: 'missing'
    }
  }]) {
    const d = example();
    edit(d);
    bad(() => D.compileStoryDocument(d), 'UNKNOWN_SLOT');
  }
});
test('unsupported fonts/viewports and unapproved schema extensions reject', () => {
  for (const edit of [d => d.font = 'Nirmala UI', d => d.video.width = 4000, d => d.video.quality = 'high', d => d.extra = 'ignore']) {
    const d = example();
    edit(d);
    bad(() => D.compileStoryDocument(d));
  }
});
test('object-focus and landscape use existing semantic APIs with no camera vectors', () => {
  const d = example();
  d.video = {
    width: 1280,
    height: 720
  };
  d.story.scenes[0].shots[0] = {
    id: 'board',
    type: 'objectFocus',
    subject: 'board',
    startFrame: 0,
    endFrame: 60
  };
  assert.equal(D.compileStoryDocument(d).timeline.sample(20).shot.subject, 'board');
});
test('canonical doc preserves the existing audio/alignment contract', () => {
  const d = example();
  d.story.audio = {
    assets: {
      voice: {
        src: 'audio/missing.wav',
        durationInSeconds: 8
      }
    },
    clips: [{
      id: 'voice',
      asset: 'voice',
      kind: 'narration',
      startFrame: 0,
      endFrame: 240
    }]
  };
  const c = D.compileStoryDocument(d);
  bad(() => validateAuthoredAssets(c, path.resolve('public'), D.STORY_FONT), 'AUDIO_ASSET_MISSING');
});
test('pinned font is available, licensed and hash-checked; missing/tampered fonts reject', () => {
  const c = D.compileStoryDocument(example());
  assert.equal(validateAuthoredAssets(c, path.resolve('public'), D.STORY_FONT).length, 0);
  const base = path.resolve('.remotion-tmp');
  fs.mkdirSync(base, {
    recursive: true
  });
  const dir = fs.mkdtempSync(path.join(base, 'font-test-'));
  try {
    bad(() => validateAuthoredAssets(c, dir, D.STORY_FONT), 'FONT_UNAVAILABLE');
    const dest = path.join(dir, D.STORY_FONT.src);
    fs.mkdirSync(path.dirname(dest), {
      recursive: true
    });
    fs.writeFileSync(dest, 'broken');
    fs.copyFileSync(path.join('public', D.STORY_FONT.license), path.join(dir, D.STORY_FONT.license));
    bad(() => validateAuthoredAssets(c, dir, D.STORY_FONT), 'FONT_INTEGRITY');
  } finally {
    assert.equal(path.dirname(fs.realpathSync(dir)), fs.realpathSync(base));
    fs.rmSync(dir, {
      recursive: true
    });
  }
});
function owner() {
  const a = new AbortController(),
    r = new ResourceOwner(),
    clean = [];
  return {
    scene: new T.Scene(),
    camera: new T.PerspectiveCamera(40, 9 / 16, .1, 100),
    profile: 'software-safe',
    signal: a.signal,
    track: o => r.track(o),
    registerCleanup: f => clean.push(f),
    dispose() {
      a.abort();
      clean.forEach(f => f());
      r.dispose();
      this.scene.clear();
    }
  };
}
test('office starters provide physical target bindings and remain owner-scoped over repeated cleanup', () => {
  for (let i = 0; i < 3; i++) {
    const e = owner();
    try {
      const b = D.createStoryEnvironments(e, D.compileStoryDocument(example())).workspace;
      assert.equal(b.root.parent, e.scene);
      for (const name of ['entry', 'finish', 'chair', 'board', 'audience']) assert.ok(b.targets.entries[name]);
      assert.ok(b.paths.entries.toDesk);
      assert.ok(b.floors.ground);
      assert.equal(b.floor.parent, b.root);
    } finally {
      e.dispose();
      e.dispose();
    }
  }
});
test('clinic starter reuses the actual clinic room and semantic seat/diagram', () => {
  const prior = global.document,
    noop = () => {},
    ctx = new Proxy({
      createRadialGradient: () => ({
        addColorStop: noop
      }),
      createLinearGradient: () => ({
        addColorStop: noop
      }),
      measureText: () => ({
        width: 10
      })
    }, {
      get: (o, k) => k in o ? o[k] : noop
    });
  global.document = {
    createElement: () => ({
      width: 1,
      height: 1,
      getContext: () => ctx
    })
  };
  const e = owner();
  try {
    const d = example();
    d.layouts.workspace.preset = 'clinic';
    const s = d.story.scenes[0];
    s.beats = [];
    s.cues = [];
    s.shots = [{
      id: 'both',
      type: 'twoShot',
      subjects: ['meera', 'kabir'],
      startFrame: 0,
      endFrame: 240
    }];
    s.characters.meera.stance = {
      type: 'stand',
      at: 'doctor'
    };
    s.characters.kabir.stance = {
      type: 'sit',
      seat: 'examSeat',
      floor: 'ground'
    };
    const b = D.createStoryEnvironments(e, D.compileStoryDocument(d)).workspace;
    assert.ok(b.targets.entries.examSeat);
    assert.ok(b.targets.entries.diagram);
    assert.ok(b.props.chart);
    assert.equal(b.root.name, 'ClinicEnvironment');
  } finally {
    e.dispose();
    if (prior === undefined) delete global.document;else global.document = prior;
  }
});
test('curated slot occupancy rejects overlapping actors and raw body math; two-standing office is supported', () => {
  let d = example();
  d.story.scenes[0].characters.kabir.stance = {
    type: 'stand',
    at: 'finish'
  };
  bad(() => D.compileStoryDocument(d), 'SLOT_OCCUPIED');
  d.story.scenes[0].characters.kabir.stance = {
    type: 'stand',
    at: 'right'
  };
  D.compileStoryDocument(d);
  d.story.characters.meera.scale = 2;
  bad(() => D.compileStoryDocument(d), 'UNSUPPORTED_BODY');
});
test('CLI programmatic entry rejects unsafe overrides and workspace escapes before spawning', async () => {
  const {
    runAuthoredStory
  } = require('../story.cjs');
  await assert.rejects(runAuthoredStory({
    command: 'render',
    plan: 'examples/office-idea.story.json',
    concurrency: 2
  }), e => e.diagnostic.code === 'AUTHORING_ARGUMENT');
  await assert.rejects(runAuthoredStory({
    command: 'validate',
    plan: '../outside.json'
  }), e => e.diagnostic.code === 'WORKSPACE_PATH');
});
test('CLI validate uses isolated workspace temp and cleans its owned bootstrap', async () => {
  const {
    runAuthoredStory
  } = require('../story.cjs');
  const r = await runAuthoredStory({
    command: 'validate',
    plan: 'examples/office-idea.story.json'
  });
  assert.equal(r.frames, 240);
  assert.ok(r.temp.startsWith(path.resolve('.remotion-tmp') + path.sep));
  assert.equal(fs.existsSync(r.temp), false);
  assert.equal(fs.existsSync('.remotion-tmp/authoring.lock'), false);
});
test('an existing production lock is preserved and does not leave a second authoring lock', async () => {
  const {
      runAuthoredStory
    } = require('../story.cjs'),
    base = path.resolve('.remotion-tmp'),
    lock = path.join(base, 'active.lock');
  assert.equal(fs.existsSync(lock), false);
  fs.writeFileSync(lock, 'test-owner', {
    flag: 'wx'
  });
  try {
    await assert.rejects(runAuthoredStory({
      command: 'validate',
      plan: 'examples/office-idea.story.json'
    }), e => e.diagnostic.code === 'AUTHORING_BUSY');
    assert.equal(fs.readFileSync(lock, 'utf8'), 'test-owner');
    assert.equal(fs.existsSync(path.join(base, 'authoring.lock')), false);
  } finally {
    if (fs.readFileSync(lock, 'utf8') === 'test-owner') fs.unlinkSync(lock);
  }
});
test('two-standing office binds and certifies with the existing story director', () => {
  const d = example();
  d.story.scenes[0].characters.kabir.stance = {
    type: 'stand',
    at: 'right'
  };
  d.story.scenes[0].beats = [];
  d.story.scenes[0].cues = [];
  const c = D.compileStoryDocument(d),
    e = owner();
  try {
    const p = require('../../out/character-tests/toon-kit/story').createStory(e, {
      timeline: c.timeline,
      settings: D.createStoryEnvironments(e, c)
    });
    p.prepare();
    for (const frame of [0, 80, 20, 80, 0]) assert.ok(p.applyFrame(frame).camera);
    p.dispose();
  } finally {
    e.dispose();
  }
});
test('impossible caption-safe framing preserves the director diagnostic and never captures an old camera', () => {
  const c = D.compileStoryDocument(example()),
    e = owner(),
    captions = {
      width: 720,
      height: 1280,
      style: {
        fontSize: 40,
        bottom: 48,
        fontFamily: 'test',
        strokeWidth: 1,
        scalePunch: true
      },
      words: c.timeline.captionWords.map(w => ({
        ...w,
        rect: {
          left: 0,
          top: 0,
          right: 1,
          bottom: 1
        }
      }))
    };
  try {
    const p = require('../../out/character-tests/toon-kit/story').createStory(e, {
      timeline: c.timeline,
      settings: D.createStoryEnvironments(e, c),
      captions
    });
    assert.throws(() => p.prepare(), err => err.diagnostic?.details?.code === 'CAPTION_TOO_TALL');
    assert.throws(() => p.applyFrame(0), err => err.diagnostic?.code === 'NOT_PREPARED');
    p.dispose();
  } finally {
    e.dispose();
  }
});
test('CLI cancellation before rendering cleans the bootstrap and leaves no live render lock', () => {
  const {
    execFileSync
  } = require('node:child_process');
  const script = "const {runAuthoredStory}=require('./scripts/story.cjs');const p=runAuthoredStory({command:'validate',plan:'examples/office-idea.story.json'});setTimeout(()=>process.emit('SIGINT'),0);p.then(()=>{process.exitCode=2}).catch(()=>console.log('CANCEL_OK'));";
  const text = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true
  });
  assert.match(text, /CANCEL_OK/);
  assert.equal(fs.existsSync('.remotion-tmp/authoring.lock'), false);
  assert.equal(fs.existsSync('.remotion-tmp/active.lock'), false);
});
