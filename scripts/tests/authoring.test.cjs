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

test('static two-shot gaze warnings are actionable, deterministic and do not claim visibility certification',()=>{
 const d=example(),first=D.compileStoryDocument(d),second=D.compileStoryDocument(d);
 assert.deepEqual(first.warnings,second.warnings);assert.ok(Object.isFrozen(first.warnings));
 assert.ok(first.warnings.some(w=>w.code==='TWO_SHOT_GAZE_RISK'&&w.actor==='meera'&&w.target==='board'&&w.message.includes('audience')));
 d.story.scenes[0].beats.forEach(b=>b.actions=b.actions.filter(a=>a.type!=='look'));d.story.scenes[0].characters.meera.lookAt='audience';d.story.scenes[0].characters.kabir.lookAt='audience';
 assert.deepEqual(D.compileStoryDocument(d).warnings,[]);
});
test('office chair has four grounded legs/backrest and preserves the original semantic seat surface',()=>{
 const e=owner();try{
  const b=D.createStoryEnvironments(e,D.compileStoryDocument(example())).workspace,seat=b.targets.entries.chair.object;
  assert.equal(seat.name,'OfficeChairSeat');assert.deepEqual(seat.position.toArray(),[1,1.025,-.5]);
  seat.geometry.computeBoundingBox();const box=seat.geometry.boundingBox;assert.ok(Math.abs(box.max.y+seat.position.y-1.1)<1e-6);assert.ok(Math.abs(box.max.x-box.min.x-1.1)<1e-6);
  const legs=b.root.children.filter(o=>o.name==='OfficeChairLeg');assert.equal(legs.length,4);
  for(const leg of legs){leg.geometry.computeBoundingBox();assert.ok(Math.abs(leg.position.y+leg.geometry.boundingBox.min.y)<1e-6);assert.ok(Math.abs(leg.position.y+leg.geometry.boundingBox.max.y-.95)<1e-6);}
  const back=b.root.getObjectByName('OfficeChairBack');assert.ok(back);back.geometry.computeBoundingBox();assert.ok(Math.abs(back.position.y+back.geometry.boundingBox.min.y-1.1)<1e-6);
 }finally{e.dispose();}
});

test('derived preflight report cannot overwrite the input plan',async()=>{
 const dir=fs.mkdtempSync(path.resolve('out/preflight-path-test-')),plan=path.join(dir,'report.json.preflight.json');fs.writeFileSync(plan,JSON.stringify(example()));
 try{await assert.rejects(require('../story.cjs').runAuthoredStory({command:'validate',plan,report:path.join(dir,'report.json'),output:path.join(dir,'video.mp4')}),e=>e.diagnostic?.code==='OUTPUT_PATH');assert.ok(fs.readFileSync(plan,'utf8').includes('workspace'));}
 finally{assert.equal(fs.realpathSync(dir),dir);assert.ok(dir.startsWith(path.resolve('out')+path.sep));fs.rmSync(dir,{recursive:true});}
});

test('board content is bounded plain Hindi/English data and survives canonical/segment compilation',()=>{
 const d=example();d.layouts.workspace.displays={board:{text:'टीम बैठक\nकल सुबह १० बजे'}};
 const c=D.compileStoryDocument(d);assert.deepEqual(c.document.layouts.workspace.displays,d.layouts.workspace.displays);assert.ok(Object.isFrozen(c.document.layouts.workspace.displays.board));
 assert.deepEqual(D.compileStorySegment(c,0).document.layouts.workspace.displays,c.document.layouts.workspace.displays);
 d.layouts.workspace.displays.board.text='changed';assert.equal(c.document.layouts.workspace.displays.board.text,'टीम बैठक\nकल सुबह १० बजे');
 for(const text of ['', 'W'.repeat(161),'a\nb\nc\nd\ne','a\tbad']){const x=example();x.layouts.workspace.displays={board:{text}};bad(()=>D.compileStoryDocument(x),'INVALID_DISPLAY_TEXT');}
 for(const text of ['🙂','中文','\u200d']){const x=example();x.layouts.workspace.displays={board:{text}};bad(()=>D.compileStoryDocument(x),'DISPLAY_UNSUPPORTED_GLYPH');}
 for(const displays of [{poster:{text:'hello'}},{board:{text:'hello',html:true}}]){const x=example();x.layouts.workspace.displays=displays;bad(()=>D.compileStoryDocument(x));}
});

