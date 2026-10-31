import * as THREE from 'three';
import {CartoonEngine} from '../toon-kit/engine';
import {poseAnchorPosition} from '../toon-kit/characters';
import {createActingFixture,ACTING_IDS} from './acting-fixture';
export async function verifyActing(parent:CartoonEngine){
  const results:{name:string;pass:boolean;details:unknown}[]=[],captures:{instance:number;frame:number;png:string;rgba:string;pose:string}[]=[];
  const record=(name:string,pass:boolean,details:unknown={})=>results.push({name,pass,details});
  const digest=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  for(let instance=0;instance<2;instance++){
    parent.signal.throwIfAborted();const engine=new CartoonEngine(document.createElement('canvas'),640,400,{quality:'software-safe'});parent.registerCleanup(()=>engine.dispose());
    const fixture=createActingFixture(engine,!!instance),resources=new Map<THREE.EventDispatcher,number>(),original=document.createElement;
    try{
      fixture.evaluate(100);fixture.camera();await parent.wait(engine.prepare());engine.renderFrame(100,30);
      engine.scene.traverse(o=>{if(o instanceof THREE.Mesh){for(const r of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)!+1));}for(const m of Array.isArray(o.material)?o.material:[o.material])for(const r of Object.values(m))if(r instanceof THREE.Texture&&!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)!+1));}}});
      const memory=JSON.stringify(engine.renderer.info.memory);let canvases=0;
      document.createElement=((tag:string,options?:ElementCreationOptions)=>{if(tag==='canvas')canvases++;return original.call(document,tag,options);}) as typeof document.createElement;
      for(const frame of [0,80,20,80,0,100,155,285]){
        const snapshot=fixture.evaluate(frame);fixture.camera();engine.renderFrame(frame,30);
        const gl=engine.renderer.getContext(),rgba=new Uint8Array(engine.width*engine.height*4);gl.readPixels(0,0,engine.width,engine.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
        const binary=atob(engine.canvas.toDataURL('image/png').split(',')[1]);captures.push({instance,frame,rgba:await digest(rgba),png:await digest(Uint8Array.from(binary,c=>c.charCodeAt(0))),pose:JSON.stringify(snapshot)});
        record(`stable GPU/canvas allocations ${instance}/${frame}`,memory===JSON.stringify(engine.renderer.info.memory)&&canvases===0,{memory:{...engine.renderer.info.memory},canvases});
        let correct=true;
        for(const id of ACTING_IDS){const actor=fixture.cast.actors[id],head=actor.root.getObjectByName(`${id}:head`)!;
          const expected=new THREE.Vector3(...poseAnchorPosition(snapshot.poses[id],actor.definition.anchors.head,'parent'));
          const forward=new THREE.Vector3(0,0,1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
          correct&&=head.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-8&&forward.distanceTo(new THREE.Vector3(...snapshot.gaze[id].headWorldDirection))<1e-8;
          for(const side of ['left','right'] as const){const ankle=actor.root.getObjectByName(`${id}:${side}Ankle`)!;const sole=new THREE.Vector3(...actor.definition.anchors[`${side}Sole`].offset).applyMatrix4(ankle.matrixWorld);
            correct&&=sole.y>=-1e-8;if(snapshot.contacts[id].feet[side]==='floor')correct&&=Math.abs(sole.y)<1e-8;
            if(snapshot.locomotion[id])correct&&=sole.distanceTo(new THREE.Vector3(...snapshot.locomotion[id]!.feet[side].position))<1e-8;
          }
        }
        record(`actual animated hierarchy and contacts ${instance}/${frame}`,correct);
      }
      const transforms=()=>JSON.stringify(ACTING_IDS.map(id=>{const list:unknown[]=[];fixture.cast.actors[id].root.traverse(o=>list.push([o.position.toArray(),o.quaternion.toArray(),o.visible]));return list;}));
      const before=transforms();let rejected=false;try{fixture.cast.evaluate({frame:80,fps:30,poses:{doctor:{expression:'invalid' as never}}});}catch{rejected=true;}
      record('atomic acting failure '+instance,rejected&&before===transforms());
      fixture.cast.dispose();record('shared acting assets retained '+instance,[...resources.values()].every(n=>n===0));
    }finally{document.createElement=original;engine.dispose();}
    record('acting GPU assets disposed once '+instance,[...resources.values()].every(n=>n===1),resources.size);record('acting context released '+instance,engine.renderer.getContext().isContextLost());
  }
  const first=new Map<number,{png:string;rgba:string;pose:string}>();record('fresh/reversed/nonsequential PNG raw RGBA and pose determinism',captures.every(c=>{const old=first.get(c.frame);if(!old){first.set(c.frame,c);return true;}return old.png===c.png&&old.rgba===c.rgba&&old.pose===c.pose;}),captures.map(({pose,...c})=>c));
  record('expressive frames differ',new Set([...first.values()].map(c=>c.png)).size===6);
  console.log('AUDIT_ACTING_RESULTS:'+JSON.stringify(results));if(results.some(r=>!r.pass))throw new Error('Acting GPU assertions failed');
}
