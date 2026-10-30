import type {AnchorDefinition, CharacterDefinition, CharacterPlacement, CharacterPose, NodeName, Vec3} from './types';
import {JOINT_NAMES, NODE_NAMES, NODE_PARENTS} from './types';

/** Only plain data is frozen; never freeze mutable Three.js resources. */
export function freezeData<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeData);
    Object.freeze(value);
  }
  return value;
}

/** Pure pose-space calculation: no scene graph reads or mutation. */
export function poseAnchorPosition(pose: CharacterPose, anchor: AnchorDefinition, space: 'root' | 'parent' = 'root'): Vec3 {
  let point = [...anchor.offset] as [number, number, number];
  let node: NodeName | null = anchor.node;
  while (node && (space === 'parent' || node !== 'root')) {
    const transform = pose[node];
    const [x, y, z] = point.map((v, i) => v * transform.scale[i]);
    const [qx, qy, qz, qw] = transform.quaternion;
    // q * vector * inverse(q), for unit quaternions.
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    point = [x + qw * tx + qy * tz - qz * ty + transform.position[0],
      y + qw * ty + qz * tx - qx * tz + transform.position[1],
      z + qw * tz + qx * ty - qy * tx + transform.position[2]];
    node = NODE_PARENTS[node];
  }
  return point;
}

export function validateCompletePose(pose: CharacterPose): void {
  if (!pose || Object.keys(pose).length !== NODE_NAMES.length) throw new Error('A complete character pose is required');
  for (const name of NODE_NAMES) {
    const value = pose[name];
    if (!value || !Array.isArray(value.position) || value.position.length !== 3 ||
      !Array.isArray(value.scale) || value.scale.length !== 3 ||
      !Array.isArray(value.quaternion) || value.quaternion.length !== 4 ||
      ![...value.position, ...value.scale, ...value.quaternion].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      value.position.some((v) => Math.abs(v) > 1e6) || value.scale.some((v) => v <= 0 || v > 20) ||
      typeof value.visible !== 'boolean' || Math.abs(Math.hypot(...value.quaternion) - 1) > 1e-6) {
      throw new Error(`Invalid complete transform: ${name}`);
    }
    if (JOINT_NAMES.includes(name as typeof JOINT_NAMES[number])) {
      const [x, y, z] = value.scale;
      if (name === 'root' ? (x < .05 || Math.abs(x - y) > 1e-10 || Math.abs(x - z) > 1e-10) : (x !== 1 || y !== 1 || z !== 1)) {
        throw new Error('Character scaling belongs exclusively on root and must be uniform (0.05..20)');
      }
    }
  }
}

/** A complete immutable rest pose with explicit placement. No animation evaluator. */
export function createRestPose(definition: CharacterDefinition, placement: CharacterPlacement = {}): CharacterPose {
  const yaw = placement.yaw ?? 0, scale = placement.scale ?? 1;
  if (!Number.isFinite(yaw)) throw new Error('Character yaw must be finite');
  const pose: CharacterPose = {...definition.restPose, root: {
    position: [...(placement.position ?? [0, 0, 0])],
    quaternion: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    scale: [scale, scale, scale], visible: placement.visible ?? true,
  }};
  validateCompletePose(pose);
  return freezeData(pose);
}
