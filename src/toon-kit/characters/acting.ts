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
  const envelope=smoothStep(u/.23)*smoothStep((1-u)/.28),intensity=action.options.intensity??(name==='point'?1:.8),weight=envelope*intensity;
  const antProgress=u<.22?u/.22:0,antPulse=u<.22?Math.sin(Math.PI*antProgress)**2*(1-antProgress)*intensity:0;
  const osProgress=(u>=.18&&u<.45)?(u-.18)/.27:0,osPulse=(u>=.18&&u<.45)?Math.sin(Math.PI*osProgress)**2*(1-osProgress)*intensity:0;
  const beat=Math.sin(2*Math.PI*t.seconds/1.05),beatCadence=Math.sin(2*Math.PI*t.seconds/.95),beatPhrase=Math.sin(2*Math.PI*t.seconds/1.80+.45);
  const bounceBeat=Math.sin(2*Math.PI*t.seconds/.55),nodBeat=Math.sin(2*Math.PI*t.seconds/.85);
  let lean=0,headPitch=0,headYaw=0,headRoll=0;
  if(name==='surprise'){
    lean=.040*antPulse-.035*osPulse-.052*weight;
    headPitch=.060*antPulse-.045*osPulse-.085*weight;
    headRoll=.025*weight;
  }else if(name==='point'){
    lean=-.035*antPulse+.020*osPulse+.020*weight;
    headPitch=-.025*antPulse+.018*osPulse+.014*weight;
  }else if(name==='explain'){
    lean=-.025*antPulse+(.022+.008*beatCadence)*weight;
    headPitch=(.035+.022*beatCadence)*weight;
    headRoll=.038*beatPhrase*weight;
    headYaw=.020*beatCadence*weight;
  }else if(name==='shrug'){
    lean=.030*antPulse-.018*osPulse-.022*weight;
    headPitch=.040*antPulse-.020*osPulse-.035*weight;
    headRoll=.095*weight;
  }else if(name==='wave'){
    const waveHand=(action.kind==='acting'?action.options.hand:undefined)??'auto',rollDir=waveHand==='left'?.050:-.050;
    lean=.020*antPulse-(.018-.006*beat)*weight;
    headPitch=-.028*weight;
    headRoll=rollDir*weight;
  }else if(name==='excited'){
    lean=(.035+.025*bounceBeat)*weight;
    headPitch=.045*bounceBeat*weight;
    headRoll=.055*Math.sin(2*Math.PI*t.seconds/1.10)*weight;
  }else if(name==='nod'){
    lean=.012*nodBeat*weight;
    headPitch=.18*nodBeat*weight;
  }else if(name==='shake-head'){
    headYaw=.30*beat*weight;
    headRoll=.025*Math.sin(2*Math.PI*t.seconds/2.10)*weight;
    lean=.008*Math.sin(2*Math.PI*t.seconds/2.10)*weight;
  }else if(name==='sad'){
    lean=(.075+.006*Math.sin(2*Math.PI*t.seconds/2.2))*weight;
    headPitch=.17*weight;
    headRoll=.020*weight;
  }else if(name==='worried'){
    lean=.075*weight;
    headPitch=.10*weight;
    headRoll=.070*weight;
  }
  const expression:ExpressionName=name==='explain'?'explaining':name==='surprise'?'surprised':name==='sad'?'sad':name==='worried'||name==='shrug'?'worried':name==='wave'||name==='excited'?'happy':'neutral';
  return freezeData({name,weight,envelope,time:t.seconds,progress:u,lean,headPitch,headYaw,headRoll,options:{...action.options},expression});
}
