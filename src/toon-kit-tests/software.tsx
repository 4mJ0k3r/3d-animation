/** Small CPU fixture: real video, moving geometry, outlines, warm room and shadows. */
import React from 'react';
import * as THREE from 'three';
import {Composition, getInputProps, registerRoot} from 'remotion';
import {ThreeCanvas, createStudioRoom, setupCartoonLighting, sphere, capsule, cylinder, roundedBox, QualityProfile} from '../toon-kit';

const SoftwareScene: React.FC = () => {
  const props = getInputProps() as {quality?: QualityProfile; variant?: string};
  return <ThreeCanvas engineOptions={{quality:props.quality, aoIntensity:props.variant==='ao'?0.12:undefined,bokehMaxBlur:props.variant==='bokeh'?0.0015:undefined}}
    initScene={(engine)=>{
      engine.scene.add(createStudioRoom()); setupCartoonLighting(engine.scene,{quality:props.quality});
      if(props.variant==='no-shadows')engine.renderer.shadowMap.enabled=false;
      const actor=new THREE.Group();actor.name='actor';actor.userData.outlineGroup='actor';
      actor.add(sphere({radius:.6,color:'#fedcbd',position:[0,2.2,0]}),capsule({radius:.3,length:.6,color:'#00a3af',position:[0,1.2,0]}));
      const hair=sphere({radius:.615,color:'#4a3525',position:[0,2.23,0],outlineMode:'silhouette-only'});
      hair.geometry.dispose();hair.geometry=new THREE.SphereGeometry(.615,24,16,0,Math.PI*2,0,Math.PI*.42);actor.add(hair);
      for(const side of [-1,1]){
        actor.add(cylinder({radiusTop:.035,radiusBottom:.035,height:.7,position:[side*.18,.35,0],color:'#111111'}));
        actor.add(sphere({radius:.035,position:[side*.18,2.2,.57],color:'#111111',outlineMode:'none',castShadow:false}));
      }
      engine.scene.add(actor,roundedBox({width:1,height:.4,depth:.7,position:[1,.2,0],color:'#bd8351'}));
      const gl=engine.renderer.getContext();const extension=gl.getExtension('WEBGL_debug_renderer_info');
      const renderer=String(extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
      if(!/swiftshader/i.test(renderer))throw new Error('Software fixture requires verified SwiftShader, got '+renderer);
      console.log('TOON_RENDERER:'+JSON.stringify({renderer,vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),quality:props.quality||'software-safe',variant:props.variant||'base',canvas:[engine.canvas.width,engine.canvas.height]}));
      const render=engine.renderFrame.bind(engine);
      engine.renderFrame=(frame,fps)=>{const start=performance.now();render(frame,fps);console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-start}));};
    }}
    // Fixed envelope avoids per-frame shot changes; dynamic mode is separately audited.
    autoFrame='static' framingSubjects={()=>new THREE.Box3(new THREE.Vector3(-1,0,-.5),new THREE.Vector3(1.7,3,.5))}
    onFrame={({engine,time})=>{const actor=engine.scene.getObjectByName('actor')!;actor.position.x=Math.sin(time*2)*.15;actor.rotation.y=Math.sin(time)*.1;}}
  />;
};
registerRoot(()=> <><Composition id='SoftwarePortrait' component={SoftwareScene} width={720} height={1280} durationInFrames={90} fps={30}/><Composition id='SoftwareLandscape' component={SoftwareScene} width={1280} height={720} durationInFrames={90} fps={30}/></>);
