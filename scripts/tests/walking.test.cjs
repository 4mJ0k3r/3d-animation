'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three'),fs=require('node:fs');
const S=require('../../out/character-tests/toon-kit/characters');
const {ResourceOwner}=require('../../out/character-tests/toon-kit/internal/resources');
const {TALL,COMPACT}=require('../../out/character-tests/toon-kit-tests/character-fixture');
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const straight=()=>S.pathThrough([[0,0,0],[0,0,4]]),curved=()=>S.pathThrough([[0,0,0],[0,0,1.5],[1,0,3],[2.5,0,4]]);
function owner(){const a=new AbortController(),r=new ResourceOwner(),clean=[];return {scene:new THREE.Scene(),profile:'software-safe',signal:a.signal,track:o=>r.track(o),registerCleanup:f=>clean.push(f),dispose(){if(a.signal.aborted)return;a.abort();clean.forEach(f=>f());r.dispose();this.scene.clear();}};}
function world(d,pose,name,parent={position:[0,0,0],yaw:0,scale:1}){return new THREE.Vector3(...S.poseAnchorPosition(pose,d.anchors[name],'parent')).multiplyScalar(parent.scale).applyAxisAngle(new THREE.Vector3(0,1,0),parent.yaw).add(new THREE.Vector3(...parent.position)).toArray();}
function solve(d,w,frame,scale=1,parent){const plan=S.planWalk(d,w,frame,30,scale*(parent?.scale??1)),r=S.solveContactPose(d,{support:plan.support,scale,parent});assert.ok(r.ok,JSON.stringify({frame,plan:plan.state,diagnostics:r.diagnostics}));return {plan,r};}
test('static straight and smoothed waypoint paths have immutable arc-length sampling',()=>{
 const p=straight();near(p.length,4);for(let i=0;i<=100;i++)near(p.sample(i*.04).position[2],i*.04,1e-6);
 const c=curved(),steps=Array.from({length:101},(_,i)=>c.sample(c.length*i/100)),lengths=steps.slice(1).map((p,i)=>dist(p.position,steps[i].position));assert.ok(Math.max(...lengths)/Math.min(...lengths)<1.02);assert.ok(Object.isFrozen(c));assert.ok(c.length>5);assert.deepEqual(c.sample(0).position,[0,0,0]);assert.deepEqual(c.sample(c.length).position,[2.5,0,4]);
});
test('headings unwrap continuously across the -pi/pi boundary without orientation flips',()=>{
 const p=S.pathThrough([[0,0,0],[.3,0,-2],[-.3,0,-4],[-1,0,-6]]);let last=p.sample(0).yaw,max=0;
 for(let i=1;i<=1000;i++){const yaw=p.sample(p.length*i/1000).yaw;max=Math.max(max,Math.abs(yaw-last));last=yaw;}assert.ok(max<.02);assert.ok(last>Math.PI);
});
test('invalid, duplicate, non-level, reversing and missing named paths reject clearly',()=>{
 for(const points of [[],[[0,0,0]],[[0,0,0],[0,0,0]],[[0,0,0],[1,1,0]],[[0,0,0],[0,0,1],[0,0,0]],[[NaN,0,0],[1,0,0]]])assert.throws(()=>S.pathThrough(points),e=>e.diagnostics[0].code==='PATH_INVALID');
 assert.throws(()=>S.planWalk(S.createCharacterDefinition(),S.walkAlong(S.createPaths({}).path('missing')),0,30,1));
});
test('static scene mark bindings snapshot current transforms and reject live actor joints',()=>{
 const g=new THREE.Group(),a=new THREE.Object3D(),b=new THREE.Object3D();b.position.z=4;g.position.set(3,2,-1);g.rotation.y=.4;g.scale.setScalar(1.2);g.add(a,b);
 const p=S.pathFromMarks([a,b]),start=p.sample(0);g.position.x=8;assert.deepEqual(p.sample(0),start);near(p.floor,2);near(p.length,4.8);a.userData.outlineGroup='character:test';assert.throws(()=>S.pathFromMarks([a,b]));
});
test('walking support is solved by the existing analytic chains with fixed lengths',()=>{
 for(const proportions of [undefined,TALL,COMPACT,{upperLegLength:.42,lowerLegLength:.55}])for(const path of [straight(),curved()]){
 const d=S.createCharacterDefinition(proportions),w=S.walkAlong(path,{startFrame:30,endFrame:270});for(let frame=0;frame<=300;frame+=2){const {plan,r}=solve(d,w,frame);
 for(const side of ['left','right']){const hip=world(d,r.pose,side+'Hip'),knee=world(d,r.pose,side+'Knee'),ankle=world(d,r.pose,side+'Ankle');near(dist(hip,knee),d.proportions.upperLegLength);near(dist(knee,ankle),d.proportions.lowerLegLength);assert.ok(world(d,r.pose,side+'Sole')[1]>=-1e-8);assert.ok(dist(world(d,r.pose,side+'Sole'),plan.state.feet[side].position)<1e-8);}
 }}
});
test('planted soles and shoe headings stay fixed quantitatively on straight/curved paths and scaled parents',()=>{
 let maxSlip=0,maxTargetError=0,maxYawError=0,plants=0,samples=0,maxPenetration=0;
 for(const proportions of [undefined,TALL,COMPACT])for(const path of [straight(),curved()])for(const scale of [.65,1.4]){
 const e=owner(),parent=new THREE.Group();parent.position.set(2,1,-3);parent.rotation.y=.6;parent.scale.setScalar(1.3);e.scene.add(parent);
 const rig=S.createCharacterFactory(e).create({id:'test',proportions}),d=rig.definition;parent.add(rig.root);const pf={position:[2,1,-3],yaw:.6,scale:1.3},w=S.walkAlong(path,{startFrame:30,endFrame:270}),fixed=new Map();
 try{for(let frame=0;frame<=300;frame++){const {plan,r}=solve(d,w,frame,scale,pf);rig.applyPose(r.pose);
 for(const side of ['left','right']){const foot=plan.state.feet[side],actual=rig.getAnchor(side+'Sole','world').toArray(),shoe=rig.root.getObjectByName('test:'+side+'Shoe'),q=shoe.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(0,0,1).applyQuaternion(q);maxTargetError=Math.max(maxTargetError,dist(actual,foot.position));maxYawError=Math.max(maxYawError,Math.hypot(forward.x-Math.sin(foot.yaw),forward.y,forward.z-Math.cos(foot.yaw)));maxPenetration=Math.max(maxPenetration,-actual[1]);
 if(foot.state==='floor'){const key=side+'/'+foot.step,old=fixed.get(key);if(old)maxSlip=Math.max(maxSlip,dist(actual,old));else{fixed.set(key,actual);plants++;}samples++;}
 }} }finally{e.dispose();}
 }
 assert.ok(maxSlip<1e-8);assert.ok(maxTargetError<1e-8);assert.ok(maxYawError<1e-8);assert.ok(maxPenetration<1e-8);
 fs.mkdirSync('out/phase2ea',{recursive:true});fs.writeFileSync('out/phase2ea/foot-plant-math.json',JSON.stringify({maxSlip,maxTargetError,maxYawError,maxPenetration,plants,samples},null,2));
});
test('idle/start/stop endpoints are complete standing poses with no root or foot pops',()=>{
 const d=S.createCharacterDefinition(),p=straight(),w=S.walkAlong(p,{startFrame:30,endFrame:270});const a=solve(d,w,0),b=solve(d,w,30),z=solve(d,w,270),after=solve(d,w,300);
 assert.deepEqual(a.r.pose,b.r.pose);assert.deepEqual(z.r.pose,after.r.pose);assert.equal(a.plan.state.phase,'idle-before');assert.equal(after.plan.state.phase,'idle-after');near(z.plan.state.distance,p.length);
 assert.ok(solve(d,w,31).plan.state.distance<.001);assert.ok(p.length-solve(d,w,269).plan.state.distance<.001);
 for(const side of ['left','right']){assert.ok(dist(world(d,a.r.pose,side+'Sole'),world(d,solve(d,w,31).r.pose,side+'Sole'))<.002);assert.ok(dist(world(d,z.r.pose,side+'Sole'),world(d,solve(d,w,269).r.pose,side+'Sole'))<.002);}
});
test('speed, duration, small walks and invalid cadence have deterministic contracts',()=>{
 const d=S.createCharacterDefinition(),p=straight(),slow=S.planWalk(d,S.walkAlong(p,{speed:.4}),60,30,1),fast=S.planWalk(d,S.walkAlong(p,{speed:.8}),60,30,1);assert.ok(fast.state.distance>slow.state.distance);assert.ok(fast.state.endFrame<slow.state.endFrame);
 for(const options of [{speed:0},{startFrame:-1},{endFrame:0},{endFrame:2},{speed:.4,endFrame:200},{strideScale:0},{endFrame:NaN}])assert.throws(()=>S.planWalk(d,S.walkAlong(p,options),0,30,1));
 const tiny=S.pathThrough([[0,0,0],[0,0,.0001]]),w=S.walkAlong(tiny);for(const frame of [0,1,15,30,60])solve(d,w,frame);
});
test('impossible strides diagnose and never stretch, and malformed combined supports reject',()=>{
 const d=S.createCharacterDefinition(),w=S.walkAlong(S.pathThrough([[0,0,0],[0,0,8]]),{startFrame:0,endFrame:270,strideScale:4});let failures=0;
 for(let frame=0;frame<=270;frame++){const plan=S.planWalk(d,w,frame,30,1),r=S.solveContactPose(d,{support:plan.support});if(!r.ok){failures++;assert.ok(r.diagnostics.some(d=>['STANCE_UNREACHABLE','LIMB_CLEARANCE'].includes(d.code)));}}
 assert.ok(failures>0);assert.throws(()=>S.planWalk(d,{...w,seat:{}},0,30,1),e=>e.diagnostics[0].code==='WALK_INVALID');
});
test('support anchors of moving actors resolve in the same frame independent of declaration order',()=>{
 const run=reverse=>{const e=owner(),path=straight(),w=S.walkAlong(path,{endFrame:240}),defs={walker:{stance:w},watcher:{stance:S.standAt(S.worldMark([-2,0,1]))}},c=S.createCast(e,reverse?{watcher:defs.watcher,walker:defs.walker}:defs);try{return [0,80,20,80,0].map(frame=>{const r=c.evaluate({frame,fps:30,poses:{watcher:{gaze:S.lookAt(c.actors.walker.target('head'))}}});const target=world(c.actors.walker.definition,r.poses.walker,'head');assert.ok(dist(r.gaze.watcher.targetWorld,target)<1e-8);return r;});}finally{e.dispose();}};
 const a=run(false),b=run(true);assert.deepEqual(a,b);assert.deepEqual(a[0],a[4]);assert.deepEqual(a[1],a[3]);assert.notDeepEqual(a[0].poses.walker,a[1].poses.walker);
});
test('explicit reaches and pointing reserve arms before walking swing without changing foot contacts',()=>{
 const e=owner(),d=S.createCharacterDefinition(),w=S.walkAlong(straight(),{endFrame:240}),c=S.createCast(e,{a:{stance:w}});
 try{for(const frame of [20,50,80,120,180]){const bare=solve(d,w,frame),goal=world(d,bare.r.pose,'leftWrist');const r=c.evaluate({frame,fps:30,poses:{a:{reaches:[S.reachFor('left',S.worldPoint(goal))],gesture:S.pointAt(S.worldPoint([-6,2.3,5]),{hand:'right'})}}});assert.equal(r.locomotion.a.arms.left,'reach');assert.equal(r.locomotion.a.arms.right,'point');assert.ok(dist(world(d,r.poses.a,'leftWrist'),goal)<1e-8);for(const side of ['left','right'])assert.ok(dist(world(d,r.poses.a,side+'Sole'),bare.plan.state.feet[side].position)<1e-8);const point=r.pointing.a,elbow=world(d,r.poses.a,'rightElbow'),hand=world(d,r.poses.a,'rightWrist');assert.ok(dist(elbow,point.elbowWorld)<1e-8);assert.ok(dist(hand,point.handWorld)<1e-8);}
 }finally{e.dispose();}
});
test('walking arms counter-swing, remain attached and yield to valid higher-priority actions',()=>{
 const e=owner(),c=S.createCast(e,{a:{stance:S.walkAlong(straight(),{endFrame:280})}});try{const r=c.evaluate({frame:10,fps:30});assert.equal(r.locomotion.a.arms.left,'swing');assert.equal(r.locomotion.a.arms.right,'swing');const d=c.actors.a.definition;assert.ok(world(d,r.poses.a,'leftWrist')[2]<world(d,r.poses.a,'leftShoulder')[2]);assert.ok(world(d,r.poses.a,'rightWrist')[2]>world(d,r.poses.a,'rightShoulder')[2]);}finally{e.dispose();}
});
test('one reserved pointing arm keeps its solved elbow and hand while the other arm swings',()=>{
 const e=owner(),c=S.createCast(e,{a:{stance:S.walkAlong(straight(),{endFrame:240})}});try{for(const frame of [20,50,80,110]){const r=c.evaluate({frame,fps:30,poses:{a:{gesture:S.pointAt(S.worldPoint([-6,2.3,5]),{hand:'right'})}}}),d=c.actors.a.definition,p=r.pointing.a;assert.equal(r.locomotion.a.arms.right,'point');assert.ok(dist(world(d,r.poses.a,'rightElbow'),p.elbowWorld)<1e-8);assert.ok(dist(world(d,r.poses.a,'rightWrist'),p.handWorld)<1e-8);assert.ok(['swing','rest'].includes(r.locomotion.a.arms.left));}}finally{e.dispose();}
});
test('changing level parent translation/yaw does not move world-space planted contacts',()=>{
 const d=S.createCharacterDefinition(),w=S.walkAlong(curved(),{endFrame:270}),reference=solve(d,w,80,1),parent={position:[4,2,-5],yaw:1.1,scale:1},changed=solve(d,w,80,1,parent);for(const side of ['left','right'])assert.ok(dist(world(d,reference.r.pose,side+'Sole'),world(d,changed.r.pose,side+'Sole',parent))<1e-8);
});
test('moving actors track each other from current supports in reversed cast declarations',()=>{
 const run=reverse=>{const e=owner(),defs={a:{stance:S.walkAlong(straight(),{endFrame:240})},b:{stance:S.walkAlong(S.pathThrough([[-2,0,0],[-2,0,3]]),{endFrame:240})}},c=S.createCast(e,reverse?{b:defs.b,a:defs.a}:defs);try{return [0,80,20,80,0].map(frame=>c.evaluate({frame,fps:30,poses:{a:{gaze:S.lookAt(c.actors.b.target('head'))},b:{gaze:S.lookAt(c.actors.a.target('head'))}}}));}finally{e.dispose();}};assert.deepEqual(run(false),run(true));
});
test('all four appearances preserve walking poses and resource/character independence through resets',()=>{
 for(const preset of ['doctor','patient','office','casual']){const e=owner(),c=S.createCast(e,{a:{appearance:S.appearancePreset(preset)},b:{}}),w=S.walkAlong(straight(),{endFrame:240});try{const rest=c.evaluate({frame:0,fps:30}),a=c.evaluate({frame:80,fps:30,poses:{a:{stance:w,expression:'happy'}}});assert.equal(a.faces.a.expression,'happy');assert.deepEqual(a.poses.b,rest.poses.b);assert.deepEqual(c.evaluate({frame:0,fps:30}),rest);c.dispose();c.dispose();}finally{e.dispose();}}
});
test('invalid walking rejects the complete cast without changing any published transforms',()=>{
 const e=owner(),c=S.createCast(e,{a:{},z:{}}),snapshot=()=>JSON.stringify(Object.values(c.actors).map(a=>{const out=[];a.root.traverse(n=>out.push([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray()]));return out;}));try{c.evaluate({frame:0,fps:30});const before=snapshot();assert.throws(()=>c.evaluate({frame:80,fps:30,poses:{a:{stance:S.walkAlong(straight(),{endFrame:240})},z:{stance:S.walkAlong(straight(),{endFrame:1})}}}));assert.equal(snapshot(),before);}finally{e.dispose();}
});
