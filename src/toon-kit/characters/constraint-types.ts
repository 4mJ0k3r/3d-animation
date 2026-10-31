import type {CharacterPose, Quat, Vec3} from './types';

export type Side = 'left' | 'right';
export type DiagnosticCode = 'INVALID_IK_INPUT' | 'IK_ZERO_DISTANCE' | 'IK_BEND_PLANE_FALLBACK' |
  'IK_TARGET_TOO_FAR' | 'IK_TARGET_TOO_CLOSE' | 'INVALID_REQUEST' | 'INVALID_TARGET' |
  'INVALID_FRAME' | 'PLACEMENT_OUT_OF_RANGE' | 'STANCE_UNREACHABLE' | 'FLOOR_UNREACHABLE' |
  'SEAT_TOO_NARROW' | 'SEAT_TOO_SHALLOW' | 'SEAT_TOO_LOW' | 'SEAT_CLEARANCE' |
  'FEET_DANGLING' | 'FLOOR_CLEARANCE' | 'BODY_CLEARANCE' | 'LIMB_CLEARANCE' |
  'REACH_UNREACHABLE' | 'JOINT_LIMIT' | 'DUPLICATE_REACH';
export interface ConstraintDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: 'info' | 'error';
  readonly message: string;
  readonly limb?: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
  readonly requested?: Vec3;
  readonly achieved?: Vec3;
}
export interface TwoBoneInput {
  readonly origin: Vec3;
  readonly target: Vec3;
  readonly upperLength: number;
  readonly lowerLength: number;
  /** Bend direction, not a world-space point. All vectors use the same space. */
  readonly pole: Vec3;
  readonly fallbackDirection?: Vec3;
  readonly fallbackPole?: Vec3;
}
export type TwoBoneResult = {
  readonly ok: true;
  readonly reachable: boolean;
  readonly joint: Vec3;
  readonly end: Vec3;
  /** Both orientations are absolute in the input space, not parent-local. */
  readonly upperOrientation: Quat;
  readonly lowerOrientation: Quat;
  readonly singularity: 'zero' | 'extended' | 'folded' | null;
  readonly diagnostics: readonly ConstraintDiagnostic[];
} | {readonly ok: false; readonly diagnostics: readonly ConstraintDiagnostic[]};

export interface LevelFrame {readonly position: Vec3; readonly yaw: number; readonly scale: number}
export interface FloorTarget {readonly kind: 'floor'; readonly height: number}
/** Open-front, level rectangular slab. Front edge is local Z=depth/2. */
export interface SeatTarget {
  readonly kind: 'seat';
  /** World-space top-surface center; width/depth/thickness are world lengths. */
  readonly center: Vec3;
  readonly yaw: number;
  readonly width: number;
  readonly depth: number;
  readonly thickness: number;
}
export interface PointTarget {readonly space: 'world'; readonly position: Vec3}
export interface StandingContact {
  readonly kind: 'stand'; readonly floor: FloorTarget;
  readonly at: readonly [number,number]; readonly yaw: number; readonly crouch: number;
}
export interface SittingContact {
  readonly kind: 'sit'; readonly seat: SeatTarget; readonly floor: FloorTarget;
  readonly feet: 'auto' | 'floor' | 'dangle';
}
export interface ArmReach {readonly hand: Side; readonly target: PointTarget}
export interface ContactRequest {
  readonly support: StandingContact | SittingContact;
  readonly reaches?: readonly ArmReach[];
  /** Root's positive uniform scale relative to parent, as in Stage 2A. */
  readonly scale?: number;
  /** Explicit current world transform of root.parent; only yaw/uniform scale. */
  readonly parent?: LevelFrame;
  readonly visible?: boolean;
}
export interface ContactState {
  readonly support: 'standing' | 'seated';
  readonly feet: Readonly<Record<Side,'floor' | 'dangling'>>;
}
export type ContactResult = {readonly ok: true; readonly pose: CharacterPose;
  readonly contacts: ContactState; readonly diagnostics: readonly ConstraintDiagnostic[]} |
  {readonly ok: false; readonly pose: null; readonly diagnostics: readonly ConstraintDiagnostic[]};
