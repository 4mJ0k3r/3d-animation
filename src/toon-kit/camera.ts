import * as THREE from 'three';

export interface FramingOptions {
  padding?: number;
  direction?: [number, number, number];
  minimumFar?: number;
}

/** Fit every bounds corner in camera space, accounting for depth and both FOVs. */
export function frameSubjects(
  camera: THREE.PerspectiveCamera,
  subjects: THREE.Object3D | THREE.Object3D[] | THREE.Box3,
  options: FramingOptions = {},
): void {
  const bounds = new THREE.Box3();
  if (subjects instanceof THREE.Box3) bounds.copy(subjects);
  else for (const subject of Array.isArray(subjects) ? subjects : [subjects]) {
    subject.updateWorldMatrix(true, true);
    bounds.union(new THREE.Box3().setFromObject(subject));
  }
  if (bounds.isEmpty()) return;
  const padding = options.padding ?? 1.15;
  if (!Number.isFinite(padding) || padding < 1) throw new Error('Framing padding must be >= 1');
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(...(options.direction ?? [0, 0, 1]));
  if (direction.lengthSq() === 0) throw new Error('Camera direction cannot be zero');
  direction.normalize();
  camera.position.copy(center).add(direction);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const inverseRotation = camera.quaternion.clone().invert();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const tanX = tanY * camera.aspect;
  let distance = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(inverseRotation);
    distance = Math.max(distance, corner.z + Math.abs(corner.x) * padding / tanX, corner.z + Math.abs(corner.y) * padding / tanY);
    minZ = Math.min(minZ, corner.z);
    maxZ = Math.max(maxZ, corner.z);
  }
  distance = Math.max(distance, maxZ + camera.near * 2);
  camera.position.copy(center).addScaledVector(direction, distance);
  // Frustum derives from this shot's bounds, not a previously expanded far plane.
  camera.far = Math.max(options.minimumFar ?? 100, camera.near + 1, distance - minZ + 1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
