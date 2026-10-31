import React from 'react';
import {Composition,getInputProps,registerRoot} from 'remotion';
import {ThreeCanvas} from '../toon-kit/ThreeCanvas';
import {createAppearanceFixture} from './appearance-fixture';
import {verifyAppearance} from './appearance-gpu';
const AppearanceValidation:React.FC=()=>{
  const props=getInputProps() as {verify?:boolean;mode?:string;index?:number};const fixture=React.useRef<ReturnType<typeof createAppearanceFixture>|null>(null),solve=React.useRef(0);
  return <ThreeCanvas autoFrame={false} engineOptions={{quality:'software-safe'}} initScene={async engine=>{
    if(props.verify!==false)await verifyAppearance(engine);engine.signal.throwIfAborted();fixture.current=createAppearanceFixture(engine,false,props.mode==='portrait');
    console.log('AUDIT_APPEARANCE_COUNTS:'+JSON.stringify(fixture.current.counts));engine.renderer.info.autoReset=false;const render=engine.renderFrame.bind(engine);
    engine.renderFrame=(frame,fps)=>{engine.renderer.info.reset();const t=performance.now();render(frame,fps);console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-t,solveMs:solve.current,calls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,memory:{...engine.renderer.info.memory}}));};
  }} onFrame={({frame})=>{const state=[0,20,80][Math.floor(frame/30)%3],mode=props.mode??'demo',t=performance.now();fixture.current!.evaluate(state,frame,mode,props.index??0);solve.current=performance.now()-t;fixture.current!.camera(mode,props.index??0);}}/>;
};
registerRoot(()=><Composition id='AppearanceValidation' component={AppearanceValidation} width={1600} height={900} durationInFrames={90} fps={30}/>);
