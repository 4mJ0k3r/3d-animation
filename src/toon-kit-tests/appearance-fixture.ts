import * as THREE from 'three';
import type {CartoonEngine} from '../toon-kit/engine';
import {setupCartoonLighting,createPrimitiveFactory} from '../toon-kit/lib';
import type {BoxOptions,PlaneOptions} from '../toon-kit/lib';
import {createCast,appearancePreset,standAt,worldMark,sceneSeat,sitAt,lookAt,pointAt,worldPoint,measureCharacter} from '../toon-kit/characters';
import type {ActorIntent,CastSnapshot} from '../toon-kit/characters';
import {COMPACT,TALL} from './character-fixture';
export const APPEARANCE_IDS=['doctor','patient','office','casual'] as const;
export function createAppearanceFixture(engine:CartoonEngine,reverse=false,high=false){
  setupCartoonLighting(engine.scene);engine.scene.background=new THREE.Color('#e8dfd1');
  const p:{box:(o:BoxOptions)=>THREE.Mesh;plane:(o:PlaneOptions)=>THREE.Mesh}=createPrimitiveFactory(engine);
  engine.scene.add(p.plane({width:25,height:25,rotation:[-Math.PI/2,0,0],color:'#ddc6a7',outlineMode:'none'}));
  const bench=new THREE.Group(),board=p.box({width:1.12,height:.1,depth:1.05,color:'#b78055',position:[-1,.45,0]});bench.add(board);
  for(const x of [-1.46,-.54])for(const z of [-.42,.42])bench.add(p.box({width:.065,height:.40,depth:.065,color:'#725039',position:[x,.2,z]}));engine.scene.add(bench);
  const definitions={doctor:{proportions:TALL,appearance:appearancePreset('doctor'),stance:standAt(worldMark([-3,0,0])),face:{textureSize:high?512 as const:256 as const}},
    patient:{proportions:COMPACT,appearance:appearancePreset('patient'),stance:standAt(worldMark([-1,0,0])),face:{textureSize:high?512 as const:256 as const}},
    office:{appearance:appearancePreset('office'),stance:standAt(worldMark([1,0,0])),face:{textureSize:high?512 as const:256 as const}},
    casual:{appearance:appearancePreset('casual'),stance:standAt(worldMark([3,0,0])),face:{textureSize:high?512 as const:256 as const}}};
  const cast=createCast(engine,reverse?{casual:definitions.casual,office:definitions.office,patient:definitions.patient,doctor:definitions.doctor}:definitions),seat=sceneSeat(board);
  const counts=APPEARANCE_IDS.map(id=>({id,...measureCharacter(cast.actors[id])}));
  function evaluate(state:number,frame=state,mode='demo',index=0):CastSnapshot {
    const poses:Record<string,{-readonly [K in keyof ActorIntent]:ActorIntent[K]}>={doctor:{expression:'explaining'},patient:{expression:'worried'},office:{expression:'neutral'},casual:{expression:{name:'happy',blush:.25}}};
    if(mode==='demo'||mode==='audit'){
      if(state!==0){poses.patient.stance=sitAt(seat);poses.doctor.gesture=pointAt(worldPoint([1,2.3,4]));poses.doctor.gaze=lookAt(worldPoint([1,2.3,4]));poses.patient.gaze=lookAt(cast.actors.doctor.target('head'));}
      poses.office.gaze=lookAt(worldPoint([state===80?-2:2,3,5]));poses.casual.gaze=lookAt(worldPoint([state===20?4:1,2.5,5]));
    }
    if(mode==='sheet'||mode==='head'||mode==='portrait')for(const id of APPEARANCE_IDS){poses[id].visible=id===APPEARANCE_IDS[index];poses[id].blink=0;}
    const snapshot=cast.evaluate({frame,fps:30,poses});bench.visible=(mode==='demo'||mode==='audit')&&state!==0;return snapshot;
  }
  function camera(mode='demo',index=0,view=0){
    if(mode==='head'||mode==='portrait'){
      const actor=cast.actors[APPEARANCE_IDS[index]],head=actor.root.getObjectByName(`${APPEARANCE_IDS[index]}:head`)!;
      const center=head.getWorldPosition(new THREE.Vector3()),radius=actor.definition.proportions.headRadius;
      const bounds=new THREE.Box3().setFromObject(head);bounds.expandByPoint(center.clone().add(new THREE.Vector3(0,-radius*1.7,0)));
      engine.frameSubjects(bounds,{padding:1.12,direction:[.12,0,1]});
    }else{
      const angle=[0,Math.PI/4,Math.PI/2][view],x=mode==='sheet'?[-3,-1,1,3][index]:0;
      engine.camera.position.set(x+Math.sin(angle)*8,3.0,Math.cos(angle)*8);engine.camera.lookAt(x,1.5,0);
      engine.frameSubjects(mode==='sheet'?cast.actors[APPEARANCE_IDS[index]].root:Object.values(cast.actors).map(a=>a.root),{padding:1.15,direction:[Math.sin(angle),.12,Math.cos(angle)]});
    }
    engine.camera.updateMatrixWorld(true);
  }
  return {cast,counts,evaluate,camera,bench};
}
