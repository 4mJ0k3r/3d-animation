import {freezeData, poseAnchorPosition, validateCompletePose} from './pose';
import {JOINT_NAMES, NODE_NAMES} from './types';
import type {AnchorDefinition, AnchorName, CharacterDefinition, CharacterPose, CharacterProportions, NodeName, NodeTransform, Quat, Vec3} from './types';

export const DEFAULT_PROPORTIONS: CharacterProportions = Object.freeze({
  torsoRadius: .25, torsoLength: .60, headRadius: .52, neckRadius: .075, neckLength: .12,
  upperArmLength: .36, lowerArmLength: .34, armRadius: .035, handRadius: .065,
  upperLegLength: .48, lowerLegLength: .46, legRadius: .04,
  shoeWidth: .15, shoeHeight: .14, shoeLength: .28, hipSpread: .60,
});

/** Signed distance to the solid torso capsule; negative means embedded. */
export function torsoDistance(point: Vec3, p: CharacterProportions): number {
  return Math.hypot(point[0], Math.max(0, Math.abs(point[1]) - p.torsoLength / 2), point[2]) - p.torsoRadius;
}

export function resolveProportions(input: Partial<CharacterProportions> = {}): CharacterProportions {
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_PROPORTIONS, key)) throw new Error(`Unknown proportion: ${key}`);
  const p = {...DEFAULT_PROPORTIONS, ...input};
  for (const [key, value] of Object.entries(p)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10) throw new Error(`Invalid positive proportion: ${key}`);
  }
  const check = (ok: boolean, message: string) => {if (!ok) throw new Error(`Unsupported proportions: ${message}`);};
  check(p.hipSpread >= .4 && p.hipSpread <= .8, 'hipSpread must be 0.4..0.8');
  check(p.headRadius >= p.torsoRadius * 1.4 && p.headRadius <= p.torsoRadius * 2.8, 'head/torso ratio must be 1.4..2.8');
  check(p.torsoLength >= p.torsoRadius && p.torsoLength <= p.torsoRadius * 4, 'torso straight length must be 1..4 radii');
  check(p.armRadius <= p.torsoRadius * .18 && p.legRadius <= p.torsoRadius * .22, 'limbs must remain slim');
  check(p.neckRadius <= p.torsoRadius * .4 && p.neckLength <= p.headRadius * .5, 'neck must fit the body');
  check(p.handRadius >= p.armRadius * 1.25 && p.handRadius <= p.armRadius * 2.5, 'hands must cover wrist ends');
  check(p.upperArmLength >= p.armRadius * 4 && p.lowerArmLength >= p.armRadius * 4 &&
    p.upperLegLength >= p.legRadius * 5 && p.lowerLegLength >= p.legRadius * 5, 'limb lengths must exceed joint diameters');
  check(p.shoeHeight <= p.shoeWidth * 1.1 && p.shoeWidth <= p.shoeLength * .85 &&
    p.shoeHeight <= p.lowerLegLength * .5 && p.shoeLength <= p.lowerLegLength * 1.2, 'shoe dimensions must fit the lower leg');
  // Conservative bound puts the entire horizontal shin end-cap inside the shoe ellipsoid.
  check((p.legRadius / (p.shoeWidth / 2)) ** 2 +
    ((p.shoeLength * .15 + p.legRadius) / (p.shoeLength / 2)) ** 2 + .2 ** 2 < 1,
  'shoe must enclose the ankle end-cap');
  check(2 * (p.torsoRadius - 1.05 * p.legRadius) * p.hipSpread > p.shoeWidth + p.legRadius * .5,
    'shoes must have neutral-pose clearance');
  check(p.upperArmLength * Math.sin(Math.PI / 10) >= 2.1 * p.armRadius, 'elbows must clear the torso');
  return freezeData(p);
}

