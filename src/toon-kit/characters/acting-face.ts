import {resolveFace,blinkAt} from './face';
import {smoothStep,timingProgress,validateTiming} from './acting';
import {freezeData} from './pose';
import type {FaceConfig,ResolvedFace,ExpressionName,Expression} from './face';
import type {ActingSample,ExpressionTransition} from './acting';
import type {Vec3} from './types';

export function resolveActingFace(config:FaceConfig,id:string,time:number,frame:number,fps:number,
  expression:ExpressionName|Expression|ExpressionTransition|undefined,blink:number|undefined,direction:Vec3,
  acting?:ActingSample,gazeProgress?:number):ResolvedFace {
  let effectiveBlink=blink;
  if(effectiveBlink===undefined&&config.blink?.enabled!==false){
    if(acting?.name==='surprise'&&acting.weight>.25){
      effectiveBlink=0;
    }else if(gazeProgress!==undefined&&gazeProgress>0&&gazeProgress<1){
      const idle=blinkAt(time,id,config.blink);
      const saccade=Math.sin(Math.PI*gazeProgress)**3;
      effectiveBlink=Math.max(idle,saccade);
    }
  }
  const face=(e:ExpressionName|Expression|undefined)=>resolveFace(config,id,time,e,effectiveBlink,direction);
  if(expression&&typeof expression==='object'&&'kind'in expression){
    if(expression.kind!=='expression-transition'||Object.keys(expression).some(k=>!['kind','from','to','options'].includes(k)))throw new Error('Invalid expression transition');
    validateTiming(expression.options);if(expression.options.intensity!==undefined)throw new Error('Expression intensity belongs on endpoints');
    const from=face(expression.from),to=face(expression.to),weight=smoothStep(timingProgress(expression.options,frame,fps).progress);
    return weight===0?from:weight===1?to:freezeData({...to,transition:{from,weight}});
  }
  if(expression!==undefined||!acting||acting.weight===0||acting.expression==='neutral')return face(expression);
  const from=face(undefined),to=face({name:acting.expression,intensity:acting.options.intensity??.8});
  return acting.envelope===1?to:freezeData({...to,transition:{from,weight:acting.envelope}});
}
