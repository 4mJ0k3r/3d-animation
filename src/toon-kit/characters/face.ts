import {freezeData} from './pose';
import type {Vec3} from './types';

export const EXPRESSIONS=Object.freeze(['neutral','happy','worried','surprised','angry','sad','explaining'] as const);
export type ExpressionName=typeof EXPRESSIONS[number];
export type MouthShape='auto'|'closed'|'smile'|'frown'|'open'|'o';
export interface Expression {readonly name:ExpressionName;readonly intensity?:number;readonly mouth?:MouthShape;readonly blush?:number}
export interface BlinkConfig {readonly period?:number;readonly duration?:number;readonly phase?:number;readonly enabled?:boolean}
export interface FaceConfig {readonly textureSize?:256|512;readonly defaultExpression?:ExpressionName;readonly blink?:BlinkConfig}
export interface ResolvedFace {
  readonly expression:ExpressionName;readonly intensity:number;readonly mouth:MouthShape;readonly blush:number;
  readonly blink:number;readonly pupil:readonly [number,number];
}
const only=(o:object,keys:string[])=>Object.keys(o).every(k=>keys.includes(k));
const scalar=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
export function validateFaceConfig(config:FaceConfig):void {
  if(!config||typeof config!=='object'||Array.isArray(config)||!only(config,['textureSize','defaultExpression','blink'])||
    (config.textureSize!==undefined&&![256,512].includes(config.textureSize))||
    (config.defaultExpression!==undefined&&!EXPRESSIONS.includes(config.defaultExpression)))throw new Error('Invalid face configuration');
  const b=config.blink;
  if(b!==undefined&&(!b||typeof b!=='object'||Array.isArray(b)||!only(b,['period','duration','phase','enabled'])||
    (b.period!==undefined&&!scalar(b.period,.5,120))||(b.duration!==undefined&&!scalar(b.duration,.06,.5))||
    (b.phase!==undefined&&!scalar(b.phase,0,120))||(b.enabled!==undefined&&typeof b.enabled!=='boolean')||
    (b.duration??.18)>=(b.period??4)))throw new Error('Invalid blink configuration');
}
/** Stable ID phase, no RNG and no mutable counters. */
export function blinkAt(time:number,id:string,config:BlinkConfig={}):number {
  validateFaceConfig({blink:config});
  if(!Number.isFinite(time)||time<0)throw new Error('Blink time must be finite and nonnegative');
  if(config.enabled===false)return 0;
  let hash=2166136261;for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619)>>>0;
  const period=config.period??4,duration=config.duration??.18,phase=config.phase??(hash/4294967296)*period;
  const t=((time+phase)%period+period)%period;
  // Half cosine closure/opening, exactly zero outside each bounded blink window.
  return t<duration?(1-Math.cos(2*Math.PI*t/duration))/2:0;
}
/** Pure complete facial snapshot. Pupil coordinates are normalized within safe sclera bounds. */
export function resolveFace(config:FaceConfig,id:string,time:number,expression:ExpressionName|Expression|undefined,
  blink:number|undefined,direction:Vec3):ResolvedFace {
  validateFaceConfig(config);
  const e=expression===undefined?{name:config.defaultExpression??'neutral'}:typeof expression==='string'?{name:expression}:expression;
  if(!e||typeof e!=='object'||Array.isArray(e)||!only(e,['name','intensity','mouth','blush'])||!EXPRESSIONS.includes(e.name)||
    (e.intensity!==undefined&&!scalar(e.intensity,0,1))||(e.blush!==undefined&&!scalar(e.blush,0,1))||
    (e.mouth!==undefined&&!['auto','closed','smile','frown','open','o'].includes(e.mouth))||
    (blink!==undefined&&!scalar(blink,0,1))||!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite))throw new Error('Invalid expression, blink or eye direction');
  const yaw=Math.atan2(direction[0],direction[2]),pitch=Math.atan2(direction[1],Math.hypot(direction[0],direction[2]));
  const clamp=(v:number)=>Math.max(-1,Math.min(1,v));
  const quantize=(v:number)=>Math.round(v*256)/256||0;
  return freezeData({expression:e.name,intensity:e.intensity??1,mouth:e.mouth??'auto',blush:e.blush??0,
    blink:quantize(blink??blinkAt(time,id,config.blink)),pupil:[quantize(clamp(yaw/(Math.PI*25/180))),quantize(clamp(pitch/(Math.PI*18/180)))] as const});
}
