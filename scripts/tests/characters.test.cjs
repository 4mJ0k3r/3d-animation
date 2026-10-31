'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const SDK = require('../../out/character-tests/toon-kit/characters/index.js');
const {NODE_NAMES, JOINT_NAMES, PART_NAMES} = require('../../out/character-tests/toon-kit/characters/types.js');
const {torsoDistance} = require('../../out/character-tests/toon-kit/characters/proportions.js');
const {ResourceOwner} = require('../../out/character-tests/toon-kit/internal/resources.js');
const {getOutlineMode, getOutlineGroup} = require('../../out/character-tests/toon-kit/internal/policy.js');

const {COMPACT:compact,TALL:tall} = require('../../out/character-tests/toon-kit-tests/character-fixture.js');
const near = (a,b,e=1e-9) => assert.ok(Math.abs(a-b)<e, `${a} != ${b}`);
const vectorNear = (a,b) => a.forEach((v,i)=>near(v,b[i]));
function owner() {
  const controller = new AbortController(), resources = new ResourceOwner(), cleanups = [], tracked = new Set(), events = new Map();
  let dead = false;
  const watch = (resource) => {
    if(!resource || tracked.has(resource))return;
    tracked.add(resource); events.set(resource,0);
    resource.addEventListener('dispose',()=>events.set(resource,events.get(resource)+1));
  };
  return {profile:'software-safe', signal:controller.signal, events,
    track(root) {
      root.traverse((mesh)=>{if(!(mesh instanceof THREE.Mesh))return;
        watch(mesh.geometry); for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {watch(mat);watch(mat.gradientMap);}});
      resources.track(root);
    },
    registerCleanup(fn) {if(dead)fn();else cleanups.push(fn);},
    dispose() {if(dead)return;dead=true;controller.abort();cleanups.forEach((fn)=>fn());resources.dispose();},
  };
}
function fixture(proportions) {
  const engine=owner(), factory=SDK.createCharacterFactory(engine), rig=factory.create({id:'subject',proportions});
  return {engine,factory,rig};
}
const snapshot = (rig) => {
  const result={}; rig.root.traverse((node)=>result[node.name]={p:node.position.toArray(),q:node.quaternion.toArray(),s:node.scale.toArray(),v:node.visible,m:node.matrix.toArray(),mw:node.matrixWorld.toArray()});return result;
};
const part=(rig,name)=>rig.root.getObjectByName(`${rig.id}:${name}`);

