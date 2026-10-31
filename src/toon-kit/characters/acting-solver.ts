import {add,sub,mul,dot,cross,length,unit,rotateQ} from './math';
import {poseAnchorPosition,freezeData} from './pose';
import {rootToWorld,worldToRoot,directionToWorld} from './pose-space';
import {solveContactPoseWithPoles} from './constraints';
import {solvePointing} from './pointing';
import {reachTo,worldPoint} from './targets';
import {castFail} from './cast-error';
import {smoothStep,timingProgress,validateTiming} from './acting';
import type {ActingSample,TimedPoint,UpperBodyMotion,GazeTransition} from './acting';
import type {CharacterDefinition,CharacterPose,Vec3} from './types';
import type {ContactRequest,ContactResult,Side,LevelFrame} from './constraint-types';
import type {ResolvedPointing} from './cast-types';

/** Direction-space interpolation; deterministic antipodal meridian, no zero vector. */
export function blendDirection(from:Vec3,to:Vec3,t:number):Vec3 {
  const a=unit(from),b=unit(to),cos=Math.max(-1,Math.min(1,dot(a,b)));
  if(cos>.999999)return unit(add(mul(a,1-t),mul(b,t)));
  let perpendicular=sub(b,mul(a,cos));
  if(length(perpendicular)<1e-7){const hint:Vec3=Math.abs(a[1])<.9?[0,1,0]:[1,0,0];perpendicular=sub(hint,mul(a,dot(a,hint)));}
  const v=unit(perpendicular),angle=Math.acos(cos)*t;
  return add(mul(a,Math.cos(angle)),mul(v,Math.sin(angle)));
}

const project=(v:Vec3,axis:Vec3)=>sub(v,mul(axis,dot(v,axis)));
function rotateAxis(v:Vec3,axis:Vec3,angle:number):Vec3 {
  return add(add(mul(v,Math.cos(angle)),mul(cross(axis,v),Math.sin(angle))),mul(axis,dot(axis,v)*(1-Math.cos(angle))));
}
function transport(v:Vec3,from:Vec3,to:Vec3):Vec3 {
  const axis=cross(from,to),s=length(axis),c=Math.max(-1,Math.min(1,dot(from,to)));
  if(s>1e-8)return rotateAxis(v,mul(axis,1/s),Math.atan2(s,c));
  if(c>0)return v;
  const hint:Vec3=Math.abs(from[1])<.9?[0,1,0]:[1,0,0];return rotateAxis(v,unit(project(hint,from)),Math.PI);
}
/** Parallel transport avoids a collapsing elbow plane when a hand rises past
 * shoulder height. Its remaining roll is blended about the current arm axis. */
function blendPole(a:Vec3,b:Vec3,elbowA:Vec3,elbowB:Vec3,fallback:Vec3,w:number):Vec3 {
  const from=unit(a),to=unit(b),axis=blendDirection(a,b,w);
  const rawA=project(elbowA,from),rawB=project(elbowB,to);
  const base=unit(length(rawA)>1e-8?rawA:project(fallback,from)),goal=unit(rawB);
  const p=unit(project(transport(base,from,axis),axis)),q=unit(project(transport(goal,to,axis),axis));
  const c=Math.max(-1,Math.min(1,dot(p,q))),s=dot(axis,cross(p,q));
  // Anatomical side resolves the exactly opposite roll toward the rear, rather
  // than allowing a numerical ±pi sign to select a different elbow path.
  const angle=c<-.999999?-(fallback[0]>=0?1:-1)*Math.PI:Math.atan2(s,c);
  return rotateAxis(p,axis,angle*w);
}

export function resolveTurn(def:CharacterDefinition,pose:CharacterPose,parent:LevelFrame,look:GazeTransition,frame:number,fps:number,target:Vec3,from:Vec3|null):Vec3 {
  if(Object.keys(look).some(k=>!['kind','target','from','options'].includes(k)))castFail('ACTION_INVALID','Invalid turnTo descriptor.');
  validateTiming(look.options);if(look.options.intensity!==undefined)castFail('ACTION_INVALID','turnTo cannot use intensity.');
  const head=rootToWorld(pose,parent,poseAnchorPosition(pose,def.anchors.head)),forward=directionToWorld(pose,parent,rotateQ(pose.torso.quaternion,[0,0,1]));
  const a=from?sub(from,head):forward,b=sub(target,head),valid=(v:Vec3)=>length(v)>1e-8?v:forward;
  return add(head,blendDirection(valid(a),valid(b),smoothStep(timingProgress(look.options,frame,fps).progress)));
}

