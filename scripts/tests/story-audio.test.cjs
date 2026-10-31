'use strict';

const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const S = require('../../out/character-tests/toon-kit/story'),
  {
    TEN_SECOND_STORY
  } = require('../../out/character-tests/toon-kit-tests/story-plan'),
  {
    validateStoryAudioFiles
  } = require('../story-audio-assets.cjs');
const {
  Readiness
} = require('../../out/character-tests/toon-kit/internal/readiness');
function plan() {
  const p = structuredClone(TEN_SECOND_STORY);
  for (const s of p.scenes) s.cues = [];
  p.audio = {
    assets: {
      voice: {
        src: 'audio/test.wav',
        durationInSeconds: 12
      }
    },
    clips: [{
      id: 'voice',
      kind: 'narration',
      asset: 'voice',
      startFrame: 0,
      endFrame: 300,
      volume: .8
    }],
    alignments: [{
      alignmentId: 'speech',
      clip: 'voice',
      text: 'नमस्ते, दुनिया!',
      language: 'hi',
      words: [{
        text: 'नमस्ते,',
        startSeconds: .4,
        endSeconds: .8
      }, {
        text: 'दुनिया!',
        startSeconds: 2,
        endSeconds: 2.4
      }]
    }]
  };
  p.scenes[0].cues = [{
    id: 'speech',
    alignmentId: 'speech',
    kind: 'caption',
    text: 'नमस्ते, दुनिया!',
    language: 'hi',
    startFrame: 0,
    endFrame: 90,
    mode: 'words',
    timing: 'supplied'
  }];
  return p;
}
const bad = (fn, code) => assert.throws(fn, e => e instanceof S.StoryError && (!code || e.diagnostic.code === code));
test('Hindi/English supplied word timings preserve text, punctuation and long/short pauses', () => {
  for (const [text, language] of [['नमस्ते, दुनिया!', 'hi'], ['Hello, world!', 'en']]) {
    const p = plan(),
      a = p.audio.alignments[0],
      c = p.scenes[0].cues[0];
    a.text = c.text = text;
    a.language = c.language = language;
    a.words.forEach((w, i) => w.text = text.split(' ')[i]);
    const t = S.compileStory(p);
    assert.deepEqual(t.captionWords, [{
      text: text.split(' ')[0],
      startFrame: 12,
      endFrame: 24
    }, {
      text: text.split(' ')[1],
      startFrame: 60,
      endFrame: 72
    }]);
    assert.equal(t.captionTiming[0].source, 'supplied');
    assert.equal(t.captionWords.find(w => 30 >= w.startFrame && 30 < w.endFrame), undefined);
  }
});
test('trim placement uses source seconds and one nearest-frame rounding convention', () => {
  const p = plan();
  p.audio.clips[0] = {
    ...p.audio.clips[0],
    startFrame: 10,
    endFrame: 290,
    trimBeforeFrames: 6
  };
  p.scenes[0].cues[0].startFrame = 10;
  const t = S.compileStory(p);
  assert.equal(t.captionWords[0].startFrame, 16);
  assert.equal(t.captionWords[1].endFrame, 76);
  for (const fps of [24, 25, 30, 60]) for (const time of [.001, .016, .5, 1.234]) assert.ok(Math.abs(S.speechSecondsToFrame(time, fps) / fps - time) <= .5 / fps + 1e-10);
  bad(() => S.speechSecondsToFrame(1e308, 30), 'INVALID_ALIGNMENT');
});
test('audio/caption boundaries and arbitrary frame order are pure and active arrays are reused', () => {
  const a = S.compileStory(plan()),
    b = S.compileStory(plan());
  const frames = [0, 80, 20, 80, 0, 169, 170, 299];
  assert.deepEqual(frames.map(f => a.sample(f)), frames.map(f => b.sample(f)));
  assert.strictEqual(a.sample(80).audio, a.audio.byFrame[80]);
  assert.equal(a.sample(0).audio[0].id, 'voice');
  assert.equal(a.sample(170).scene.id, 'review');
  assert.equal(a.sample(299).audio[0].id, 'voice');
  assert.ok(Object.isFrozen(a.audio));
});
test('multiple dialogue speakers, narration, trimming, gain and intentional silence', () => {
  const p = plan();
  p.audio.alignments = [];
  p.scenes[0].cues = [];
  p.audio.clips = [{
    id: 'a',
    kind: 'dialogue',
    asset: 'voice',
    speaker: 'asha',
    startFrame: 0,
    endFrame: 30
  }, {
    id: 'b',
    kind: 'dialogue',
    asset: 'voice',
    speaker: 'ravi',
    startFrame: 60,
    endFrame: 90,
    trimBeforeFrames: 30,
    volume: .5
  }, {
    id: 'n',
    kind: 'narration',
    asset: 'voice',
    startFrame: 100,
    endFrame: 160
  }];
  const t = S.compileStory(p);
  assert.deepEqual(t.sample(45).audio, []);
  assert.equal(t.sample(60).audio[0].speaker, 'ravi');
  assert.deepEqual(t.sample(299).audio, []);
  assert.equal(t.audio.clips[1].volume, .5);
});
test('dialogue alignment speaker must match cue and track', () => {
  const p = plan();
  p.audio.clips[0].kind = 'dialogue';
  p.audio.clips[0].speaker = p.audio.alignments[0].speaker = p.scenes[0].cues[0].speaker = 'asha';
  p.scenes[0].cues[0].kind = 'dialogue';
  S.compileStory(p);
  p.audio.alignments[0].speaker = 'ravi';
  bad(() => S.compileStory(p), 'ALIGNMENT_MISMATCH');
});
test('missing alignment rejects, and estimated words require an explicit label', () => {
  const p = plan();
  p.audio.alignments = [];
  bad(() => S.compileStory(p), 'MISSING_ALIGNMENT');
  p.scenes[0].cues[0].timing = 'estimated';
  assert.equal(S.compileStory(p).captionTiming[0].source, 'estimated');
  delete p.scenes[0].cues[0].timing;
  bad(() => S.compileStory(p), 'TIMING_REQUIRED');
});
test('contradictory text, punctuation, order, language, overlapping and invalid words reject', () => {
  for (const edit of [p => p.audio.alignments[0].text = 'Different', p => p.audio.alignments[0].language = 'en', p => p.audio.alignments[0].words.reverse(), p => p.audio.alignments[0].words[1].text = 'दुनिया', p => p.audio.alignments[0].words[1].startSeconds = .7, p => p.audio.alignments[0].words[0].endSeconds = -1, p => p.audio.alignments[0].words.pop(), p => p.audio.alignments.push(structuredClone(p.audio.alignments[0]))]) {
    const p = plan();
    edit(p);
    bad(() => S.compileStory(p));
  }
});
test('cue duration, audio duration, source trim and impossible subframe words reject', () => {
  for (const edit of [p => p.scenes[0].cues[0].endFrame = 30, p => p.audio.assets.voice.durationInSeconds = 1, p => p.audio.clips[0].trimBeforeFrames = 300, p => {
    p.audio.alignments[0].words[0].startSeconds = .001;
    p.audio.alignments[0].words[0].endSeconds = .002;
  }]) {
    const p = plan();
    edit(p);
    bad(() => S.compileStory(p));
  }
});
test('unknown audio IDs, external paths, invalid media metadata and speakers reject', () => {
  for (const edit of [p => p.audio.clips[0].asset = 'absent', p => p.audio.assets.voice.src = 'https://bad/audio.mp3', p => p.audio.assets.voice.src = 'audio/../secret.mp3', p => p.audio.assets.voice.durationInSeconds = 0, p => p.audio.clips[0].volume = 2, p => {
    p.audio.clips[0].kind = 'dialogue';
    p.audio.clips[0].speaker = 'absent';
  }, p => p.audio.alignments[0].alignmentId = 'unknown']) {
    const p = plan();
    edit(p);
    bad(() => S.compileStory(p));
  }
});
test('narration and same-speaker conflicts reject; safe mixed gain is explicit', () => {
  const p = plan();
  p.audio.clips.push({
    ...p.audio.clips[0],
    id: 'other'
  });
  bad(() => S.compileStory(p), 'AUDIO_CONFLICT');
  p.audio.clips[1].kind = 'dialogue';
  p.audio.clips[1].speaker = 'ravi';
  bad(() => S.compileStory(p), 'AUDIO_GAIN_LIMIT');
  p.audio.clips.forEach(c => c.volume = .4);
  S.compileStory(p);
});
test('aligned words and audio may continue across a scene cut without changing global boundaries', () => {
  const p = plan();
  p.scenes[0].cues[0].endFrame = 180;
  p.audio.alignments[0].words[1].startSeconds = 169 / 30;
  p.audio.alignments[0].words[1].endSeconds = 171 / 30;
  const t = S.compileStory(p);
  assert.equal(t.sample(169).cue.id, t.sample(170).cue.id);
  assert.equal(t.captionWords[1].startFrame, 169);
  assert.equal(t.captionWords[1].endFrame, 171);
  assert.equal(t.sample(169).audio[0].id, t.sample(170).audio[0].id);
});
test('Node public workspace preflight rejects missing files, traversal and oversized assets', () => {
  const root = path.resolve('.remotion-tmp');
  fs.mkdirSync(root, {
    recursive: true
  });
  const dir = fs.mkdtempSync(path.join(root, 'audio-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'audio'));
    fs.writeFileSync(path.join(dir, 'audio', 'test.wav'), 'test');
    const p = plan();
    assert.equal(validateStoryAudioFiles(p.audio, dir)[0].bytes, 4);
    fs.unlinkSync(path.join(dir, 'audio', 'test.wav'));
    assert.throws(() => validateStoryAudioFiles(p.audio, dir), /AUDIO_ASSET_MISSING/);
    p.audio.assets.voice.src = 'audio/../secret.mp3';
    assert.throws(() => validateStoryAudioFiles(p.audio, dir), /INVALID_AUDIO_ASSET/);
    p.audio.assets.voice.src = 'audio/test.wav';
    fs.writeFileSync(path.join(dir, 'audio', 'test.wav'), '');
    fs.truncateSync(path.join(dir, 'audio', 'test.wav'), 17 * 1024 * 1024);
    assert.throws(() => validateStoryAudioFiles(p.audio, dir), e => e.diagnostic.code === 'AUDIO_BUDGET');
    fs.mkdirSync(path.join(dir, 'actual'));
    fs.symlinkSync(path.join(dir, 'actual'), path.join(dir, 'redirected'), 'junction');
    assert.throws(() => validateStoryAudioFiles(p.audio, path.join(dir, 'redirected')), e => e.diagnostic.code === 'INVALID_AUDIO_ASSET');
  } finally {
    const actual = fs.realpathSync(dir);
    assert.equal(path.dirname(actual), fs.realpathSync(root));
    fs.rmSync(actual, {
      recursive: true
    });
  }
});
function fakeBrowser(t, {
  duration = 12,
  fail = false,
  pending = false,
  fetchPending = false
} = {}) {
  const saved = Object.fromEntries(['document', 'location', 'fetch'].map(k => [k, globalThis[k]])),
    create = URL.createObjectURL,
    revoke = URL.revokeObjectURL;
  let created = 0,
    freed = 0,
    listeners = 0,
    fetches = 0;
  URL.createObjectURL = () => {
    created++;
    return 'blob:owned';
  };
  URL.revokeObjectURL = () => freed++;
  globalThis.location = {
    href: 'http://localhost/',
    origin: 'http://localhost'
  };
  globalThis.fetch = async (_src, options) => {
    fetches++;
    if (fetchPending) return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), {
        once: true
      });
    });
    return new Response(new Uint8Array([1, 2, 3]));
  };
  globalThis.document = {
    createElement() {
      const handlers = new Map();
      return {
        duration,
        canPlayType: () => true,
        pause() {},
        removeAttribute() {},
        addEventListener(k, f) {
          listeners++;
          handlers.set(k, f);
        },
        removeEventListener(k) {
          if (handlers.delete(k)) listeners--;
        },
        load() {
          if (this.src && !pending) queueMicrotask(() => handlers.get(fail ? 'error' : 'loadeddata')?.());
        }
      };
    }
  };
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];else globalThis[k] = v;
    }
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  });
  return () => ({
    created,
    freed,
    listeners,
    fetches
  });
}
function owner() {
  const r = new Readiness(),
    clean = [];
  return {
    signal: r.signal,
    registerReady: p => r.register(p),
    registerCleanup: f => clean.push(f),
    prepare: () => r.prepare(async () => {}),
    dispose() {
      r.dispose();
      clean.forEach(f => f());
    }
  };
}
test('assets join readiness, clean metadata nodes/URLs, and disposal is idempotent', {
  timeout: 2000
}, async t => {
  const stats = fakeBrowser(t),
    engine = owner(),
    p = S.prepareStoryAudio(engine, S.compileStory(plan()));
  await engine.prepare();
  const ready = await p;
  ready.assertReady();
  assert.deepEqual(stats(), {
    created: 1,
    freed: 1,
    listeners: 0,
    fetches: 1
  });
  ready.dispose();
  ready.dispose();
  bad(() => ready.assertReady(), 'AUDIO_DISPOSED');
  engine.dispose();
});
test('duration mismatch/corrupt media fails the readiness barrier and frees resources', {
  timeout: 2000
}, async t => {
  const stats = fakeBrowser(t, {
      duration: 2
    }),
    engine = owner(),
    p = S.prepareStoryAudio(engine, S.compileStory(plan()));
  await assert.rejects(p, e => e.diagnostic.code === 'AUDIO_DURATION_MISMATCH');
  await assert.rejects(engine.prepare());
  assert.equal(stats().created, stats().freed);
  engine.dispose();
});
test('corrupt media reports a structured failure without leaving listeners', {
  timeout: 2000
}, async t => {
  const stats = fakeBrowser(t, {
      fail: true
    }),
    engine = owner();
  await assert.rejects(S.prepareStoryAudio(engine, S.compileStory(plan())), e => e.diagnostic.code === 'INVALID_AUDIO_ASSET');
  assert.equal(stats().listeners, 0);
  assert.equal(stats().created, stats().freed);
  engine.dispose();
});
test('unmount cancels unresolved metadata immediately and revokes owned URLs', {
  timeout: 2000
}, async t => {
  const stats = fakeBrowser(t, {
      pending: true
    }),
    engine = owner(),
    p = S.prepareStoryAudio(engine, S.compileStory(plan()));
  while (!stats().created) await new Promise(r => setImmediate(r));
  engine.dispose();
  await assert.rejects(p);
  assert.equal(stats().created, stats().freed);
  assert.equal(stats().listeners, 0);
});
test('unmount aborts pending fetch without waiting for an asset to resolve', {
  timeout: 2000
}, async t => {
  const stats = fakeBrowser(t, {
      fetchPending: true
    }),
    engine = owner(),
    p = S.prepareStoryAudio(engine, S.compileStory(plan()));
  engine.dispose();
  await assert.rejects(p);
  assert.equal(stats().created, 0);
});
test('offscreen narrator IDs are supported without constructing a narrator character', () => {
  const p = plan();
  p.audio.clips[0].speaker = p.audio.alignments[0].speaker = p.scenes[0].cues[0].speaker = 'narrator';
  assert.equal(S.compileStory(p).captionTiming[0].source, 'supplied');
});
test('shared file references are probed once; repeated owners release every temporary media resource', {
  timeout: 3000
}, async t => {
  const stats = fakeBrowser(t);
  for (let i = 0; i < 4; i++) {
    const p = plan();
    p.audio.assets.alias = {
      ...p.audio.assets.voice
    };
    p.audio.clips.push({
      id: 'alias',
      kind: 'dialogue',
      speaker: 'asha',
      asset: 'alias',
      startFrame: 0,
      endFrame: 30,
      volume: .1
    });
    const engine = owner(),
      ready = await S.prepareStoryAudio(engine, S.compileStory(p));
    assert.strictEqual(ready.assets.voice, ready.assets.alias);
    engine.dispose();
  }
  assert.deepEqual(stats(), {
    created: 4,
    freed: 4,
    listeners: 0,
    fetches: 4
  });
});
test('audio stories reject missing preparation and prepared sessions reject cross-story/cross-engine reuse', {
  timeout: 2000
}, async t => {
  fakeBrowser(t);
  const engine = owner(),
    timeline = S.compileStory(plan());
  bad(() => S.createStory(engine, {
    timeline,
    settings: {}
  }), 'AUDIO_NOT_PREPARED');
  const audio = await S.prepareStoryAudio(engine, timeline);
  audio.assertReady(timeline, engine);
  bad(() => audio.assertReady(S.compileStory(plan()), engine), 'AUDIO_TIMELINE_MISMATCH');
  bad(() => audio.assertReady(timeline, owner()), 'AUDIO_OWNER_MISMATCH');
  engine.dispose();
});
