'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three'),fs=require('node:fs');
const S=require('../../out/character-tests/toon-kit/characters'),{ResourceOwner}=require('../../out/character-tests/toon-kit/internal/resources');
const {TALL,COMPACT}=require('../../out/character-tests/toon-kit-tests/character-fixture');
const {sampleActing}=require('../../out/character-tests/toon-kit/characters/acting');
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const gestures=['wave','nod','shakeHead','shrug','explain','surprise','sad','worried','excited'];
function owner(){const r=new ResourceOwner(),a=new AbortController(),clean=[];return {scene:new THREE.Scene(),profile:'software-safe',signal:a.signal,track:o=>r.track(o),registerCleanup:f=>clean.push(f),dispose(){if(a.signal.aborted)return;a.abort();clean.forEach(f=>f());r.dispose();}};}
function point(actor,pose,name){return S.poseAnchorPosition(pose,actor.definition.anchors[name],'parent');}
function checkLimbs(actor,pose){const p=actor.definition.proportions;for(const side of ['left','right'])for(const [a,b,c,u,l]of [['Shoulder','Elbow','Wrist',p.upperArmLength,p.lowerArmLength],['Hip','Knee','Ankle',p.upperLegLength,p.lowerLegLength]]){near(dist(point(actor,pose,side+a),point(actor,pose,side+b)),u*pose.root.scale[0]);near(dist(point(actor,pose,side+b),point(actor,pose,side+c)),l*pose.root.scale[0]);}}
const walk=(fps=30)=>S.walkAlong(S.pathThrough([[0,0,0],[0,0,3]]),{endFrame:fps*6});
test('gesture descriptors are immutable, bounded and reject invalid timing and options',()=>{
 for(const name of gestures){const a=S[name]();assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.options));}
 for(const o of [{intensity:null},{intensity:2},{duration:0},{duration:2,endFrame:30},{startFrame:-1},{endFrame:0},{hand:'tail'},{oops:1}])assert.throws(()=>S.wave(o));
 const e=owner(),c=S.createCast(e,{a:{}});try{assert.throws(()=>c.evaluate({frame:0,fps:30,poses:{a:{gesture:S.wave({endFrame:2})}}}),x=>x.diagnostics[0].code==='ACTION_INVALID');}finally{e.dispose();}
});
test('all nine gestures retain contacts and fixed lengths for three proportions on stand/seat/walk',()=>{
 let samples=0,maxElbowStep=0;
 for(const proportions of [undefined,TALL,COMPACT])for(const support of ['stand','sit','walk'])for(const name of gestures)for(const intensity of [.8,1]){
  const e=owner(),stance=support==='walk'?walk():support==='sit'?S.sitAt(S.seatTarget({center:[0,.65,0],width:1.4,depth:1.2,thickness:.08})):S.standAt(S.worldMark([0,0,0]));
  const c=S.createCast(e,{a:{proportions,stance}}),actor=c.actors.a,gesture=S[name]({startFrame:20,endFrame:140,intensity});let previous=null;
  try{for(let frame=0;frame<=180;frame+=2){const r=c.evaluate({frame,fps:30,poses:{a:{gesture}}}),pose=r.poses.a;checkLimbs(actor,pose);
   for(const side of ['left','right']){const sole=point(actor,pose,side+'Sole');assert.ok(sole[1]>=-1e-8);if(r.contacts.a.feet[side]==='floor')near(sole[1],0);if(r.locomotion.a)assert.ok(dist(sole,r.locomotion.a.feet[side].position)<1e-8);}
   const elbow=point(actor,pose,'rightElbow');if(previous)maxElbowStep=Math.max(maxElbowStep,dist(elbow,previous));previous=elbow;samples++;
  }}finally{e.dispose();}
 }
 // Adjacent 1/15-second samples must not contain a bend-plane flip.
 assert.ok(maxElbowStep<.25,JSON.stringify({maxElbowStep}));fs.mkdirSync('out/phase2eb',{recursive:true});fs.writeFileSync('out/phase2eb/pose-sweep.json',JSON.stringify({samples,maxElbowStep},null,2));
});
test('gesture onset/completion return exact rest and omitted inputs reset arbitrary history',()=>{
 const e=owner(),c=S.createCast(e,{a:{},b:{}});try{for(const name of gestures){const g=S[name]({startFrame:20,endFrame:140}),rest=c.evaluate({frame:20,fps:30});
 assert.deepEqual(c.evaluate({frame:20,fps:30,poses:{a:{gesture:g}}}).poses,rest.poses);c.evaluate({frame:80,fps:30,poses:{a:{gesture:g}}});assert.deepEqual(c.evaluate({frame:140,fps:30,poses:{a:{gesture:g}}}).poses,rest.poses);
 c.actors.a.root.traverse(o=>{o.position.set(7,8,9);o.visible=false;});assert.deepEqual(c.evaluate({frame:20,fps:30}).poses,rest.poses);}}finally{e.dispose();}
});
test('timed pointing fades from rest, aligns at full weight and reports actual blended hand/elbow',()=>{
 const e=owner(),c=S.createCast(e,{a:{}}),g=S.gestureDuring(S.pointAt(S.worldPoint([-5,2.6,4]),{hand:'right'}),{startFrame:20,endFrame:140});try{
 for(const frame of [0,20,22,30,50,80,110,130,138,140,160]){const r=c.evaluate({frame,fps:30,poses:{a:{gesture:g}}});if(r.pointing.a){const p=r.pointing.a;assert.ok(dist(point(c.actors.a,r.poses.a,'rightWrist'),p.handWorld)<1e-8);assert.ok(dist(point(c.actors.a,r.poses.a,'rightElbow'),p.elbowWorld)<1e-8);if(frame===80)assert.ok(p.aligned);}}
 }finally{e.dispose();}
});
test('physical reaches reserve arms; auto gestures share free arms and explicit conflicts fail atomically',()=>{
 const e=owner(),c=S.createCast(e,{a:{}});try{const rest=c.evaluate({frame:80,fps:30}),target=S.worldPoint(point(c.actors.a,rest.poses.a,'rightWrist')),reach=S.reachFor('right',target);
 const r=c.evaluate({frame:80,fps:30,poses:{a:{gesture:S.explain({endFrame:160}),reaches:[reach]}}});assert.deepEqual(r.acting.a.hands,['left']);assert.ok(dist(point(c.actors.a,r.poses.a,'rightWrist'),target.position)<1e-8);
 const state=()=>{const data=[];c.actors.a.root.traverse(o=>data.push([o.position.toArray(),o.quaternion.toArray(),o.visible]));return JSON.stringify(data);};
 const before=state();assert.throws(()=>c.evaluate({frame:80,fps:30,poses:{a:{gesture:S.wave({hand:'right',endFrame:160}),reaches:[reach]}}}),x=>x.diagnostics[0].code==='INTENT_CONFLICT');assert.equal(state(),before);
 }finally{e.dispose();}
});
test('walking handovers blend smoothly, preserve actual plants and reserve only gesture arms',()=>{
 const e=owner(),c=S.createCast(e,{a:{stance:walk()}}),g=S.wave({startFrame:20,endFrame:140,hand:'right'}),fixed=new Map();let previous;
 try{for(let frame=0;frame<=180;frame++){const r=c.evaluate({frame,fps:30,poses:{a:{gesture:g}}}),p=point(c.actors.a,r.poses.a,'rightWrist');if(previous)assert.ok(dist(p,previous)<.12);previous=p;
 if(r.acting.a.weight>0)assert.equal(r.locomotion.a.arms.right,'gesture');
 for(const side of ['left','right']){const f=r.locomotion.a.feet[side],actual=point(c.actors.a,r.poses.a,side+'Sole');if(f.state==='floor'){const key=side+f.step;if(fixed.has(key))assert.ok(dist(fixed.get(key),actual)<1e-8);else fixed.set(key,actual);}}
 }}finally{e.dispose();}
});
test('transition root/wrist/ankle/head and elbow limits are measured at fine absolute-frame boundaries',()=>{
 const metrics={root:0,wrist:0,ankle:0,head:0,elbow:0};let maxHeadRotation=0;const fps=3000;
 for(const moving of [false,true])for(const name of ['wave','explain','nod','surprise']){const e=owner(),c=S.createCast(e,{a:{stance:moving?walk(fps):undefined}}),g=S[name]({startFrame:2000,endFrame:14000});
 try{for(const boundary of [2000,14000]){const snapshots=[boundary-1,boundary,boundary+1].map(frame=>c.evaluate({frame,fps,poses:{a:{gesture:g}}}));for(let i=1;i<3;i++){
 for(const [key,anchor]of [['root','root'],['wrist','rightWrist'],['ankle','rightAnkle'],['head','head'],['elbow','rightElbow']]){const delta=dist(point(c.actors.a,snapshots[i-1].poses.a,anchor),point(c.actors.a,snapshots[i].poses.a,anchor));metrics[key]=Math.max(metrics[key],delta);assert.ok(delta<.001,JSON.stringify({name,moving,boundary,key,delta}));}
 const orientation=pose=>new THREE.Quaternion(...pose.root.quaternion).multiply(new THREE.Quaternion(...pose.torso.quaternion)).multiply(new THREE.Quaternion(...pose.head.quaternion));
 const delta=orientation(snapshots[i-1].poses.a).invert().multiply(orientation(snapshots[i].poses.a)),angle=2*Math.atan2(Math.hypot(delta.x,delta.y,delta.z),Math.abs(delta.w));maxHeadRotation=Math.max(maxHeadRotation,angle);assert.ok(angle<.001);
 }}}finally{e.dispose();}}
 fs.writeFileSync('out/phase2eb/transition-continuity.json',JSON.stringify({intervalSeconds:1/fps,maxDisplacement:metrics,maxHeadRotationRadians:maxHeadRotation},null,2));
});
test('current posture support targets, shuffled frames and reversed declarations are deterministic',()=>{
 const run=reverse=>{const e=owner(),defs={doctor:{stance:walk()},patient:{stance:S.standAt(S.worldMark([-2,0,1]))}},c=S.createCast(e,reverse?{patient:defs.patient,doctor:defs.doctor}:defs);try{return [0,80,20,80,0].map(frame=>{const r=c.evaluate({frame,fps:30,poses:{doctor:{gesture:S.explain({endFrame:160})},patient:{gesture:S.nod({endFrame:160}),gaze:S.lookAt(c.actors.doctor.target('head'))}}});assert.ok(dist(r.gaze.patient.targetWorld,point(c.actors.doctor,r.poses.doctor,'head'))<1e-8);return r;});}finally{e.dispose();}};
 const a=run(false),b=run(true);assert.deepEqual(a,b);assert.deepEqual(a[0],a[4]);assert.deepEqual(a[1],a[3]);
});
test('turnTo uses explicit endpoints, handles opposed directions and resets independently of history',()=>{
 const e=owner(),c=S.createCast(e,{a:{}}),g=S.turnTo(S.worldPoint([2,2,5]),{from:S.worldPoint([-2,2,5]),startFrame:20,endFrame:80});try{const values=[0,80,20,50,80,0].map(frame=>c.evaluate({frame,fps:30,poses:{a:{gaze:g,gesture:S.nod({endFrame:160})}}}));assert.deepEqual(values[0],values[5]);assert.deepEqual(values[1],values[4]);for(const r of values)assert.ok(r.poses.a.head.quaternion.every(Number.isFinite));const opposed=S.turnTo(S.worldPoint([0,2,-5]),{from:S.worldPoint([0,2,5]),endFrame:80});c.evaluate({frame:40,fps:30,poses:{a:{gaze:opposed}}});}finally{e.dispose();}
});
test('facial transitions have exact endpoints and automatic gesture emotion honors explicit override',()=>{
 const e=owner(),c=S.createCast(e,{a:{face:{blink:{enabled:false}}}}),x=S.blendExpression('neutral','surprised',{startFrame:20,endFrame:40});try{const a=c.evaluate({frame:20,fps:30,poses:{a:{expression:x}}}),b=c.evaluate({frame:30,fps:30,poses:{a:{expression:x}}}),z=c.evaluate({frame:40,fps:30,poses:{a:{expression:x}}});assert.equal(a.faces.a.expression,'neutral');assert.ok(b.faces.a.transition.weight>.4);assert.equal(z.faces.a.expression,'surprised');assert.equal(z.faces.a.transition,undefined);
 assert.equal(c.evaluate({frame:60,fps:30,poses:{a:{gesture:S.surprise({endFrame:140})}}}).faces.a.expression,'surprised');assert.equal(c.evaluate({frame:60,fps:30,poses:{a:{gesture:S.surprise({endFrame:140}),expression:'happy'}}}).faces.a.expression,'happy');}finally{e.dispose();}
});
test('appearance remains attached and repeated acting construction cleans pooled resources once',()=>{
 for(let n=0;n<4;n++){const e=owner(),c=S.createCast(e,{a:{appearance:S.appearancePreset(['doctor','patient','office','casual'][n])}}),resources=new Map();c.actors.a.root.traverse(o=>{if(o.isMesh)for(const r of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)+1));}});for(const frame of [0,80,20,80,0])c.evaluate({frame,fps:30,poses:{a:{gesture:S.explain({endFrame:160})}}});c.dispose();assert.ok([...resources.values()].every(v=>v===0));e.dispose();e.dispose();assert.ok([...resources.values()].every(v=>v===1));}
});
test('acting supports level transformed parents, uniform scales and correct world gaze',()=>{
 for(const scale of [.7,1.4]){const e=owner(),parent=new THREE.Group();parent.position.set(3,1,-2);parent.rotation.y=.65;parent.scale.setScalar(1.3);e.scene.add(parent);const c=S.createCast(e,{a:{parent,scale,stance:walk()}});
 try{for(const frame of [0,80,20,80,0]){const r=c.evaluate({frame,fps:30,poses:{a:{gesture:S.explain({endFrame:160}),gaze:S.lookAt(S.worldPoint([1,2,6]))}}}),actor=c.actors.a;
 for(const side of ['left','right']){const ankle=actor.root.getObjectByName('a:'+side+'Ankle'),sole=new THREE.Vector3(...actor.definition.anchors[side+'Sole'].offset).applyMatrix4(ankle.matrixWorld);assert.ok(sole.distanceTo(new THREE.Vector3(...r.locomotion.a.feet[side].position))<1e-8);}
 const head=actor.root.getObjectByName('a:head'),direction=new THREE.Vector3(0,0,1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));assert.ok(direction.distanceTo(new THREE.Vector3(...r.gaze.a.headWorldDirection))<1e-8);
 }}finally{e.dispose();}}
});
test('seated leaning preserves the capsule support plane and embedded hip sockets',()=>{
 const e=owner(),seat=S.seatTarget({center:[0,.65,0],width:1.4,depth:1.2,thickness:.08}),c=S.createCast(e,{a:{stance:S.sitAt(seat)}});try{for(const name of ['sad','worried','surprise','explain'])for(const frame of [30,60,100]){c.evaluate({frame,fps:30,poses:{a:{gesture:S[name]({endFrame:160})}}});const actor=c.actors.a,p=actor.definition.proportions,torso=actor.root.getObjectByName('a:torso'),center=torso.getWorldPosition(new THREE.Vector3()),axis=new THREE.Vector3(0,p.torsoLength/2,0).applyQuaternion(torso.getWorldQuaternion(new THREE.Quaternion()));near(center.y-Math.abs(axis.y)-p.torsoRadius,.65);}}
 finally{e.dispose();}
});
test('timed pointing while walking has continuous wrists and exact stance plants',()=>{
 const e=owner(),c=S.createCast(e,{a:{stance:walk()}}),g=S.gestureDuring(S.pointAt(S.worldPoint([-5,2.6,5]),{hand:'right'}),{startFrame:20,endFrame:140});let previous,maxStep=0;
 try{for(let frame=0;frame<=180;frame++){const r=c.evaluate({frame,fps:30,poses:{a:{gesture:g}}}),wrist=point(c.actors.a,r.poses.a,'rightWrist');if(previous)maxStep=Math.max(maxStep,dist(previous,wrist));previous=wrist;for(const side of ['left','right'])assert.ok(dist(point(c.actors.a,r.poses.a,side+'Sole'),r.locomotion.a.feet[side].position)<1e-8);}
 assert.ok(maxStep<.12,JSON.stringify({maxStep}));}finally{e.dispose();}
});
test('matched walking endpoints hand off to standing without a body or foot jump',()=>{
 const e=owner(),c=S.createCast(e,{a:{stance:walk()}});try{for(const frame of [0,180]){const a=c.evaluate({frame,fps:30}),b=c.evaluate({frame,fps:30,poses:{a:{stance:S.standAt(S.worldMark([0,0,frame===0?0:3]))}}});for(const anchor of ['root','head','leftWrist','rightWrist','leftSole','rightSole'])assert.ok(dist(point(c.actors.a,a.poses.a,anchor),point(c.actors.a,b.poses.a,anchor))<1e-8);}}finally{e.dispose();}
});
test('Phase 8C acting polish: anticipation, overshoot, body coordination, and gaze saccadic blinks',()=>{
 const sur=S.surprise({startFrame:0,endFrame:100});
 const sample0=sampleActing(sur,0,30),sampleAnt=sampleActing(sur,8,30),sampleOver=sampleActing(sur,28,30),sampleHold=sampleActing(sur,50,30),sampleEnd=sampleActing(sur,100,30);
 assert.ok(sampleAnt.lean>0,`Expected positive lean during anticipation, got ${sampleAnt.lean}`);
 assert.ok(sampleAnt.headPitch>0,`Expected positive headPitch during anticipation, got ${sampleAnt.headPitch}`);
 assert.ok(sampleOver.lean<sampleHold.lean,`Expected recoil lean overshoot, got ${sampleOver.lean} vs ${sampleHold.lean}`);
 assert.ok(sampleOver.headPitch<sampleHold.headPitch,`Expected chin lift overshoot, got ${sampleOver.headPitch} vs ${sampleHold.headPitch}`);
 assert.ok(sampleHold.lean<0&&Math.abs(sampleHold.lean)<=.15);
 assert.equal(sample0.lean,0);assert.equal(sample0.headPitch,0);
 assert.equal(sampleEnd.lean,0);assert.equal(sampleEnd.headPitch,0);

 const pt=S.gestureDuring(S.pointAt(S.worldPoint([2,1,3])),{startFrame:0,endFrame:100});
 const ptAnt=sampleActing(pt,8,30),ptOver=sampleActing(pt,28,30),ptHold=sampleActing(pt,50,30);
 assert.ok(ptAnt.lean<0,`Expected negative lean during point anticipation, got ${ptAnt.lean}`);
 assert.ok(ptOver.lean>ptHold.lean,`Expected point lean overshoot, got ${ptOver.lean} vs ${ptHold.lean}`);
 assert.equal(ptHold.weight,1);

 const e=owner(),c=S.createCast(e,{a:{face:{blink:{enabled:true,phase:1.5,period:10}}}});
 try{
  const turn=S.turnTo(S.worldPoint([3,2,5]),{from:S.worldPoint([-3,2,5]),startFrame:0,endFrame:30});
  const rStart=c.evaluate({frame:0,fps:30,poses:{a:{gaze:turn}}});
  const rMid=c.evaluate({frame:15,fps:30,poses:{a:{gaze:turn}}});
  const rEnd=c.evaluate({frame:30,fps:30,poses:{a:{gaze:turn}}});
  assert.ok(rMid.faces.a.blink>.7,`Expected saccadic blink peak, got ${rMid.faces.a.blink}`);
  assert.equal(rStart.faces.a.blink,0);
  assert.equal(rEnd.faces.a.blink,0);

  const rSurprise=c.evaluate({frame:50,fps:30,poses:{a:{gesture:S.surprise({startFrame:0,endFrame:100})}}});
  assert.equal(rSurprise.faces.a.expression,'surprised');
  assert.equal(rSurprise.faces.a.blink,0);

  const rExplicit=c.evaluate({frame:15,fps:30,poses:{a:{gaze:turn,blink:0}}});
  assert.equal(rExplicit.faces.a.blink,0);
 }finally{e.dispose();}
});