/** Construction-time mathematics only. Rest layout does not read live objects. */
export function createCharacterDefinition(input: Partial<CharacterProportions> = {}): CharacterDefinition {
  const p = resolveProportions(input);
  const ankleY = .6 * p.shoeHeight;
  const hipY = ankleY + p.upperLegLength + p.lowerLegLength;
  const hipNormalY = -Math.sqrt(1 - p.hipSpread ** 2);
  const hipInsetRadius = p.torsoRadius - 1.05 * p.legRadius;
  const hipLocalY = -p.torsoLength / 2 + hipInsetRadius * hipNormalY;
  const torsoY = -hipLocalY;
  const pose = {} as Record<NodeName, NodeTransform>;
  const set = (name: NodeName, position: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], quaternion: Quat = [0, 0, 0, 1]) => {
    pose[name] = {position, quaternion, scale, visible: true};
  };
  NODE_NAMES.forEach((name) => set(name));
  set('pelvis', [0, hipY, 0]);
  set('torso', [0, torsoY, 0]);
  set('neck', [0, p.torsoLength / 2 + p.torsoRadius, 0]);
  set('head', [0, p.neckLength + p.headRadius, 0]);
  set('headShape', [0, 0, 0], [p.headRadius, p.headRadius, p.headRadius]);
  set('neckShape', [0, p.neckLength / 2, 0], [p.neckRadius, p.neckLength + p.neckRadius, p.neckRadius]);
  const anchors = {} as Record<AnchorName, AnchorDefinition>;
  for (const name of JOINT_NAMES) anchors[name] = {node: name, offset: [0, 0, 0]};
  anchors.headTop = {node: 'head', offset: [0, p.headRadius, 0]};
  anchors.neckBase = {node: 'neck', offset: [0, 0, 0]};
  anchors.neckTop = {node: 'neck', offset: [0, p.neckLength, 0]};
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? 1 : -1;
    const angle = sign * Math.PI / 10; // Symmetric 18-degree neutral splay.
    set(`${side}Shoulder`, [sign * (p.torsoRadius - 1.05 * p.armRadius), p.torsoLength * .35, 0],
      [1, 1, 1], [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]);
    set(`${side}Elbow`, [0, -p.upperArmLength, 0]);
    set(`${side}Wrist`, [0, -p.lowerArmLength, 0]);
    set(`${side}Hip`, [sign * hipInsetRadius * p.hipSpread, 0, 0]);
    set(`${side}Knee`, [0, -p.upperLegLength, 0]);
    set(`${side}Ankle`, [0, -p.lowerLegLength, 0]);
    for (const [part, length, radius] of [
      [`${side}UpperArm`, p.upperArmLength, p.armRadius], [`${side}Forearm`, p.lowerArmLength, p.armRadius],
      [`${side}Thigh`, p.upperLegLength, p.legRadius], [`${side}Shin`, p.lowerLegLength, p.legRadius],
    ] as const) set(part, [0, -length / 2, 0], [radius, length, radius]);
    set(`${side}ElbowShape`, [0, 0, 0], [p.armRadius, p.armRadius, p.armRadius]);
    set(`${side}KneeShape`, [0, 0, 0], [p.legRadius, p.legRadius, p.legRadius]);
    set(`${side}Hand`, [0, 0, 0], [p.handRadius, p.handRadius, p.handRadius]);
    set(`${side}Shoe`, [0, p.shoeHeight / 2 - ankleY, p.shoeLength * .15], [p.shoeWidth / 2, p.shoeHeight / 2, p.shoeLength / 2]);
    anchors[`${side}Sole`] = {node: `${side}Ankle`, offset: [0, -ankleY, p.shoeLength * .15]};
    anchors[`${side}ShoulderSurface`] = {node: 'torso', offset: [sign * p.torsoRadius, p.torsoLength * .35, 0]};
    anchors[`${side}HipSurface`] = {node: 'torso', offset: [sign * p.torsoRadius * p.hipSpread,
      -p.torsoLength / 2 + p.torsoRadius * hipNormalY, 0]};
  }
  const restPose: CharacterPose = pose;
  validateCompletePose(restPose);
  const height = poseAnchorPosition(restPose, anchors.headTop)[1];
  const handBottom = poseAnchorPosition(restPose, anchors.leftWrist)[1] - p.handRadius;
  if (handBottom <= p.shoeHeight) throw new Error('Unsupported proportions: neutral hands must clear the ground and shoes');
  const torsoCenter = poseAnchorPosition(restPose, anchors.torso);
  const handCenter = poseAnchorPosition(restPose, anchors.leftWrist).map((value, i) => value - torsoCenter[i]) as unknown as Vec3;
  if (torsoDistance(handCenter, p) <= p.handRadius) throw new Error('Unsupported proportions: neutral hands must clear the torso');
  if (hipY + torsoY - p.torsoLength / 2 - p.torsoRadius <= p.shoeHeight) {
    throw new Error('Unsupported proportions: torso must clear the shoes and ground');
  }
  return freezeData({proportions: p, restPose, anchors, height});
}
