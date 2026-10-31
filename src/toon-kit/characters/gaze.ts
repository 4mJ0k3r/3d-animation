import {canonicalQ,inverseQ,multiplyQ,rotateQ,sub,length,unit} from './math';
import {freezeData,poseAnchorPosition} from './pose';
import {directionToWorld,worldToRoot} from './pose-space';
import type {CharacterDefinition,CharacterPose,Vec3} from './types';
import type {LevelFrame} from './constraint-types';
import type {CastDiagnostic,ResolvedGaze} from './cast-types';

export const GAZE_LIMITS=Object.freeze({yaw:Math.PI/3,pitch:Math.PI*25/180});
/** Head-center rotation preserves the spherical head/neck overlap and all contacts. */
export function solveHeadGaze(definition:CharacterDefinition,pose:CharacterPose,parent:LevelFrame,target:Vec3|null):{
  pose:CharacterPose;gaze:ResolvedGaze;diagnostics:readonly CastDiagnostic[];
} {
  const diagnostics:CastDiagnostic[]=[],head=poseAnchorPosition(pose,definition.anchors.head);
  const delta=target?sub(worldToRoot(pose,parent,target),head):[0,0,1] as Vec3;
  const coincident=length(delta)<1e-10;
  const direction=coincident?[0,0,1] as Vec3:unit(delta);
  const horizontal=Math.hypot(direction[0],direction[2]);
  const x=Math.abs(direction[0])<1e-12?0:direction[0];
  const desiredYaw=horizontal<1e-10?0:Math.atan2(x,direction[2]),desiredPitch=-Math.atan2(direction[1],horizontal);
  const clamp=(value:number,max:number)=>Math.max(-max,Math.min(max,value));
  const yaw=clamp(desiredYaw,GAZE_LIMITS.yaw),pitch=clamp(desiredPitch,GAZE_LIMITS.pitch);
  const limited=Math.abs(yaw-desiredYaw)>1e-10||Math.abs(pitch-desiredPitch)>1e-10;
  const q=multiplyQ([0,Math.sin(yaw/2),0,Math.cos(yaw/2)],[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]);
  if(coincident&&target)diagnostics.push({code:'GAZE_COINCIDENT',severity:'info',message:'Coincident head target resolves to neutral forward gaze.'});
  if(limited)diagnostics.push({code:'GAZE_LIMITED',severity:'info',message:'Target exceeds the head yaw/pitch bounds; remaining direction is exposed for future eyes.'});
  const result:CharacterPose={...pose,head:{...pose.head,quaternion:canonicalQ(q)}};
  return freezeData({pose:result,gaze:{targetWorld:target?[...target]:null,desiredWorldDirection:directionToWorld(pose,parent,direction),
    headWorldDirection:directionToWorld(pose,parent,rotateQ(q,[0,0,1])),eyeLocalDirection:rotateQ(inverseQ(q),direction),yaw,pitch,limited},diagnostics});
}
