import type * as THREE from 'three';
import type {AnchorName,CharacterColors,CharacterPose,CharacterProportions,Vec3} from './types';
import type {ArmReach,ContactState,ConstraintDiagnostic,FloorTarget,LevelFrame,PointTarget,SeatTarget,Side,SittingContact,StandingContact} from './constraint-types';
import type {CharacterRig} from './rig';
import type {ExpressionName,Expression,FaceConfig,ResolvedFace} from './face';

export interface FrameInput {readonly frame:number;readonly fps:number;readonly time:number}
export interface WorldMark {readonly kind:'mark';readonly position:Vec3;readonly yaw:number}
export interface NamedTarget {readonly kind:'named';readonly library:TargetLibrary;readonly name:string}
export interface ActorTarget {readonly kind:'actor';readonly actor:string;readonly anchor:AnchorName;readonly phase:'support'|'final';readonly scope?:object}
export interface ScenePoint {readonly kind:'scene-point';readonly object:THREE.Object3D;readonly local:Vec3}
export interface SceneMark {readonly kind:'scene-mark';readonly object:THREE.Object3D;readonly local:Vec3;readonly yaw:number}
export interface SceneSeat {readonly kind:'scene-seat';readonly object:THREE.Object3D;readonly surface:Vec3;readonly width:number;readonly depth:number;readonly thickness:number}
export interface TargetAlias {readonly kind:'alias';readonly name:string}
export interface FrameTarget {readonly kind:'frame-target';readonly resolve:(frame:FrameInput)=>TargetDefinition}
export interface DerivedMark {readonly kind:'derived-mark';readonly target:TargetReference;readonly yaw:number}
export type TargetReference=PointTarget|WorldMark|SeatTarget|NamedTarget|ActorTarget|ScenePoint|SceneMark|SceneSeat|DerivedMark|FrameTarget;
export type TargetDefinition=TargetReference|TargetAlias;
export interface TargetLibrary {
  readonly entries:Readonly<Record<string,TargetDefinition>>;
  target(name:string):NamedTarget;
  mark(name:string):NamedTarget;
  seat(name:string):NamedTarget;
}
export type ResolvedTarget={readonly kind:'point';readonly position:Vec3}|WorldMark|SeatTarget;
export interface StandAt {readonly kind:'stand-at';readonly target:TargetReference;readonly crouch:number}
export interface SitAt {readonly kind:'sit-at';readonly target:TargetReference;readonly floor:FloorTarget;readonly feet:SittingContact['feet']}
export type CastStance=StandAt|SitAt|StandingContact|SittingContact|import('./walking').WalkAlong;
export interface LookIntent {readonly kind:'look';readonly target:TargetReference}
export interface PointIntent {readonly kind:'point';readonly target:TargetReference;readonly hand:Side|'auto'}
export interface SemanticReach {readonly hand:Side;readonly target:TargetReference}
export interface ActorIntent {
  readonly expression?:ExpressionName|Expression;
  readonly blink?:number;
  /** Optional eyes-only target; omission follows residual head gaze. */
  readonly eyeGaze?:LookIntent;
  readonly stance?:CastStance;
  readonly gaze?:LookIntent;
  readonly gesture?:PointIntent;
  readonly reaches?:readonly (SemanticReach|ArmReach)[];
  readonly scale?:number;
  readonly visible?:boolean;
}
export interface CastActorOptions {
  readonly appearance?:import('./appearance').Appearance;
  readonly face?:FaceConfig|false;
  readonly proportions?:Partial<CharacterProportions>;
  readonly colors?:CharacterColors;
  readonly stance?:CastStance;
  readonly scale?:number;
  readonly parent?:THREE.Object3D;
}
export interface CastActor {
  readonly appearance?:import('./appearance').ResolvedAppearance;
  readonly root:THREE.Group;
  readonly definition:CharacterRig['definition'];
  target(anchor?:AnchorName,phase?:ActorTarget['phase']):ActorTarget;
}
export type CastCode='INVALID_CAST_REQUEST'|'UNKNOWN_ACTOR'|'TARGET_MISSING'|'TARGET_INVALID'|'TARGET_CYCLE'|
  'TARGET_DEPTH'|'TARGET_CALLBACK_FAILED'|'TARGET_PHASE'|'ACTOR_SCENE_TARGET'|'INVALID_PARENT'|
  'CONTACT_FAILED'|'INTENT_CONFLICT'|'POINTING_UNREACHABLE'|'POINTING_COINCIDENT'|'GAZE_LIMITED'|
  'GAZE_COINCIDENT'|'CAST_DISPOSED'|'POSE_PREFLIGHT'|'FACE_INVALID'|'APPEARANCE_INVALID'|
  'PATH_INVALID'|'WALK_INVALID'|'WALK_SPEED'|'WALK_UNREACHABLE'|'WALK_ARM_YIELD';
export interface CastDiagnostic {readonly code:CastCode;readonly severity:'info'|'error';readonly message:string;readonly actor?:string;readonly details?:unknown}
export interface ResolvedGaze {
  readonly targetWorld:Vec3|null;
  readonly desiredWorldDirection:Vec3;
  readonly headWorldDirection:Vec3;
  readonly eyeLocalDirection:Vec3;
  readonly yaw:number;readonly pitch:number;readonly limited:boolean;
}
export interface ResolvedPointing {
  readonly hand:Side;readonly targetWorld:Vec3;readonly elbowWorld:Vec3;readonly handWorld:Vec3;
  readonly directionWorld:Vec3;readonly bend:number;readonly attempts:number;
}
export interface CastFrameRequest {readonly frame:number;readonly fps:number;readonly poses?:Readonly<Record<string,ActorIntent>>}
export interface CastSnapshot extends FrameInput {
  readonly locomotion:Readonly<Record<string,import('./walking').WalkState|null>>;
  readonly faces:Readonly<Record<string,ResolvedFace|null>>;
  readonly poses:Readonly<Record<string,CharacterPose>>;
  readonly contacts:Readonly<Record<string,ContactState>>;
  readonly gaze:Readonly<Record<string,ResolvedGaze>>;
  readonly pointing:Readonly<Record<string,ResolvedPointing|null>>;
  readonly diagnostics:readonly (CastDiagnostic|ConstraintDiagnostic)[];
}
export interface ActorSupport {readonly pose:CharacterPose;readonly parent:LevelFrame}
