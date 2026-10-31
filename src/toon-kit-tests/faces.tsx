import React from 'react';
import {Composition,getInputProps,registerRoot} from 'remotion';
import {ThreeCanvas} from '../toon-kit/ThreeCanvas';
import {createFaceFixture} from './face-fixture';
import {verifyFaces} from './faces-gpu';

const Faces:React.FC=()=>{
  const props=getInputProps() as {mode?:string;verify?:boolean;high?:boolean};
  const fixture=React.useRef<ReturnType<typeof createFaceFixture>|null>(null),solveMs=React.useRef(0);
  return <ThreeCanvas autoFrame={false} engineOptions={{quality:'software-safe'}} initScene={async engine=>{
    if(props.verify!==false)await verifyFaces(engine);
    engine.signal.throwIfAborted();fixture.current=createFaceFixture(engine,props.high);
    console.log('AUDIT_FACE_COUNTS:'+JSON.stringify(fixture.current.counts));
    engine.renderer.info.autoReset=false;const render=engine.renderFrame.bind(engine);
    engine.renderFrame=(frame,fps)=>{engine.renderer.info.reset();const t=performance.now();render(frame,fps);
      console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-t,solveMs:solveMs.current,calls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,memory:{...engine.renderer.info.memory}}));};
  }} onFrame={({frame,engine})=>{
    const t=performance.now();fixture.current!.evaluate(frame,props.mode??'demo');solveMs.current=performance.now()-t;engine.camera.updateProjectionMatrix();
  }}/>;
};
registerRoot(()=><Composition id='FaceValidation' component={Faces} width={1080} height={720} durationInFrames={180} fps={30}/>);
