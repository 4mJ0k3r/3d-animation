'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three');
const S=require('../../out/character-tests/toon-kit/characters');
const {COMPACT,TALL}=require('../../out/character-tests/toon-kit-tests/character-fixture');
const {ResourceOwner}=require('../../out/character-tests/toon-kit/internal/resources');
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const vec=(a,b,e=1e-8)=>a.forEach((v,i)=>near(v,b[i],e));
const len=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const V=(v)=>new THREE.Vector3(...v);
const unitQ=(q)=>new THREE.Quaternion(...q);
const solved=(r)=>{assert.equal(r.ok,true,JSON.stringify(r.diagnostics));S.validateCompletePose(r.pose);return r;};
const rejected=(r,code)=>{assert.equal(r.ok,false);assert.equal(r.pose,null);if(code)assert.ok(r.diagnostics.some(d=>d.code===code),JSON.stringify(r.diagnostics));};
const defs=()=>[{},COMPACT,TALL].map(S.createCharacterDefinition);
const chair=(height=.45,yaw=0)=>S.seatTarget({center:[0,height,0],width:1,depth:.9,thickness:.1,yaw});
function actor(definition) {
  const resources=new ResourceOwner(),controller=new AbortController(),cleanups=[];
  const owner={profile:'software-safe',signal:controller.signal,track:(root)=>resources.track(root),registerCleanup:(fn)=>cleanups.push(fn)};
  const rig=S.createCharacterFactory(owner).create({id:'test',proportions:definition.proportions});
  return {rig,dispose(){if(controller.signal.aborted)return;controller.abort();cleanups.forEach(fn=>fn());resources.dispose();}};
}
const anchor=(d,pose,name)=>S.poseAnchorPosition(pose,d.anchors[name]);
const snapshot=(rig)=>{const out={};rig.root.traverse(n=>out[n.name]=[n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.visible]);return out;};
const baseIK={origin:[0,0,0],target:[0,-.6,0],upperLength:.36,lowerLength:.34,pole:[0,0,1]};
function checkIK(r,input) {
  assert.equal(r.ok,true);near(len(r.joint,input.origin),input.upperLength);near(len(r.end,r.joint),input.lowerLength);
  vec(V([0,-input.upperLength,0]).applyQuaternion(unitQ(r.upperOrientation)).add(V(input.origin)).toArray(),r.joint);
  vec(V([0,-input.lowerLength,0]).applyQuaternion(unitQ(r.lowerOrientation)).add(V(r.joint)).toArray(),r.end);
  for(const data of [r.joint,r.end,r.upperOrientation,r.lowerOrientation])assert.ok(data.every(Number.isFinite));
}