test('boundary posture warnings use final held actions and remain order-independent',()=>{
 const d=JSON.parse(fs.readFileSync('examples/long-story.json','utf8'));delete d.story.audio;
 for(const scene of d.story.scenes){scene.beats=[];scene.cues=[];}
 d.story.scenes[0].characters.arun.stance={type:'sit',seat:'chair',floor:'ground'};
 const c=D.compileStoryDocument(d),warning=c.warnings.find(w=>w.code==='POSTURE_CUT');
 assert.equal(warning.actor,'arun');assert.equal(warning.frame,270);assert.equal(warning.target.from,'seated');assert.equal(warning.target.to,'standing');assert.ok(warning.message.includes('not animated'));
 assert.deepEqual(c.warnings,D.compileStoryDocument(d).warnings);
 d.story.scenes[0].shots=[{...d.story.scenes[0].shots[0],endFrame:240},{...d.story.scenes[0].shots[0],id:'stand-cut',startFrame:240}];
 d.story.scenes[0].beats=[{id:'authored-contact-cut',startFrame:240,endFrame:270,actions:[{actor:'arun',type:'stand',at:'right'}]}];
 assert.equal(D.compileStoryDocument(d).warnings.filter(w=>w.code==='POSTURE_CUT').length,0);
 // An instantaneous stand command at the boundary is still a posture cut, not animation.
 d.story.scenes[0].beats=[];d.story.scenes[1].beats=[{id:'instant',startFrame:270,endFrame:280,actions:[{actor:'arun',type:'stand',at:'right'}]}];
 assert.ok(D.compileStoryDocument(d).warnings.some(w=>w.code==='POSTURE_CUT'));
 d.story.scenes[0].characters.arun.stance={type:'stand',at:'right'};d.story.scenes[1].characters.arun.stance={type:'sit',seat:'chair',floor:'ground'};d.story.scenes[1].beats=[];
 assert.equal(D.compileStoryDocument(d).warnings.find(w=>w.code==='POSTURE_CUT').target.to,'seated');
});
test('display materials require a loaded font, preserve shaping tokens and are independently owned/disposed',()=>{
 const prior=global.document,drawn=[];
 const ctx={font:'',textAlign:'',textBaseline:'',fillRect:()=>{},fillText:s=>drawn.push(s),measureText(s){return {width:Array.from(s).length*parseFloat(this.font.split(' ')[1])*.6,actualBoundingBoxAscent:60,actualBoundingBoxDescent:20};}};
 const fonts=new Set();fonts.check=()=>true;
 global.document={fonts,createElement:()=>({width:0,height:0,getContext:()=>ctx})};
 const a=owner(),b=owner();try{
  const d=example();d.layouts.workspace.displays={board:{text:'टीम बैठक\nकल सुबह १० बजे'}};const c=D.compileStoryDocument(d);
  bad(()=>D.createStoryEnvironments(a,c),'FONT_UNAVAILABLE');fonts.add({family:D.STORY_FONT.family,status:'loaded'});
  const first=D.createStoryEnvironments(a,c).workspace.props.board,second=D.createStoryEnvironments(b,c).workspace.props.board;
  assert.equal(first.material.map.colorSpace,T.SRGBColorSpace);assert.equal(first.material.map.generateMipmaps,false);assert.equal(first.material.map.image.width,1024);assert.equal(first.material.map.image.height,704);
  assert.notEqual(first.material.map,second.material.map);assert.ok(drawn.includes('टीम बैठक'));assert.ok(drawn.includes('कल सुबह १० बजे'));
  let disposed=0;first.material.map.addEventListener('dispose',()=>disposed++);a.dispose();a.dispose();assert.equal(disposed,1);
  const dense=example();dense.layouts.workspace.displays={board:{text:'W'.repeat(160)}};bad(()=>D.createStoryEnvironments(b,D.compileStoryDocument(dense)),'DISPLAY_TEXT_TOO_DENSE');
 }finally{a.dispose();b.dispose();if(prior===undefined)delete global.document;else global.document=prior;}
});