test('valid default, compact and tall proportions; finite immutable definitions',()=>{
  for(const input of [{},compact,tall]) {
    const d=SDK.createCharacterDefinition(input);
    assert.ok(d.height>0); assert.ok(Object.isFrozen(d)); assert.ok(Object.isFrozen(d.proportions));
    assert.ok(Object.isFrozen(d.restPose.leftShoulder.position));assert.ok(Object.isFrozen(d.anchors.leftHipSurface.offset));
    SDK.validateCompletePose(d.restPose);
    assert.equal(Object.keys(d.restPose).length,JOINT_NAMES.length+PART_NAMES.length);
    for(const node of Object.values(d.restPose))assert.ok([...node.position,...node.scale,...node.quaternion].every(Number.isFinite));
  }
});
test('reject nonpositive, nonfinite, unknown and geometrically incompatible proportions',()=>{
  for(const key of Object.keys(SDK.DEFAULT_PROPORTIONS))for(const bad of [0,-1,NaN,Infinity,undefined,'1'])
    assert.throws(()=>SDK.createCharacterDefinition({[key]:bad}));
  for(const input of [{unknown:1},{toString:1},{hipSpread:1},{headRadius:.1},{armRadius:.2},
    {neckRadius:.4},{shoeWidth:.01},{shoeWidth:1},{shoeHeight:5},{upperArmLength:.15},{lowerArmLength:5},
    {upperArmLength:.238,lowerArmLength:.14,handRadius:.0875}])assert.throws(()=>SDK.createCharacterDefinition(input));
});
test('shoulder and hip surface anchors exactly match capsule; joints embed by limb radius',()=>{
  for(const input of [{},compact,tall]) {
    const {engine,rig}=fixture(input),p=rig.definition.proportions;
    try {
      for(const side of ['left','right']) {
        for(const kind of ['Shoulder','Hip']) {
          near(torsoDistance(rig.definition.anchors[side+kind+'Surface'].offset,p),0);
          const joint=rig.getAnchor(side+kind).sub(rig.getAnchor('torso'));
          near(torsoDistance(joint.toArray(),p),-1.05*(kind==='Shoulder'?p.armRadius:p.legRadius));
        }
      }
    }finally{engine.dispose();}
  }
});
test('left/right anchors and geometry are mirror-symmetric for every proportion set',()=>{
  for(const input of [{},compact,tall]) {
    const {engine,rig}=fixture(input);
    try {
      for(const suffix of ['Shoulder','Elbow','Wrist','Hip','Knee','Ankle','Sole','ShoulderSurface','HipSurface']) {
        const left=rig.getAnchor('left'+suffix),right=rig.getAnchor('right'+suffix);
        near(left.x,-right.x);near(left.y,right.y);near(left.z,right.z);
      }
    }finally{engine.dispose();}
  }
});
test('rod endpoints, elbow/knee rounds and hands are exactly attached',()=>{
  for(const input of [{},compact,tall]) {
    const {engine,rig}=fixture(input),p=rig.definition.proportions;
    try {
      for(const side of ['left','right']) {
        for(const [shape,a,b,length] of [['UpperArm','Shoulder','Elbow',p.upperArmLength],['Forearm','Elbow','Wrist',p.lowerArmLength],
          ['Thigh','Hip','Knee',p.upperLegLength],['Shin','Knee','Ankle',p.lowerLegLength]]) {
          const mesh=part(rig,side+shape);
          vectorNear(mesh.localToWorld(new THREE.Vector3(0,.5,0)).toArray(),rig.getAnchor(side+a,'world').toArray());
          vectorNear(mesh.localToWorld(new THREE.Vector3(0,-.5,0)).toArray(),rig.getAnchor(side+b,'world').toArray());
          near(rig.getAnchor(side+a).distanceTo(rig.getAnchor(side+b)),length);
        }
        for(const [shape,joint] of [['ElbowShape','Elbow'],['KneeShape','Knee'],['Hand','Wrist']])
          vectorNear(part(rig,side+shape).getWorldPosition(new THREE.Vector3()).toArray(),rig.getAnchor(side+joint,'world').toArray());
      }
    }finally{engine.dispose();}
  }
});
test('neck end caps embed inside torso/head; ankle end caps embed inside shoes',()=>{
  for(const input of [{},compact,tall]) {
    const {engine,rig}=fixture(input),p=rig.definition.proportions;
    try {
      const neck=part(rig,'neckShape'),torso=rig.getAnchor('torso'),head=rig.getAnchor('head');
      for(let i=0;i<64;i++) {
        const a=i*Math.PI*2/64;
        assert.ok(torsoDistance(neck.localToWorld(new THREE.Vector3(Math.cos(a),-.5,Math.sin(a))).sub(torso).toArray(),p)<0);
        assert.ok(neck.localToWorld(new THREE.Vector3(Math.cos(a),.5,Math.sin(a))).distanceTo(head)<p.headRadius);
        for(const side of ['left','right']) {
          const shin=part(rig,side+'Shin'),shoe=part(rig,side+'Shoe');
          const end=shin.localToWorld(new THREE.Vector3(Math.cos(a),-.5,Math.sin(a)));
          assert.ok(shoe.worldToLocal(end).length()<1);
        }
      }
    }finally{engine.dispose();}
  }
});
test('shoe soles and actual geometry bounds meet the ground, including uniform scaling',()=>{
  for(const input of [{},compact,tall])for(const scale of [.05,1,2.5,20]) {
    const {engine,rig}=fixture(input);
    try {
      rig.applyPose(SDK.createRestPose(rig.definition,{position:[2,0,-3],yaw:.43,scale}));
      for(const side of ['left','right']) {
        near(rig.getAnchor(side+'Sole','world').y,0);
        near(new THREE.Box3().setFromObject(part(rig,side+'Shoe')).min.y,0);
      }
      near(new THREE.Box3().setFromObject(rig.root).min.y,0);
      near(rig.getAnchor('headTop').y,rig.definition.height);
    }finally{engine.dispose();}
  }
});
test('complete rest application overwrites arbitrary transforms, visibility and manual matrices',()=>{
  const {engine,rig}=fixture(compact),expected=snapshot(rig);
  try {
    let i=0;
    rig.root.traverse((node)=>{
      i++; node.position.set(i*.17,-i*.31,i*.05);node.rotation.set(.7,-.9,1.1,'ZYX');
      node.scale.set(2,3,4);node.visible=false;node.matrixAutoUpdate=false;node.matrixWorldAutoUpdate=false;
      node.matrix.makeScale(6,7,8);node.matrixWorld.makeTranslation(100,200,300);
    });
    rig.applyPose(rig.definition.restPose);
    assert.deepEqual(snapshot(rig),expected);
    rig.root.traverse((node)=>{assert.equal(node.matrixAutoUpdate,true);assert.equal(node.matrixWorldAutoUpdate,true);assert.equal(node.rotation.order,'XYZ');});
  }finally{engine.dispose();}
});
test('full non-rest pose is applied; subsequent rest resets every channel',()=>{
  const {engine,rig}=fixture(),rest=snapshot(rig);
  try {
    const pose=structuredClone(rig.definition.restPose);
    for(const name of NODE_NAMES)pose[name].visible=false;
    pose.leftElbow.quaternion=[0,0,Math.sin(.25),Math.cos(.25)];
    pose.pelvis.position[2]=.2;
    rig.applyPose(pose);
    assert.equal(part(rig,'leftHand').visible,false);near(part(rig,'leftElbow').quaternion.z,Math.sin(.25));
    rig.applyPose(rig.definition.restPose);assert.deepEqual(snapshot(rig),rest);
  }finally{engine.dispose();}
});
test('invalid/incomplete poses fail transactionally before any mutation',()=>{
  const {engine,rig}=fixture(),before=snapshot(rig);
  try {
    const cases=[];
    const partial=structuredClone(rig.definition.restPose);delete partial.rightShoe;cases.push(partial);
    for(const [name,field,value] of [['rightShoe','position',[0,NaN,0]],['head','quaternion',[0,0,0,0]],
      ['root','scale',[1,2,1]],['root','scale',[0,0,0]],['root','scale',[21,21,21]],['neck','scale',[2,2,2]],['head','visible',0]]) {
      const p=structuredClone(rig.definition.restPose);p[name][field]=value;cases.push(p);
    }
    for(const pose of cases){assert.throws(()=>rig.applyPose(pose));assert.deepEqual(snapshot(rig),before);}
  }finally{engine.dispose();}
});
test('root/world anchors respect transformed uniform parents; reject nonuniform parents',()=>{
  const {engine,rig}=fixture(),parent=new THREE.Group(),local=rig.getAnchor('leftSole');
  try {
    parent.position.set(3,2,1);parent.rotation.y=.8;parent.scale.setScalar(2);parent.add(rig.root);
    rig.applyPose(SDK.createRestPose(rig.definition,{position:[.2,0,.3],yaw:.2,scale:1.4}));
    vectorNear(rig.getAnchor('leftSole').toArray(),local.toArray());
    const expected=rig.root.localToWorld(local.clone());vectorNear(rig.getAnchor('leftSole','world').toArray(),expected.toArray());
    const target=new THREE.Vector3();assert.equal(rig.getAnchor('head','world',target),target);
    target.set(999,999,999);assert.notEqual(rig.getAnchor('head','world').x,999);
    parent.scale.y=3;assert.throws(()=>rig.applyPose(rig.definition.restPose),/uniform/);assert.throws(()=>rig.getAnchor('head'),/uniform/);
  }finally{engine.dispose();}
});
test('pure pose-space anchor math matches independent Three.js hierarchy transforms',()=>{
  for(const input of [{},compact,tall]) {
    const {engine,rig}=fixture(input);
    try {
      const pose=structuredClone(SDK.createRestPose(rig.definition,{position:[2,1,-3],yaw:.7,scale:1.4}));
      pose.head.quaternion=[Math.sin(.2),0,0,Math.cos(.2)];
      pose.leftElbow.quaternion=[0,0,Math.sin(.1),Math.cos(.1)];
      rig.applyPose(pose);
      for(const [name,anchor] of Object.entries(rig.definition.anchors)) {
        vectorNear(SDK.poseAnchorPosition(pose,anchor),rig.getAnchor(name,'root').toArray());
        vectorNear(SDK.poseAnchorPosition(pose,anchor,'parent'),rig.getAnchor(name,'world').toArray());
      }
    }finally{engine.dispose();}
  }
});
test('characters have independent transforms/definitions, safely shared immutable resources and actor groups',()=>{
  const engine=owner(),factory=SDK.createCharacterFactory(engine);
  try {
    const a=factory.create({id:'a',proportions:compact}),b=factory.create({id:'b',proportions:tall}),before=snapshot(b);
    assert.notEqual(a.definition.height,b.definition.height);
    assert.equal(part(a,'headShape').geometry,part(b,'headShape').geometry);
    assert.equal(part(a,'leftShoe').geometry,part(b,'leftHand').geometry);
    assert.equal(part(a,'leftForearm').material,part(b,'leftShin').material);
    const positions=part(a,'headShape').geometry.attributes.position.array.slice();
    a.applyPose(SDK.createRestPose(a.definition,{position:[1,2,3],scale:2,yaw:1}));
    assert.deepEqual(snapshot(b),before);assert.deepEqual(part(a,'headShape').geometry.attributes.position.array,positions);
    assert.notEqual(getOutlineGroup(part(a,'headShape')),getOutlineGroup(part(b,'headShape')));
    assert.equal(getOutlineMode(part(a,'leftElbowShape')),'silhouette-only');assert.equal(getOutlineMode(part(a,'headShape')),'full');
    a.dispose();assert.equal(b.disposed,false);b.applyPose(b.definition.restPose);
    for(const count of engine.events.values())assert.equal(count,0);
    assert.throws(()=>a.applyPose(a.definition.restPose));assert.throws(()=>a.getAnchor('head'));
    assert.throws(()=>factory.create({id:'a'}));
  }finally{engine.dispose();}
  for(const count of engine.events.values())assert.equal(count,1);
});
test('factory and engine disposal are idempotent; every pooled resource disposed exactly once',()=>{
  for(let cycle=0;cycle<12;cycle++) {
    const engine=owner(),factory=SDK.createCharacterFactory(engine),a=factory.create({id:'a'}),b=factory.create({id:'b',proportions:compact});
    a.dispose();a.dispose();factory.dispose();factory.dispose();assert.equal(b.disposed,true);
    for(const count of engine.events.values())assert.equal(count,0);
    engine.dispose();engine.dispose();for(const count of engine.events.values())assert.equal(count,1);
    assert.throws(()=>factory.create({id:'c'}));assert.throws(()=>SDK.createCharacterFactory(engine));
  }
});
test('separate live owners never share GPU resources; owner disposal invalidates all handles',()=>{
  const a=fixture(),b=fixture();
  assert.notEqual(part(a.rig,'headShape').geometry,part(b.rig,'headShape').geometry);
  a.engine.dispose();assert.equal(a.rig.disposed,true);assert.equal(b.rig.disposed,false);
  b.rig.applyPose(b.rig.definition.restPose);b.engine.dispose();
});
test('IDs are owner-scoped across factories, survive factory disposal and remain independent across engines',()=>{
  const engine=owner(),other=owner(),a=SDK.createCharacterFactory(engine),b=SDK.createCharacterFactory(engine),c=SDK.createCharacterFactory(other);
  try {
    const first=a.create({id:'shared'});assert.throws(()=>b.create({id:'shared'}),/owner/);
    const independent=c.create({id:'shared'});assert.notEqual(first.root,independent.root);
    first.dispose();a.dispose();assert.throws(()=>b.create({id:'shared'}),/owner/);
    b.create({id:'distinct'});engine.dispose();assert.equal(independent.disposed,false);
    independent.applyPose(independent.definition.restPose);
  }finally{engine.dispose();other.dispose();}
  for(const count of engine.events.values())assert.equal(count,1);
  for(const count of other.events.values())assert.equal(count,1);
});
test('mesh/triangle budgets, duplicate ids and construction input validation',()=>{
  const {engine,factory,rig}=fixture();
  try {
    const counts=SDK.measureCharacter(rig);
    assert.equal(counts.meshes,19);assert.equal(counts.triangles,2784);assert.equal(counts.geometries,5);assert.equal(counts.materials,3);
    console.log('CHARACTER_MEASUREMENTS '+JSON.stringify(counts));
    for(const options of [{id:''},{id:'subject'},{id:'x',colors:{skin:'red'}},{id:'x',placement:{scale:-1}},
      {id:'x',placement:{yaw:Infinity}},{id:'x',placement:{position:[NaN,0,0]}}])assert.throws(()=>factory.create(options));
    assert.throws(()=>rig.getAnchor('missing'));assert.throws(()=>rig.getAnchor('head','invalid'));
  }finally{engine.dispose();}
});
test('nonsequential complete snapshots and fresh constructions are identical',()=>{
  const captures=[];
  for(let instance=0;instance<2;instance++) {
    const {engine,rig}=fixture(tall);
    try {
      for(const frame of [0,80,20,80,0]) {
        rig.applyPose(SDK.createRestPose(rig.definition,{position:[Math.sin(frame*.03),0,0],yaw:frame*.006}));
        captures.push({frame,data:snapshot(rig)});
      }
    }finally{engine.dispose();}
  }
  for(const frame of [0,20,80]) {
    const values=captures.filter((v)=>v.frame===frame);for(const value of values)assert.deepEqual(value.data,values[0].data);
  }
  assert.notDeepEqual(captures[0].data,captures[1].data);
});
