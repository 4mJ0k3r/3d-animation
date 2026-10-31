import * as THREE from 'three';
import {CartoonEngine} from '../toon-kit/engine';
import {createAppearanceFixture,APPEARANCE_IDS} from './appearance-fixture';
import {createCast,appearancePreset,standAt,worldMark} from '../toon-kit/characters';
import {TALL} from './character-fixture';
export async function verifyAppearance(parent:CartoonEngine){
  const results:{name:string;pass:boolean;details:unknown}[]=[],captures:{frame:number;png:string;pose:string}[]=[];
  const record=(name:string,pass:boolean,details:unknown={})=>results.push({name,pass,details});
  const hash=async(canvas:HTMLCanvasElement)=>{const b=atob(canvas.toDataURL('image/png').split(',')[1]),bytes=Uint8Array.from(b,c=>c.charCodeAt(0));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');};
  for(let instance=0;instance<2;instance++){
    const engine=new CartoonEngine(document.createElement('canvas'),640,400,{quality:'software-safe'});parent.registerCleanup(()=>engine.dispose());
    const fixture=createAppearanceFixture(engine,!!instance),resources=new Map<THREE.EventDispatcher,number>();
    const baseline=instance===0?createCast(engine,{undressed:{proportions:TALL,stance:standAt(worldMark([-3,0,0]))}}):null;
    baseline?.evaluate({frame:0,fps:30,poses:{undressed:{visible:false}}});
    try{
      fixture.evaluate(80);fixture.camera();await parent.wait(engine.prepare());engine.renderFrame(80,30);
      engine.scene.traverse(o=>{if(o instanceof THREE.Mesh){for(const r of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)!+1));}for(const mat of Array.isArray(o.material)?o.material:[o.material])for(const r of Object.values(mat))if(r instanceof THREE.Texture&&!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)!+1));}}});
      const memory=JSON.stringify(engine.renderer.info.memory);
      for(const frame of [0,80,20,80,0]){
        const snapshot=fixture.evaluate(frame);fixture.camera();engine.renderFrame(frame,30);captures.push({frame,png:await hash(engine.canvas),pose:JSON.stringify(snapshot)});
        record(`bounded allocations ${instance}/${frame}`,JSON.stringify(engine.renderer.info.memory)===memory,engine.renderer.info.memory);
        record(`preserved facial and contact state ${instance}/${frame}`,snapshot.faces.doctor?.expression==='explaining'&&snapshot.faces.patient?.expression==='worried'&&snapshot.contacts.doctor.feet.left==='floor'&&(frame===0||snapshot.contacts.patient.support==='seated'));
      }
      record('bounded preset geometry '+instance,fixture.counts.every(c=>c.meshes<=25&&c.triangles<6500),fixture.counts);
      const transforms=()=>JSON.stringify(Object.values(fixture.cast.actors).map(a=>{const out:unknown[]=[];a.root.traverse(n=>out.push([n.name,n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.visible]));return out;}));
      const before=transforms();let failed=false;try{fixture.cast.evaluate({frame:0,fps:30,poses:{doctor:{expression:'happy'},patient:{expression:'invalid' as never}}});}catch{failed=true;}record('appearance preserves cast atomicity '+instance,failed&&before===transforms());
      record('head anchors and outline inheritance '+instance,Object.values(fixture.cast.actors).every(a=>{let valid=true;a.root.traverse(n=>{if(n.name.startsWith('appearance:'))valid&&=n.userData.outlineMode==='silhouette-only'&&!!n.userData.attachmentAnchor;});return valid;}));
      if(instance===0){
        // Measure actual multipass draw cost for one visible preset at a time.
        const costs=[];for(let index=0;index<4;index++){fixture.evaluate(0,0,'sheet',index);fixture.camera('sheet',index,0);engine.renderer.info.autoReset=false;engine.renderer.info.reset();engine.renderFrame(0,30);costs.push({id:APPEARANCE_IDS[index],calls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,memory:{...engine.renderer.info.memory}});}
        fixture.cast.evaluate({frame:0,fps:30,poses:Object.fromEntries(APPEARANCE_IDS.map(id=>[id,{visible:false}]))});baseline!.evaluate({frame:0,fps:30});engine.frameSubjects(baseline!.actors.undressed.root,{padding:1.15,direction:[0,.12,1]});engine.renderer.info.reset();engine.renderFrame(0,30);
        console.log('AUDIT_APPEARANCE_BASELINE:'+JSON.stringify({calls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles}));baseline!.evaluate({frame:0,fps:30,poses:{undressed:{visible:false}}});
        console.log('AUDIT_APPEARANCE_COSTS:'+JSON.stringify(costs));
        engine.resize(480,720);
        for(let view=0;view<3;view++){
          const sheet=document.createElement('canvas');sheet.width=4*480;sheet.height=752;const ctx=sheet.getContext('2d')!;
          for(let index=0;index<4;index++){fixture.evaluate(0,0,'sheet',index);fixture.camera('sheet',index,view);engine.renderFrame(0,30);ctx.fillStyle='#e8dfd1';ctx.fillRect(index*480,0,480,752);ctx.fillStyle='#17121b';ctx.font='20px sans-serif';ctx.fillText(APPEARANCE_IDS[index],index*480+18,24);ctx.drawImage(engine.canvas,index*480,32);}
          console.log('AUDIT_APPEARANCE_SHEET_'+view+':'+sheet.toDataURL('image/png').split(',')[1]);sheet.width=sheet.height=1;
        }
        engine.resize(480,600);const heads=document.createElement('canvas');heads.width=1920;heads.height=632;const ctx=heads.getContext('2d')!;
        for(let index=0;index<4;index++){fixture.evaluate(0,0,'head',index);fixture.camera('head',index);engine.renderFrame(0,30);ctx.fillStyle='#e8dfd1';ctx.fillRect(index*480,0,480,632);ctx.fillStyle='#17121b';ctx.font='20px sans-serif';ctx.fillText(APPEARANCE_IDS[index],index*480+18,24);ctx.drawImage(engine.canvas,index*480,32);}console.log('AUDIT_APPEARANCE_HEADS:'+heads.toDataURL('image/png').split(',')[1]);heads.width=heads.height=1;
      }
      fixture.cast.dispose();record('shared GPU resources retained until owner end '+instance,[...resources.values()].every(v=>v===0));
    }finally{engine.dispose();}
    record('exactly once disposal '+instance,[...resources.values()].every(v=>v===1),resources.size);record('context released '+instance,engine.renderer.getContext().isContextLost());
  }
  const first=new Map<number,{png:string;pose:string}>();record('fresh/reversed/nonsequential PNG and pose determinism',captures.every(c=>{const old=first.get(c.frame);if(!old){first.set(c.frame,c);return true;}return old.png===c.png&&old.pose===c.pose;}),captures.map(({pose,...c})=>c));record('distinct frames distinct pixels',new Set([...first.values()].map(c=>c.png)).size===3);
  console.log('AUDIT_APPEARANCE_RESULTS:'+JSON.stringify(results));if(results.some(r=>!r.pass))throw new Error('Appearance GPU assertion failed');
}
