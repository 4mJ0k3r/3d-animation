import React from 'react';
import {getInputProps,useVideoConfig,useCurrentFrame} from 'remotion';
import {ThreeCanvas,ToonCaptions} from './toon-kit';
import {createUniversalClinic} from './clinic-universal';
import {UNIVERSAL_CLINIC_CAPTIONS} from './clinic-universal-story';

export const DoctorClinicUniversal:React.FC=()=>{
  const fixture=React.useRef<ReturnType<typeof createUniversalClinic>|null>(null),solve=React.useRef(0),caption=React.useRef(''),config=useVideoConfig(),currentFrame=useCurrentFrame();
  const props=getInputProps() as {view?:'portrait'|'front'|'quarter'|'close'|'point-close';sourceFrame?:number;previewFrames?:number[];previewViews?:('portrait'|'front'|'quarter'|'close'|'point-close')[];verify?:boolean};
  const sourceAt=(frame:number)=>props.previewFrames?.[frame]??props.sourceFrame??frame;
  const source=sourceAt(currentFrame),shift=currentFrame-source;
  return <div style={{position:'relative',width:'100%',height:'100%'}}>
    <ThreeCanvas autoFrame={false} fonts={['900 66px "Arial Black"','bold 28px Arial']} engineOptions={{quality:'software-safe',outlineThickness:2.8,depthThreshold:.015,normalThreshold:.46,saturation:1.14,warmth:.04}}
      initScene={async engine=>{
        if(props.verify){const {verifyUniversalClinic}=await import('./toon-kit-tests/clinic-universal-gpu');await verifyUniversalClinic(engine);}
        engine.signal.throwIfAborted();fixture.current=createUniversalClinic(engine);
        engine.renderer.info.autoReset=false;const render=engine.renderFrame.bind(engine);engine.renderFrame=(frame,fps)=>{engine.renderer.info.reset();const t=performance.now();render(frame,fps);console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-t,solveMs:solve.current,caption:caption.current,calls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,programs:engine.renderer.info.programs?.length,memory:{...engine.renderer.info.memory}}));};
      }} onFrame={({frame,fps})=>{const t=performance.now(),view=props.previewViews?.[frame]??props.view??'portrait';fixture.current!.evaluate(sourceAt(frame),fps,view==='close'?'patient':view==='point-close'?'doctor':undefined);fixture.current!.camera(view);
        const actual=document.querySelector('[data-clinic-caption] span')?.textContent??'',word=UNIVERSAL_CLINIC_CAPTIONS.find(w=>sourceAt(frame)>=w.startFrame&&sourceAt(frame)<w.endFrame)?.text??'';
        if(actual!==word)throw new Error(`Clinic caption mismatch: ${actual} / ${word}`);
        caption.current=actual;solve.current=performance.now()-t;
      }}/>
    <div data-clinic-caption><ToonCaptions words={UNIVERSAL_CLINIC_CAPTIONS.map(w=>({...w,startFrame:w.startFrame+shift,endFrame:w.endFrame+shift}))} fontSize={config.width*66/1080} bottom={config.height*100/1920} strokeWidth={config.width*5/1080} scalePunch/></div>
  </div>;
};
