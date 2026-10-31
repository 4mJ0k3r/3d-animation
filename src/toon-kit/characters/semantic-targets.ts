import * as THREE from 'three';
import {levelFloor} from './targets';
import type {AnchorName,Vec3} from './types';
import type {FloorTarget,Side,SittingContact} from './constraint-types';
import type {ActorTarget,DerivedMark,FrameInput,FrameTarget,LookIntent,PointIntent,SceneMark,ScenePoint,SceneSeat,SemanticReach,SitAt,StandAt,TargetAlias,TargetDefinition,TargetLibrary,TargetReference,WorldMark} from './cast-types';

const copy=(v:Vec3):Vec3=>Object.freeze([...v]) as Vec3;
export const worldMark=(position:Vec3,yaw=0):WorldMark=>Object.freeze({kind:'mark',position:copy(position),yaw});
export const scenePoint=(object:THREE.Object3D,local:Vec3=[0,0,0]):ScenePoint=>Object.freeze({kind:'scene-point',object,local:copy(local)});
export const sceneMark=(object:THREE.Object3D,local:Vec3=[0,0,0],yaw=0):SceneMark=>Object.freeze({kind:'scene-mark',object,local:copy(local),yaw});
/** Infer a rigid mesh's top surface once; its current world transform is read each frame. */
export function sceneSeat(object:THREE.Object3D,options:{surface?:Vec3;width?:number;depth?:number;thickness?:number}={}):SceneSeat {
  let box:THREE.Box3|null=null;
  if(object instanceof THREE.Mesh&&object.geometry.attributes.position)box=new THREE.Box3().setFromBufferAttribute(object.geometry.attributes.position);
  const surface:Vec3=options.surface??(box?[(box.min.x+box.max.x)/2,box.max.y,(box.min.z+box.max.z)/2]:[0,0,0]);
  return Object.freeze({kind:'scene-seat',object,surface:copy(surface),width:options.width??(box?box.max.x-box.min.x:NaN),
    depth:options.depth??(box?box.max.z-box.min.z:NaN),thickness:options.thickness??(box?box.max.y-box.min.y:NaN)});
}
export const aliasTarget=(name:string):TargetAlias=>Object.freeze({kind:'alias',name});
export const frameTarget=(resolve:(frame:FrameInput)=>TargetDefinition):FrameTarget=>Object.freeze({kind:'frame-target',resolve});
export const markFrom=(target:TargetReference,yaw=0):DerivedMark=>Object.freeze({kind:'derived-mark',target,yaw});
export function createTargets(entries:Readonly<Record<string,TargetDefinition>>):TargetLibrary {
  const library:TargetLibrary={entries:Object.freeze({...entries}),target:(name)=>Object.freeze({kind:'named',library,name}),
    mark:(name)=>library.target(name),seat:(name)=>library.target(name)};
  return Object.freeze(library);
}
export const characterTarget=(actor:string,anchor:AnchorName='head',phase:ActorTarget['phase']='support'):ActorTarget=>Object.freeze({kind:'actor',actor,anchor,phase});
export const standAt=(target:TargetReference,options:{crouch?:number}={}):StandAt=>Object.freeze({kind:'stand-at',target,crouch:options.crouch??0});
export const sitAt=(target:TargetReference,options:{floor?:FloorTarget;feet?:SittingContact['feet']}={}):SitAt=>Object.freeze({kind:'sit-at',target,floor:options.floor??levelFloor(),feet:options.feet??'auto'});
export const lookAt=(target:TargetReference):LookIntent=>Object.freeze({kind:'look',target});
export const pointAt=(target:TargetReference,options:{hand?:Side|'auto'}={}):PointIntent=>Object.freeze({kind:'point',target,hand:options.hand??'auto'});
export const reachFor=(hand:Side,target:TargetReference):SemanticReach=>Object.freeze({hand,target});
