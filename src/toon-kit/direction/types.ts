import type { Vec3, Quat } from '../characters/types';
export type { Vec3, Quat };
export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly points?: readonly Vec3[];
}
export type ActorRegion = 'head' | 'face' | 'torso' | 'fullBody' | 'leftHand' | 'rightHand' | 'gesture';
export interface CompositionActor {
  readonly visibility?:import('./visibility-types').ActorVisibility;
  readonly visible: boolean;
  readonly origin: Vec3;
  readonly facing: Vec3;
  readonly regions: Readonly<Record<ActorRegion, Bounds>>;
}
export interface CompositionProp {
  readonly visible: boolean;
  readonly facing: Vec3;
  readonly regions: Readonly<Record<string, Bounds>>;
}
export interface CompositionSnapshot {
  readonly visibility?:import('./visibility-types').StageVisibility;
  readonly frame: number;
  readonly fps: number;
  readonly actors: Readonly<Record<string, CompositionActor>>;
  readonly props: Readonly<Record<string, CompositionProp>>;
  readonly front: Vec3;
  readonly axis: {
    readonly from: Vec3;
    readonly to: Vec3;
  };
}
export type ShotType = 'establishing' | 'twoShot' | 'medium' | 'fullBody' | 'closeUp' | 'reaction' | 'objectFocus';
export interface StaticShot {
  readonly allowAxisCrossing?:boolean;
  readonly id: string;
  readonly type: ShotType;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly subject?: string;
  readonly subjects?: readonly string[];
  readonly region?: string;
  readonly view?: 'front' | 'threeQuarter' | 'subjectFront';
}
export interface CameraState {
  readonly shotId: string;
  readonly position: Vec3;
  readonly quaternion: Quat;
  readonly up: Vec3;
  readonly scale: Vec3;
  readonly fov: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
  readonly zoom: number;
  readonly focus: number;
  readonly filmGauge: number;
  readonly filmOffset: number;
  readonly layers: number;
  readonly view: null;
}
export interface DirectionDiagnostic {
  readonly details?:unknown;
  readonly code: string;
  readonly message: string;
  readonly shotId?: string;
  readonly frame?: number;
  readonly subject?: string;
}
export class DirectionError extends Error {
  constructor(public readonly diagnostic: DirectionDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.message}`);
    this.name = 'DirectionError';
  }
}
export function directionFail(code: string, message: string, details: Partial<DirectionDiagnostic> = {}): never {
  throw new DirectionError({
    code,
    message,
    ...details
  });
}
