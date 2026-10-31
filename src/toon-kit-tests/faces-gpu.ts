import * as THREE from 'three';
import {CartoonEngine} from '../toon-kit/engine';
import {createFaceFixture} from './face-fixture';
import {EXPRESSIONS} from '../toon-kit/characters';

export async function verifyFaces(parent:CartoonEngine):Promise<void> {
  const results:{name:string;pass:boolean;details:unknown}[]=[],captures:{instance:number;frame:number;png:string;face:string}[]=[];
  const record=(name:string,pass:boolean,details:unknown={})=>{results.push({name,pass,details});};
  const hash=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  for(let instance=0;instance<2;instance++){
    parent.signal.throwIfAborted();const engine=new CartoonEngine(document.createElement('canvas'),720,480,{quality:'software-safe'});parent.registerCleanup(()=>engine.dispose());
    const fixture=createFaceFixture(engine,false,instance===1,true),resources=new Map<{addEventListener:Function},number>(),backings=new Set<HTMLCanvasElement>();
    try {
      const faces=Object.values(fixture.cast.actors).map(a=>a.root.getObjectByName('face') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>);
      record('one pooled curved face per existing head '+instance,faces.every(Boolean)&&faces[0].geometry===faces[1].geometry&&faces.every(f=>f.parent?.name.endsWith(':head')));
      record('private texture/material and sRGB alpha cutout '+instance,faces[0].material!==faces[1].material&&faces[0].material.map!==faces[1].material.map&&faces.every(f=>f.material.alphaTest>0&&!f.material.depthWrite&&f.material.depthTest&&f.material.map?.colorSpace===THREE.SRGBColorSpace&&f.userData.outlineMode==='none'));
      fixture.evaluate(0,'audit');await parent.wait(engine.prepare());
      engine.scene.traverse(o=>{if(o instanceof THREE.Mesh){for(const r of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)!+1));}for(const m of Array.isArray(o.material)?o.material:[o.material])for(const r of Object.values(m))if(r instanceof THREE.Texture&&!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)!+1));}}});
      let memory='';
      for(const frame of [0,80,20,80,0]) {
        const snapshot=fixture.evaluate(frame,'audit');engine.renderFrame(frame,30);
        faces.forEach(face=>backings.add(face.material.map!.image as HTMLCanvasElement));
        const binary=atob(engine.canvas.toDataURL('image/png').split(',')[1]);captures.push({instance,frame,png:await hash(Uint8Array.from(binary,c=>c.charCodeAt(0))),face:JSON.stringify(snapshot)});
        const current=JSON.stringify(engine.renderer.info.memory);memory||=current;record(`bounded allocations ${instance}/${frame}`,current===memory,current);
      }
      const canvasHash=async()=>{const canvas=faces[0].material.map!.image as HTMLCanvasElement;return hash(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data as unknown as Uint8Array<ArrayBuffer>);};
      const pixels:string[]=[];for(const name of EXPRESSIONS){fixture.cast.evaluate({frame:0,fps:30,poses:{a:{expression:name,blink:0},b:{expression:name,blink:0}}});pixels.push(await canvasHash());}
      record('seven expressions have distinct raster pixels '+instance,new Set(pixels).size===7,pixels);
      fixture.cast.evaluate({frame:0,fps:30,poses:{a:{expression:'happy',blink:0},b:{expression:'sad',blink:0}}});
      const before=await canvasHash(),other=faces[1].material.map!.version,version=faces[0].material.map!.version;
      fixture.cast.evaluate({frame:0,fps:30,poses:{a:{expression:'happy',blink:0},b:{expression:'sad',blink:0}}});
      record('unchanged face avoids upload '+instance,faces[0].material.map!.version===version&&faces[1].material.map!.version===other);
      let rejected=false;try{fixture.cast.evaluate({frame:80,fps:30,poses:{a:{expression:'angry'},b:{expression:'invalid' as never}}});}catch{rejected=true;}
      record('invalid late actor leaves texture pixels and versions untouched '+instance,rejected&&before===await canvasHash()&&faces[0].material.map!.version===version&&faces[1].material.map!.version===other);
      const blink=fixture.cast.evaluate({frame:3,fps:30,poses:{a:{expression:'happy',blink:1},b:{expression:'sad',blink:0}}});
      record('blink preserves underlying expression and other actor '+instance,blink.faces.a?.expression==='happy'&&blink.faces.a.blink===1&&faces[1].material.map!.version===other);
      const reset=fixture.cast.evaluate({frame:0,fps:30});record('omission resets expression '+instance,reset.faces.a?.expression==='neutral'&&reset.faces.b?.expression==='neutral');
      faces[0].visible=false;faces[0].position.set(5,5,5);faces[0].scale.setScalar(2);
      fixture.cast.evaluate({frame:0,fps:30});record('complete face attachment reset '+instance,faces[0].visible&&faces[0].position.length()===0&&Math.abs(faces[0].scale.x-fixture.cast.actors.a.definition.proportions.headRadius*1.012)<1e-10);
      if(instance===0){
        // Contact sheets contain actual lossless WebGL captures, not painted face mockups.
        const sheet=document.createElement('canvas');sheet.width=1440;sheet.height=7*512;
        const panel=(canvas:HTMLCanvasElement,x:number,y:number,label:string)=>{const context=canvas.getContext('2d')!;context.fillStyle='#eee4d6';context.fillRect(x,y,720,512);context.fillStyle='#17121b';context.font='20px sans-serif';context.fillText(label,x+16,y+25);context.drawImage(engine.canvas,x,y+32);};
        for(let frame=0;frame<14;frame++){fixture.evaluate(frame,'sheet');engine.renderFrame(frame,30);panel(sheet,(frame%2)*720,Math.floor(frame/2)*512,EXPRESSIONS[Math.floor(frame/2)]+' / '+(frame%2?'three-quarter':'front'));}
        console.log('AUDIT_FACE_SHEET:'+sheet.toDataURL('image/png').split(',')[1]);sheet.width=sheet.height=1;
        const gazeSheet=document.createElement('canvas');gazeSheet.width=2160;gazeSheet.height=6*512;
        for(let frame=0;frame<18;frame++){fixture.evaluate(frame,'gaze');engine.renderFrame(frame,30);
          const row=frame<15?frame%5:5,col=frame<15?Math.floor(frame/5):frame-15;
          panel(gazeSheet,col*720,row*512,frame<15?['forward','left','right','up','down'][row]+' / '+['front','three-quarter','side'][col]:['blink open','blink half','blink closed'][col]);}
        console.log('AUDIT_GAZE_SHEET:'+gazeSheet.toDataURL('image/png').split(',')[1]);gazeSheet.width=gazeSheet.height=1;
      }
      fixture.cast.dispose();record('GPU stays owner scoped after cast detach '+instance,[...resources.values()].every(n=>n===0));
    }finally{engine.dispose();}
    record('all body and facial resources disposed once '+instance,[...resources.values()].every(n=>n===1),resources.size);
    record('both private backing canvases released '+instance,backings.size===4&&[...backings].every(canvas=>canvas.width===1&&canvas.height===1));
    record('context released '+instance,engine.renderer.getContext().isContextLost());
  }
  const first=new Map<number,{png:string;face:string}>();
  record('fresh/reversed/nonsequential PNG and facial determinism',captures.every(c=>{const old=first.get(c.frame);if(!old){first.set(c.frame,c);return true;}return old.png===c.png&&old.face===c.face;}),captures.map(({face,...c})=>c));
  record('different frames have distinct pixels',new Set([...first.values()].map(c=>c.png)).size===3);
  record('nonsequential captures include automatic blink closure',JSON.parse(captures.find(c=>c.frame===80)!.face).faces.a.blink>0&&JSON.parse(captures.find(c=>c.frame===20)!.face).faces.a.blink===0);
  console.log('AUDIT_FACE_RESULTS:'+JSON.stringify(results));if(results.some(r=>!r.pass))throw new Error('Facial GPU verification failed');
}
