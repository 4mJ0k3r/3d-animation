import {solveContactPoseWithPoles} from './constraints';
import {poseAnchorPosition,freezeData} from './pose';
import {worldPoint,reachTo} from './targets';
import {worldToRoot,rootToWorld,directionToWorld} from './pose-space';
import {add,sub,mul,dot,length,unit,distance} from './math';
import {castFail} from './cast-error';
import type {CharacterDefinition,Vec3} from './types';
import type {ContactRequest,ContactResult,Side} from './constraint-types';
import type {ResolvedPointing} from './cast-types';
import type {UpperBodyMotion} from './acting';

/** Bounded candidate construction; every limb solve and clearance check stays in Stage 2B. */
export function solvePointing(definition:CharacterDefinition,base:Extract<ContactResult,{ok:true}>,request:ContactRequest,
  target:Vec3,hand:Side|'auto',motion?:UpperBodyMotion):{result:Extract<ContactResult,{ok:true}>;pointing:ResolvedPointing} {
  const parent=request.parent??{position:[0,0,0] as Vec3,yaw:0,scale:1},pose=base.pose;
  const local=worldToRoot(pose,parent,target),occupied=new Set((request.reaches??[]).map(r=>r.hand));
  const rootCenter=poseAnchorPosition(pose,definition.anchors.torso),offset=sub(local,rootCenter);
  const preferred:Side=Math.abs(offset[0])<Math.abs(offset[2])*.27?'right':offset[0]>=0?'left':'right';
  const hands:Side[]=hand==='auto'?[preferred,preferred==='left'?'right':'left']:[hand];
  const available=hands.filter(side=>!occupied.has(side));
  if(!available.length)castFail('INTENT_CONFLICT','Pointing and reaching cannot control the same arm.');
  let attempts=0;
  for(const side of available) {
    const shoulder=poseAnchorPosition(pose,definition.anchors[`${side}Shoulder`]),delta=sub(local,shoulder);
    if(length(delta)<1e-8)continue;
    const forward=unit(delta),sign=side==='left'?1:-1,p=definition.proportions;
    for(const pole of [[sign,-.35,-.25],[sign,-.7,0],[sign,0,0],[sign,.25,-.3]] as Vec3[]) {
      let lateral=sub(pole,mul(forward,dot(pole,forward)));
      if(length(lateral)<1e-8)lateral=sub([0,-1,0],mul(forward,dot([0,-1,0],forward)));
      if(length(lateral)<1e-8)continue;
      lateral=unit(lateral);
      for(const angle of [Math.PI/4,Math.PI/3,Math.PI/6,Math.PI*5/12]) {
        attempts++;
        const elbow=add(shoulder,mul(add(mul(forward,Math.cos(angle)),mul(lateral,Math.sin(angle))),p.upperArmLength));
        const aim=sub(local,elbow);
        if(length(aim)<=p.lowerArmLength+p.handRadius)continue;
        const goal=add(elbow,mul(unit(aim),p.lowerArmLength));
        const candidate=solveContactPoseWithPoles(definition,{...request,reaches:[...(request.reaches??[]),reachTo(side,worldPoint(rootToWorld(pose,parent,goal)))]},
          {[side]:sub(elbow,shoulder)},motion);
        if(!candidate.ok)continue;
        const actualElbow=poseAnchorPosition(candidate.pose,definition.anchors[`${side}Elbow`]);
        const actualHand=poseAnchorPosition(candidate.pose,definition.anchors[`${side}Wrist`]);
        const upper=unit(sub(actualElbow,shoulder)),lower=unit(sub(actualHand,actualElbow));
        const bend=Math.acos(Math.max(-1,Math.min(1,dot(upper,lower))));
        if(bend<Math.PI*25/180||bend>Math.PI*105/180||dot(lower,unit(sub(local,actualHand)))<1-1e-8)continue;
        return freezeData({result:candidate,pointing:{hand:side,targetWorld:[...target],elbowWorld:rootToWorld(pose,parent,actualElbow),
          handWorld:rootToWorld(pose,parent,actualHand),directionWorld:directionToWorld(pose,parent,lower),bend,attempts}});
      }
    }
  }
  const coincident=available.some(side=>distance(local,poseAnchorPosition(pose,definition.anchors[`${side}Shoulder`]))<1e-8);
  castFail(coincident?'POINTING_COINCIDENT':'POINTING_UNREACHABLE','No clear, readable pointing pose satisfies the requested arm and target.',undefined,{attempts});
}
