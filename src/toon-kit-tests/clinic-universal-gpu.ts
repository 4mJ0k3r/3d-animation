import {CartoonEngine} from '../toon-kit/engine';
import {createUniversalClinic} from '../clinic-universal';
export async function verifyUniversalClinic(parent:CartoonEngine){
  const results:{name:string;pass:boolean;details:unknown}[]=[],captures:{frame:number;instance:number;png:string;rgba:string;pose:string}[]=[];
  const record=(name:string,pass:boolean,details:unknown={})=>results.push({name,pass,details});
  const hash=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  for(let instance=0;instance<2;instance++){
    const engine=new CartoonEngine(document.createElement('canvas'),360,640,{quality:'software-safe',outlineThickness:2.8,depthThreshold:.015,normalThreshold:.46,saturation:1.14,warmth:.04});parent.registerCleanup(()=>engine.dispose());
    try{const fixture=createUniversalClinic(engine);fixture.evaluate(50);fixture.camera();await parent.wait(engine.prepare());engine.renderFrame(50,30);const memory=JSON.stringify(engine.renderer.info.memory);
      const resources=()=>{const ids:string[]=[];engine.scene.traverse(o=>{if('isMesh' in o&&o.isMesh){const mesh=o as import('three').Mesh;ids.push(mesh.geometry.uuid,...(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.uuid));}});return ids.sort().join(',');};
      const baseline=resources(),programs=engine.renderer.info.programs?.length;
      for(const frame of [0,80,20,80,0,50,105,135]){const state=fixture.evaluate(frame);fixture.camera();engine.renderFrame(frame,30);const gl=engine.renderer.getContext(),rgba=new Uint8Array(engine.width*engine.height*4);gl.readPixels(0,0,engine.width,engine.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);const b=atob(engine.canvas.toDataURL('image/png').split(',')[1]);captures.push({instance,frame,png:await hash(Uint8Array.from(b,c=>c.charCodeAt(0))),rgba:await hash(rgba),pose:JSON.stringify(state)});
        record(`bounded clinic GPU allocations ${instance}/${frame}`,memory===JSON.stringify(engine.renderer.info.memory)&&baseline===resources()&&programs===engine.renderer.info.programs?.length,{...engine.renderer.info.memory,programs,stableGeometryAndMaterialIdentity:baseline===resources()});
      }
      fixture.cast.dispose();
    }finally{engine.dispose();}
    record('clinic context released '+instance,engine.renderer.getContext().isContextLost());
  }
  const first=new Map<number,typeof captures[number]>();record('clinic PNG raw RGBA and complete pose order/fresh determinism',captures.every(c=>{const old=first.get(c.frame);if(!old){first.set(c.frame,c);return true;}return old.png===c.png&&old.rgba===c.rgba&&old.pose===c.pose;}),captures.map(({pose,...c})=>c));
  record('clinic active story frames differ',new Set([...first.values()].map(c=>c.png)).size>=5);
  console.log('AUDIT_CLINIC_RESULTS:'+JSON.stringify(results));if(results.some(r=>!r.pass))throw new Error('Universal clinic verification failed');
}