const street=()=>JSON.parse(fs.readFileSync('examples/street-meeting.story.json','utf8'));
function streetWithoutText(){const d=street();delete d.layouts.stop.props.notice.text;return d;}
test('immutable environment/prefab metadata validates semantic props and canonicalizes declaration order',()=>{
 assert.ok(Object.isFrozen(D.ENVIRONMENTS.street.slots));assert.ok(Object.isFrozen(D.PREFABS.table.sockets.top));
 const raw=streetWithoutText(),c=D.compileStoryDocument(raw);assert.equal(Object.keys(c.document.story.scenes[0].characters).length,2);
 raw.layouts.stop.props=Object.fromEntries(Object.entries(raw.layouts.stop.props).reverse());assert.deepEqual(c.document,D.compileStoryDocument(raw).document);
 assert.ok(D.environmentCatalog(c.document.layouts.stop).seats.includes('rest'));assert.ok(D.environmentCatalog(c.document.layouts.stop).paths.includes('to:rest'));
 assert.deepEqual(D.compileStorySegment(c,0).document.layouts,c.document.layouts);
});
test('missing prefabs, incompatible slots, attachments, styles and raw geometry fail before allocation',()=>{
 const cases=[
 [d=>d.layouts.stop.props.rest.prefab='castle','UNSUPPORTED_PREFAB'],
 [d=>d.layouts.stop.props.rest.slot='roof','UNSUPPORTED_SLOT'],
 [d=>d.layouts.stop.props.rest.slot='notice','INCOMPATIBLE_PROP'],
 [d=>d.layouts.stop.props.copy={prefab:'sign',slot:'notice'},'PROP_SLOT_OCCUPIED'],
 [d=>d.layouts.stop.props.rest.finish='raw-shader','UNSUPPORTED_APPEARANCE'],
 [d=>d.layouts.stop.options.palette='hdr','UNSUPPORTED_APPEARANCE'],
 [d=>d.layouts.stop.props.rest.position=[0,1,2],'INVALID_DOCUMENT'],
 [d=>d.layouts.stop.props.rest.text='No','INCOMPATIBLE_PROP_CONTENT'],
 [d=>d.layouts.stop.props.flowers={prefab:'planter',attachTo:{prop:'absent',socket:'top'}},'MISSING_PROP'],
 [d=>d.layouts.stop.props.flowers={prefab:'planter',attachTo:{prop:'rest',socket:'top'}},'INVALID_ATTACHMENT'],
 [d=>d.layouts.stop.props.flowers={prefab:'planter',slot:'corner',attachTo:{prop:'rest',socket:'top'}},'INVALID_ATTACHMENT'],
 [d=>d.layouts.stop.props={a:{prefab:'table',attachTo:{prop:'b',socket:'top'}},b:{prefab:'table',attachTo:{prop:'a',socket:'top'}}},'INVALID_ATTACHMENT'],
 [d=>d.layouts.stop.props={...d.layouts.stop.props,a:{prefab:'planter',slot:'corner'},b:{prefab:'planter',slot:'corner'}},'PROP_BUDGET'],
 [d=>d.layouts.stop.props.entry={prefab:'planter',slot:'corner'},'PROP_ID_COLLISION']];
 for(const [edit,code]of cases){const d=streetWithoutText();edit(d);bad(()=>D.compileStoryDocument(d),code);}
 for(const edit of [d=>d.story.scenes[0].characters.kabir.stance.seat='notice',d=>d.story.scenes[0].beats[0].actions[0].path='to:notice',d=>d.story.scenes[0].shots[2].subject='missing']){const d=streetWithoutText();edit(d);bad(()=>D.compileStoryDocument(d),'UNKNOWN_SLOT');}
 const d=streetWithoutText();d.story.scenes[0].characters.third={stance:{type:'stand',at:'right'}};d.story.characters.third={};bad(()=>D.compileStoryDocument(d),'LAYOUT_CAPACITY');
});
test('semantic furniture/attachments retain full grouped framing, independent child ownership and floor contact',()=>{
 const {createStory}=require('../../out/character-tests/toon-kit/story/player'),{createStage}=require('../../out/character-tests/toon-kit/staging/stage');
 const d=streetWithoutText();d.layouts.stop.props={rest:{prefab:'bench',slot:'rest'},table:{prefab:'table',slot:'kiosk',finish:'blue'},plant:{prefab:'planter',attachTo:{prop:'table',socket:'top'},finish:'stone'},notice:{prefab:'sign',slot:'notice'}};
 const c=D.compileStoryDocument(d),e=owner();try{
  const b=D.createStoryEnvironments(e,c).stop,seat=b.targets.entries.rest.object;assert.ok(b.props.rest instanceof T.Group);assert.ok(Math.abs(new T.Vector3().setFromMatrixPosition(seat.matrixWorld).y+.075-.44)<1e-6);
  const player=createStory(e,{timeline:c.timeline,settings:{stop:b}});player.prepare();
  const samples=[0,80,20,80,0].map(f=>JSON.stringify(player.applyFrame(f)));assert.equal(samples[0],samples[4]);assert.equal(samples[1],samples[3]);
  assert.deepEqual(player.applyFrame(45).cast.contacts.kabir.feet,{left:'floor',right:'floor'});
  for(const reverse of [false,true]){
   const stage=createStage(e,{root:b.root,floor:b.floor,axis:c.timeline.plan.scenes[0].axis});stage.bind(player.cast);
   for(const [id,prop]of reverse?Object.entries(b.props).reverse():Object.entries(b.props))stage.registerProp(id,prop);
   const snap=stage.snapshot(player.applyFrame(20).cast);assert.ok(snap.props.rest.regions.full.max[1]>1.2);assert.ok(snap.props.rest.regions.full.min[1]<1e-6);
   assert.ok(Math.abs(snap.props.table.regions.full.max[1]-.9)<1e-6);assert.ok(snap.props.plant.regions.full.min[1]>=.9-1e-6);
   assert.ok(snap.visibility.proxies.some(p=>p.owner==='plant'));assert.ok(snap.visibility.proxies.length<=64);stage.dispose();
  }
 }finally{e.dispose();e.dispose();}
});
test('prop resources and appearance remain owner-local over repeated creation/destruction',()=>{
 const raw=streetWithoutText();raw.layouts.stop.options.palette='cool';let prior;
 for(let i=0;i<3;i++){
  const e=owner();try{const c=D.compileStoryDocument(raw),b=D.createStoryEnvironments(e,c,['other','stop']).stop;assert.equal(b.root.position.x,20);assert.equal(b.props.rest.parent,b.root);
   const mesh=b.props.rest.children.find(o=>o instanceof T.Mesh);if(prior)assert.notEqual(mesh.material,prior);prior=mesh.material;
   let count=0;mesh.material.addEventListener('dispose',()=>count++);e.dispose();e.dispose();assert.equal(count,1);
  }finally{e.dispose();}
 }
});

test('street standing and approach marks clear the furniture and retain forward level walking',()=>{
 for(const kind of ['chair','bench']){
  const d=streetWithoutText();d.layouts.stop.props.rest.prefab=kind;const e=owner();try{
   const b=D.createStoryEnvironments(e,D.compileStoryDocument(d)).stop,seat=b.targets.entries.rest.object,right=b.targets.entries.right.object,approach=b.targets.entries['rest.approach'].object;
   const rightPosition=right.getWorldPosition(new T.Vector3()),approachPosition=approach.getWorldPosition(new T.Vector3()),seatBox=new T.Box3().setFromObject(seat);
   assert.ok(rightPosition.z-.25>seatBox.max.z+.09);assert.equal(rightPosition.y,0);assert.equal(approachPosition.y,0);assert.ok(approachPosition.z>rightPosition.z);assert.ok(b.paths.entries['to:rest']);
  }finally{e.dispose();}
 }
});


