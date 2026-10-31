import * as T from 'three';
import type { Bounds, CameraState, StaticShot, Vec3, SemanticCameraPlan, CompositionSnapshot, CameraTarget } from './types';
import type { CompactVisibilityFrame, CompositionOptions } from './visibility-types';
import { directionFail } from './types';
import { freezeData } from '../characters/pose';
import { assessComposition, planVisibleShot } from './composition';
export const MOTION_LIMITS = freezeData({
  pushIn: {
    subtle: .06,
    moderate: .12
  },
  panBackoff: [1.18, 1.30, 1.42],
  midpointChecks: true
});
export interface PreparedMotion {
  readonly type: 'pushIn' | 'pan' | 'move';
  readonly easing: 'linear' | 'easeInOut';
  readonly startFrame: number;
  readonly endFrame: number;
  readonly start: CameraState;
  readonly end: CameraState;
  readonly startFocus: Vec3;
  readonly endFocus: Vec3;
  readonly checks: number;
  readonly endpointCandidates: number;
}
const vec = (v: Vec3) => new T.Vector3(...v);
const center = (b: Bounds) => new T.Vector3().addVectors(vec(b.min), vec(b.max)).multiplyScalar(.5);
const forward = (c: CameraState) => new T.Vector3(0, 0, -1).applyQuaternion(new T.Quaternion(...c.quaternion));
export function motionTarget(s: CompositionSnapshot, target: CameraTarget): Vec3 {
  const a = Object.hasOwn(s.actors, target.subject) ? s.actors[target.subject] : undefined;
  const p = Object.hasOwn(s.props, target.subject) ? s.props[target.subject] : undefined;
  const regions = a?.regions ?? p?.regions,
    key = target.region ?? (a ? 'face' : 'full');
  const b = regions && Object.hasOwn(regions, key) ? regions[key as keyof typeof regions] : undefined;
  if (!(a ?? p)?.visible || !b) directionFail('INVALID_MOTION_TARGET', 'Pan needs a visible registered actor/prop region', {
    subject: target.subject
  });
  return center(b).toArray();
}
function opticalFocus(c: CameraState, b: Bounds): Vec3 {
  const depth = center(b).sub(vec(c.position)).dot(forward(c));
  if (depth <= c.near) directionFail('INVALID_MOTION_FOCUS', 'Semantic focus must be in front of the camera');
  return vec(c.position).addScaledVector(forward(c), depth).toArray();
}
function focused(c: CameraState, p: Vec3, focus: Vec3): CameraState {
  const distance = vec(p).distanceTo(vec(focus));
  if (distance <= c.near) directionFail('INVALID_MOTION_FOCUS', 'Camera path reaches its focus');
  const matrix = new T.Matrix4().lookAt(vec(p), vec(focus), new T.Vector3(0, 1, 0));
  return freezeData({
    ...c,
    position: [...p],
    quaternion: new T.Quaternion().setFromRotationMatrix(matrix).toArray(),
    focus: distance
  });
}
/** Pure absolute-frame evaluation. Public endpoint snapshots are returned exactly. */
export function evaluateCameraMotion(plan: PreparedMotion, frame: number): CameraState {
  if (!Number.isFinite(frame) || frame < plan.startFrame || frame > plan.endFrame - 1) directionFail('INVALID_MOTION_FRAME', 'Frame outside the prepared motion');
  if (frame === plan.startFrame) return plan.start;
  if (frame === plan.endFrame - 1) return plan.end;
  let t = (frame - plan.startFrame) / (plan.endFrame - plan.startFrame - 1);
  if (plan.easing === 'easeInOut') t = t * t * t * (10 + t * (-15 + 6 * t));
  return focused(plan.start, vec(plan.start.position).lerp(vec(plan.end.position), t).toArray(), vec(plan.startFocus).lerp(vec(plan.endFocus), t).toArray());
}
export function prepareCameraMotion(shot: StaticShot, frames: readonly CompactVisibilityFrame[], base: ReturnType<typeof planVisibleShot>, options: CompositionOptions, endpointFrames: (index: 0 | 1) => readonly CompactVisibilityFrame[], target: (index: 0 | 1) => Vec3): PreparedMotion {
  const m = shot.motion!;
  let endpointCandidates = 0;
  const make = (a: CameraState, b: CameraState, fa: Vec3, fb: Vec3): PreparedMotion => {
    if ((['fov', 'aspect', 'near', 'far', 'zoom', 'filmGauge', 'filmOffset', 'layers', 'view'] as const).some(k => a[k] !== b[k])) directionFail('UNSUPPORTED_MOTION_PROJECTION', 'Motion endpoints must use the same fixed projection', {
      shotId: shot.id
    });
    // The camera-to-focus vector is linear in eased progress. Reject its exact
    // closest approach, not just sampled coincidences, before lookAt can flip.
    const v = vec(fa).sub(vec(a.position)),
      delta = vec(fb).sub(vec(b.position)).sub(v);
    const t = delta.lengthSq() ? Math.max(0, Math.min(1, -v.dot(delta) / delta.lengthSq())) : 0;
    if (v.clone().addScaledVector(delta, t).length() <= Math.max(a.near, b.near)) directionFail('INVALID_MOTION_FOCUS', 'Camera path crosses its focus', {
      shotId: shot.id
    });
    const horizontal = new T.Vector3(v.x, 0, v.z), change = new T.Vector3(delta.x, 0, delta.z);
    const uprightT = change.lengthSq() ? Math.max(0, Math.min(1, -horizontal.dot(change) / change.lengthSq())) : 0;
    if (horizontal.addScaledVector(change, uprightT).length() < 1e-6) directionFail('UNSUPPORTED_MOTION_ORIENTATION', 'Path crosses a vertical look direction; upright framing would be ambiguous', {shotId:shot.id});
    return freezeData({
      type: m.type,
      easing: m.easing ?? 'easeInOut',
      startFrame: shot.startFrame,
      endFrame: shot.endFrame,
      start: focused(a, a.position, fa),
      end: focused(b, b.position, fb),
      startFocus: fa,
      endFocus: fb,
      checks: 0,
      endpointCandidates
    });
  };
  const validate = (p: PreparedMotion) => {
    let checks = 0;
    for (let i = 0; i < frames.length; i++) {
      // Test every rendered frame, and each half-frame against BOTH adjacent
      // explicit scene snapshots. This does not assert subframe actor interpolation.
      const samples = i + 1 < frames.length ? [frames[i].frame, frames[i].frame + .5] : [frames[i].frame];
      for (const time of samples) for (const f of time % 1 ? [frames[i], frames[i + 1]] : [frames[i]]) {
        const r = assessComposition(shot, f, evaluateCameraMotion(p, time), options);
        checks++;
        if (!r.valid) return {
          checks,
          failure: {
            frame: time,
            sceneFrame: f.frame,
            failures: r.failures,
            details: r.details
          }
        };
      }
    }
    return {
      checks
    };
  };
  const focus = opticalFocus(base.camera, base.bounds);
  const proposals: PreparedMotion[] = [];
  if (m.type === 'pushIn') {
    const amount = MOTION_LIMITS.pushIn[m.amount ?? 'subtle'],
      distance = vec(base.camera.position).distanceTo(vec(focus));
    const start = vec(base.camera.position).addScaledVector(forward(base.camera), -distance * amount / (1 - amount));
    proposals.push(make({
      ...base.camera,
      position: start.toArray()
    }, base.camera, focus, focus));
  } else if (m.type === 'pan') {
    const from = vec(target(0)),
      to = vec(target(1)),
      mid = from.clone().add(to).multiplyScalar(.5);
    if (from.distanceToSquared(to) < 1e-12) directionFail('DEGENERATE_MOTION', 'Pan requires distinct semantic target positions', {
      shotId: shot.id
    });
    const fa = vec(focus).add(from.sub(mid)).toArray(),
      fb = vec(focus).add(to.sub(mid)).toArray(),
      distance = vec(base.camera.position).distanceTo(vec(focus));
    for (const factor of MOTION_LIMITS.panBackoff) {
      const c = {
        ...base.camera,
        position: vec(base.camera.position).addScaledVector(forward(base.camera), -distance * (factor - 1)).toArray()
      };
      proposals.push(make(c, c, fa, fb));
    }
  } else {
    const endpoint = (p: SemanticCameraPlan, index: 0 | 1) => {
      const s = {
        ...p,
        id: shot.id,
        startFrame: shot.startFrame,
        endFrame: shot.endFrame,
        allowAxisCrossing: shot.allowAxisCrossing
      };
      const result = planVisibleShot(s, endpointFrames(index), base.camera.aspect, options, p.view);
      endpointCandidates += result.candidateCount;
      return {
        c: result.camera,
        f: opticalFocus(result.camera, result.bounds)
      };
    };
    const a = endpoint(m.from, 0),
      b = endpoint(m.to, 1);
    proposals.push(make(a.c, b.c, a.f, b.f));
  }
  const failures: unknown[] = [];
  let totalChecks = 0;
  for (const proposal of proposals) {
    const r = validate(proposal);
    totalChecks += r.checks;
    if (!r.failure) return freezeData({
      ...proposal,
      checks: totalChecks,
      endpointCandidates
    });
    failures.push(r.failure);
  }
  directionFail('INVALID_MOTION_PATH', 'No supported motion path preserves required composition', {
    shotId: shot.id,
    details: failures
  });
}
