'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three');
const S=require('../../out/character-tests/toon-kit/characters');
const {ResourceOwner}=require('../../out/character-tests/toon-kit/internal/resources');
function owner(){const resources=new ResourceOwner(),a=new AbortController(),cleanups=[];return {scene:new THREE.Scene(),signal:a.signal,profile:'software-safe',track:o=>resources.track(o),registerCleanup:f=>cleanups.push(f),dispose(){if(a.signal.aborted)return;a.abort();cleanups.forEach(f=>f());resources.dispose();}};}
const input=(frame,poses={})=>({frame,fps:30,poses});
const transforms=c=>JSON.stringify(Object.values(c.actors).map(a=>{const r=[];a.root.traverse(n=>r.push([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.visible]));return r;}));
test('all expressions resolve immutable complete data for different head proportions',()=>{
 assert.ok(Object.isFrozen(S.EXPRESSIONS));
 const e=owner(),c=S.createCast(e,{small:{proportions:{headRadius:.46}},large:{proportions:{headRadius:.62}}});
 try{for(const name of S.EXPRESSIONS){const r=c.evaluate(input(20,{small:{expression:name},large:{expression:name}}));assert.equal(r.faces.small.expression,name);assert.deepEqual(r.faces.small.pupil,[0,0]);assert.equal(r.faces.large.expression,name);assert.ok(Object.isFrozen(r.faces.small));}}finally{e.dispose();}
});
test('mouth overrides and blush are complete, independent and reset to defaults',()=>{
 const e=owner(),c=S.createCast(e,{a:{face:{defaultExpression:'happy'}},b:{}});try{
 for(const mouth of ['closed','smile','frown','open','o']){const r=c.evaluate(input(0,{a:{expression:{name:'worried',mouth,blush:.6,intensity:.8},blink:1}}));assert.equal(r.faces.a.mouth,mouth);assert.equal(r.faces.a.blink,1);assert.equal(r.faces.b.expression,'neutral');}
 const r=c.evaluate(input(0));assert.equal(r.faces.a.expression,'happy');assert.equal(r.faces.a.blush,0);assert.equal(r.faces.a.mouth,'auto');assert.notEqual(r.faces.a.blink,1);
 }finally{e.dispose();}
});
test('invalid facial inputs reject the entire cast before any pose transform changes',()=>{
 const e=owner(),c=S.createCast(e,{a:{},z:{}});try{c.evaluate(input(0));const before=transforms(c);
 for(const bad of [{expression:'bad'},{expression:null},{expression:{name:'sad',intensity:NaN}},{expression:{name:'happy',blush:2}},{expression:{name:'happy',mouth:'lip-sync'}},{blink:-1},{blink:NaN},{eyeGaze:null}]){
 assert.throws(()=>c.evaluate(input(80,{a:{stance:S.standAt(S.worldMark([2,0,0]))},z:bad})),e=>e instanceof S.CastEvaluationError&&e.diagnostics[0].code==='FACE_INVALID');assert.equal(transforms(c),before);}
 }finally{e.dispose();}
});
test('face configurations validate before rig allocation and copy mutable caller configuration',()=>{
 for(const face of [{textureSize:1024},{blink:{period:0}},{blink:{duration:.6}},{blink:{period:.5,duration:.5}},{defaultExpression:'bad'},{blink:{enabled:1}},{extra:1}]){
 const e=owner();try{assert.throws(()=>S.createCast(e,{a:{face}}));assert.equal(e.scene.children.length,0);}finally{e.dispose();}}
 const e=owner(),face={blink:{phase:.2},defaultExpression:'happy'},c=S.createCast(e,{a:{face}});try{const r=c.evaluate(input(0));face.defaultExpression='sad';face.blink.phase=1;assert.deepEqual(c.evaluate(input(0)),r);assert.ok(!Object.isFrozen(face));}finally{e.dispose();}
});
test('absolute-time blink has open, closing, closed and opening samples with no counters',()=>{
 const b={period:3,duration:.2,phase:0};assert.equal(S.blinkAt(0,'a',b),0);assert.ok(Math.abs(S.blinkAt(.05,'a',b)-.5)<1e-8);assert.equal(S.blinkAt(.1,'a',b),1);assert.ok(Math.abs(S.blinkAt(.15,'a',b)-.5)<1e-8);assert.equal(S.blinkAt(.3,'a',b),0);assert.equal(S.blinkAt(.1,'a',{...b,enabled:false}),0);
 assert.equal(S.blinkAt(3.1,'a',b),S.blinkAt(.1,'a',b));assert.throws(()=>S.blinkAt(0,'a',{period:0}));
});
test('blink phase and explicit closure are character specific without altering expression identity',()=>{
 const e=owner(),c=S.createCast(e,{a:{face:{blink:{period:2,duration:.2,phase:0}}},b:{face:{blink:{period:2,duration:.2,phase:1}}}});try{const r=c.evaluate(input(3,{a:{expression:'angry'},b:{expression:'sad'}}));assert.equal(r.faces.a.blink,1);assert.equal(r.faces.b.blink,0);assert.equal(r.faces.a.expression,'angry');assert.equal(r.faces.b.expression,'sad');}finally{e.dispose();}
});
test('eye-only gaze is bounded, mirrored and does not change the head/contact pose',()=>{
 const e=owner(),c=S.createCast(e,{a:{}});try{const neutral=c.evaluate(input(0));for(const [p,axis,value] of [[[20,3,2],0,1],[[-20,3,2],0,-1],[[0,30,2],1,1],[[0,-30,2],1,-1]]){const r=c.evaluate(input(0,{a:{eyeGaze:S.lookAt(S.worldPoint(p))}}));assert.equal(r.faces.a.pupil[axis],value);assert.deepEqual(r.poses,neutral.poses);assert.deepEqual(r.contacts,neutral.contacts);}}finally{e.dispose();}
});
test('default pupil gaze follows residual head direction and preserves Stage 2C head bounds',()=>{
 const e=owner(),c=S.createCast(e,{a:{}});try{const r=c.evaluate(input(0,{a:{gaze:S.lookAt(S.worldPoint([100,3,0]))}}));assert.equal(r.gaze.a.yaw,S.GAZE_LIMITS.yaw);assert.equal(r.faces.a.pupil[0],1);assert.ok(Math.abs(r.faces.a.pupil[1])<=1);}finally{e.dispose();}
});
test('nonsequential frames and fresh/reversed casts produce equal facial and complete snapshots',()=>{
 const run=reverse=>{const e=owner(),c=S.createCast(e,reverse?{z:{},a:{}}:{a:{},z:{}});try{return [0,80,20,80,0].map(frame=>c.evaluate(input(frame,{a:{expression:frame===80?'worried':'happy'},z:{expression:'explaining'}})));}finally{e.dispose();}};
 const a=run(false),b=run(true);assert.deepEqual(a,b);assert.deepEqual(a[0],a[4]);assert.deepEqual(a[1],a[3]);
});
test('disabled faces reject facial intentions; lifecycle remains idempotent across repeated owners',()=>{
 for(let i=0;i<10;i++){const e=owner(),c=S.createCast(e,{a:{face:false}});assert.equal(c.evaluate(input(0)).faces.a,null);assert.throws(()=>c.evaluate(input(0,{a:{expression:'happy'}})));c.dispose();c.dispose();e.dispose();e.dispose();assert.throws(()=>c.evaluate(input(0)));}
});