test('two-bone law of cosines preserves both lengths and orientations over a deterministic direction grid',()=>{
  for(let i=0;i<80;i++) {
    const az=i*.73,el=-1.4+(i%13)*.23,d=.021+(i%17)*.039;
    const input={...baseIK,origin:[1,-2,3],target:[1+Math.cos(az)*Math.cos(el)*d,-2+Math.sin(el)*d,3+Math.sin(az)*Math.cos(el)*d]};
    const result=S.solveTwoBoneIK(input);checkIK(result,input);assert.equal(result.reachable,true);vec(result.end,input.target);
  }
});
test('fully extended, folded, antiparallel and almost antiparallel IK stays finite and exact',()=>{
  for(const target of [[0,-.7,0],[0,.7,0],[1e-12,.7,0],[0,-.02,0],[0,0,0]]) {
    const input={...baseIK,target},r=S.solveTwoBoneIK(input);checkIK(r,input);
    if(target[0]===0&&Math.abs(target[1])===.7)assert.equal(r.singularity,'extended');
  }
});
test('unreachable IK reports near/far limits and never stretches segments',()=>{
  for(const [target,code] of [[[0,-5,0],'IK_TARGET_TOO_FAR'],[[0,0,0],'IK_TARGET_TOO_CLOSE']]) {
    const input={...baseIK,target},r=S.solveTwoBoneIK(input);checkIK(r,input);assert.equal(r.reachable,false);
    assert.ok(r.diagnostics.some(d=>d.code===code));
  }
});
test('equal-length zero targets and degenerate poles choose deterministic anatomical fallbacks',()=>{
  for(const pole of [[0,0,0],[0,-1,0],[0,0,1]]) {
    const input={...baseIK,target:[0,0,0],upperLength:.4,lowerLength:.4,pole,fallbackPole:[0,-1,0]};
    const result=S.solveTwoBoneIK(input);checkIK(result,input);assert.equal(result.reachable,true);vec(result.end,input.origin);
    assert.equal(result.singularity,'zero');assert.ok(result.diagnostics.some(d=>d.code==='IK_ZERO_DISTANCE'));
    assert.deepEqual(result,S.solveTwoBoneIK(input));
  }
  const r=S.solveTwoBoneIK({...baseIK,pole:[0,-1,0],fallbackPole:[0,-1,0]});
  assert.ok(r.diagnostics.some(d=>d.code==='IK_BEND_PLANE_FALLBACK'));checkIK(r,baseIK);
});
test('IK rejects invalid numeric domains and handles subnormal direction hints without NaN',()=>{
  for(const input of [null,{...baseIK,origin:[0,NaN,0]},{...baseIK,target:Array(3)},
    ...[0,-1,NaN,Infinity,1e-300].map(upperLength=>({...baseIK,upperLength}))]) {
    const r=S.solveTwoBoneIK(input);assert.equal(r.ok,false);assert.equal(r.diagnostics[0].code,'INVALID_IK_INPUT');
  }
  for(const target of [[5e-324,0,0],[0,0,0]]) {
    const input={...baseIK,upperLength:.4,lowerLength:.4,target,fallbackDirection:[5e-324,0,0]};checkIK(S.solveTwoBoneIK(input),input);
  }
  const unequal={...baseIK,target:[0,0,0],pole:[0,0,0],fallbackDirection:[5e-324,5e-324,0]};checkIK(S.solveTwoBoneIK(unequal),unequal);
});
test('pure functions do not mutate or freeze caller data, including unreachable diagnostics',()=>{
  const input=structuredClone({...baseIK,target:[0,-5,0]}),before=structuredClone(input);
  S.solveTwoBoneIK(input);assert.deepEqual(input,before);assert.equal(Object.isFrozen(input.target),false);
  const request=structuredClone({support:S.standOn(S.levelFloor())}),copy=structuredClone(request);
  solved(S.solveContactPose(defs()[0],request));assert.deepEqual(request,copy);assert.equal(Object.isFrozen(request.support.floor),false);
  const raw={kind:'floor',height:0};S.standOn(raw);assert.equal(Object.isFrozen(raw),false);
});
test('standing/crouching preserves lengths, grounded shoe geometry, symmetry and outward knee poles',()=>{
  for(const d of defs()) {
    const {rig,dispose}=actor(d),p=d.proportions;
    try {
      for(const crouch of [0,.25,.5,1])for(const scale of [.5,1,2])for(const yaw of [0,.7,Math.PI/2]) {
        const result=solved(S.solveContactPose(d,{support:S.standOn(S.levelFloor(.2),{at:[1,-2],crouch,yaw}),scale}));
        rig.applyPose(result.pose);
        for(const side of ['left','right']) {
          near(len(anchor(d,result.pose,side+'Hip'),anchor(d,result.pose,side+'Knee')),p.upperLegLength);
          near(len(anchor(d,result.pose,side+'Knee'),anchor(d,result.pose,side+'Ankle')),p.lowerLegLength);
          near(rig.getAnchor(side+'Sole','world').y,.2);
          near(new THREE.Box3().setFromObject(rig.root.getObjectByName('test:'+side+'Shoe')).min.y,.2);
          assert.ok(anchor(d,result.pose,side+'Knee')[2]>=-1e-8);
        }
        const a=anchor(d,result.pose,'leftKnee'),b=anchor(d,result.pose,'rightKnee');vec(a,[-b[0],b[1],b[2]]);
      }
    }finally{dispose();}
  }
});
test('level parents, root scale and world floor targets compose safely without local/world mixing',()=>{
  for(const d of defs()) {
    const {rig,dispose}=actor(d),parent=new THREE.Group();parent.add(rig.root);
    try {
      const frame=S.levelFrame({position:[2,1,-3],yaw:-.8,scale:1.5});
      parent.position.set(...frame.position);parent.rotation.y=frame.yaw;parent.scale.setScalar(frame.scale);
      const result=solved(S.solveContactPose(d,{support:S.standOn(S.levelFloor(.4),{at:[-1,3],yaw:.6,crouch:.5}),parent:frame,scale:.8}));
      rig.applyPose(result.pose);
      for(const side of ['left','right'])near(rig.getAnchor(side+'Sole','world').y,.4);
      const q=new THREE.Quaternion();rig.root.getWorldQuaternion(q);near(q.dot(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.6)),1);
    }finally{dispose();}
  }
});
test('shared seat automatically gives short legs dangling and tall legs floor contact',()=>{
  for(const [p,mode] of [[COMPACT,'dangling'],[TALL,'floor']]) {
    const d=S.createCharacterDefinition(p),r=solved(S.solveContactPose(d,{support:S.sitOn(chair(),{floor:S.levelFloor()})}));
    assert.equal(r.contacts.feet.left,mode);const torso=anchor(d,r.pose,'torso');near(torso[1]-p.torsoLength/2-p.torsoRadius,.45);
    for(const side of ['left','right']) {
      const h=anchor(d,r.pose,side+'Hip'),k=anchor(d,r.pose,side+'Knee'),a=anchor(d,r.pose,side+'Ankle'),sole=anchor(d,r.pose,side+'Sole');
      near(len(h,k),p.upperLegLength);near(len(k,a),p.lowerLegLength);near(h[1],k[1]);
      if(mode==='floor')near(sole[1],0);else assert.ok(sole[1]>.1);
    }
  }
});
test('rotated/scaled seats preserve body support, level shoes, slab clearance and floor contacts',()=>{
  for(const d of defs()) {
    const {rig,dispose}=actor(d),parent=new THREE.Group();parent.add(rig.root);
    try {
      const frame=S.levelFrame({position:[2,.4,-1],yaw:.7,scale:1.5});
      parent.position.set(...frame.position);parent.rotation.y=frame.yaw;parent.scale.setScalar(frame.scale);
      for(const scale of [.5,1,2])for(const yaw of [0,Math.PI/6,Math.PI/2,Math.PI,-Math.PI/2]) {
        const ws=scale*frame.scale,floor=.2,seat=S.seatTarget({center:[-1,floor+.45*ws,2],width:ws,depth:.9*ws,thickness:.1*ws,yaw});
        const r=solved(S.solveContactPose(d,{support:S.sitOn(seat,{floor:S.levelFloor(floor)}),scale,parent:frame}));rig.applyPose(r.pose);
        const center=rig.getAnchor('torso','world');near(center.y-(d.proportions.torsoLength/2+d.proportions.torsoRadius)*ws,seat.center[1]);
        for(const side of ['left','right']) {
          const knee=rig.getAnchor(side+'Knee','world').sub(V(seat.center)).applyAxisAngle(new THREE.Vector3(0,1,0),-yaw);
          assert.ok(knee.z>seat.depth/2);assert.ok(knee.y-d.proportions.legRadius*ws>=-1e-8);
          const sole=rig.getAnchor(side+'Sole','world');if(r.contacts.feet[side]==='floor')near(sole.y,floor);else assert.ok(sole.y>floor);
          const shoe=rig.root.getObjectByName('test:'+side+'Shoe'),q=shoe.getWorldQuaternion(new THREE.Quaternion());
          near(Math.abs(q.dot(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw))),1);
        }
      }
    }finally{dispose();}
  }
});
test('high-seat dangling never stretches; required floor and low-seat forced dangling reject',()=>{
  for(const d of defs()) {
    const r=solved(S.solveContactPose(d,{support:S.sitOn(chair(1.2),{floor:S.levelFloor()})}));assert.equal(r.contacts.feet.left,'dangling');
    assert.ok(r.diagnostics.some(d=>d.code==='FEET_DANGLING'));
    rejected(S.solveContactPose(d,{support:S.sitOn(chair(1.2),{floor:S.levelFloor(),feet:'floor'})}),'FLOOR_UNREACHABLE');
  }
  rejected(S.solveContactPose(S.createCharacterDefinition(TALL),{support:S.sitOn(chair(),{floor:S.levelFloor(),feet:'dangle'})}),'FLOOR_CLEARANCE');
});
test('too narrow/shallow/low/solid seats return diagnostics and no pose',()=>{
  const d=defs()[0],floor=S.levelFloor();
  rejected(S.solveContactPose(d,{support:S.sitOn({...chair(),width:.2},{floor})}),'SEAT_TOO_NARROW');
  rejected(S.solveContactPose(d,{support:S.sitOn({...chair(),depth:.2},{floor})}),'SEAT_TOO_SHALLOW');
  rejected(S.solveContactPose(d,{support:S.sitOn({...chair(),center:[0,.05,0]},{floor})}),'INVALID_TARGET');
  rejected(S.solveContactPose(S.createCharacterDefinition(COMPACT),{support:S.sitOn({...chair(.8),thickness:.4},{floor})}),'SEAT_CLEARANCE');
});
test('mirrored arm reaches hit targets exactly with stable outward elbows and fixed lengths',()=>{
  for(const d of defs()) {
    const reaches=['left','right'].map(side=>S.reachTo(side,S.worldPoint([side==='left'?.55:-.55,1.68,.3])));
    const request={support:S.standOn(S.levelFloor(),{crouch:.5}),reaches};
    const r=solved(S.solveContactPose(d,request));
    assert.deepEqual(r,S.solveContactPose(d,{...request,reaches:[...reaches].reverse()}));
    for(const side of ['left','right']) {
      const hand=anchor(d,r.pose,side+'Wrist'),elbow=anchor(d,r.pose,side+'Elbow'),shoulder=anchor(d,r.pose,side+'Shoulder');
      vec(hand,[side==='left'?.55:-.55,1.68,.3]);near(len(shoulder,elbow),d.proportions.upperArmLength);near(len(elbow,hand),d.proportions.lowerArmLength);
      assert.ok((elbow[0]-shoulder[0])*(side==='left'?1:-1)>0);
    }
  }
});
test('bent cylinder endpoints coincide with joints in rendered hierarchy after constraint application',()=>{
  for(const d of defs()) {
    const {rig,dispose}=actor(d);
    try {
      for(const request of [{support:S.standOn(S.levelFloor(),{crouch:.7})},
        {support:S.sitOn(chair(.45,.4),{floor:S.levelFloor()})},
        {support:S.standOn(S.levelFloor(),{crouch:.5}),reaches:[S.reachTo('left',S.worldPoint([.55,1.68,.3]))]}]) {
        rig.applyPose(solved(S.solveContactPose(d,request)).pose);
        for(const side of ['left','right'])for(const [part,start,end] of [['UpperArm','Shoulder','Elbow'],['Forearm','Elbow','Wrist'],['Thigh','Hip','Knee'],['Shin','Knee','Ankle']]) {
          const mesh=rig.root.getObjectByName('test:'+side+part);
          vec(mesh.localToWorld(new THREE.Vector3(0,.5,0)).toArray(),rig.getAnchor(side+start,'world').toArray());
          vec(mesh.localToWorld(new THREE.Vector3(0,-.5,0)).toArray(),rig.getAnchor(side+end,'world').toArray());
        }
      }
    }finally{dispose();}
  }
});
test('reach targets in world space respect translated rotated scaled parents',()=>{
  const d=defs()[0],parent=S.levelFrame({position:[1,.3,-2],yaw:.6,scale:1.3}),scale=.8;
  const support=S.standOn(S.levelFloor(.2),{at:[2,-1],yaw:-.4,crouch:.5});
  const world=V([.55,1.68,.3]).multiplyScalar(parent.scale*scale).applyAxisAngle(new THREE.Vector3(0,1,0),-.4).add(new THREE.Vector3(2,.2,-1)).toArray();
  const r=solved(S.solveContactPose(d,{support,parent,scale,reaches:[S.reachTo('left',S.worldPoint(world))]}));
  const {rig,dispose}=actor(d),group=new THREE.Group();group.position.set(...parent.position);group.rotation.y=parent.yaw;group.scale.setScalar(parent.scale);group.add(rig.root);
  try{rig.applyPose(r.pose);vec(rig.getAnchor('leftWrist','world').toArray(),world);}finally{dispose();}
});
test('unreachable and singular semantic reaches are rejected, never silently limited',()=>{
  const d=defs()[0],support=S.standOn(S.levelFloor());
  for(const point of [[5,5,5],anchor(d,d.restPose,'leftShoulder')])
    rejected(S.solveContactPose(d,{support,reaches:[S.reachTo('left',S.worldPoint(point))]}),'REACH_UNREACHABLE');
  rejected(S.solveContactPose(d,{support,reaches:[S.reachTo('left',S.worldPoint([0,2.4,0]))]}));
});
test('unsupported frames, invalid targets, duplicate reaches and malformed descriptors fail explicitly',()=>{
  const d=defs()[0],base={support:S.standOn(S.levelFloor())};
  const requests=[null,{}, {...base,extra:1},{...base,scale:0},{...base,parent:{...S.levelFrame(),scale:NaN}},
    {...base,parent:{...S.levelFrame(),pitch:.2}},{...base,parent:S.levelFrame({pitch:.2})},{support:{...base.support,floor:{kind:'floor',height:NaN}}},
    {support:{...base.support,floor:{kind:'floor',height:0,normal:[0,.7,.7]}}},
    {support:{...base.support,crouch:2}},{support:{...base.support,at:Array(2)}},{support:S.sitOn({...chair(),pitch:.1},{floor:S.levelFloor()})},
    {...base,reaches:[{hand:'left',target:{space:'root',position:[1,1,1]}}]},
    {...base,reaches:[S.reachTo('left',S.worldPoint([NaN,0,0]))]},
    {...base,reaches:[{hand:'left',target:{space:'world',position:Array(3)}}]}];
  for(const request of requests)rejected(S.solveContactPose(d,request));
  const reach=S.reachTo('left',S.worldPoint([.55,1.68,.3]));
  rejected(S.solveContactPose(d,{...base,reaches:[reach,reach]}),'DUPLICATE_REACH');
});
test('nonsequential contact snapshots match across fresh owners and complete rest application resets all transforms',()=>{
  const captured=[];
  for(let instance=0;instance<2;instance++) {
    const d=defs()[0],{rig,dispose}=actor(d),rest=snapshot(rig);
    try {
      for(const frame of [0,80,20,80,0]) {
        const request=frame===0?{support:S.standOn(S.levelFloor())}:frame===20?
          {support:S.sitOn(chair(),{floor:S.levelFloor()})}:
          {support:S.standOn(S.levelFloor(),{crouch:.5}),reaches:[S.reachTo('left',S.worldPoint([.55,1.68,.3]))]};
        const r=solved(S.solveContactPose(d,request));rig.applyPose(r.pose);captured.push({frame,pose:r.pose,actual:snapshot(rig)});
      }
      rig.applyPose(d.restPose);assert.deepEqual(snapshot(rig),rest);
    }finally{dispose();}
  }
  for(const frame of [0,20,80]){const values=captured.filter(v=>v.frame===frame);for(const v of values)assert.deepEqual(v,values[0]);}
});
test('multiple independent characters preserve geometry ownership through repeated constraint changes',()=>{
  const a=actor(defs()[1]),b=actor(defs()[2]),before=snapshot(b.rig);
  try {
    const geometry=a.rig.root.getObjectByName('test:headShape').geometry;
    const vertices=geometry.attributes.position.array.slice();
    for(let i=0;i<100;i++)a.rig.applyPose(solved(S.solveContactPose(a.rig.definition,{support:S.standOn(S.levelFloor(),{crouch:(i%10)/10})})).pose);
    assert.deepEqual(snapshot(b.rig),before);assert.deepEqual(geometry.attributes.position.array,vertices);
    a.dispose();b.rig.applyPose(solved(S.solveContactPose(b.rig.definition,{support:S.sitOn(chair(),{floor:S.levelFloor()})})).pose);
  }finally{a.dispose();b.dispose();}
});
