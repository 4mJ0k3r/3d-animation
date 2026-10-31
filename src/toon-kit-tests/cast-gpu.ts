import * as THREE from 'three';
import {CartoonEngine} from '../toon-kit/engine';
import {createTargets,lookAt,standAt,worldMark,CastEvaluationError} from '../toon-kit/characters';
import {createCastFixture} from './cast-fixture';

type Result={name:string;pass:boolean;details:unknown};
async function hashes(engine:CartoonEngine):Promise<{rgba:string;png:string}> {
  const gl=engine.renderer.getContext(),rgba=new Uint8Array(engine.width*engine.height*4);
  gl.readPixels(0,0,engine.width,engine.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  const binary=atob(engine.canvas.toDataURL('image/png').split(',')[1]),png=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const digest=async(data:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
  return {rgba:await digest(rgba),png:await digest(png)};
}
export async function verifyCastGpu(parent:CartoonEngine):Promise<void> {
  const results:Result[]=[],captures:{instance:number;frame:number;rgba:string;png:string;pose:string}[]=[];
  const record=(name:string,pass:boolean,details:unknown)=>results.push({name,pass,details});
  for(let instance=0;instance<3;instance++) {
    parent.signal.throwIfAborted();
    const engine=new CartoonEngine(document.createElement('canvas'),400,400,{quality:'software-safe'});
    parent.registerCleanup(()=>engine.dispose());
    const tracked=new Map<THREE.EventDispatcher,number>();
    try {
      const fixture=createCastFixture(engine,{debug:true,reverse:instance===1}),gl=engine.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
      const renderer=String(extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
      record(`SwiftShader ${instance}`,/swiftshader/i.test(renderer),{renderer});
      engine.scene.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        const material=object.material as THREE.MeshToonMaterial;
        for(const resource of [object.geometry,material,material.gradientMap])if(resource&&!tracked.has(resource)) {
          tracked.set(resource,0);resource.addEventListener('dispose',()=>tracked.set(resource,tracked.get(resource)!+1));
        }
      });
      await parent.wait(engine.prepare());
      let memory:string|undefined;
      for(const frame of instance<2?[0,80,20,80,0]:[0,20,80,0]) {
        const snapshot=fixture.evaluate(frame);
        engine.scene.updateMatrixWorld(true);engine.camera.position.set(.5,2.6,9);
        engine.frameSubjects(Object.values(fixture.cast.actors).map(a=>a.root),{padding:1.2});engine.camera.updateMatrixWorld(true);engine.renderFrame(frame,30);
        if(instance<2)captures.push({instance,frame,...await parent.wait(hashes(engine)),pose:JSON.stringify(snapshot)});
        const current=JSON.stringify(engine.renderer.info.memory);if(memory===undefined)memory=current;
        record(`bounded resources ${instance}/${frame}`,memory===current,{memory,current});
        record(`pointing + gaze + contacts ${instance}/${frame}`,!!snapshot.pointing.doctor&&!snapshot.gaze.patient.limited&&snapshot.contacts.doctor.feet.left==='floor'&&snapshot.contacts.patient.feet.left==='dangling',
          {pointing:snapshot.pointing.doctor,gaze:snapshot.gaze,contacts:snapshot.contacts});
      }
      const actual=()=>JSON.stringify(Object.values(fixture.cast.actors).map(a=>{const nodes:unknown[]=[];a.root.traverse(n=>nodes.push([n.name,n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.visible]));return nodes;}));
      const before=actual();
      let rejected=false;const missing=createTargets({});
      try{fixture.cast.evaluate({frame:99,fps:30,poses:{doctor:{stance:standAt(worldMark([3,0,0]))},patient:{gaze:lookAt(missing.target('missing'))}}});}catch(error){rejected=error instanceof CastEvaluationError;}
      const after=actual();
      record(`atomic rejection ${instance}`,rejected&&before===after,{rejected});
      const reset=fixture.cast.evaluate({frame:0,fps:30});
      record(`complete neutral intention reset ${instance}`,Object.values(reset.gaze).every(g=>g.yaw===0&&g.pitch===0)&&Object.values(reset.pointing).every(p=>p===null),{gaze:reset.gaze});
      fixture.cast.dispose();record(`shared resources stay live ${instance}`,[...tracked.values()].every(n=>n===0),{resources:tracked.size});
      engine.dispose();engine.dispose();record(`exactly-once resources ${instance}`,[...tracked.values()].every(n=>n===1),{resources:tracked.size});
      await parent.wait(new Promise<void>(resolve=>setTimeout(resolve,25)));record(`context released ${instance}`,gl.isContextLost(),{});
    }finally{engine.dispose();engine.canvas.remove();}
  }
  for(const field of ['rgba','png','pose'] as const)record(`${field} fresh/reordered/nonsequential determinism`,[0,20,80].every(frame=>{
    const values=captures.filter(v=>v.frame===frame);return values.every(v=>v[field]===values[0][field]);
  }),field==='pose'?{captures:captures.length}:captures.map(({instance,frame,rgba,png})=>({instance,frame,rgba,png})));
  record('different requested frames are distinct',new Set([0,20,80].map(frame=>captures.find(v=>v.frame===frame)!.png)).size===3,{});
  console.log('AUDIT_CAST_RESULTS:'+JSON.stringify(results));
  if(results.some(r=>!r.pass))throw new Error('Cast GPU validation failed: '+results.filter(r=>!r.pass).map(r=>r.name).join(', '));
}
