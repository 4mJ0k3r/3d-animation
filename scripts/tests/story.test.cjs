'use strict';

const test = require('node:test'),
  assert = require('node:assert/strict'),
  T = require('three');
const {
    ResourceOwner
  } = require('../../out/character-tests/toon-kit/internal/resources'),
  S = require('../../out/character-tests/toon-kit/story'),
  {
    TEN_SECOND_STORY
  } = require('../../out/character-tests/toon-kit-tests/story-plan'),
  {
    createStorySettings
  } = require('../../out/character-tests/toon-kit-tests/story-fixture');
const clone = () => structuredClone(TEN_SECOND_STORY);
function owner(aspect = 9 / 16) {
  const resources = new ResourceOwner(),
    abort = new AbortController(),
    clean = [];
  return {
    profile: 'software-safe',
    scene: new T.Scene(),
    camera: new T.PerspectiveCamera(40, aspect, .05, 100),
    signal: abort.signal,
    track: o => resources.track(o),
    registerCleanup: f => clean.push(f),
    dispose() {
      if (abort.signal.aborted) return;
      abort.abort();
      clean.forEach(f => f());
      resources.dispose();
      this.scene.clear();
    }
  };
}
function setup(plan = clone(), aspect = 9 / 16) {
  const engine = owner(aspect),
    timeline = S.compileStory(plan),
    settings = createStorySettings(engine),
    captions = {
      width: aspect < 1 ? 720 : 1280,
      height: aspect < 1 ? 1280 : 720,
      style: {},
      words: timeline.captionWords.map(w => ({
        ...w,
        rect: {
          left: .2,
          right: .8,
          top: .88,
          bottom: .98
        }
      }))
    };
  return {
    engine,
    timeline,
    settings,
    captions,
    create: () => S.createStory(engine, {
      timeline,
      settings,
      captions
    })
  };
}
test('10-second schema compiles immutable Unicode cues and future alignment metadata', () => {
  const p = clone(),
    t = S.compileStory(p);
  assert.equal(t.plan.durationInFrames, 300);
  assert.equal(t.plan.fps, 30);
  assert.equal(t.plan.scenes.length, 2);
  assert.ok(t.captionWords.some(w => w.text === 'वाह!'));
  assert.equal(t.alignment.find(x => x.id === 'ravi-reaction').language, 'hi');
  assert.equal(t.alignment.find(x => x.id === 'ravi-reaction').startFrame, 120);
  assert.ok(Object.isFrozen(t.plan.scenes[0].beats[0].actions[0]));
  p.characters.asha.expression = 'angry';
  assert.equal(t.plan.characters.asha.expression, 'neutral');
});
test('complete semantic channel defaults, holds, resets and half-open boundaries are independent of sampling order', () => {
  const t = S.compileStory(clone());
  assert.equal(t.sample(59).poses.asha.gesture, null);
  assert.equal(t.sample(60).poses.asha.gesture.action.type, 'point');
  assert.equal(t.sample(120).poses.asha.gesture, null);
  assert.equal(t.sample(120).poses.ravi.gesture.action.type, 'react');
  assert.equal(t.sample(160).poses.ravi.gesture, null);
  assert.equal(t.sample(169).poses.asha.stance.action.type, 'walk');
  assert.equal(t.sample(170).poses.asha.stance.type, 'stand');
  assert.equal(t.sample(170).scene.id, 'review');
  assert.equal(t.sample(170).localFrame, 0);
  assert.equal(t.sample(90).poses.asha.expression.action.name, 'explaining');
  assert.equal(t.sample(170).poses.asha.expression, 'happy');
  const f = JSON.stringify(t.sample(80));
  for (const k of [299, 0, 170, 20, 80]) t.sample(k);
  assert.equal(JSON.stringify(t.sample(80)), f);
  assert.equal(t.sample(230).poses.asha.gaze.from, 'board');
});
test('compatible simultaneous channels work; collisions reject with actor/beat/channel diagnostics', () => {
  S.compileStory(clone());
  for (const action of [{
    actor: 'asha',
    type: 'gesture',
    name: 'wave'
  }, {
    actor: 'asha',
    type: 'walk',
    path: 'toDesk'
  }, {
    actor: 'ravi',
    type: 'expression',
    name: 'happy'
  }]) {
    const p = clone(),
      start = action.actor === 'ravi' ? 130 : action.type === 'walk' ? 20 : 75;
    p.scenes[0].beats.push({
      id: 'collision',
      startFrame: start,
      endFrame: start + 15,
      actions: [action]
    });
    assert.throws(() => S.compileStory(p), e => e instanceof S.StoryError && e.diagnostic.code === 'ACTION_CONFLICT' && e.diagnostic.actor === action.actor);
  }
});
test('strict JSON, timing, targets, cue ranges and unsupported raw-math fields are structured errors', () => {
  const changes = [p => p.fps = 0, p => p.fps = 29.97, p => p.scenes[1].startFrame = 171, p => p.scenes[0].shots[0].endFrame = 61, p => p.scenes[0].beats[0].actions[0].type = 'fly', p => p.scenes[0].beats[0].actions[0].position = [0, 2, 3], p => p.scenes[0].beats[0].actions[0].actor = 'missing', p => p.scenes[0].beats[2].actions[0].target = {
    actor: 'missing'
  }, p => p.scenes[0].beats[2].actions[0].transitionFrames = 2, p => p.scenes[0].cues[0].endFrame = 1, p => p.scenes[0].cues[1].startFrame = 50, p => p.scenes[0].cues[0].text = () => '', p => p.scenes = [null], p => p.scenes[0].beats = null, p => p.scenes[0].cues = {}, p => p.scenes[0].axis = ['asha', 'asha']];
  for (const change of changes) {
    const p = clone();
    change(p);
    assert.throws(() => S.compileStory(p), e => e instanceof S.StoryError);
  }
  const p = clone();
  p.loop = p;
  assert.throws(() => S.compileStory(p), e => e instanceof S.StoryError);
});
test('channel/beat declaration order does not change complete intents', () => {
  const a = clone(),
    b = clone();
  b.characters = Object.fromEntries(Object.entries(b.characters).reverse());
  b.scenes.reverse();
  b.scenes.forEach(s => {
    s.beats.reverse();
    s.beats.forEach(x => x.actions.reverse());
    s.shots.reverse();
  });
  const x = S.compileStory(a),
    y = S.compileStory(b);
  for (const frame of [0, 80, 120, 169, 170, 245, 299]) assert.deepEqual(x.sample(frame).poses, y.sample(frame).poses);
});
test('inactive characters receive complete explicit hidden defaults, not prior-scene state', () => {
  const p = clone();
  p.characters.guest = {
    appearance: 'casual'
  };
  p.scenes[1].characters.guest = {
    stance: {
      type: 'stand',
      at: 'finish'
    }
  };
  const t = S.compileStory(p);
  assert.equal(t.sample(0).poses.guest.visible, false);
  assert.equal(t.sample(170).poses.guest.visible, true);
  assert.equal(t.sample(0).poses.guest.gesture, null);
});
for (const aspect of [9 / 16, 16 / 9]) test(`existing cast/director prepare every scene, preserve absolute clocks and walk endpoints ${aspect}`, () => {
  const f = setup(clone(), aspect);
  try {
    const p = f.create();
    assert.throws(() => p.applyFrame(0), e => e.diagnostic.code === 'NOT_PREPARED');
    p.prepare();
    const first = p.applyFrame(0),
      end = p.applyFrame(59),
      hold = p.applyFrame(119);
    assert.equal(first.cast.frame, 0);
    assert.equal(hold.cast.locomotion.asha.phase, 'idle-after');
    assert.deepEqual(end.cast.poses.asha.root.position, hold.cast.poses.asha.root.position);
    assert.equal(p.applyFrame(170).cast.frame, 170);
    assert.equal(p.describe(170).shot.startFrame, 170);
    assert.equal(p.describe(170).direction.shot.startFrame, 0);
    assert.equal(f.settings.office.root.visible, false);
    assert.equal(f.settings.meeting.root.visible, true);
    p.applyFrame(0);
    assert.equal(f.settings.office.root.visible, true);
    assert.equal(f.settings.meeting.root.visible, false);
    assert.throws(() => p.prepare(), e => e.diagnostic.code === 'PREPARATION_STATE');
    assert.ok(p.preparationStats().reduce((n, s) => n + s.signatureBytes, 0) < 16 * 1024 * 1024);
  } finally {
    f.engine.dispose();
  }
});
test('nonsequential 0,80,20,80,0 and scene cuts match complete poses/cameras across fresh players', () => {
  let baseline;
  for (let i = 0; i < 2; i++) {
    const f = setup();
    try {
      const p = f.create();
      p.prepare();
      const a = [0, 80, 20, 80, 0, 169, 170, 245, 299, 170].map(frame => JSON.stringify(p.applyFrame(frame)));
      assert.equal(a[0], a[4]);
      assert.equal(a[1], a[3]);
      assert.equal(a[6], a[9]);
      if (baseline) assert.deepEqual(a, baseline);
      baseline = a;
    } finally {
      f.engine.dispose();
    }
  }
});
test('caption readiness contract rejects missing/mismatched layout before capture', () => {
  const f = setup();
  try {
    assert.throws(() => S.createStory(f.engine, {
      timeline: f.timeline,
      settings: f.settings
    }), e => e.diagnostic.code === 'CAPTION_LAYOUT_REQUIRED');
    assert.throws(() => S.createStory(f.engine, {
      timeline: f.timeline,
      settings: f.settings,
      captions: {
        ...f.captions,
        words: []
      }
    }), e => e.diagnostic.code === 'CAPTION_MISMATCH');
  } finally {
    f.engine.dispose();
  }
});
test('unresolved future targets/paths fail at binding, including clips after frame zero', () => {
  for (const kind of ['path', 'target']) {
    const f = setup();
    try {
      if (kind === 'path') f.settings.office = {
        ...f.settings.office,
        paths: undefined
      };else f.settings.meeting = {
        ...f.settings.meeting,
        targets: require('../../out/character-tests/toon-kit/characters').createTargets({
          ...f.settings.meeting.targets.entries,
          audience: undefined
        })
      };
      if (kind === 'target') {
        const entries = {
          ...f.settings.meeting.targets.entries
        };
        delete entries.audience;
        f.settings.meeting = {
          ...f.settings.meeting,
          targets: require('../../out/character-tests/toon-kit/characters').createTargets(entries)
        };
      }
      assert.throws(() => f.create(), e => e.diagnostic.code === 'UNKNOWN_BINDING');
    } finally {
      f.engine.dispose();
    }
  }
});
test('incompatible mid-shot support changes fail; preparation restores scene zero and cannot be retried', () => {
  const data = clone();
  data.scenes[0].beats.push({
    id: 'bad-seat',
    startFrame: 90,
    endFrame: 105,
    actions: [{
      actor: 'asha',
      type: 'sit',
      seat: 'chair',
      floor: 'ground'
    }]
  });
  const f = setup(data);
  try {
    const p = f.create();
    assert.throws(() => p.prepare(), e => e.diagnostic.code === 'UNSUPPORTED_TRANSITION');
    assert.equal(f.settings.office.root.visible, true);
    assert.equal(f.settings.meeting.root.visible, false);
    assert.throws(() => p.applyFrame(0), e => e.diagnostic.code === 'NOT_PREPARED');
    assert.throws(() => p.prepare(), e => e.diagnostic.code === 'PREPARATION_STATE');
  } finally {
    f.engine.dispose();
  }
});
test('support endpoint discontinuities reject, while explicit shot cuts permit contact cuts', () => {
  const data = clone();
  data.scenes[0].beats.push({
    id: 'bad-jump',
    startFrame: 90,
    endFrame: 100,
    actions: [{
      actor: 'asha',
      type: 'stand',
      at: 'entry'
    }]
  });
  const f = setup(data);
  try {
    const p = f.create();
    assert.throws(() => p.prepare(), e => e.diagnostic.code === 'SUPPORT_DISCONTINUITY');
  } finally {
    f.engine.dispose();
  }
  const good = clone();
  good.scenes[0].beats.push({
    id: 'cut',
    startFrame: 60,
    endFrame: 65,
    actions: [{
      actor: 'asha',
      type: 'stand',
      at: 'entry'
    }]
  });
  const g = setup(good);
  try {
    const p = g.create();
    p.prepare();
    assert.equal(p.applyFrame(60).cast.locomotion.asha, null);
  } finally {
    g.engine.dispose();
  }
});
test('reaction and pointing fade to complete baseline; expressions do not leak across cuts', () => {
  const f = setup();
  try {
    const p = f.create();
    p.prepare();
    const point = p.applyFrame(119),
      reset = p.applyFrame(120),
      reaction = p.applyFrame(159);
    assert.ok(!point.cast.pointing.asha || point.cast.pointing.asha.weight === 0);
    assert.equal(reset.cast.pointing.asha, null);
    assert.equal(reaction.cast.faces.ravi.expression, 'neutral');
    assert.equal(p.applyFrame(170).cast.faces.ravi.expression, 'happy');
  } finally {
    f.engine.dispose();
  }
});
test('repeated creation/cleanup retains immutable geometry and idempotent owner disposal', () => {
  for (let i = 0; i < 2; i++) {
    const f = setup();
    try {
      const p = f.create(),
        resources = new Set();
      f.engine.scene.traverse(o => {
        if (o.isMesh) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            resources.add(m);
            if (m.gradientMap) resources.add(m.gradientMap);
          }
        }
      });
      let count = 0;
      resources.forEach(r => r.addEventListener('dispose', () => count++));
      const before = resources.size;
      p.prepare();
      p.applyFrame(299);
      p.applyFrame(0);
      assert.equal(resources.size, before);
      p.dispose();
      p.dispose();
      assert.throws(() => p.applyFrame(0), e => e.diagnostic.code === 'STORY_DISPOSED');
      f.engine.dispose();
      assert.equal(count, resources.size);
    } finally {
      f.engine.dispose();
    }
  }
});
test('zero-intensity reactions leave the declared baseline expression and body unchanged', () => {
  const data = clone();
  data.scenes[0].characters.ravi.expression = 'happy';
  data.scenes[0].beats.find(b => b.id === 'reaction').actions[0].intensity = 0;
  const f = setup(data);
  try {
    const p = f.create();
    p.prepare();
    for (const frame of [120, 130, 150, 159]) {
      const s = p.applyFrame(frame);
      assert.equal(s.cast.faces.ravi.expression, 'happy');
      assert.equal(s.cast.acting.ravi.weight, 0);
    }
  } finally {
    f.engine.dispose();
  }
});
