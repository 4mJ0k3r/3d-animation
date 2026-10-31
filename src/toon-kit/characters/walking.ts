import {freezeData} from './pose';
import {castFail} from './cast-error';
import {resolveWalkingPath} from './walk-path';
import {yawPoint,add} from './math';
import type {WalkingPathReference} from './walk-path';
import type {CharacterDefinition,Vec3} from './types';
import type {WalkingContact,Side} from './constraint-types';
export interface WalkOptions {readonly startFrame?:number;readonly endFrame?:number;readonly speed?:number;readonly strideScale?:number}
export interface WalkAlong {readonly kind:'walk-along';readonly path:WalkingPathReference;readonly options:WalkOptions}
export interface WalkState {
  readonly phase:'idle-before'|'starting'|'walking'|'stopping'|'idle-after';
  readonly distance:number;readonly length:number;readonly yaw:number;readonly stepCount:number;readonly stepPhase:number;
  readonly startFrame:number;readonly endFrame:number;readonly swing:number;
  readonly activity:number;
  readonly feet:WalkingContact['feet'];
  readonly arms?:Readonly<Record<Side,'reach'|'point'|'gesture'|'swing'|'rest'>>;readonly swingWeight?:number;
}
const ease=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*x*(10+x*(-15+6*x));};
export function walkAlong(path:WalkingPathReference,options:WalkOptions={}):WalkAlong {
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['startFrame','endFrame','speed','strideScale'].includes(k)))castFail('WALK_INVALID','Unknown walking options.');
  return Object.freeze({kind:'walk-along',path,options:Object.freeze({...options})});
}
/** Pure finite footstep schedule; all world plants are derived from absolute step indices. */
export function planWalk(definition:CharacterDefinition,intention:WalkAlong,frame:number,fps:number,worldScale:number):{support:WalkingContact;state:WalkState} {
  if(!intention||intention.kind!=='walk-along'||Object.keys(intention).some(k=>!['kind','path','options'].includes(k))||!intention.options||typeof intention.options!=='object'||Array.isArray(intention.options)||Object.keys(intention.options).some(k=>!['startFrame','endFrame','speed','strideScale'].includes(k)))castFail('WALK_INVALID','Use a complete walkAlong descriptor; seated and walking supports cannot be combined.');
  const path=resolveWalkingPath(intention.path),o=intention.options,start=o.startFrame??0,stride=o.strideScale??1;
  if(!Number.isFinite(worldScale)||worldScale<=0||!Number.isInteger(frame)||frame<0||!Number.isFinite(fps)||fps<=0||!Number.isInteger(start)||start<0||
    !Number.isFinite(stride)||stride<.2||stride>4||(o.endFrame!==undefined&&o.speed!==undefined))castFail('WALK_INVALID','Supply valid frame/fps, startFrame, strideScale .2..4 and either endFrame or speed.');
  const p=definition.proportions,L=p.upperLegLength+p.lowerLegLength,nominal=.35*L*worldScale*stride,N=Math.max(1,Math.ceil(path.length/nominal));
  if(N>4096)castFail('WALK_INVALID','A single walk supports at most 4096 steps.');
  const a=path.length/N,T=N+1,speed=o.speed??Math.min(.65*L*worldScale,2*a);
  if(!Number.isFinite(speed)||speed<=0)castFail('WALK_INVALID','Walking speed must be positive and finite.');
  const end=o.endFrame??start+T*a/speed*fps;
  if(!Number.isFinite(end)||end<=start||(o.endFrame!==undefined&&!Number.isInteger(end)))castFail('WALK_INVALID','endFrame must be an integer after startFrame.');
  if(T/((end-start)/fps)>5)castFail('WALK_SPEED','Requested duration/speed exceeds five footsteps per second.');
  const q=Math.max(0,Math.min(T,(frame-start)/(end-start)*T)),j=Math.min(N,Math.floor(q)),u=q-j;
  const ramp=(v:number)=>v*v*v-.5*v*v*v*v;
  const distance=q<1?a*ramp(q):q>N?path.length-a*ramp(T-q):a*(q-.5),root=path.sample(distance);
  const factor=Math.min(1,a/(.25*L*worldScale)),activation=ease(q)*ease(T-q),lift=Math.min(.075*L*worldScale,a*.30);
  function station(s:number,side:Side){const sampled=path.sample(s);const hip=definition.restPose[`${side}Hip`].position[0];return {position:add(sampled.position,yawPoint([hip*worldScale,0,p.shoeLength*.15*worldScale],sampled.yaw)),yaw:sampled.yaw};}
  const feet={} as Record<Side,WalkingContact['feet'][Side]>;
  for(const side of ['left','right'] as const){
    const parity=side==='left'?0:1,k=j-1-((j-1-parity)%2+2)%2,previousDistance=k<0?0:Math.min((k+1)*a,path.length),from=station(previousDistance,side);
    const swinging=q>0&&q<T&&j%2===parity;
    if(swinging){const to=station(Math.min((j+1)*a,path.length),side),blend=ease(u);feet[side]={position:[from.position[0]+(to.position[0]-from.position[0])*blend,path.floor+lift*Math.sin(Math.PI*blend)**2,from.position[2]+(to.position[2]-from.position[2])*blend],yaw:from.yaw+(to.yaw-from.yaw)*blend,state:'swing',step:j};}
    else {const endpoint=q>=T?station(path.length,side):from;feet[side]={...endpoint,state:'floor',step:q>=T?N:k};}
  }
  const support:WalkingContact={kind:'walk',floor:{kind:'floor',height:path.floor},at:[root.position[0],root.position[2]],yaw:root.yaw,
    pelvisHeight:.6*p.shoeHeight+L-L*(.045+.015*Math.cos(2*Math.PI*q))*activation*factor,feet};
  const phase=frame<=start?'idle-before':frame>=end?'idle-after':q<1?'starting':q>N?'stopping':'walking';
  return freezeData({support,state:{phase,distance,length:path.length,yaw:root.yaw,stepCount:T,stepPhase:q,startFrame:start,endFrame:end,swing:.22*activation*factor*Math.sin(Math.PI*q),activity:activation*factor,feet}});
}
