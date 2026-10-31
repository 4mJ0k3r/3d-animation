import * as THREE from 'three';
import {CartoonEngine} from '../toon-kit/engine';
import {createWalkingFixture,WALK_IDS} from './walking-fixture';
export async function verifyWalking(parent:CartoonEngine){
  const results:{name:string;pass:boolean;details:unknown}[]=[],captures:{instance:number;frame:number;png:string;rgba:string;pose:string}[]=[];
  const record=(name:string,pass:boolean,details:unknown={})=>results.push({name,pass,details});
  const digest=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  let maxSlip=0,maxError=0,plants=0;
  for(let instance=0;instance<2;instance++){
    parent.signal.throwIfAborted();const engine=new CartoonEngine(document.createElement('canvas'),640,400,{quality:'software-safe'});parent.registerCleanup(()=>engine.dispose());
    const fixture=createWalkingFixture(engine,!!instance),resources=new Map<THREE.EventDispatcher,number>();
    try{
      fixture.evaluate(120);fixture.camera();await parent.wait(engine.prepare());engine.renderFrame(120,30);
      engine.scene.traverse(o=>{if(o instanceof THREE.Mesh){for(const r of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)!+1));}for(const m of Array.isArray(o.material)?o.material:[o.material])for(const r of Object.values(m))if(r instanceof THREE.Texture&&!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)!+1));}}});
      const memory=JSON.stringify(engine.renderer.info.memory);
      for(const frame of [0,80,20,80,0,120,120]){
        const snapshot=fixture.evaluate(frame);fixture.camera();engine.renderFrame(frame,30);
        const gl=engine.renderer.getContext(),rgba=new Uint8Array(engine.width*engine.height*4);gl.readPixels(0,0,engine.width,engine.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
        const binary=atob(engine.canvas.toDataURL('image/png').split(',')[1]);captures.push({instance,frame,rgba:await digest(rgba),png:await digest(Uint8Array.from(binary,c=>c.charCodeAt(0))),pose:JSON.stringify(snapshot)});
        record(`no gait GPU allocation ${instance}/${frame}`,memory===JSON.stringify(engine.renderer.info.memory),engine.renderer.info.memory);
        const target=fixture.cast.actors.doctor.root.getObjectByName('doctor:head')!.getWorldPosition(new THREE.Vector3());
        record(`moving support target ${instance}/${frame}`,target.distanceTo(new THREE.Vector3(...snapshot.gaze.office.targetWorld!))<1e-8);
      }
      // Verification-only history map measures plants; production walking stores none.
      const fixed=new Map<string,THREE.Vector3>();
      for(let frame=30;frame<=150;frame++){
        const snapshot=fixture.evaluate(frame);
        for(const id of WALK_IDS)for(const side of ['left','right'] as const){const actor=fixture.cast.actors[id],foot=snapshot.locomotion[id]!.feet[side],ankle=actor.root.getObjectByName(`${id}:${side}Ankle`)!;
          const actual=new THREE.Vector3(...actor.definition.anchors[`${side}Sole`].offset).applyMatrix4(ankle.matrixWorld);maxError=Math.max(maxError,actual.distanceTo(new THREE.Vector3(...foot.position)));
          if(foot.state==='floor'){const key=id+'/'+side+'/'+foot.step,previous=fixed.get(key);if(previous)maxSlip=Math.max(maxSlip,actual.distanceTo(previous));else{fixed.set(key,actual);plants++;}}
        }
      }
      record('render hierarchy foot planting '+instance,maxSlip<1e-8&&maxError<1e-8,{maxSlip,maxError,plants});
      record('appearance mesh budgets unchanged '+instance,fixture.counts.every(c=>c.meshes<=22&&c.triangles<6000),fixture.counts);
      const actual=()=>JSON.stringify(WALK_IDS.map(id=>{const values:unknown[]=[];fixture.cast.actors[id].root.traverse(n=>values.push([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.visible]));return values;}));
      const before=actual();let rejected=false;try{fixture.cast.evaluate({frame:80,fps:30,poses:{doctor:{expression:'invalid' as never}}});}catch{rejected=true;}record('atomic gait rejection '+instance,rejected&&before===actual());
      fixture.cast.dispose();record('resources owner-scoped '+instance,[...resources.values()].every(n=>n===0));
    }finally{engine.dispose();}
    record('all gait resources disposed once '+instance,[...resources.values()].every(n=>n===1),resources.size);record('context released '+instance,engine.renderer.getContext().isContextLost());
  }
  const first=new Map<number,{png:string;rgba:string;pose:string}>();record('fresh/reversed/nonsequential PNG raw RGBA and pose determinism',captures.every(c=>{const old=first.get(c.frame);if(!old){first.set(c.frame,c);return true;}return old.png===c.png&&old.rgba===c.rgba&&old.pose===c.pose;}),captures.map(({pose,...c})=>c));record('different frames distinct',new Set([...first.values()].map(c=>c.png)).size===4);
  console.log('AUDIT_WALK_RESULTS:'+JSON.stringify(results));console.log('AUDIT_WALK_PLANTS:'+JSON.stringify({maxSlip,maxError,plants}));
  if(results.some(r=>!r.pass))throw new Error('Walking GPU assertion failed');
}
