import * as T from 'three';
import type { VisibilityProxy, FeatureSamples } from './visibility-types';
import type { CameraState, Bounds, Vec3 } from './types';
import type { ScreenRect } from '../caption-layout';
import { corners } from './bounds';
import { applyCameraState } from './director';
import { directionFail } from './types';
export const VISIBILITY_LIMITS = Object.freeze({
  maxSamples: 9,
  minFacingCosine: .06
});
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Segment vs analytic proxies. No triangles, pixel buffers or scene reads. */
export function proxyBlocks(origin: Vec3, target: Vec3, p: VisibilityProxy): boolean {
  const dx = target[0] - origin[0],
    dy = target[1] - origin[1],
    dz = target[2] - origin[2],
    len = dx * dx + dy * dy + dz * dz;
  if (len < 1e-16) return false;
  if (p.kind === 'sphere') {
    const x = origin[0] - p.center[0],
      y = origin[1] - p.center[1],
      z = origin[2] - p.center[2],
      b = x * dx + y * dy + z * dz,
      c = x * x + y * y + z * z - p.radius * p.radius;
    if (c <= 0) return true;
    const disc = b * b - len * c;
    if (disc < 0) return false;
    const t = (-b - Math.sqrt(disc)) / len;
    return t >= 0 && t < 1 - 1e-6;
  }
  if (p.kind === 'capsule') {
    const vx = p.b[0] - p.a[0],
      vy = p.b[1] - p.a[1],
      vz = p.b[2] - p.a[2],
      wx = origin[0] - p.a[0],
      wy = origin[1] - p.a[1],
      wz = origin[2] - p.a[2];
    const b = dx * vx + dy * vy + dz * vz,
      c = vx * vx + vy * vy + vz * vz,
      d = dx * wx + dy * wy + dz * wz,
      e = vx * wx + vy * wy + vz * wz,
      den = len * c - b * b;
    if (c < 1e-16) return proxyBlocks(origin, target, {
      ...p,
      kind: 'sphere',
      center: p.a
    });
    let s = den > 1e-16 ? clamp((b * e - c * d) / den) : 0,
      t = (b * s + e) / c;
    if (t < 0) {
      t = 0;
      s = clamp(-d / len);
    } else if (t > 1) {
      t = 1;
      s = clamp((b - d) / len);
    }
    const x = wx + s * dx - t * vx,
      y = wy + s * dy - t * vy,
      z = wz + s * dz - t * vz;
    return x * x + y * y + z * z < p.radius * p.radius - 1e-10;
  }
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 3; i++) {
    const axis = p.axes[i],
      o = (origin[0] - p.center[0]) * axis[0] + (origin[1] - p.center[1]) * axis[1] + (origin[2] - p.center[2]) * axis[2],
      d = dx * axis[0] + dy * axis[1] + dz * axis[2],
      h = p.half[i] + (p.kind === 'plane' ? 1e-5 : 0);
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(o) > h) return false;
      continue;
    }
    let a = (-h - o) / d,
      b = (h - o) / d;
    if (a > b) [a, b] = [b, a];
    lo = Math.max(lo, a);
    hi = Math.min(hi, b);
    if (lo > hi) return false;
  }
  return lo < 1 - 1e-6 && hi >= 0;
}
export function createProjection(state: CameraState) {
  const c = new T.PerspectiveCamera();
  applyCameraState(c, state);
  return {
    camera: c,
    point(p: Vec3) {
      const v = new T.Vector3(...p).project(c);
      return {
        x: (v.x + 1) / 2,
        y: (1 - v.y) / 2,
        inFrame: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z >= -1 && v.z <= 1,
        depth: -new T.Vector3(...p).applyMatrix4(c.matrixWorldInverse).z
      };
    },
    rect(b: Bounds): ScreenRect {
      const ps = corners(b).map(p => this.point(p));
      return {
        left: Math.min(...ps.map(p => p.x)),
        right: Math.max(...ps.map(p => p.x)),
        top: Math.min(...ps.map(p => p.y)),
        bottom: Math.max(...ps.map(p => p.y))
      };
    }
  };
}
export function estimateVisibility(state: CameraState, feature: FeatureSamples, proxies: readonly VisibilityProxy[]) {
  if (!feature.points.length || feature.points.length > VISIBILITY_LIMITS.maxSamples || feature.points.some(p => p.length !== 3 || !p.every(Number.isFinite))) directionFail('INVALID_FEATURE', 'Finite bounded visibility samples required');
  if(feature.selfOccluding&&(!feature.normals||feature.normals.length!==feature.points.length||new Set(feature.selfOccluding).size!==feature.selfOccluding.length||feature.selfOccluding.some(i=>!Number.isInteger(i)||i<0||i>=feature.points.length)))directionFail('INVALID_FEATURE','Self-occluding indices require matching normals and valid unique indices');
  const projection = createProjection(state);
  let visible = 0,
    inFrame = 0,
    backFacing = 0, required = 0, selfOccluded = 0;
  const blockers = new Set<string>();
  for (let i = 0; i < feature.points.length; i++) {
    const p = feature.points[i];
    const facesAway=feature.normals?.[i] && dot(feature.normals[i],sub(state.position,p))<=VISIBILITY_LIMITS.minFacingCosine*Math.hypot(...sub(state.position,p));
    if(facesAway&&feature.selfOccluding?.includes(i)){selfOccluded++;continue;}
    required++;
    if (!projection.point(p).inFrame) continue;
    inFrame++;
    if (feature.normals?.[i] && dot(feature.normals[i], sub(state.position, p)) <= VISIBILITY_LIMITS.minFacingCosine * Math.hypot(...sub(state.position, p))) {
      backFacing++;
      continue;
    }
    const blocker = proxies.find(proxy => !feature.ignore.includes(proxy.id) && proxyBlocks(state.position, p, proxy));
    if (blocker) blockers.add(blocker.id);else visible++;
  }
  return {
    fraction: required ? visible / required : 0,
    inFrameFraction: required ? inFrame / required : 0,
    selfOccluded,
    backFacing,
    blockers: [...blockers].sort()
  };
}
export function projectedSphereRect(state: CameraState, center: Vec3, radius: number): ScreenRect {
  const projection = createProjection(state),
    p = new T.Vector3(...center).applyMatrix4(projection.camera.matrixWorldInverse),
    d = -p.z;
  const frustum = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(projection.camera.projectionMatrix, projection.camera.matrixWorldInverse));
  if (!frustum.intersectsSphere(new T.Sphere(new T.Vector3(...center), radius))) return {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  };
  if (d + radius <= state.near) return {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  };
  if (d <= radius) return {
    left: 0,
    right: 1,
    top: 0,
    bottom: 1
  };
  const extent = (v: number) => {
      const s = radius * Math.sqrt(d * d + v * v - radius * radius),
        den = d * d - radius * radius;
      return [(v * d - s) / den, (v * d + s) / den];
    },
    x = extent(p.x),
    y = extent(p.y),
    tan = Math.tan(state.fov * Math.PI / 360);
  return {
    left: (x[0] / (tan * state.aspect) + 1) / 2,
    right: (x[1] / (tan * state.aspect) + 1) / 2,
    top: (1 - y[1] / tan) / 2,
    bottom: (1 - y[0] / tan) / 2
  };
}
