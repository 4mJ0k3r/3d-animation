/** Immutable data contracts. +Y up, +Z forward, anatomical left = +X. */
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export const JOINT_NAMES = Object.freeze([
  'root', 'pelvis', 'torso', 'neck', 'head',
  'leftShoulder', 'leftElbow', 'leftWrist', 'rightShoulder', 'rightElbow', 'rightWrist',
  'leftHip', 'leftKnee', 'leftAnkle', 'rightHip', 'rightKnee', 'rightAnkle',
] as const);
export const PART_NAMES = Object.freeze([
  'torsoShape', 'neckShape', 'headShape',
  'leftUpperArm', 'leftForearm', 'leftElbowShape', 'leftHand',
  'rightUpperArm', 'rightForearm', 'rightElbowShape', 'rightHand',
  'leftThigh', 'leftShin', 'leftKneeShape', 'leftShoe',
  'rightThigh', 'rightShin', 'rightKneeShape', 'rightShoe',
] as const);
export type JointName = typeof JOINT_NAMES[number];
export type PartName = typeof PART_NAMES[number];
export type NodeName = JointName | PartName;
export const NODE_NAMES: readonly NodeName[] = Object.freeze([...JOINT_NAMES, ...PART_NAMES]);

export const NODE_PARENTS: Readonly<Record<NodeName, JointName | null>> = Object.freeze({
  root: null, pelvis: 'root', torso: 'pelvis', neck: 'torso', head: 'neck',
  leftShoulder: 'torso', leftElbow: 'leftShoulder', leftWrist: 'leftElbow',
  rightShoulder: 'torso', rightElbow: 'rightShoulder', rightWrist: 'rightElbow',
  leftHip: 'pelvis', leftKnee: 'leftHip', leftAnkle: 'leftKnee',
  rightHip: 'pelvis', rightKnee: 'rightHip', rightAnkle: 'rightKnee',
  torsoShape: 'torso', neckShape: 'neck', headShape: 'head',
  leftUpperArm: 'leftShoulder', leftForearm: 'leftElbow', leftElbowShape: 'leftElbow', leftHand: 'leftWrist',
  rightUpperArm: 'rightShoulder', rightForearm: 'rightElbow', rightElbowShape: 'rightElbow', rightHand: 'rightWrist',
  leftThigh: 'leftHip', leftShin: 'leftKnee', leftKneeShape: 'leftKnee', leftShoe: 'leftAnkle',
  rightThigh: 'rightHip', rightShin: 'rightKnee', rightKneeShape: 'rightKnee', rightShoe: 'rightAnkle',
});

export interface NodeTransform {
  readonly position: Vec3;
  readonly quaternion: Quat;
  readonly scale: Vec3;
  readonly visible: boolean;
}
/** Complete local transforms, including renderable parts, not a partial update. */
export type CharacterPose = Readonly<Record<NodeName, NodeTransform>>;

export interface CharacterProportions {
  readonly torsoRadius: number;
  /** Length of the capsule's straight section; excludes both hemispheres. */
  readonly torsoLength: number;
  readonly headRadius: number;
  readonly neckRadius: number;
  /** Visible separation of torso crown and head bottom. */
  readonly neckLength: number;
  readonly upperArmLength: number;
  readonly lowerArmLength: number;
  readonly armRadius: number;
  readonly handRadius: number;
  readonly upperLegLength: number;
  readonly lowerLegLength: number;
  readonly legRadius: number;
  readonly shoeWidth: number;
  readonly shoeHeight: number;
  readonly shoeLength: number;
  /** Sine of the attachment angle from the lower capsule's downward axis. */
  readonly hipSpread: number;
}

export type AnchorName = JointName | 'headTop' | 'neckBase' | 'neckTop' |
  'leftSole' | 'rightSole' | 'leftShoulderSurface' | 'rightShoulderSurface' |
  'leftHipSurface' | 'rightHipSurface';
export interface AnchorDefinition {readonly node: JointName; readonly offset: Vec3}
export interface CharacterDefinition {
  readonly proportions: CharacterProportions;
  readonly restPose: CharacterPose;
  readonly anchors: Readonly<Record<AnchorName, AnchorDefinition>>;
  readonly height: number;
}
export interface CharacterPlacement {
  readonly position?: Vec3;
  /** Radians around +Y; zero faces +Z. */
  readonly yaw?: number;
  /** Positive uniform scale, supported range 0.05..20. */
  readonly scale?: number;
  readonly visible?: boolean;
}
export interface CharacterColors {
  readonly skin?: string;
  readonly torso?: string;
  readonly limbs?: string;
  readonly shoes?: string;
}
export interface CharacterOptions {
  /** Unique within the scene; also supplies the actor's outline group. */
  readonly id: string;
  readonly proportions?: Partial<CharacterProportions>;
  readonly colors?: CharacterColors;
  readonly placement?: CharacterPlacement;
  /** Raw rigs remain faceless unless enabled; declarative casts enable faces. */
  readonly face?: import('./face').FaceConfig|false;
  readonly appearance?: import('./appearance').Appearance;
}
