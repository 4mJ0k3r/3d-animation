import React from 'react';
import {Composition,getInputProps,registerRoot} from 'remotion';
import {ThreeCanvas} from '../toon-kit/ThreeCanvas';
import {measureCharacter} from '../toon-kit/characters';
import {createCastFixture} from './cast-fixture';
import {verifyCastGpu} from './cast-gpu';

const CastValidation:React.FC=()=>{
  const props=getInputProps() as {verify?:boolean;portrait?:boolean};
  const fixture=React.useRef<ReturnType<typeof createCastFixture>|null>(null),solveTime=React.useRef(0);
  return <ThreeCanvas engineOptions={{quality:'software-safe'}} autoFrame={false}
    initScene={async engine=>{
      if(props.verify!==false)await verifyCastGpu(engine);
      engine.signal.throwIfAborted();fixture.current=createCastFixture(engine,{environment:true,debug:true});
      console.log('AUDIT_CAST_COUNTS:'+JSON.stringify(Object.entries(fixture.current.cast.actors).map(([id,actor])=>({id,...measureCharacter(actor)}))));
      engine.renderer.info.autoReset=false;const render=engine.renderFrame.bind(engine);
      engine.renderFrame=(frame,fps)=>{engine.renderer.info.reset();const start=performance.now();render(frame,fps);
        console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-start,solveMs:solveTime.current,calls:engine.renderer.info.render.calls,
          triangles:engine.renderer.info.render.triangles,memory:{...engine.renderer.info.memory}}));};
    }}
    onFrame={({engine,frame,fps})=>{
      const view=Math.floor(frame/30)%3,state=[0,20,80][view],portrait=!!props.portrait||engine.width<engine.height,start=performance.now();
      fixture.current!.evaluate(state,frame,fps,portrait);solveTime.current=performance.now()-start;
      if(portrait){engine.camera.position.set(-.4,2.4,8);engine.camera.lookAt(-.4,1.8,0);}
      else {const angle=[0,-Math.PI/6,Math.PI/2][view];engine.camera.position.set(.5+Math.sin(angle)*9.7,3.5,Math.cos(angle)*9.7);engine.camera.lookAt(.5,1.7,-.4);}
      engine.camera.updateProjectionMatrix();
    }} />;
};
registerRoot(()=><Composition id='CastValidation' component={CastValidation} width={1600} height={900} durationInFrames={90} fps={30}/>);