/** Construct anatomical targets; all final bones still come from Stage 2B IK. */
export function solveActingArms(def:CharacterDefinition,baseline:Extract<ContactResult,{ok:true}>,request:ContactRequest,
  sample:ActingSample,pointAction:TimedPoint|null,pointTarget:Vec3|null,motion:UpperBodyMotion){
  if(sample.weight===0)return {result:baseline,pointing:null as ResolvedPointing|null,hands:[] as Side[]};
  const p=def.proportions,parent=request.parent??{position:[0,0,0] as Vec3,yaw:0,scale:1},pose=baseline.pose;
  const occupied=new Set((request.reaches??[]).map(r=>r.hand)),free=(['right','left'] as const).filter(s=>!occupied.has(s));
  const armAction=['wave','explain','shrug','surprise','excited','point'].includes(sample.name);
  if(!armAction)return {result:baseline,pointing:null as ResolvedPointing|null,hands:[] as Side[]};
  const selection=pointAction?.point.hand??sample.options.hand??'auto';
  let hands:Side[];
  if(selection==='auto')hands=sample.name==='wave'||sample.name==='point'?free.slice(0,1):[...free];
  else hands=selection==='both'?['left','right']:[selection];
  if(!hands.length||hands.some(s=>occupied.has(s)))castFail('INTENT_CONFLICT','Gesture arm is reserved by a physical reach; select a free hand or a head-only gesture.');
  let fullPoint:ResolvedPointing|null=null;
  const goals=new Map<Side,{hand:Vec3;elbow:Vec3}>();
  if(pointAction){
    if(!pointTarget)castFail('ACTION_INVALID','Missing timed pointing target.');
    const full=solvePointing(def,baseline,request,pointTarget,hands[0],motion);fullPoint=full.pointing;
    goals.set(hands[0],{hand:worldToRoot(pose,parent,full.pointing.handWorld),elbow:worldToRoot(pose,parent,full.pointing.elbowWorld)});
  }else for(const side of hands){
    const sign=side==='left'?1:-1,beat=Math.sin(2*Math.PI*sample.time/1.05+(side==='left'?.7:0));
    let a=.7,b=.85,sag=.20;
    if(sample.name==='wave'){a=1.8;b=1.1+.18*beat;sag=.08;}
    if(sample.name==='explain'){a=.85+.15*beat;b=1.2+.20*beat;sag=.26+.12*beat;}
    if(sample.name==='shrug'){a=.85;b=1.35;sag=.14;}
    if(sample.name==='surprise'){a=1.35;b=1.15;sag=.12;}
    if(sample.name==='excited'){a=1.5+.10*beat;b=1.3+.15*beat;sag=.15;}
    const direction=(angle:number,z:number):Vec3=>rotateQ(pose.torso.quaternion,unit([sign*Math.sin(angle),-Math.cos(angle),z]));
    const shoulder=poseAnchorPosition(pose,def.anchors[`${side}Shoulder`]),elbow=add(shoulder,mul(direction(a,sag),p.upperArmLength));
    goals.set(side,{elbow,hand:add(elbow,mul(direction(a+b,sag+.12),p.lowerArmLength))});
  }
  const reaches=[...(request.reaches??[])],poles:Partial<Record<Side,Vec3>>={};
  // Keep all unreserved baseline arms exact, including walking swing. Blend
  // shoulder-relative direction/radius and bend hints, never finished IK rotations.
  for(const side of ['left','right'] as const){
    if(occupied.has(side))continue;
    const shoulder=poseAnchorPosition(pose,def.anchors[`${side}Shoulder`]),hand=poseAnchorPosition(pose,def.anchors[`${side}Wrist`]),elbow=poseAnchorPosition(pose,def.anchors[`${side}Elbow`]),goal=goals.get(side);
    let endpoint=hand,pole=sub(elbow,shoulder);
    if(goal){const a=sub(hand,shoulder),b=sub(goal.hand,shoulder),w=sample.weight;
      endpoint=add(shoulder,mul(blendDirection(a,b,w),length(a)*(1-w)+length(b)*w));
      pole=blendPole(a,b,pole,sub(goal.elbow,shoulder),rotateQ(pose.torso.quaternion,[side==='left'?1:-1,0,0]),w);
    }
    reaches.push(reachTo(side,worldPoint(rootToWorld(pose,parent,endpoint))));poles[side]=pole;
  }
  const result=solveContactPoseWithPoles(def,{...request,reaches},poles,motion);
  if(!result.ok)castFail('ACTION_UNREACHABLE','Gesture transition cannot satisfy body/limb clearance. Use a smaller intensity, another hand or different proportions.',undefined,result.diagnostics);
  let pointing:ResolvedPointing|null=null;
  if(fullPoint){const side=fullPoint.hand,elbow=poseAnchorPosition(result.pose,def.anchors[`${side}Elbow`]),hand=poseAnchorPosition(result.pose,def.anchors[`${side}Wrist`]),shoulder=poseAnchorPosition(result.pose,def.anchors[`${side}Shoulder`]);
    const direction=unit(sub(hand,elbow));pointing={...fullPoint,elbowWorld:rootToWorld(result.pose,parent,elbow),handWorld:rootToWorld(result.pose,parent,hand),directionWorld:directionToWorld(result.pose,parent,direction),bend:Math.acos(Math.max(-1,Math.min(1,dot(unit(sub(elbow,shoulder)),direction)))),weight:sample.weight,aligned:sample.weight===1};}
  return freezeData({result,pointing,hands});
}
