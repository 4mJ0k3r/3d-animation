import * as T from 'three';
import type { Bounds, Vec3 } from './types';
import { directionFail } from './types';
export function corners(b: Bounds): readonly Vec3[] {
  return b.points ?? [0, 1, 2, 3, 4, 5, 6, 7].map(i => [b[i & 1 ? 'max' : 'min'][0], b[i & 2 ? 'max' : 'min'][1], b[i & 4 ? 'max' : 'min'][2]] as Vec3);
}
export function boundsOf(points: readonly Vec3[]): Bounds {
  if (!points.length || points.some(p => p.length !== 3 || !p.every(Number.isFinite))) directionFail('INVALID_BOUNDS', 'Finite nonempty region required');
  return {
    min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))) as unknown as Vec3,
    max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) as unknown as Vec3,
    points
  };
}
export const unionBounds = (boxes: readonly Bounds[]): Bounds => boundsOf(boxes.flatMap(corners));
export const transformBounds = (b: Bounds, m: T.Matrix4): Bounds => boundsOf(corners(b).map(p => new T.Vector3(...p).applyMatrix4(m).toArray() as unknown as Vec3));
export function geometryBounds(g: T.BufferGeometry): Bounds {
  if (!g.boundingBox) g.computeBoundingBox();
  if (!g.boundingBox || g.boundingBox.isEmpty()) directionFail('INVALID_BOUNDS', 'Mesh requires geometry bounds');
  return {
    min: g.boundingBox.min.toArray(),
    max: g.boundingBox.max.toArray()
  };
}
