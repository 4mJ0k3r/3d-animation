import * as THREE from 'three';
import type {CartoonEngine} from '../toon-kit/engine';
import {createPrimitiveFactory,createStudioRoom,setupCartoonLighting} from '../toon-kit/lib';
import type {BoxOptions} from '../toon-kit/lib';
import {createCast,createPaths,pathThrough,walkAlong,appearancePreset,lookAt,pointAt,worldPoint,measureCharacter} from '../toon-kit/characters';
import type {ActorIntent} from '../toon-kit/characters';
import {TALL,COMPACT} from './character-fixture';
export const WALK_IDS=Object.freeze(['doctor','patient','office','casual'] as const);
export function createWalkingFixture(engine:CartoonEngine,reverse=false){
  setupCartoonLighting(engine.scene);engine.scene.add(createStudioRoom({width:12,depth:14,height:6,sideWalls:false,floorExtension:10}));
  const props:{box:(o:BoxOptions)=>THREE.Mesh}=createPrimitiveFactory(engine),chair=new THREE.Group();chair.position.set(-.8,0,.7);chair.rotation.y=Math.PI/2;
  chair.add(props.box({width:1.1,height:.1,depth:.9,color:'#ac7b52',position:[0,.45,0]}));
  chair.add(props.box({width:1.1,height:.65,depth:.08,color:'#ac7b52',position:[0,.8,-.4]}));
  for(const x of [-.44,.44])for(const z of [-.34,.34])chair.add(props.box({width:.07,height:.4,depth:.07,color:'#654935',position:[x,.2,z]}));engine.scene.add(chair);
  // Static authored lanes, not dynamic pathfinding or inter-character collision avoidance.
  const paths=createPaths({
    doctor:pathThrough([[-3,0,2.8],[3,0,2.8]]),patient:pathThrough([[3.2,0,.7],[0,0,.7]]),
    office:pathThrough([[-2.5,0,-1.5],[-1.2,0,-2.4],[.5,0,-2.0],[2.5,0,-1.5]]),casual:pathThrough([[-3,0,-4.6],[2.5,0,-4.6]]),
  });
  const definitions={
    doctor:{proportions:TALL,appearance:appearancePreset('doctor'),stance:walkAlong(paths.path('doctor'),{startFrame:30,endFrame:270})},
    patient:{proportions:COMPACT,appearance:appearancePreset('patient'),stance:walkAlong(paths.path('patient'),{startFrame:15,endFrame:225})},
    office:{appearance:appearancePreset('office'),stance:walkAlong(paths.path('office'),{startFrame:0,endFrame:285})},
    casual:{proportions:{...COMPACT,upperLegLength:.46,lowerLegLength:.40,upperArmLength:.36,lowerArmLength:.32},appearance:appearancePreset('casual'),stance:walkAlong(paths.path('casual'),{startFrame:15,endFrame:285})},
  };
  const cast=createCast(engine,reverse?{casual:definitions.casual,office:definitions.office,patient:definitions.patient,doctor:definitions.doctor}:definitions);
  const counts=WALK_IDS.map(id=>({id,...measureCharacter(cast.actors[id])}));
  function evaluate(frame:number,focusDoctor=false){
    // Keep the action intention constant: this stage does not blend gesture switches.
    const poses:Record<string,ActorIntent>={doctor:{expression:'explaining',gesture:pointAt(worldPoint([4,2.4,5]))},patient:{expression:'worried'},office:{expression:'neutral',gaze:lookAt(cast.actors.doctor.target('head'))},casual:{expression:'happy'}};
    if(focusDoctor)for(const id of WALK_IDS)poses[id]={...poses[id],visible:id==='doctor'};
    return cast.evaluate({frame,fps:30,poses});
  }
  function camera(view:'front'|'quarter'|'side'|'feet'='front',focusDoctor=false){
    if(focusDoctor){
      const yaw=cast.actors.doctor.root.rotation.y,angle=yaw-(view==='quarter'?Math.PI/4:view==='side'?Math.PI/2:0);
      engine.frameSubjects([cast.actors.doctor.root],{padding:1.15,direction:[Math.sin(angle),.12,Math.cos(angle)]});
    }else if(view==='feet'){
      // Explicit fixed validation camera; no tracking controller or cinematic API.
      engine.camera.position.set(1.8,1.2,6.1);engine.camera.lookAt(1.8,.75,2.8);
    }else{
      const angle=view==='quarter'?Math.PI/5:view==='side'?Math.PI/2:0;
      // Static room envelope avoids a camera that follows/jitters with each step.
      const bounds=new THREE.Box3(new THREE.Vector3(-3.8,0,-5.6),new THREE.Vector3(3.8,3.6,3.8));
      engine.frameSubjects(bounds,{padding:1.08,direction:[Math.sin(angle),.20,Math.cos(angle)]});
    }
    engine.camera.updateMatrixWorld(true);
  }
  return {cast,paths,counts,evaluate,camera};
}
