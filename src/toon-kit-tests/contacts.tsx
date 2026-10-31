import React from 'react';
import * as THREE from 'three';
import {Composition,getInputProps,registerRoot} from 'remotion';
import {ThreeCanvas} from '../toon-kit/ThreeCanvas';
import {box,plane,setupCartoonLighting,sphere} from '../toon-kit/lib';
import {createCharacterFactory,measureCharacter,solveContactPose,seatTarget,sitOn,levelFloor} from '../toon-kit/characters';
import type {CharacterRig} from '../toon-kit/characters';
import {COMPACT,TALL} from './character-fixture';
import {contactRequest} from './contact-fixture';
import {verifyContactGpu} from './contact-gpu';

/** Six static contact cases. Cuts between three views; no animation orchestration. */
const ContactValidation:React.FC=()=>{
  const actors=React.useRef<CharacterRig[]>([]),chairs=React.useRef<THREE.Group[]>([]),markers=React.useRef<THREE.Mesh[]>([]);
  const props=getInputProps() as {verify?:boolean};
  const solveTiming=React.useRef(0);
  return <ThreeCanvas engineOptions={{quality:'software-safe'}} autoFrame={false}
    initScene={async engine=>{
      if(props.verify!==false)await verifyContactGpu(engine);
      engine.signal.throwIfAborted();setupCartoonLighting(engine.scene);
      engine.scene.add(plane({width:200,height:200,rotation:[-Math.PI/2,0,0],color:'#e4d5bf',outlineMode:'none'}));
      const factory=createCharacterFactory(engine);
      actors.current=Array.from({length:6},(_,index)=>factory.create({id:`contact-${index}`,proportions:index%2===0?COMPACT:TALL,colors:{torso:index%2===0?'#e5ae40':'#36a9b0'}}));
      actors.current.forEach(actor=>engine.scene.add(actor.root));
      chairs.current=Array.from({length:2},()=>{
        const group=new THREE.Group();group.add(box({width:1,height:.1,depth:.9,position:[0,.4,0],color:'#bb7950'}));
        for(const x of [-.43,.43])for(const z of [-.35,.35])group.add(box({width:.07,height:.35,depth:.07,position:[x,.175,z],color:'#61452e'}));
        engine.scene.add(group);return group;
      });
      markers.current=Array.from({length:2},()=>{const marker=sphere({radius:.025,widthSegments:8,heightSegments:6,color:'#70bf54',outlineMode:'none',castShadow:false});engine.scene.add(marker);return marker;});
      console.log('AUDIT_CONTACT_COUNTS:'+JSON.stringify(actors.current.map(actor=>({id:actor.id,...measureCharacter(actor)}))));
      engine.renderer.info.autoReset=false;
      const render=engine.renderFrame.bind(engine);
      engine.renderFrame=(frame,fps)=>{
        engine.renderer.info.reset();const start=performance.now();render(frame,fps);
        console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-start,solveMs:solveTiming.current,calls:engine.renderer.info.render.calls,
          triangles:engine.renderer.info.render.triangles,memory:{...engine.renderer.info.memory}}));
      };
    }}
    onFrame={({engine,frame})=>{
      const angle=[0,Math.PI/4,Math.PI/2][Math.floor(frame/30)%3],start=performance.now();
      actors.current.forEach((actor,index)=>{
        const offset=-5+index*2,at:[number,number]=[Math.cos(angle)*offset,-Math.sin(angle)*offset];
        const state=index<2?0:index<4?80:20;
        let request=contactRequest(state,at,index%2===1);
        if(index>=4) {
          // Rotated seats exercise a semantic front edge, not camera-relative joint math.
          const yaw=Math.PI/12;
          request={support:sitOn(seatTarget({center:[at[0],.45,at[1]],width:1,depth:.9,thickness:.1,yaw}),{floor:levelFloor()})};
          chairs.current[index-4].position.set(at[0],0,at[1]);chairs.current[index-4].rotation.y=yaw;
        }
        const result=solveContactPose(actor.definition,request);
        if(!result.ok)throw new Error(JSON.stringify({id:actor.id,diagnostics:result.diagnostics}));
        actor.applyPose(result.pose);
        if(index===2||index===3)markers.current[index-2].position.set(at[0]+(index===2?.55:-.55),1.68,at[1]+.3);
      });
      solveTiming.current=performance.now()-start;
      engine.camera.position.set(Math.sin(angle)*10.1,3.4,Math.cos(angle)*10.1);engine.camera.lookAt(0,1.5,0);engine.camera.updateProjectionMatrix();
    }}
  />;
};
registerRoot(()=><Composition id='ContactValidation' component={ContactValidation} width={1600} height={900} durationInFrames={90} fps={30}/>);