const customExample=(name='school')=>JSON.parse(fs.readFileSync('examples/custom-'+name+'.story.json','utf8'));
const noCustomText=d=>{for(const l of Object.values(d.layouts))for(const s of Object.values(l.composition.items))delete s.text;return d;};
test('custom construction is canonical, immutable and independent of JSON declaration order',()=>{
 for(const name of ['school','garden']){
  const d=customExample(name),key=Object.keys(d.layouts)[0],c=D.compileStoryDocument(d),a=D.planConstruction(d.layouts[key]);
  d.layouts[key].composition.items=Object.fromEntries(Object.entries(d.layouts[key].composition.items).reverse());
  assert.deepEqual(D.planConstruction(d.layouts[key]),a);assert.deepEqual(D.compileStoryDocument(d).document,c.document);
  assert.ok(Object.isFrozen(a.items[0].box.min));assert.ok(Object.isFrozen(D.STRUCTURES.wall.max));assert.ok(Object.isFrozen(D.CONSTRUCTION_LIMITS));
  assert.deepEqual(D.compileStorySegment(c,0).document.layouts,c.document.layouts);
 }
});
test('semantic construction resolves exact face, boundary, relative and top contacts with quarter-turn orientation',()=>{
 const school=D.planConstruction(customExample().layouts.schoolyard),by=Object.fromEntries(school.items.map(i=>[i.id,i]));
 assert.equal(by.facade.box.min[2],-5);assert.ok(Math.abs(by.entrance.box.min[2]-by.facade.box.max[2]-.01)<1e-10);
 assert.ok(by.porch.box.min[2]>by.facade.box.max[2]);assert.equal(by.rest.position[0],1.15);assert.ok(by.eastWindow.position[0]>0&&by.westWindow.position[0]<0);
 const garden=D.planConstruction(customExample('garden').layouts.garden),g=Object.fromEntries(garden.items.map(i=>[i.id,i]));
 assert.equal(g.centerpiece.box.min[1],g.plinth.box.max[1]);assert.equal(g.border.turn,1);assert.ok(Math.abs(g.border.box.max[0]-g.border.box.min[0]-.2)<1e-9);assert.ok(g.pillar.box.max[0]<g.plinth.box.min[0]);
 const d=customExample();d.layouts.schoolyard.composition.items.facade.facing='back';
 // Explicit opposite facing is inherited by all front-face attachments, never mixed spaces.
 const back=D.planConstruction(d.layouts.schoolyard),b=Object.fromEntries(back.items.map(i=>[i.id,i]));assert.equal(b.entrance.turn,2);assert.ok(b.entrance.box.max[2]<b.facade.box.min[2]);
});
test('custom construction rejects unknown parts, invalid dimensions, cycles, overlaps and unsupported contacts',()=>{
 const cases=[
 [l=>l.composition.items.facade.kind='school','UNKNOWN_STRUCTURE'],
 [l=>l.composition.items.facade.size.width=100,'INVALID_DIMENSION'],
 [l=>l.composition.items.facade.size.height=NaN,'INVALID_DIMENSION'],
 [l=>l.composition.items.facade.position=[0,0,0],'INVALID_CONSTRUCTION'],
 [l=>l.composition.items.facade.place={relation:'behind',target:'absent'},'MISSING_CONSTRUCTION_TARGET'],
 [l=>l.composition.items.facade.place={relation:'behind',target:'porch'},'PLACEMENT_CYCLE'],
 [l=>l.composition.items.eastWindow.place.align='start','STRUCTURAL_OVERLAP'],
 [l=>l.composition.items.entrance.place.target='garden','INVALID_ATTACHMENT'],
 [l=>l.composition.items.garden.place={relation:'onTopOf',target:'rest'},'INVALID_ATTACHMENT'],
 [l=>l.composition.items.porch.place={relation:'onTopOf',target:'facade'},'INVALID_ATTACHMENT'],
 [l=>l.composition.items.schoolName.facing='left','INVALID_ATTACHMENT'],
 [l=>l.composition.items.garden.place={relation:'alongBoundary',boundary:'left',gap:-1},'INVALID_DIMENSION'],
 [l=>{delete l.composition.items.garden;l.composition.items.facade.place={relation:'near',target:'finish',side:'behind',gap:0};},'BLOCKED_INTERACTION'],
 [l=>l.composition.items.notice.place={relation:'near',target:'audience',side:'front'},'MISSING_CONSTRUCTION_TARGET'],
 [l=>l.composition.items.entrance.text='raw','INCOMPATIBLE_PROP_CONTENT']
 ];
 for(const [edit,code]of cases){const d=customExample();edit(d.layouts.schoolyard);bad(()=>D.compileStoryDocument(d),code);}
});
test('construction enforces independent piece, geometry, attachment and display budgets',()=>{
 const l=()=>({preset:'custom',composition:{ground:{width:20,depth:20},items:{}}});
 let a=l();for(let i=0;i<25;i++)a.composition.items['p'+i]={kind:'block',place:{relation:'alongBoundary',boundary:'back'}};bad(()=>D.planConstruction(a),'CONSTRUCTION_BUDGET');
 a=l();for(let i=0;i<19;i++)a.composition.items['p'+i]={kind:'wall',place:{relation:'alongBoundary',boundary:'back'}};bad(()=>D.planConstruction(a),'CONSTRUCTION_BUDGET');
 a=l();for(let i=0;i<7;i++)a.composition.items['p'+i]={prefab:'planter',place:{relation:'alongBoundary',boundary:'back'}};bad(()=>D.planConstruction(a),'CONSTRUCTION_BUDGET');
 a=l();for(let i=0;i<5;i++)a.composition.items['p'+i]={prefab:'sign',text:'hello',place:{relation:'alongBoundary',boundary:'back'}};bad(()=>D.planConstruction(a),'CONSTRUCTION_BUDGET');
 a=l();a.composition.items={base:{kind:'platform',place:{relation:'alongBoundary',boundary:'back'}},one:{kind:'block',size:{width:1,height:.5,depth:1},place:{relation:'onTopOf',target:'base'}},two:{kind:'block',size:{width:.7,height:.5,depth:.7},place:{relation:'onTopOf',target:'one'}},three:{kind:'block',size:{width:.4,height:.5,depth:.4},place:{relation:'onTopOf',target:'two'}}};bad(()=>D.planConstruction(a),'ATTACHMENT_DEPTH');
});
test('constructed anchors, resource envelopes and complete poses agree across owners and shuffled frames',()=>{
 const {createStory}=require('../../out/character-tests/toon-kit/story/player');
 for(const name of ['school','garden']){
  const raw=noCustomText(customExample(name)),compiled=D.compileStoryDocument(raw),key=Object.keys(raw.layouts)[0];let baseline;
  for(let iteration=0;iteration<3;iteration++){
   const e=owner();try{
    const settings=D.createStoryEnvironments(e,compiled),b=settings[key],plan=D.planConstruction(raw.layouts[key]);
    assert.deepEqual(Object.keys(b.targets.entries).sort(),[...new Set([...plan.catalog.marks,...plan.catalog.points,...plan.catalog.seats])].sort());
    for(const i of plan.items){const box=new T.Box3().setFromObject(b.props[i.id]);for(let k=0;k<3;k++){const axis=['x','y','z'][k];assert.ok(box.min[axis]>=i.box.min[k]-.0001,i.id+' min '+axis);assert.ok(box.max[axis]<=i.box.max[k]+.0001,i.id+' max '+axis);}}
    assert.ok(b.root.userData.construction.meshes<=D.CONSTRUCTION_LIMITS.meshes);assert.ok(b.root.userData.construction.triangles<=D.CONSTRUCTION_LIMITS.triangles);
    const p=createStory(e,{timeline:compiled.timeline,settings});try{p.prepare();}catch(error){throw new Error(JSON.stringify(error.diagnostic));}const values=[];
    for(const f of [0,80,20,80,0])values.push(p.applyFrame(f));assert.deepEqual(values[0],values[4]);assert.deepEqual(values[1],values[3]);
    const stable=JSON.parse(JSON.stringify(values));if(baseline)assert.deepEqual(stable,baseline);else baseline=stable;
    if(name==='school'){assert.deepEqual(p.applyFrame(45).cast.contacts.kabir.feet,{left:'floor',right:'floor'});assert.ok(plan.catalog.marks.includes('rest.approach'));assert.ok(plan.catalog.paths.includes('to:rest'));}
    for(const mark of Object.values(plan.marks))assert.equal(mark[1],0);
    for(const [id,[start,end]]of Object.entries(plan.paths)){const path=b.paths.entries[id];assert.deepEqual(path.sample(0).position,plan.marks[start]);assert.deepEqual(path.sample(path.length).position,plan.marks[end]);}
    const {createStage}=require('../../out/character-tests/toon-kit/staging/stage'),stage=createStage(e,{root:b.root,floor:b.floor,axis:compiled.timeline.plan.scenes[0].axis,cameraSpace:b.cameraSpace});stage.bind(p.cast);for(const [id,prop]of Object.entries(b.props))stage.registerProp(id,prop);assert.ok(stage.snapshot(p.applyFrame(20).cast).visibility.proxies.length<=64);stage.dispose();
    const geometries=new Set(),materials=new Set();b.root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    let disposed=0,materialDisposals=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);for(const m of materials)m.addEventListener('dispose',()=>materialDisposals++);p.dispose();e.dispose();e.dispose();assert.equal(disposed,geometries.size);assert.equal(materialDisposals,materials.size);
   }finally{e.dispose();}
  }
 }
});


