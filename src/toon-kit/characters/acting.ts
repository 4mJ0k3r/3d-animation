import {castFail} from './cast-error';
import {freezeData} from './pose';
import type {Side} from './constraint-types';
import type {PointIntent,TargetReference} from './cast-types';
import type {Expression,ExpressionName} from './face';

export interface ActionTiming {readonly startFrame?:number;readonly endFrame?:number;readonly duration?:number;readonly intensity?:number}
export interface GestureOptions extends ActionTiming {readonly hand?:Side|'auto'|'both'}
export const GESTURES=Object.freeze(['wave','nod','shake-head','shrug','explain','surprise','sad','worried','excited'] as const);
export type GestureName=typeof GESTURES[number];
export interface ActingGesture {readonly kind:'acting';readonly name:GestureName;readonly options:GestureOptions}
export interface TimedPoint {readonly kind:'timed-point';readonly point:PointIntent;readonly options:ActionTiming}
export interface GazeTransition {readonly kind:'turn-to';readonly target:TargetReference;readonly from?:TargetReference;readonly options:ActionTiming}
export interface ExpressionTransition {readonly kind:'expression-transition';readonly from:ExpressionName|Expression;readonly to:ExpressionName|Expression;readonly options:ActionTiming}
export interface UpperBodyMotion {readonly lean:number}
export interface ActingSample {
  readonly hands?:readonly Side[];
  readonly name:GestureName|'point';readonly weight:number;readonly envelope:number;readonly time:number;readonly progress:number;
  readonly lean:number;readonly headPitch:number;readonly headYaw:number;readonly headRoll:number;
  readonly options:GestureOptions;readonly expression:ExpressionName;
}
export const smoothStep=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*x*(10+x*(-15+6*x));};
export function validateTiming(o:ActionTiming,hand=false):void {
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!['startFrame','endFrame','duration','intensity',...(hand?['hand']:[])].includes(k))||
    Object.entries(o).some(([k,v])=>k!=='hand'&&v!==undefined&&(typeof v!=='number'||!Number.isFinite(v)))||
    (o.startFrame!==undefined&&(!Number.isInteger(o.startFrame)||o.startFrame<0))||
    (o.endFrame!==undefined&&(!Number.isInteger(o.endFrame)||o.endFrame<=(o.startFrame??0)))||
    (o.duration!==undefined&&(o.duration<=0||o.duration>120))||(o.duration!==undefined&&o.endFrame!==undefined)||
    (o.intensity!==undefined&&(o.intensity<0||o.intensity>1)))castFail('ACTION_INVALID','Use nonnegative startFrame, endFrame or positive duration seconds, and intensity 0..1.');
  if(hand&&('hand'in o)&&!['auto','both','left','right'].includes((o as GestureOptions).hand!))castFail('ACTION_INVALID','Invalid gesture hand.');
}
function gesture(name:GestureName,options:GestureOptions={}):ActingGesture {validateTiming(options,true);return freezeData({kind:'acting',name,options:{...options}});}
export const wave=(o:GestureOptions={})=>gesture('wave',o);
export const nod=(o:ActionTiming={})=>gesture('nod',o);
export const shakeHead=(o:ActionTiming={})=>gesture('shake-head',o);
export const shrug=(o:GestureOptions={})=>gesture('shrug',o);
export const explain=(o:GestureOptions={})=>gesture('explain',o);
export const surprise=(o:GestureOptions={})=>gesture('surprise',o);
export const sad=(o:ActionTiming={})=>gesture('sad',o);
export const worried=(o:ActionTiming={})=>gesture('worried',o);
export const excited=(o:GestureOptions={})=>gesture('excited',o);
export function gestureDuring(point:PointIntent,options:ActionTiming={}):TimedPoint {
  validateTiming(options);if(!point||point.kind!=='point'||!['auto','left','right'].includes(point.hand))castFail('ACTION_INVALID','gestureDuring requires pointAt(target).');
  // Target references may contain live scene objects; do not deep-freeze them.
  return Object.freeze({kind:'timed-point',point:Object.freeze({...point}),options:Object.freeze({...options})});
}
export function turnTo(target:TargetReference,options:ActionTiming&{from?:TargetReference}={}):GazeTransition {
  const {from,...timing}=options;validateTiming(timing);if(timing.intensity!==undefined)castFail('ACTION_INVALID','turnTo uses complete endpoints, not intensity.');
  return Object.freeze({kind:'turn-to',target,from,options:Object.freeze(timing)});
}
export function blendExpression(from:ExpressionName|Expression,to:ExpressionName|Expression,options:ActionTiming={}):ExpressionTransition {
  validateTiming(options);if(options.intensity!==undefined)castFail('ACTION_INVALID','Set facial intensity on expression endpoints.');
  return freezeData({kind:'expression-transition',from:typeof from==='object'?{...from}:from,to:typeof to==='object'?{...to}:to,options:{...options}});
}
export function timingProgress(options:ActionTiming,frame:number,fps:number,allowHand=false){
  validateTiming(options,allowHand);const start=options.startFrame??0,end=options.endFrame??start+(options.duration??2.4)*fps;
  if(!Number.isInteger(frame)||frame<0||!Number.isFinite(fps)||fps<=0||end-start<4)castFail('ACTION_INVALID','Animation requires valid frame/fps and at least four frames.');
  return {progress:Math.max(0,Math.min(1,(frame-start)/(end-start))),seconds:(frame-start)/fps,duration:(end-start)/fps};
}
/** Pure bounded acting profile. No scene reads, mixer, clocks or previous state. */
export function sampleActing(action:ActingGesture|TimedPoint,frame:number,fps:number):ActingSample {
  if(!action||!['acting','timed-point'].includes(action.kind)||Object.keys(action).some(k=>!(action.kind==='acting'?['kind','name','options']:['kind','point','options']).includes(k)))castFail('ACTION_INVALID','Invalid timed gesture descriptor.');
  validateTiming(action.options,action.kind==='acting');
  if(action.kind==='acting'&&!GESTURES.includes(action.name))castFail('ACTION_INVALID','Unknown semantic gesture.');
  const name=action.kind==='acting'?action.name:'point',t=timingProgress(action.options,frame,fps,action.kind==='acting'),u=t.progress;
  if(action.kind==='timed-point'&&(!action.point||action.point.kind!=='point'||!['auto','left','right'].includes(action.point.hand)))castFail('ACTION_INVALID','Invalid timed pointAt descriptor.');
  const envelope=smoothStep(u/.23)*smoothStep((1-u)/.28),weight=envelope*(action.options.intensity??(name==='point'?1:.8)),beat=Math.sin(2*Math.PI*t.seconds/1.05);
  const anticipation=u<.23?-.025*Math.sin(Math.PI*u/.23)**3:0;
  const lean=(name==='sad'||name==='worried'?.075:name==='surprise'?-.055:name==='explain'?.025*beat:name==='excited'?.045*beat:0)*weight+anticipation*weight;
  const headPitch=(name==='nod'?.18*Math.sin(2*Math.PI*t.seconds/.85):name==='sad'?.17:name==='worried'?.10:name==='surprise'?-.09:0)*weight;
  const headYaw=(name==='shake-head'?.30*Math.sin(2*Math.PI*t.seconds/1.05):0)*weight;
  const headRoll=(name==='shrug'?.09:name==='worried'?.07:name==='explain'?.035*beat:name==='excited'?.06*beat:0)*weight;
  const expression:ExpressionName=name==='explain'?'explaining':name==='surprise'?'surprised':name==='sad'?'sad':name==='worried'||name==='shrug'?'worried':name==='wave'||name==='excited'?'happy':'neutral';
  return freezeData({name,weight,envelope,time:t.seconds,progress:u,lean,headPitch,headYaw,headRoll,options:{...action.options},expression});
}
