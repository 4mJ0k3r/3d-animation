import * as THREE from 'three';
import {CartoonEngine} from '../toon-kit/engine';
import {plane,setupCartoonLighting} from '../toon-kit/lib';
import {createCharacterFactory,measureCharacter,solveContactPose} from '../toon-kit/characters';
import {COMPACT,TALL} from './character-fixture';
import {contactRequest} from './contact-fixture';

type Result={name:string;pass:boolean;details:unknown};
async function canvasHashes(engine:CartoonEngine):Promise<{rgba:string;png:string}> {
  const gl=engine.renderer.getContext(),rgba=new Uint8Array(engine.canvas.width*engine.canvas.height*4);
  gl.readPixels(0,0,engine.canvas.width,engine.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  // Capture PNG synchronously before yielding a WebGL buffer with preserveDrawingBuffer=false.
  const binary=atob(engine.canvas.toDataURL('image/png').split(',')[1]);
  const png=Uint8Array.from(binary,(c)=>c.charCodeAt(0));
  const digest=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  return {rgba:await digest(rgba),png:await digest(png)};
}

export async function verifyContactGpu(parent:CartoonEngine):Promise<void> {
  const results:Result[]=[],hashes:{instance:number;frame:number;rgba:string;png:string;pose:string}[]=[];
  const record=(name:string,pass:boolean,details:unknown)=>results.push({name,pass,details});
  for(let instance=0;instance<3;instance++) {
    parent.signal.throwIfAborted();
    const engine=new CartoonEngine(document.createElement('canvas'),400,400,{quality:'software-safe'});
    parent.registerCleanup(()=>engine.dispose());
    const events=new Map<THREE.EventDispatcher,number>(),gl=engine.renderer.getContext();
    try {
      const extension=gl.getExtension('WEBGL_debug_renderer_info');
      const renderer=String(extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
      record(`software context ${instance}`,/swiftshader/i.test(renderer),{renderer});
      setupCartoonLighting(engine.scene);
      engine.scene.add(plane({width:20,height:20,rotation:[-Math.PI/2,0,0],color:'#e4d5bf',outlineMode:'none'}));
      const first=createCharacterFactory(engine),second=createCharacterFactory(engine);
      const a=first.create({id:'compact',proportions:COMPACT,colors:{torso:'#e5ae40'}}),b=second.create({id:'tall',proportions:TALL});
      engine.scene.add(a.root,b.root);
      let duplicateBlocked=false;
      try{second.create({id:'compact'});}catch{duplicateBlocked=true;}
      record(`cross-factory owner ID enforcement ${instance}`,duplicateBlocked,{duplicateBlocked});
      for(const actor of [a,b])actor.root.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        const material=object.material as THREE.MeshToonMaterial;
        for(const resource of [object.geometry,material,material.gradientMap])if(resource&&!events.has(resource)) {
          events.set(resource,0);resource.addEventListener('dispose',()=>events.set(resource,events.get(resource)!+1));
        }
      });
      await parent.wait(engine.prepare());
      let baseline:string|undefined;
      for(const frame of instance<2?[0,80,20,80,0]:[0,20,80,0]) {
        const snapshots=[];
        for(const [index,actor] of [a,b].entries()) {
          const result=solveContactPose(actor.definition,contactRequest(frame,[index===0?-.7:.7,0],index===1));
          if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));
          actor.applyPose(result.pose);snapshots.push(result.pose);
          if(frame===20)record(`seat contact ${instance}/${index}`,result.contacts.feet.left===(index===0?'dangling':'floor'),result.contacts);
        }
        engine.scene.updateMatrixWorld(true);engine.camera.position.set(0,2.5,8);
        engine.frameSubjects([a.root,b.root],{padding:1.15});engine.camera.updateMatrixWorld(true);engine.renderFrame(frame,30);
        const current=JSON.stringify(engine.renderer.info.memory);
        if(baseline===undefined)baseline=current;
        record(`bounded geometry/texture allocation ${instance}/${frame}`,baseline===current,{baseline,current});
        if(instance<2)hashes.push({instance,frame,...await parent.wait(canvasHashes(engine)),pose:JSON.stringify(snapshots)});
      }
      a.applyPose(a.definition.restPose);b.applyPose(b.definition.restPose);
      record(`complete reset after constraints ${instance}`,Math.abs(a.getAnchor('leftSole').y)<1e-8&&Math.abs(b.getAnchor('leftSole').y)<1e-8,{counts:[measureCharacter(a),measureCharacter(b)]});
      a.dispose();b.applyPose(b.definition.restPose);
      record(`shared resources remain live ${instance}`,[...events.values()].every(n=>n===0),{resources:events.size});
      first.dispose();second.dispose();engine.dispose();engine.dispose();
      record(`character resources disposed exactly once ${instance}`,[...events.values()].every(n=>n===1),{resources:events.size});
      await parent.wait(new Promise<void>(resolve=>setTimeout(resolve,25)));
      record(`context disposed ${instance}`,gl.isContextLost(),{lost:gl.isContextLost()});
    }finally{engine.dispose();engine.canvas.remove();}
  }
  for(const field of ['rgba','png','pose'] as const) {
    record(`${field} determinism across 0/80/20/80/0 and fresh engines`,[0,20,80].every(frame=>{
      const values=hashes.filter(v=>v.frame===frame);return values.every(v=>v[field]===values[0][field]);
    }),field==='pose'?{snapshots:hashes.length}:hashes.map(({instance,frame,rgba,png})=>({instance,frame,rgba,png})));
  }
  record('different contact poses produce different PNGs',new Set([0,20,80].map(frame=>hashes.find(h=>h.frame===frame)!.png)).size===3,{frames:[0,20,80]});
  console.log('AUDIT_CONTACT_RESULTS:'+JSON.stringify(results));
  if(results.some(r=>!r.pass))throw new Error('Contact software-rendering assertions failed: '+results.filter(r=>!r.pass).map(r=>r.name).join(', '));
}
