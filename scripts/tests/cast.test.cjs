'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three');
const S=require('../../out/character-tests/toon-kit/characters');
const {ResourceOwner}=require('../../out/character-tests/toon-kit/internal/resources');
const {COMPACT,TALL}=require('../../out/character-tests/toon-kit-tests/character-fixture');
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const vec=(a,b)=>a.forEach((v,i)=>near(v,b[i]));
function owner(){const resources=new ResourceOwner(),controller=new AbortController(),cleanups=[];
  return{scene:new THREE.Scene(),signal:controller.signal,profile:'software-safe',track:r=>resources.track(r),registerCleanup:fn=>cleanups.push(fn),
    dispose(){if(controller.signal.aborted)return;controller.abort();cleanups.forEach(fn=>fn());resources.dispose();this.scene.clear();}};}
const shot=(cast)=>{const out={};for(const [id,a]of Object.entries(cast.actors)){out[id]={};a.root.traverse(n=>out[id][n.name]=[n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.visible]);}return out;};
const fails=(fn,code)=>{assert.throws(fn,e=>e instanceof S.CastEvaluationError&&(!code||e.diagnostics.some(d=>d.code===code)));};
function setup(reverse=false){const engine=owner(),a={proportions:TALL,stance:S.standAt(S.worldMark([-1.4,0,0],1.35))},b={proportions:COMPACT,
  stance:S.sitAt(S.seatTarget({center:[.2,.45,-1.3],width:1,depth:.9,thickness:.1,yaw:-Math.PI/6}))};
  const cast=S.createCast(engine,reverse?{patient:b,doctor:a}:{doctor:a,patient:b});return{engine,cast};}
const frame=(frame=0,poses={})=>({frame,fps:30,poses});