test('custom exterior camera space is optional, validated and preserves scene-local anchors under layout translation',()=>{
 const d=noCustomText(customExample('garden'));d.layouts.garden.composition.items.westTree.finish='white';const c=D.compileStoryDocument(d),e=owner();
 try{
  const b=D.createStoryEnvironments(e,c,['other','garden']).garden,plan=D.planConstruction(c.document.layouts.garden),{createStage}=require('../../out/character-tests/toon-kit/staging/stage');
  assert.equal(b.root.position.x,20);assert.equal(b.props.westTree.children[0].material.color.getHexString(),'fff6e5');
  for(const [id,position]of Object.entries(plan.marks)){const p=b.targets.entries[id].object.getWorldPosition(new T.Vector3());assert.ok(Math.abs(p.x-position[0]-20)<1e-9);assert.equal(p.y,0);assert.equal(p.z,position[2]);}
  for(const [id,[from,to]]of Object.entries(plan.paths)){const path=b.paths.entries[id];assert.ok(Math.abs(path.sample(0).position[0]-plan.marks[from][0]-20)<1e-9);assert.ok(Math.abs(path.sample(path.length).position[0]-plan.marks[to][0]-20)<1e-9);}
  const o={root:b.root,floor:b.floor,axis:c.timeline.plan.scenes[0].axis};
  assert.throws(()=>createStage(e,{...o,cameraSpace:{width:NaN,depth:40,height:6}}),err=>err.diagnostic?.code==='INVALID_CAMERA_SPACE');
  const {createStory}=require('../../out/character-tests/toon-kit/story/player'),p=createStory(e,{timeline:c.timeline,settings:{garden:b}});p.prepare();
  for(const external of [false,true]){const stage=createStage(e,{...o,...(external?{cameraSpace:b.cameraSpace}:{})});stage.bind(p.cast);const snap=stage.snapshot(p.applyFrame(0).cast);assert.equal(snap.visibility.zone.forward,external?20:6);assert.equal(snap.visibility.zone.origin[0],20);stage.dispose();}p.dispose();
 }finally{e.dispose();}
});


