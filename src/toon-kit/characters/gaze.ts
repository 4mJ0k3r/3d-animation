import {canonicalQ,inverseQ,multiplyQ,rotateQ,sub,length,unit} from './math';
import {freezeData,poseAnchorPosition} from './pose';
import {directionToWorld,worldToRoot} from './pose-space';
import type {CharacterDefinition,CharacterPose,Vec3} from './types';
import type {LevelFrame} from './constraint-types';
import type {CastDiagnostic,ResolvedGaze} from './cast-types';
import type {ActingSample} from './acting';

export const GAZE_LIMITS=Object.freeze({yaw:Math.PI/3,pitch:Math.PI*25/180});
/** Head-center rotation preserves the spherical head/neck overlap and all contacts. */
export function solveHeadGaze(definition:CharacterDefinition,pose:CharacterPose,parent:LevelFrame,target:Vec3|null,acting?:ActingSample):{
  pose:CharacterPose;gaze:ResolvedGaze;diagnostics:readonly CastDiagnostic[];
} {
  const diagnostics:CastDiagnostic[]=[],head=poseAnchorPosition(pose,definition.anchors.head);
  const body=pose.torso.quaternion;
  const delta=target?rotateQ(inverseQ(body),sub(worldToRoot(pose,parent,target),head)):[0,0,1] as Vec3;
  const coincident=length(delta)<1e-10;
  const direction=coincident?[0,0,1] as Vec3:unit(delta);
  const horizontal=Math.hypot(direction[0],direction[2]);
  const x=Math.abs(direction[0])<1e-12?0:direction[0];
  const desiredYaw=horizontal<1e-10?0:Math.atan2(x,direction[2]),desiredPitch=-Math.atan2(direction[1],horizontal);
  const clamp=(value:number,max:number)=>Math.max(-max,Math.min(max,value));
  const requestedYaw=desiredYaw+(acting?.headYaw??0),requestedPitch=desiredPitch+(acting?.headPitch??0);
  const yaw=clamp(requestedYaw,GAZE_LIMITS.yaw),pitch=clamp(requestedPitch,GAZE_LIMITS.pitch);
  const limited=Math.abs(yaw-requestedYaw)>1e-10||Math.abs(pitch-requestedPitch)>1e-10;
  const roll=acting?.headRoll??0,aim=multiplyQ([0,Math.sin(yaw/2),0,Math.cos(yaw/2)],[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]);
  const q=roll?multiplyQ(aim,[0,0,Math.sin(roll/2),Math.cos(roll/2)]):aim;
  if(coincident&&target)diagnostics.push({code:'GAZE_COINCIDENT',severity:'info',message:'Coincident head target resolves to neutral forward gaze.'});
  if(limited)diagnostics.push({code:'GAZE_LIMITED',severity:'info',message:'Requested head direction exceeds yaw/pitch bounds; residual direction is passed to the eyes.'});
  const result:CharacterPose={...pose,head:{...pose.head,quaternion:canonicalQ(q)}};
  return freezeData({pose:result,gaze:{targetWorld:target?[...target]:null,desiredWorldDirection:directionToWorld(pose,parent,rotateQ(body,direction)),
    headWorldDirection:directionToWorld(pose,parent,rotateQ(body,rotateQ(q,[0,0,1]))),eyeLocalDirection:rotateQ(inverseQ(q),direction),yaw,pitch,limited},diagnostics});
}
