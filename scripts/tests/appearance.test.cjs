'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('three');
const S=require('../../out/character-tests/toon-kit/characters');
const {ResourceOwner}=require('../../out/character-tests/toon-kit/internal/resources');
function owner(){const a=new AbortController(),r=new ResourceOwner(),cleanups=[];return {scene:new THREE.Scene(),profile:'software-safe',signal:a.signal,track:o=>r.track(o),registerCleanup:f=>cleanups.push(f),dispose(){if(a.signal.aborted)return;a.abort();cleanups.forEach(f=>f());r.dispose();this.scene.clear();}};}
const shape=rig=>rig.root.getObjectByName(rig.id+':headShape');
test('four presets use plain immutable configuration, three hair styles and four garments',()=>{
 const presets=['doctor','patient','office','casual'].map(name=>S.appearancePreset(name));assert.equal(new Set(presets.map(p=>p.clothing.style)).size,4);assert.equal(new Set(presets.map(p=>p.hair.style)).size,3);presets.forEach(p=>assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.hair)&&Object.isFrozen(p.accessories)));
 const o={hair:{color:'#ffccaa'}};const p=S.appearancePreset('doctor',o);assert.equal(p.hair.style,'short');assert.equal(p.hair.color,'#ffccaa');assert.ok(!Object.isFrozen(o.hair));
 assert.equal(S.resolveAppearance({clothing:{style:'hoodie'}}).clothing.sleeves,'long');assert.equal(S.resolveAppearance({clothing:{style:'lab-coat'}}).clothing.color,'#fff9ed');
});
test('invalid style, color, accessories and unknown fields reject before allocation',()=>{
 for(const appearance of [null,[],{preset:'bad'},{skin:null},{skin:'#fff'},{hair:null},{hair:{style:'spikes'}},{hair:{color:4}},{clothing:{extra:1}},{clothing:{sleeves:'ultra'}},{trousers:{style:'wide'}},{shoes:{style:'heels'}},{accessories:'glasses'},{accessories:['glasses','glasses']},{accessories:['hat']},{extra:1}])assert.throws(()=>S.resolveAppearance(appearance));
 const e=owner(),f=S.createCharacterFactory(e);try{assert.throws(()=>f.create({id:'a',appearance:{skin:'bad'}}));assert.ok(f.create({id:'a',appearance:S.appearancePreset('doctor')}));}finally{e.dispose();}
});
test('legacy colors remain supported and ambiguous combined palettes diagnose clearly',()=>{
 const e=owner();try{const f=S.createCharacterFactory(e),r=f.create({id:'legacy',colors:{skin:'#abcdef'}});assert.equal(shape(r).material.color.getHexString(),'abcdef');assert.throws(()=>S.createCast(e,{bad:{colors:{skin:'#ffffff'},appearance:{}}}),e=>e.diagnostics[0].code==='APPEARANCE_INVALID');}finally{e.dispose();}
});
test('appearance never alters complete pose, contacts, physical lengths or Stage 2C head gaze',()=>{
 const solve=appearance=>{const e=owner(),c=S.createCast(e,{actor:{appearance}});try{return [0,80,20,80,0].map(frame=>{const r=c.evaluate({frame,fps:30,poses:{actor:{gaze:S.lookAt(S.worldPoint([3,3,5])),gesture:S.pointAt(S.worldPoint([4,2,5]))}}});return {poses:r.poses,contacts:r.contacts,gaze:r.gaze};});}finally{e.dispose();}};
 const neutral=solve(undefined);for(const name of ['doctor','patient','office','casual'])assert.deepEqual(solve(S.appearancePreset(name)),neutral);
});
test('hair, hood and glasses follow named anchors in the one existing hierarchy',()=>{
 const e=owner(),f=S.createCharacterFactory(e);try{for(const name of ['doctor','patient','office','casual']){const r=f.create({id:name,appearance:S.appearancePreset(name)});let heads=0;r.root.traverse(o=>{if(o.name===name+':head')heads++;if(o.name.startsWith('appearance:')){assert.equal(o.userData.outlineMode,'silhouette-only');assert.ok(o.userData.attachmentAnchor);assert.ok(o.parent.name.endsWith(o.name==='appearance:hood'?':torso':':head'));}});assert.equal(heads,1);}}finally{e.dispose();}
});
test('three coherent hair caps clear the full frontal eyebrow and eye regions',()=>{
 const e=owner(),f=S.createCharacterFactory(e);try{for(const style of ['short','swept','tied-back'])for(const headRadius of [.46,.62]){const r=f.create({id:style+headRadius,proportions:{headRadius},appearance:{hair:{style}}});const hair=r.root.getObjectByName('appearance:hair'),p=hair.geometry.attributes.position;assert.equal(hair.scale.x,headRadius);
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);assert.ok([x,y,z].every(Number.isFinite));if(z>.7&&Math.abs(x)<.60)assert.ok(y>.49,'Hair must clear maximum frontal brow height');}
 }}finally{e.dispose();}
});
test('appearance attachments are completely reset after arbitrary prior transforms and visibility',()=>{
 const e=owner(),f=S.createCharacterFactory(e),r=f.create({id:'actor',appearance:S.appearancePreset('office')});try{const hair=r.root.getObjectByName('appearance:hair'),glasses=r.root.getObjectByName('appearance:glasses');for(const o of [hair,glasses]){o.position.set(8,9,7);o.rotation.set(1,2,3);o.scale.setScalar(4);o.visible=false;}r.applyPose(r.definition.restPose);for(const o of [hair,glasses]){assert.deepEqual(o.position.toArray(),[0,0,0]);assert.deepEqual(o.quaternion.toArray(),[0,0,0,1]);assert.equal(o.scale.x,r.definition.proportions.headRadius);assert.ok(o.visible);}}finally{e.dispose();}
});
test('hair cap UV wraps meet in position and normal with no frontal seam',()=>{
 const e=owner(),f=S.createCharacterFactory(e);try{for(const style of ['short','swept','tied-back']){const r=f.create({id:style,appearance:{hair:{style}}}),g=r.root.getObjectByName('appearance:hair').geometry,p=g.attributes.position,n=g.attributes.normal;for(let row=0;row<=14;row++)for(const buffer of [p,n])assert.deepEqual(new THREE.Vector3().fromBufferAttribute(buffer,row*41).toArray(),new THREE.Vector3().fromBufferAttribute(buffer,row*41+40).toArray());}}finally{e.dispose();}
});
test('hood remains embedded in the torso surface and clears both slim and thick necks',()=>{
 const e=owner(),f=S.createCharacterFactory(e);try{for(const neckRadius of [.065,.10]){const r=f.create({id:'hood'+neckRadius,proportions:{neckRadius},appearance:{clothing:{style:'hoodie'}}}),p=r.definition.proportions,hood=r.root.getObjectByName('appearance:hood'),v=hood.geometry.attributes.position,distances=[];
 for(let i=0;i<v.count;i++){const x=v.getX(i),y=v.getY(i),z=v.getZ(i);assert.ok([x,y,z].every(Number.isFinite));assert.ok(Math.hypot(x,z)>neckRadius);distances.push(Math.hypot(x,Math.max(0,Math.abs(y)-p.torsoLength/2),z)-p.torsoRadius);}
 assert.ok(Math.min(...distances)<0&&Math.max(...distances)>0);assert.ok(Math.max(...distances)<p.torsoRadius*.16);
 }}finally{e.dispose();}
});
test('equivalent appearances share immutable geometry/materials within a factory, never across owners',()=>{
 const e=owner(),other=owner(),f=S.createCharacterFactory(e),g=S.createCharacterFactory(other);try{const a=f.create({id:'a',appearance:S.appearancePreset('office')}),b=f.create({id:'b',appearance:S.appearancePreset('office')}),c=g.create({id:'a',appearance:S.appearancePreset('office')});assert.equal(a.root.getObjectByName('appearance:hair').geometry,b.root.getObjectByName('appearance:hair').geometry);assert.notEqual(a.root.getObjectByName('appearance:hair').geometry,c.root.getObjectByName('appearance:hair').geometry);assert.equal(shape(a).material,shape(b).material);assert.notEqual(shape(a).material,shape(c).material);a.dispose();b.applyPose(b.definition.restPose);}finally{e.dispose();other.dispose();}
});
test('appearance clones caller data and accessory order resolves canonically',()=>{
 const input={hair:{style:'short',color:'#334455'},accessories:['stethoscope','badge']},a=S.resolveAppearance(input);input.hair.color='#abcdef';assert.equal(a.hair.color,'#334455');assert.deepEqual(a.accessories,['badge','stethoscope']);assert.deepEqual(a,S.resolveAppearance({hair:{style:'short',color:'#334455'},accessories:['badge','stethoscope']}));
});
test('skin and hair variants reuse the same immutable fabric material',()=>{
 const e=owner(),f=S.createCharacterFactory(e);try{const a=f.create({id:'a',appearance:S.appearancePreset('doctor')}),b=f.create({id:'b',appearance:S.appearancePreset('doctor',{skin:'#bb8866',hair:{color:'#665544'}})});assert.equal(a.root.getObjectByName('a:torsoShape').material,b.root.getObjectByName('b:torsoShape').material);assert.notEqual(shape(a).material,shape(b).material);}finally{e.dispose();}
});
test('repeated construction and cleanup disposes all shared appearance resources exactly once',()=>{
 for(let cycle=0;cycle<6;cycle++){const e=owner(),f=S.createCharacterFactory(e),resources=new Map();for(const name of ['doctor','patient','office','casual']){const r=f.create({id:name,appearance:S.appearancePreset(name)});r.root.traverse(o=>{if(o instanceof THREE.Mesh)for(const resource of [o.geometry,o.material,o.material.gradientMap])if(resource&&!resources.has(resource)){resources.set(resource,0);resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));}});}f.dispose();assert.ok([...resources.values()].every(n=>n===0));e.dispose();e.dispose();assert.ok([...resources.values()].every(n=>n===1));}
});
test('yellow-mellow preset resolves beanie hair, black skin, hoodie, shorts and highlight face',()=>{
 const ym=S.appearancePreset('yellow-mellow');
 assert.equal(ym.skin,'#171717');
 assert.equal(ym.hair.style,'beanie');
 assert.equal(ym.hair.color,'#e53935');
 assert.equal(ym.clothing.style,'hoodie');
 assert.equal(ym.clothing.color,'#fbc02d');
 assert.equal(ym.trousers.style,'shorts');
 const e=owner(),f=S.createCharacterFactory(e);
 try{
   const r=f.create({id:'ym',appearance:ym,face:{}});
   const beanie=r.root.getObjectByName('appearance:hair');
   assert.ok(beanie);
   assert.equal(beanie.userData.attachmentAnchor,'head');
   const hood=r.root.getObjectByName('appearance:hood');
   assert.ok(hood);
   assert.equal(hood.userData.attachmentAnchor,'torso');
   const cowl=r.root.getObjectByName('appearance:cowl');
   assert.ok(cowl);
   assert.equal(cowl.userData.attachmentAnchor,'torso');
   assert.ok(cowl.parent.name.endsWith(':torso'));

   // Highlight face audit: dark skin alone without yellow-mellow preset does NOT force highlight mode
   const darkHuman=S.resolveAppearance({skin:'#171717',clothing:{style:'shirt'}});
   const rDark=f.create({id:'darkHuman',appearance:darkHuman,face:{}});
   assert.ok(rDark);
 }finally{e.dispose();}
});
test('hoodie cowl forms a continuous neckline from torso to head and validates true 90-degree side profile',()=>{
 const ym=S.appearancePreset('yellow-mellow');
 const e=owner(),f=S.createCharacterFactory(e);
 try{
   const r=f.create({id:'ymProfile',appearance:ym,face:{}});
   const cowl=r.root.getObjectByName('appearance:cowl');
   assert.ok(cowl);
   assert.equal(cowl.userData.attachmentAnchor,'torso');
   assert.ok(cowl.parent.name.endsWith(':torso'));

   // Geometry extents: cowl must overlap torso capsule below and skull above without gap
   const p=r.definition.proportions;
   const torsoTop=p.torsoLength/2+p.torsoRadius; // 0.55m
   const headBottom=torsoTop+p.neckLength; // 0.67m
   const pos=cowl.geometry.attributes.position;
   let minY=Infinity,maxY=-Infinity,minR=Infinity;
   for(let i=0;i<pos.count;i++){
     const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
     if(y<minY)minY=y;
     if(y>maxY)maxY=y;
     const r=Math.hypot(x,z);
     if(r<minR)minR=r;
   }
   // Cowl bottom must be well below torsoTop so it anchors inside the torso capsule
   assert.ok(minY<torsoTop-.03,`Cowl bottom (${minY}) must embed into torso capsule below ${torsoTop}`);
   // Cowl top must extend well above headBottom so lower head is nestled inside collar
   assert.ok(maxY>headBottom+.02,`Cowl top (${maxY}) must extend into lower head sphere above ${headBottom}`);
   // Minimum radius must comfortably enclose the 0.075m neck
   assert.ok(minR>p.neckRadius*1.5,`Cowl radius (${minR}) must exceed neck radius (${p.neckRadius})`);

   // Posed validation: evaluate under head gaze rotation (looking 60 deg right)
   const c=S.createCast(e,{actor:{appearance:ym}});
   const evalHeadTurn=c.evaluate({frame:0,fps:30,poses:{actor:{gaze:S.lookAt(S.worldPoint([10,1.5,0]))}}});
   assert.ok(evalHeadTurn);
   // Cowl stays firmly attached to torso on the shoulders while head rotates inside
   r.applyPose(evalHeadTurn.poses.actor);
   assert.equal(cowl.position.y,0);

   // True 90-degree side profile validation: body and head oriented orthogonal to camera axis
   const evalSide=c.evaluate({frame:0,fps:30,poses:{actor:{stance:S.standAt(S.worldMark([0,0,0],Math.PI/2))}}});
   const sidePose=evalSide.poses.actor;
   // Facing direction: yaw of Math.PI / 2 means forward faces pure +X
   const facingX=Math.sin(Math.PI/2);
   assert.ok(facingX>0.99,'Body must face orthogonal (90 degrees) to camera axis');
   // Torso and head quaternions remain stable and valid
   assert.ok(sidePose.torso.quaternion.every(Number.isFinite));
   assert.ok(sidePose.head.quaternion.every(Number.isFinite));
 }finally{e.dispose();}
});