const threeActors=()=>JSON.parse(fs.readFileSync('examples/custom-three-actors.story.json','utf8'));
test('three-actor custom opt-in normalizes a third contact role and preserves strict two-shot semantics',()=>{
 const d=threeActors(),c=D.compileStoryDocument(d),plan=D.planConstruction(c.document.layouts.meeting);
 assert.equal(plan.meshLimit,28);assert.equal(plan.catalog.roles.third,'third');assert.equal(plan.catalog.roles.guestSeat,'third');assert.equal(plan.catalog.roles['guestSeat.approach'],'third');assert.ok(!plan.catalog.paths.includes('to:guestSeat'));
 assert.ok(Object.isFrozen(c.document.layouts.meeting.composition.thirdActor));assert.deepEqual(D.compileStorySegment(c,0).document.layouts,c.document.layouts);
 const cases=[
 [x=>delete x.layouts.meeting.composition.thirdActor,'LAYOUT_CAPACITY'],
 [x=>x.layouts.meeting.composition.thirdActor.at='right','THIRD_ACTOR_PLACEMENT'],
 [x=>x.layouts.meeting.composition.thirdActor.at='absent.front','THIRD_ACTOR_PLACEMENT'],
 [x=>x.story.scenes[0].characters.tara.stance={type:'stand',at:'entry'},'SLOT_OCCUPIED'],
 [x=>x.story.scenes[0].shots[0].subjects.push('kabir'),'INVALID_SUBJECT'],
 [x=>{x.story.characters.extra={appearance:'casual'};x.story.scenes[0].characters.extra={stance:{type:'stand',at:'third'}};},'LAYOUT_CAPACITY'],
 [x=>{x.layouts.meeting.composition.items.guestSeat.place={relation:'near',target:'entry',side:'behind',gap:.4};},'THIRD_ACTOR_PLACEMENT']
 ];for(const [edit,code]of cases){const raw=threeActors();edit(raw);bad(()=>D.compileStoryDocument(raw),code);}
 for(const preset of ['office','clinic','street']){const raw=threeActors();raw.layouts.meeting={preset};bad(()=>D.compileStoryDocument(raw),'LAYOUT_CAPACITY');}
});
test('third role reservation prunes overlapping marks and enforces the unchanged 64-proxy resource budget',()=>{
 const raw=threeActors(),plan=D.planConstruction(raw.layouts.meeting);assert.ok(!plan.catalog.marks.includes('guestSeat.front'));
 const crowded={preset:'custom',composition:{ground:{width:20,depth:20},thirdActor:{at:'seat.approach'},items:{seat:{prefab:'bench',place:{relation:'alongBoundary',boundary:'left'}}}}};
 for(let i=0;i<17;i++)crowded.composition.items['window'+i]={kind:'window',place:{relation:'alongBoundary',boundary:'back'}};
 bad(()=>D.planConstruction(crowded),'CONSTRUCTION_BUDGET');assert.equal(D.CONSTRUCTION_LIMITS.meshes,40);assert.equal(D.CONSTRUCTION_LIMITS.threeActorMeshes,28);
});
test('three-actor cast contacts, pointing, gaze, gestures and camera are deterministic and dispose once',()=>{
 const {createStory}=require('../../out/character-tests/toon-kit/story/player'),{createStage}=require('../../out/character-tests/toon-kit/staging/stage');let baseline;
 for(let instance=0;instance<2;instance++){
  const e=owner(),raw=threeActors();delete raw.layouts.meeting.composition.items.notice.text;
  try{
   const c=D.compileStoryDocument(raw),b=D.createStoryEnvironments(e,c).meeting,p=createStory(e,{timeline:c.timeline,settings:{meeting:b}});try{p.prepare();}catch(error){throw new Error(JSON.stringify(error.diagnostic));}
   const sequence=[0,23,7,23,0],values=sequence.map(f=>JSON.parse(JSON.stringify(p.applyFrame(f))));assert.deepEqual(values[0],values[4]);assert.deepEqual(values[1],values[3]);if(baseline)assert.deepEqual(values,baseline);baseline=values;
   assert.equal(Object.keys(p.cast.actors).length,3);assert.deepEqual(p.applyFrame(7).cast.contacts.tara.feet,{left:'floor',right:'floor'});assert.deepEqual(p.applyFrame(20).cast.contacts.tara.feet,{left:'floor',right:'floor'});
   const stage=createStage(e,{root:b.root,floor:b.floor,axis:c.timeline.plan.scenes[0].axis,cameraSpace:b.cameraSpace});stage.bind(p.cast);for(const [id,prop]of Object.entries(b.props))stage.registerProp(id,prop);
   const snap=stage.snapshot(p.applyFrame(7).cast);assert.equal(Object.keys(snap.actors).length,3);assert.ok(snap.visibility.proxies.length<=64);assert.equal(snap.visibility.proxies.filter(x=>x.owner==='tara').length,12);stage.dispose();
   const resources=new Set();e.scene.traverse(o=>{if(o instanceof T.Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)resources.add(v);}}});const counts=new Map();for(const r of resources){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}p.dispose();p.dispose();e.dispose();e.dispose();for(const count of counts.values())assert.equal(count,1);
  }finally{e.dispose();}
 }
});

