import * as T from 'three';
import { frameSubjects } from '../camera';
import { boundsOf, corners } from './bounds';
import type { Bounds } from './types';
/** Fit cached oriented corners in camera axes, avoiding repeated world-AABB
 * expansion. Reuses Phase 1 fit math; this is CPU-only preparation work. */
export function fitStaticRegion(bounds: Bounds, direction: T.Vector3, aspect: number) {
  const camera = new T.PerspectiveCamera(40, aspect, .05, 100);
  camera.position.copy(direction);
  camera.lookAt(0, 0, 0);
  const rotation = camera.quaternion.clone(),
    inverse = rotation.clone().invert();
  const center = new T.Vector3(...bounds.min).add(new T.Vector3(...bounds.max)).multiplyScalar(.5);
  const aligned = boundsOf(corners(bounds).map(p => new T.Vector3(...p).sub(center).applyQuaternion(inverse).toArray()));
  frameSubjects(camera, new T.Box3(new T.Vector3(...aligned.min), new T.Vector3(...aligned.max)), {
    padding: 1.12,
    direction: [0, 0, 1]
  });
  camera.position.applyQuaternion(rotation).add(center);
  camera.quaternion.copy(rotation);
  camera.updateMatrixWorld(true);
  return camera;
}