test('mutual gaze resolves stable current support heads without recursion or previous joint reads',()=>{
  const {engine,cast}=setup();try{
    const r=cast.evaluate(frame(0,{doctor:{gaze:S.lookAt(cast.actors.patient.target())},patient:{gaze:S.lookAt(cast.actors.doctor.target())}}));
    for(const [a,b]of [['doctor','patient'],['patient','doctor']]) {
      const node=cast.actors[b].root.getObjectByName(b+':head');vec(r.gaze[a].targetWorld,node.getWorldPosition(new THREE.Vector3()).toArray());
      assert.ok(Math.abs(r.gaze[a].yaw)<=S.GAZE_LIMITS.yaw);assert.ok(Math.abs(r.gaze[a].pitch)<=S.GAZE_LIMITS.pitch);
    }
    assert.ok(r.gaze.patient.pitch<0);assert.ok(Object.isFrozen(r.poses.doctor.head.quaternion));
  }finally{engine.dispose();}
});
test('distant pointing uses the same IK, readable bend and exact forearm ray without hand contact',()=>{
  for(const proportions of [{},COMPACT,TALL]) {
    const e=owner(),c=S.createCast(e,{actor:{proportions}});try{
      for(const target of [[0,1.8,4],[4,1.8,.8],[-4,1.8,.8]]) {
        const r=c.evaluate(frame(0,{actor:{gesture:S.pointAt(S.worldPoint(target))}})),p=r.pointing.actor;
        assert.ok(p);assert.ok(p.bend>=Math.PI*25/180&&p.bend<=Math.PI*105/180);assert.ok(p.attempts<=32);
        const aim=new THREE.Vector3(...target).sub(new THREE.Vector3(...p.handWorld)).normalize();near(aim.dot(new THREE.Vector3(...p.directionWorld)),1);
        assert.ok(new THREE.Vector3(...p.handWorld).distanceTo(new THREE.Vector3(...target))>1);
        for(const side of ['left','right'])near(c.actors.actor.root.getObjectByName('actor:'+side+'Ankle').getWorldPosition(new THREE.Vector3()).y,.6*c.actors.actor.definition.proportions.shoeHeight);
      }
    }finally{e.dispose();}
  }
});
test('explicit hand selection and occupied-arm conflict are deterministic',()=>{
  const e=owner(),c=S.createCast(e,{a:{}});try{
    for(const hand of ['left','right'])assert.equal(c.evaluate(frame(0,{a:{gesture:S.pointAt(S.worldPoint([0,1.8,4]),{hand})}})).pointing.a.hand,hand);
    fails(()=>c.evaluate(frame(0,{a:{reaches:[S.reachFor('left',S.worldPoint([.55,1.68,.3]))],gesture:S.pointAt(S.worldPoint([0,1.8,4]),{hand:'left'})}})),'INTENT_CONFLICT');
  }finally{e.dispose();}
});
test('pointing while seated preserves both floor and dangling contacts',()=>{
  for(const proportions of [COMPACT,TALL]){
    const e=owner(),c=S.createCast(e,{a:{proportions,stance:S.sitAt(S.seatTarget({center:[0,.45,0],width:1,depth:.9,thickness:.1}))}});try{
      const before=c.evaluate(frame()),r=c.evaluate(frame(80,{a:{gesture:S.pointAt(S.worldPoint([0,1.5,4]))}}));
      assert.ok(r.pointing.a);assert.deepEqual(r.contacts,before.contacts);
      for(const node of ['pelvis','leftHip','leftKnee','leftAnkle','rightHip','rightKnee','rightAnkle'])assert.deepEqual(r.poses.a[node],before.poses.a[node]);
    }finally{e.dispose();}
  }
});
test('pure frame target callbacks resolve once per evaluate and repeat from absolute frame inputs',()=>{
  const e=owner(),c=S.createCast(e,{a:{},b:{stance:S.standAt(S.worldMark([2,0,0]))}});let count=0;
  const targets=S.createTargets({moving:S.frameTarget(({frame,time})=>{count++;return S.worldPoint([frame*.01,2,time+2]);})});try{
    for(const f of [0,80,20,80,0]){const before=count,r=c.evaluate(frame(f,{a:{gaze:S.lookAt(targets.target('moving'))},b:{gaze:S.lookAt(targets.target('moving'))}}));
      assert.equal(count,before+1);vec(r.gaze.a.targetWorld,[f*.01,2,f/30+2]);vec(r.gaze.a.targetWorld,r.gaze.b.targetWorld);
    }
  }finally{e.dispose();}
});
test('reversing actor declaration and request key order produces equal snapshots and transforms',()=>{
  const all=[];for(const reverse of [false,true]){const {engine,cast}=setup(reverse);try{
    const doctor={gaze:S.lookAt(cast.actors.patient.target()),gesture:S.pointAt(S.worldPoint([2.4,2.1,.8]),{hand:'right'})};
    const patient={gaze:S.lookAt(cast.actors.doctor.target())};all.push({snapshot:cast.evaluate(frame(80,reverse?{patient,doctor}:{doctor,patient})),actual:shot(cast)});
  }finally{engine.dispose();}}assert.deepEqual(all[0],all[1]);
});
test('missing/circular targets and impossible points reject the whole cast without partial application',()=>{
  const {engine,cast}=setup();try{
    cast.evaluate(frame());const before=shot(cast),library=S.createTargets({a:S.aliasTarget('b'),b:S.aliasTarget('a')});
    for(const target of [library.target('missing'),library.target('a')]){
      fails(()=>cast.evaluate(frame(80,{doctor:{stance:S.standAt(S.worldMark([3,0,0]))},patient:{gaze:S.lookAt(target)}})));assert.deepEqual(shot(cast),before);
    }
    const head=S.characterTarget('doctor','leftShoulder');
    fails(()=>cast.evaluate(frame(80,{doctor:{gesture:S.pointAt(head,{hand:'left'})}})),'POINTING_COINCIDENT');assert.deepEqual(shot(cast),before);
    fails(()=>cast.evaluate(frame(80,{doctor:{gesture:S.pointAt(S.worldPoint([NaN,0,0]))}})),'TARGET_INVALID');
  }finally{engine.dispose();}
});
test('current scene transforms resolve fresh for multiple targets under rotated scaled ancestors',()=>{
  const e=owner(),group=new THREE.Group(),prop=new THREE.Object3D(),mark=new THREE.Object3D();group.add(prop,mark);e.scene.add(group);
  const lib=S.createTargets({p:S.scenePoint(prop,[.1,.2,.3]),home:S.sceneMark(mark)});
  const c=S.createCast(e,{a:{stance:S.standAt(lib.mark('home'))}});try{
    for(const f of [0,80,20,80,0]){
      group.position.set(f*.01,.2,-1);group.rotation.y=f*.01;group.scale.setScalar(1.5);prop.position.set(.3,2,2);mark.position.set(0,0,0);
      const r=c.evaluate(frame(f,{a:{gaze:S.lookAt(lib.target('p'))}}));
      vec(r.gaze.a.targetWorld,prop.localToWorld(new THREE.Vector3(.1,.2,.3)).toArray());
      near(c.actors.a.root.getObjectByName('a:leftAnkle').getWorldPosition(new THREE.Vector3()).y,.2+.6*c.actors.a.definition.proportions.shoeHeight);
    }
  }finally{e.dispose();}
});
test('scene points allow arbitrary object rotation/nonuniform scale; seats require level frames',()=>{
  const e=owner(),p=new THREE.Object3D();p.position.set(1,2,2);p.rotation.set(.3,.4,.2);p.scale.set(2,1,3);e.scene.add(p);
  const c=S.createCast(e,{a:{}});try{const r=c.evaluate(frame(0,{a:{gaze:S.lookAt(S.scenePoint(p,[.2,.1,0]))}}));vec(r.gaze.a.targetWorld,p.localToWorld(new THREE.Vector3(.2,.1,0)).toArray());
    fails(()=>c.evaluate(frame(0,{a:{stance:S.sitAt(S.sceneSeat(p,{width:1,depth:1,thickness:.1}))}})),'INVALID_PARENT');
  }finally{e.dispose();}
});
test('sceneSeat infers mesh geometry and follows current top-surface world transform',()=>{
  const e=owner(),seat=new THREE.Mesh(new THREE.BoxGeometry(1,.1,.9),new THREE.MeshBasicMaterial());seat.position.set(0,.4,-1);e.scene.add(seat);e.track(seat);
  const c=S.createCast(e,{a:{proportions:COMPACT}}),target=S.sceneSeat(seat);try{
    for(const f of [0,20,80,0]){seat.position.y=.4+f*.001;seat.rotation.y=f*.01;
      const r=c.evaluate(frame(f,{a:{stance:S.sitAt(target)}})),p=c.actors.a.definition.proportions;
      const torso=c.actors.a.root.getObjectByName('a:torso').getWorldPosition(new THREE.Vector3());near(torso.y-p.torsoLength/2-p.torsoRadius,seat.position.y+.05);
      assert.equal(r.contacts.a.support,'seated');
    }
  }finally{e.dispose();}
});
test('live actor scene-node references are rejected instead of reading previous-frame transforms',()=>{
  const {engine,cast}=setup();try{fails(()=>cast.evaluate(frame(0,{doctor:{gaze:S.lookAt(S.scenePoint(cast.actors.patient.root))}})),'ACTOR_SCENE_TARGET');}finally{engine.dispose();}
});
test('support cycles, final-pose cycles and unsupported support/final dependencies diagnose clearly',()=>{
  const e=owner(),c=S.createCast(e,{a:{},b:{}});try{
    fails(()=>c.evaluate(frame(0,{a:{stance:S.standAt(S.markFrom(c.actors.b.target('root')))},b:{stance:S.standAt(S.markFrom(c.actors.a.target('root')))}})),'TARGET_CYCLE');
    fails(()=>c.evaluate(frame(0,{a:{gaze:S.lookAt(c.actors.b.target('leftWrist','final'))},b:{gaze:S.lookAt(c.actors.a.target('leftWrist','final'))}})),'TARGET_CYCLE');
    fails(()=>c.evaluate(frame(0,{a:{stance:S.standAt(S.markFrom(c.actors.b.target('head','final')))}})),'TARGET_PHASE');
  }finally{e.dispose();}
});
test('acyclic final-pose targets resolve without declaration-order dependence',()=>{
  const e=owner(),c=S.createCast(e,{a:{},b:{stance:S.standAt(S.worldMark([2,0,0]))}});try{
    const r=c.evaluate(frame(0,{a:{gaze:S.lookAt(c.actors.b.target('leftWrist','final'))},b:{gesture:S.pointAt(S.worldPoint([2,1.8,4]))}}));
    vec(r.gaze.a.targetWorld,r.pointing.b.hand==='left'?r.pointing.b.handWorld:c.actors.b.root.getObjectByName('b:leftWrist').getWorldPosition(new THREE.Vector3()).toArray());
  }finally{e.dispose();}
});
test('gaze handles forward, rear, overhead, below and coincident targets with bounded yaw/pitch',()=>{
  const e=owner(),c=S.createCast(e,{a:{}});try{
    const base=c.evaluate(frame()),head=c.actors.a.root.getObjectByName('a:head').getWorldPosition(new THREE.Vector3());
    for(const [delta,yaw,pitch]of [[[0,0,3],0,0],[[0,0,-3],S.GAZE_LIMITS.yaw,0],[[0,3,0],0,-S.GAZE_LIMITS.pitch],[[0,-3,0],0,S.GAZE_LIMITS.pitch],[[0,0,0],0,0]]){
      const target=head.clone().add(new THREE.Vector3(...delta)).toArray(),r=c.evaluate(frame(20,{a:{gaze:S.lookAt(S.worldPoint(target))}}));
      near(r.gaze.a.yaw,yaw);near(r.gaze.a.pitch,pitch);vec(c.actors.a.root.getObjectByName('a:head').getWorldPosition(new THREE.Vector3()).toArray(),head.toArray());
      for(const name of ['leftAnkle','rightAnkle','neck'])assert.deepEqual(r.poses.a[name],base.poses.a[name]);
      near(Math.hypot(...r.gaze.a.eyeLocalDirection),1);
    }
  }finally{e.dispose();}
});
test('omitted intentions reset to immutable construction defaults after arbitrary prior poses',()=>{
  const {engine,cast}=setup();try{const original=cast.evaluate(frame()),before=shot(cast);
    cast.evaluate(frame(80,{doctor:{visible:false,scale:.8,gaze:S.lookAt(S.worldPoint([3,4,0])),gesture:S.pointAt(S.worldPoint([3,1.7,3]))}}));
    const reset=cast.evaluate(frame());assert.deepEqual(reset,original);assert.deepEqual(shot(cast),before);
  }finally{engine.dispose();}
});
test('nonsequential 0/80/20/80/0 snapshots and fresh cast instances match',()=>{
  const all=[];for(let instance=0;instance<2;instance++){const {engine,cast}=setup(instance===1);try{
    for(const f of [0,80,20,80,0])all.push({frame:f,result:cast.evaluate(frame(f,{doctor:{gaze:S.lookAt(cast.actors.patient.target()),
      gesture:f===80?S.pointAt(S.worldPoint([2.4,2.1,.8]),{hand:'right'}):undefined},patient:{gaze:S.lookAt(cast.actors.doctor.target())}})),actual:shot(cast)});
  }finally{engine.dispose();}}for(const f of [0,20,80]){const group=all.filter(v=>v.frame===f);for(const v of group)assert.deepEqual(v,group[0]);}
});
test('target depth, callbacks and missing actors/anchors fail predictably without corrupting the cast',()=>{
  const e=owner(),c=S.createCast(e,{a:{}});try{
    const entries={};for(let i=0;i<80;i++)entries['n'+i]=i===79?S.worldPoint([1,2,3]):S.aliasTarget('n'+(i+1));const long=S.createTargets(entries);
    for(const [target,code]of [[long.target('n0'),'TARGET_DEPTH'],[S.characterTarget('missing'),'UNKNOWN_ACTOR'],[S.characterTarget('a','missing'),'TARGET_MISSING'],
      [S.frameTarget(()=>{throw Error('bad');}),'TARGET_CALLBACK_FAILED'],[S.frameTarget(()=>Promise.resolve(S.worldPoint([0,0,1]))),'TARGET_INVALID']])fails(()=>c.evaluate(frame(0,{a:{gaze:S.lookAt(target)}})),code);
    fails(()=>c.evaluate(frame(0,{a:{gaze:S.lookAt(S.frameTarget(()=>{c.evaluate(frame());return S.worldPoint([0,0,1]);}))}})),'TARGET_CYCLE');
    c.evaluate(frame());
  }finally{e.dispose();}
});
test('invalid actor data and invalid parents are preflighted across the whole cast',()=>{
  const {engine,cast}=setup();try{cast.evaluate(frame());const before=shot(cast);
    for(const poses of [{other:{}},{patient:null},{patient:{visible:null}},{doctor:{scale:null}},{doctor:{stance:null}},{doctor:{expression:'happy'}}]){fails(()=>cast.evaluate(frame(0,poses)));assert.deepEqual(shot(cast),before);}
    const group=new THREE.Group();engine.scene.add(group);group.add(cast.actors.patient.root);group.scale.set(1,2,1);
    fails(()=>cast.evaluate(frame(80,{doctor:{stance:S.standAt(S.worldMark([3,0,0]))}})),'INVALID_PARENT');assert.deepEqual(shot(cast),before);
  }finally{engine.dispose();}
});
test('cast disposal is idempotent, releases ownership at engine end and invalidates evaluate',()=>{
  const {engine,cast}=setup();cast.evaluate(frame());cast.dispose();cast.dispose();fails(()=>cast.evaluate(frame()),'CAST_DISPOSED');engine.dispose();engine.dispose();
});
test('invalid target payloads cannot freeze scene objects or partially modify actors',()=>{
  const e=owner(),c=S.createCast(e,{a:{}}),prop=new THREE.Object3D();try{
    const targets=S.createTargets({bad:{kind:'mark',position:[0,0,0],yaw:0,extra:prop}});
    fails(()=>c.evaluate(frame(0,{a:{gaze:S.lookAt(targets.target('bad'))}})),'TARGET_INVALID');
    assert.equal(Object.isFrozen(prop),false);prop.position.x=2;c.evaluate(frame());
  }finally{e.dispose();}
});
test('foreign cast handles and scene props cannot silently alias same-named local actors',()=>{
  const e=owner(),other=owner(),a=S.createCast(e,{person:{}}),b=S.createCast(other,{person:{}}),prop=new THREE.Object3D();other.scene.add(prop);
  try{fails(()=>a.evaluate(frame(0,{person:{gaze:S.lookAt(b.actors.person.target())}})),'UNKNOWN_ACTOR');
    fails(()=>a.evaluate(frame(0,{person:{gaze:S.lookAt(S.scenePoint(prop))}})),'TARGET_INVALID');
    a.evaluate(frame());b.evaluate(frame());
  }finally{e.dispose();other.dispose();}
});
test('unattached and foreign actor parents fail before a cast can capture an invalid scene',()=>{
  const e=owner(),other=owner(),group=new THREE.Group();try{
    fails(()=>S.createCast(e,{foreign:{parent:other.scene}}),'INVALID_PARENT');
    const c=S.createCast(e,{a:{parent:group}});fails(()=>c.evaluate(frame()),'INVALID_PARENT');e.scene.add(group);c.evaluate(frame());
  }finally{e.dispose();other.dispose();}
});