test('groupShot is a distinct exact-three semantic shot while twoShot and other validation stay strict', () => {
  const T3 = ['meera', 'kabir', 'tara'], timeline = require('../../out/character-tests/toon-kit/direction/timeline');
  const shot = (extra) => [{id: 'g', type: 'groupShot', startFrame: 0, endFrame: 10, ...extra}];
  assert.equal(timeline.compileShotTimeline(shot({subjects: T3}), 10).shots[0].type, 'groupShot');
  for (const extra of [{subjects: T3.slice(0, 2)}, {subjects: [...T3, 'x']}, {subjects: [T3[0], T3[0], T3[1]]}, {subject: 'meera'}, {subject: 'meera', subjects: T3}, {}]) {
    assert.throws(() => timeline.compileShotTimeline(shot(extra), 10), e => e.diagnostic?.code === 'INVALID_SUBJECT', JSON.stringify(extra));
  }
  const shotsOf = (edit) => {const raw = threeActors(); edit(raw.story.scenes[0].shots.find(s => s.id === 'group')); return raw;};
  const c = D.compileStoryDocument(threeActors());
  assert.deepEqual(c.timeline.plan.scenes[0].shots.find(s => s.id === 'group').subjects, T3);
  assert.ok(c.warnings.some(w => w.code === 'GROUP_SHOT_GAZE_RISK' && w.actor === 'kabir'));
  // authoring: unknown, missing, duplicate and wrong-count subjects reject with structured diagnostics
  bad(() => D.compileStoryDocument(shotsOf(s => {s.subjects = ['meera', 'kabir', 'ghost'];})), 'UNKNOWN_SLOT');
  bad(() => D.compileStoryDocument(shotsOf(s => {s.subjects = ['meera', 'kabir'];})), 'INVALID_SHOTS');
  bad(() => D.compileStoryDocument(shotsOf(s => {s.subjects = ['meera', 'kabir', 'kabir'];})), 'INVALID_SHOTS');
  // without the custom thirdActor opt-in no scene can hold three actors, so no groupShot exists
  const noThird = threeActors(); delete noThird.layouts.meeting.composition.thirdActor;
  bad(() => D.compileStoryDocument(noThird), 'LAYOUT_CAPACITY');
  // twoShot keeps its exactly-two rule
  bad(() => D.compileStoryDocument(shotsOf(s => {s.type = 'twoShot';})), 'INVALID_SUBJECT');
});

test('groupShot frames all three faces inside the camera zone, with unchanged twoShot and top-aligned framing for other shots', () => {
  const {createStory} = require('../../out/character-tests/toon-kit/story/player'), C = require('../../out/character-tests/toon-kit/direction/composition');
  const e = owner(), raw = threeActors(); delete raw.layouts.meeting.composition.items.notice.text;
  try {
    const c = D.compileStoryDocument(raw), b = D.createStoryEnvironments(e, c).meeting, p = createStory(e, {timeline: c.timeline, settings: {meeting: b}});
    try {p.prepare();} catch (error) {throw new Error(JSON.stringify(error.diagnostic));}
    for (const frame of [24, 30, 41]) {
      const d = p.describe(frame);
      assert.equal(d.shot.type, 'groupShot');
      const comp = d.direction.composition, cam = p.applyFrame(frame).camera;
      assert.ok(comp.minVisible >= C.COMPOSITION_LIMITS.faceVisible, 'all three face/eye regions stay visible');
      assert.ok(comp.minHead >= C.COMPOSITION_LIMITS.minHead.groupShot);
      assert.ok(comp.candidateCount <= 6);
      assert.ok(cam.position[1] >= .1 && cam.position[1] <= 5.7 && Math.abs(cam.position[2]) <= 20, 'camera inside the stage zone');
    }
    // every individual shot kind prepared for the third actor, plus the original two-shot
    const kinds = c.timeline.plan.scenes[0].shots.map(s => `${s.type}:${s.subject ?? s.subjects.join('+')}`);
    assert.deepEqual(kinds, ['twoShot:meera+tara', 'closeUp:tara', 'groupShot:meera+kabir+tara', 'medium:kabir', 'reaction:meera']);
    assert.equal(p.describe(5).shot.type, 'twoShot');
  } finally {e.dispose();}
  const box = {min: [-3, 0, -1], max: [3, 2, 1]}, dir = new T.Vector3(0, .08, 1).normalize();
  assert.deepEqual(C.fitCompositionCamera('x', box, dir, 9 / 16, .95), C.fitCompositionCamera('x', box, dir, 9 / 16, .95, 'top'));
  const top = C.fitCompositionCamera('x', box, dir, 9 / 16, .95), mid = C.fitCompositionCamera('x', box, dir, 9 / 16, .95, 'center');
  assert.deepEqual(top.quaternion, mid.quaternion); assert.ok(mid.position[1] > top.position[1]);
});

