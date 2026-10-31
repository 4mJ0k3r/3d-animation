import * as THREE from 'three';
import type {CartoonEngine} from '../toon-kit/engine';
import {setupCartoonLighting} from '../toon-kit/lib';
import {createCast,createCharacterDefinition,standAt,worldMark,worldPoint,lookAt,pointAt,EXPRESSIONS,measureCharacter} from '../toon-kit/characters';
import type {ActorIntent,ExpressionName} from '../toon-kit/characters';
import {COMPACT,TALL} from './character-fixture';

/** Dedicated close-up fixture. The scene camera is explicit and static within each test shot. */
export function createFaceFixture(engine:CartoonEngine,high=false,reverse=false,blinkAudit=false) {
  setupCartoonLighting(engine.scene);engine.scene.background=new THREE.Color('#e8dfd1');
  const home=(p:typeof TALL,x:number)=>standAt(worldMark([x,2-createCharacterDefinition(p).height+p.headRadius,0]));
  const definitions={a:{proportions:TALL,stance:home(TALL,-.8),colors:{skin:'#f2c69d',torso:'#269fa6'},face:{textureSize:high?512 as const:256 as const,blink:{period:blinkAudit?2.6:2.4,duration:.24,phase:0}}},
    b:{proportions:COMPACT,stance:home(COMPACT,.8),colors:{skin:'#ce956a',torso:'#e4ad32'},face:{blink:{period:2.4,duration:.24,phase:.7}}}};
  const cast=createCast(engine,reverse?{b:definitions.b,a:definitions.a}:definitions);
  const counts=Object.entries(cast.actors).map(([id,actor])=>({id,...measureCharacter(actor)}));
  function camera(view:'front'|'quarter'|'side'='front') {
    const angle=view==='quarter'?Math.PI/7:view==='side'?Math.PI/2:0;
    engine.camera.position.set(Math.sin(angle)*3.5,2,Math.cos(angle)*3.5);engine.camera.lookAt(0,2,0);engine.camera.updateMatrixWorld(true);
  }
  function evaluate(frame:number,mode='demo') {
    const expression:ExpressionName=mode==='audit'?(frame===80?'worried':frame===20?'happy':'neutral'):EXPRESSIONS[(mode==='sheet'?Math.floor(frame/2):Math.floor(frame/24))%7];
    let a:ActorIntent={expression},b:ActorIntent={expression};
    let view:'front'|'quarter'|'side'=mode==='sheet'?(frame%2?'quarter':'front'):frame%48>=24?'quarter':'front';
    if(mode==='sheet'){a={expression:{name:expression,blush:expression==='happy'?.55:0},blink:0};b={expression:{name:expression,blush:expression==='happy'?.4:0},blink:0};}
    if(mode==='gaze') {
      const direction=[[0,2,5],[-5,2,5],[5,2,5],[0,7,5],[0,-3,5]][frame%5];
      const target=lookAt(worldPoint(direction as [number,number,number]));
      a={expression:'happy',blink:0,eyeGaze:target};b={expression:'worried',blink:0,gaze:target};view=frame<5?'front':frame<10?'quarter':'side';
      if(frame>=15){a={expression:'happy',blink:[0,.5,1,0][(frame-15)%4]};b={expression:'worried',blink:a.blink};view='front';}
      if(frame>=10&&frame<15)b={...b,visible:false};
    }
    if(mode==='interaction'){
      a={expression:{name:'explaining',mouth:frame%30<15?'open':'closed'},gaze:lookAt(worldPoint([3,2.2,5])),gesture:pointAt(worldPoint([3,2.2,5]))};
      b={expression:'worried',gaze:lookAt(cast.actors.a.target('head'))};view='front';
    }
    if(mode==='portrait'){
      a={expression:EXPRESSIONS[Math.floor(frame/12)%7],stance:home(TALL,0),gaze:lookAt(worldPoint([1.6,2.2,5]))};b={visible:false};
    }
    const snapshot=cast.evaluate({frame,fps:30,poses:{a,b}});camera(view);
    if(mode==='portrait'){engine.camera.position.set(0,1.9,2.8);engine.camera.lookAt(0,1.9,0);engine.camera.updateMatrixWorld(true);}
    return snapshot;
  }
  return {cast,counts,evaluate,camera};
}
