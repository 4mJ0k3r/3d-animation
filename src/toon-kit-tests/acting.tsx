import React from 'react';
import {Composition,getInputProps,registerRoot} from 'remotion';
import {ThreeCanvas} from '../toon-kit/ThreeCanvas';
import {createActingFixture} from './acting-fixture';
import {verifyActing} from './acting-gpu';
const ActingValidation:React.FC=()=>{
  const props=getInputProps() as {verify?:boolean;mode?:'demo'|'views'|'portrait'|'diagnostic'},fixture=React.useRef<ReturnType<typeof createActingFixture>|null>(null),solve=React.useRef(0);
  return <ThreeCanvas autoFrame={false} engineOptions={{quality:'software-safe'}} initScene={async engine=>{
    if(props.verify!==false)await verifyActing(engine);engine.signal.throwIfAborted();fixture.current=createActingFixture(engine,false,props.mode==='portrait');
    engine.renderer.info.autoReset=false;const render=engine.renderFrame.bind(engine);engine.renderFrame=(frame,fps)=>{engine.renderer.info.reset();const t=performance.now();render(frame,fps);console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-t,solveMs:solve.current,calls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,memory:{...engine.renderer.info.memory}}));};
  }} onFrame={({frame})=>{
    const t=performance.now(),source=props.mode==='views'||props.mode==='portrait'||props.mode==='diagnostic'?100:frame;
    const mode=props.mode==='views'?(['full','close','side'] as const)[frame%3]:props.mode==='portrait'?'portrait':props.mode==='diagnostic'?'diagnostic':'full';
    fixture.current!.evaluate(source,mode);solve.current=performance.now()-t;fixture.current!.camera(mode);
  }}/>;
};
registerRoot(()=><Composition id='ActingValidation' component={ActingValidation} width={1280} height={720} durationInFrames={300} fps={30}/>);