test('groupShot rejects unknown actors, visibility-budget overflow and impossible captions with structured diagnostics', () => {
  const {createStage} = require('../../out/character-tests/toon-kit/staging/stage'), {createStory} = require('../../out/character-tests/toon-kit/story/player'), C = require('../../out/character-tests/toon-kit/direction/composition');
  const e = owner(), raw = threeActors(); delete raw.layouts.meeting.composition.items.notice.text;
  try {
    const c = D.compileStoryDocument(raw), b = D.createStoryEnvironments(e, c).meeting, p = createStory(e, {timeline: c.timeline, settings: {meeting: b}});
    p.prepare();
    const stage = createStage(e, {root: b.root, floor: b.floor, axis: c.timeline.plan.scenes[0].axis, cameraSpace: b.cameraSpace});
    stage.bind(p.cast); for (const [id, prop] of Object.entries(b.props)) stage.registerProp(id, prop);
    const snap = stage.snapshot(p.applyFrame(30).cast), shot = {id: 'g', type: 'groupShot', subjects: ['meera', 'kabir', 'tara'], startFrame: 0, endFrame: 1};
    const frame = C.compactVisibilityFrame(shot, snap);
    assert.ok(frame.required.length <= C.COMPOSITION_LIMITS.maxRegions && snap.visibility.proxies.length <= 64);
    assert.throws(() => C.compactVisibilityFrame({...shot, subjects: ['meera', 'kabir', 'ghost']}, snap), e2 => e2.diagnostic.code === 'MISSING_VISIBILITY' && e2.diagnostic.subject === 'ghost');
    assert.throws(() => require('../../out/character-tests/toon-kit/direction/shots').shotBounds({...shot, subjects: ['meera', 'kabir', 'ghost']}, snap), e2 => e2.diagnostic.code === 'UNKNOWN_ACTOR');
    const extra = Array.from({length: 65 - snap.visibility.proxies.length}, (_, i) => ({id: 'extra' + i, owner: 'room', kind: 'sphere', center: [20, 0, 20], radius: .1}));
    assert.throws(() => C.compactVisibilityFrame(shot, {...snap, visibility: {...snap.visibility, proxies: [...snap.visibility.proxies, ...extra]}}),
      e2 => e2.diagnostic.code === 'VISIBILITY_BUDGET' && e2.diagnostic.shotId === 'g' && e2.diagnostic.details.maxProxies === 64 && e2.diagnostic.details.proxies === 65);
    const full = {words: [{text: 'X', startFrame: 0, endFrame: 100, rect: {left: 0, right: 1, top: 0, bottom: 1}}]};
    assert.throws(() => C.planVisibleShot(shot, [frame], 9 / 16, {captions: full}), e2 => e2.diagnostic.code === 'CAPTION_TOO_TALL' || e2.diagnostic.code === 'NO_VALID_COMPOSITION');
    stage.dispose();
  } finally {e.dispose();}
});

test('groupShot cameras are frame-order independent across fresh engines and dispose every resource once', () => {
  const {createStory} = require('../../out/character-tests/toon-kit/story/player'); let baseline;
  for (let instance = 0; instance < 2; instance++) {
    const e = owner(), raw = threeActors(); delete raw.layouts.meeting.composition.items.notice.text;
    try {
      const c = D.compileStoryDocument(raw), b = D.createStoryEnvironments(e, c).meeting, p = createStory(e, {timeline: c.timeline, settings: {meeting: b}});
      p.prepare();
      const values = [59, 30, 0, 41, 24, 30, 59, 0].map(f => JSON.parse(JSON.stringify(p.applyFrame(f))));
      assert.deepEqual(values[1], values[5]); assert.deepEqual(values[0], values[6]); assert.deepEqual(values[2], values[7]);
      if (baseline) assert.deepEqual(values, baseline); baseline = values;
      const resources = new Set();
      e.scene.traverse(o => {if (o instanceof T.Mesh) {resources.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) {resources.add(m); for (const v of Object.values(m)) if (v instanceof T.Texture) resources.add(v);}}});
      const counts = new Map(); for (const r of resources) {counts.set(r, 0); r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));}
      p.dispose(); p.dispose(); e.dispose(); e.dispose();
      for (const count of counts.values()) assert.equal(count, 1);
    } finally {e.dispose();}
  }
});
