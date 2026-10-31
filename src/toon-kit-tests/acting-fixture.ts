import * as THREE from 'three';
import type {CartoonEngine} from '../toon-kit/engine';
import {createPrimitiveFactory,createStudioRoom,setupCartoonLighting} from '../toon-kit/lib';
import type {BoxOptions} from '../toon-kit/lib';
import {createCast,appearancePreset,standAt,sceneMark,worldPoint,lookAt,turnTo,explain,surprise,nod,wave,walkAlong,pathThrough} from '../toon-kit/characters';
import type {ActorIntent} from '../toon-kit/characters';
import {TALL,COMPACT} from './character-fixture';
export const ACTING_IDS=Object.freeze(['doctor','patient','office','casual'] as const);
export function createActingFixture(engine:CartoonEngine,reverse=false,portrait=false){
  setupCartoonLighting(engine.scene);engine.scene.add(createStudioRoom({width:12,depth:12,height:6,sideWalls:false,floorExtension:10}));
  const props:{box:(o:BoxOptions)=>THREE.Mesh}=createPrimitiveFactory(engine),doctorMark=new THREE.Object3D(),patientMark=new THREE.Object3D(),officeMark=new THREE.Object3D();
  doctorMark.position.set(portrait?-.6:-1.8,0,0);doctorMark.rotation.y=.12;
  patientMark.position.set(portrait?.6:.5,0,portrait?-.4:.15);patientMark.rotation.y=-.18;
  officeMark.position.set(2.7,0,-1.3);officeMark.rotation.y=-.15;engine.scene.add(doctorMark,patientMark,officeMark);
  const chair=new THREE.Group();chair.position.set(.6,0,-1.3);chair.add(props.box({width:1,height:.1,depth:.9,color:'#ac7b52',position:[0,.45,0]}));
  chair.add(props.box({width:1,height:.6,depth:.08,color:'#ac7b52',position:[0,.8,-.4]}));for(const x of [-.4,.4])for(const z of [-.34,.34])chair.add(props.box({width:.07,height:.4,depth:.07,color:'#654935',position:[x,.2,z]}));engine.scene.add(chair);
  const definitions={
    doctor:{appearance:appearancePreset('doctor'),proportions:TALL,stance:standAt(sceneMark(doctorMark))},
    patient:{appearance:appearancePreset('patient'),proportions:COMPACT,stance:standAt(sceneMark(patientMark))},
    office:{appearance:appearancePreset('office'),stance:standAt(sceneMark(officeMark))},
    casual:{appearance:appearancePreset('casual'),proportions:COMPACT,stance:walkAlong(pathThrough([[-3,0,-3.2],[2,0,-3.2]]),{startFrame:15,endFrame:285})},
  };
  const cast=createCast(engine,reverse?{casual:definitions.casual,office:definitions.office,patient:definitions.patient,doctor:definitions.doctor}:definitions);
  const actions={doctor:explain({startFrame:15,endFrame:285}),patient:surprise({startFrame:55,endFrame:155}),office:nod({startFrame:60,endFrame:155}),casual:wave({startFrame:60,endFrame:210,hand:'right'})};
  const gaze=turnTo(worldPoint([.2,2.5,6]),{startFrame:10,endFrame:45});
  function evaluate(frame:number,mode:'full'|'close'|'side'|'portrait'|'diagnostic'='full'){
    const poses:Record<string,ActorIntent>={doctor:{gesture:actions.doctor,gaze},patient:{gesture:actions.patient,gaze:lookAt(worldPoint([-.4,2.5,6]))},office:{gesture:actions.office},casual:{gesture:actions.casual}};
    if(mode==='portrait'||mode==='close'){poses.office={...poses.office,visible:false};poses.casual={...poses.casual,visible:false};}
    if(mode==='side'||mode==='diagnostic')for(const id of ACTING_IDS)poses[id]={...poses[id],visible:id==='doctor'};
    return cast.evaluate({frame,fps:30,poses});
  }
  function camera(mode:'full'|'close'|'side'|'portrait'|'diagnostic'='full'){
    // Explicit authored, stable envelopes; no character-following/cinematic system.
    const pair=(a:THREE.Vector3,b:THREE.Vector3)=>new THREE.Box3(a,b);
    if(mode==='portrait')engine.frameSubjects(pair(new THREE.Vector3(-1.45,-.12,-.8),new THREE.Vector3(1.45,3.6,.8)),{padding:1.08,direction:[.06,.10,1]});
    else if(mode==='close')engine.frameSubjects(pair(new THREE.Vector3(-2.55,1.45,-.6),new THREE.Vector3(1.2,3.6,.8)),{padding:1.06,direction:[.08,.05,1]});
    else if(mode==='side')engine.frameSubjects(pair(new THREE.Vector3(-2.6,-.1,-.7),new THREE.Vector3(-.9,3.6,.8)),{padding:1.1,direction:[1,.1,.08]});
    else if(mode==='diagnostic')engine.frameSubjects(pair(new THREE.Vector3(-2.6,-.1,-.7),new THREE.Vector3(-.9,1.5,.8)),{padding:1.1,direction:[.8,.1,1]});
    else engine.frameSubjects(pair(new THREE.Vector3(-3.7,-.15,-4),new THREE.Vector3(3.6,3.7,1.2)),{padding:1.08,direction:[.75,.15,1]});
    engine.camera.updateMatrixWorld(true);
  }
  return {cast,evaluate,camera,actions};
}
