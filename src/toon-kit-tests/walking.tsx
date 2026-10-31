import React from 'react';
import {Composition,getInputProps,registerRoot} from 'remotion';
import {ThreeCanvas} from '../toon-kit/ThreeCanvas';
import {createWalkingFixture} from './walking-fixture';
import {verifyWalking} from './walking-gpu';
const WalkingValidation:React.FC=()=>{
  const props=getInputProps() as {verify?:boolean;mode?:'demo'|'views'|'feet'},fixture=React.useRef<ReturnType<typeof createWalkingFixture>|null>(null),solve=React.useRef(0);
  return <ThreeCanvas autoFrame={false} engineOptions={{quality:'software-safe'}} initScene={async engine=>{
    if(props.verify!==false)await verifyWalking(engine);engine.signal.throwIfAborted();fixture.current=createWalkingFixture(engine);
    console.log('AUDIT_WALK_COUNTS:'+JSON.stringify(fixture.current.counts));engine.renderer.info.autoReset=false;const render=engine.renderFrame.bind(engine);
    engine.renderFrame=(frame,fps)=>{engine.renderer.info.reset();const t=performance.now();render(frame,fps);console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-t,solveMs:solve.current,calls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,memory:{...engine.renderer.info.memory}}));};
  }} onFrame={({frame})=>{
    const t=performance.now(),source=props.mode==='views'?113:frame;fixture.current!.evaluate(source,props.mode==='views');solve.current=performance.now()-t;
    fixture.current!.camera(props.mode==='views'?(['front','quarter','side'] as const)[frame%3]:props.mode==='feet'||frame>=180?'feet':'quarter',props.mode==='views');
  }}/>;
};
registerRoot(()=><Composition id='WalkingValidation' component={WalkingValidation} width={1280} height={720} durationInFrames={300} fps={30}/>);
