import * as T from 'three';
import { freezeData } from '../characters/pose';
import { storyFail } from './types';
import type { PropAnimation } from './types';
/** Phase 6D-A limits. Animation only retargets existing objects' transforms. */
export const PROP_ANIMATION_LIMITS = freezeData({
  animations: 8,
  props: 3,
  minFrames: 2,
  maxLift: 1.5,
  maxYawDegrees: 360,
  maxTiltDegrees: 15
});
const SAFE = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const trackOf = (a: PropAnimation) => a.type === 'rotate' ? 'rotate:' + a.axis : a.type;
const obj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
/** Pure shape/range validation. Slot, eligibility and geometry rules live in authoring. */
export function validatePropAnimations(input: unknown, scene: {
  readonly id: string;
  readonly startFrame: number;
  readonly endFrame: number;
}): readonly PropAnimation[] {
  const fail = (message: string, details?: unknown): never => storyFail('INVALID_PROP_ANIMATION', message, {
    scene: scene.id,
    details
  });
  if (!Array.isArray(input) || !input.length || input.length > PROP_ANIMATION_LIMITS.animations) fail('Use 1..' + PROP_ANIMATION_LIMITS.animations + ' propAnimations');
  const list: PropAnimation[] = [];
  for (const raw of input as unknown[]) {
    if (!obj(raw)) fail('Each propAnimation must be an object');
    const a = raw as Record<string, unknown>,
      allowed = ['prop', 'type', 'startFrame', 'endFrame', 'easing', ...(a.type === 'slide' ? ['to'] : a.type === 'lift' ? ['height'] : a.type === 'rotate' ? ['axis', 'degrees'] : [])];
    if (!['slide', 'lift', 'rotate'].includes(a.type as string)) fail('type must be slide, lift or rotate', {
      type: a.type
    });
    const extra = Object.keys(a).filter(k => !allowed.includes(k));
    if (extra.length) fail('Unsupported fields for ' + a.type + ' (no raw coordinates or keyframes): ' + extra.join(', '), {
      extra
    });
    if (typeof a.prop !== 'string' || !SAFE.test(a.prop)) fail('prop must name a layout item');
    if (!Number.isInteger(a.startFrame) || !Number.isInteger(a.endFrame) || (a.startFrame as number) < scene.startFrame || (a.endFrame as number) > scene.endFrame || (a.endFrame as number) - (a.startFrame as number) < PROP_ANIMATION_LIMITS.minFrames) fail('Use integer absolute frames inside the scene, at least ' + PROP_ANIMATION_LIMITS.minFrames + ' frames long', {
      prop: a.prop,
      startFrame: a.startFrame,
      endFrame: a.endFrame
    });
    if (a.easing !== undefined && !['linear', 'easeInOut'].includes(a.easing as string)) fail('easing must be linear or easeInOut');
    if (a.type === 'slide' && (typeof a.to !== 'string' || !a.to)) fail('slide needs a named location in "to"');
    if (a.type === 'lift' && (typeof a.height !== 'number' || !Number.isFinite(a.height) || a.height < 0 || a.height > PROP_ANIMATION_LIMITS.maxLift)) fail('lift height must be 0..' + PROP_ANIMATION_LIMITS.maxLift + ' metres above rest');
    if (a.type === 'rotate') {
      if (!['x', 'y', 'z'].includes(a.axis as string)) fail('rotate axis must be x, y or z');
      const limit = a.axis === 'y' ? PROP_ANIMATION_LIMITS.maxYawDegrees : PROP_ANIMATION_LIMITS.maxTiltDegrees;
      if (typeof a.degrees !== 'number' || !Number.isFinite(a.degrees) || Math.abs(a.degrees) > limit) fail('rotate degrees on axis ' + a.axis + ' must be within +/-' + limit);
    }
    list.push(Object.freeze({
      ...a
    }) as unknown as PropAnimation);
  }
  list.sort((a, b) => a.prop.localeCompare(b.prop) || trackOf(a).localeCompare(trackOf(b)) || a.startFrame - b.startFrame || a.endFrame - b.endFrame);
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1],
      b = list[i];
    if (a.prop === b.prop && trackOf(a) === trackOf(b) && b.startFrame < a.endFrame) fail('Animations of the same kind on one prop may not overlap', {
      prop: a.prop,
      track: trackOf(a)
    });
  }
  if (new Set(list.map(a => a.prop)).size > PROP_ANIMATION_LIMITS.props) fail('Animate at most ' + PROP_ANIMATION_LIMITS.props + ' props per scene');
  return Object.freeze(list);
}
const ease = (kind: string | undefined, t: number) => kind === 'easeInOut' ? t * t * (3 - 2 * t) : t;
/** Value of one chained "go to target" track at an absolute frame; no state between calls. */
function chain(list: readonly PropAnimation[], frame: number, rest: readonly number[], target: (a: PropAnimation) => readonly number[]): number[] {
  let value = [...rest];
  for (const a of list) {
    const to = target(a);
    if (frame >= a.endFrame) {
      value = [...to];
      continue;
    }
    if (frame >= a.startFrame) {
      const u = ease(a.easing, (frame - a.startFrame) / (a.endFrame - a.startFrame));
      return value.map((x, i) => x + (to[i] - x) * u);
    }
    break;
  }
  return value;
}
/**
 * Pure transform of a prop at a frame. Exported for tests and authoring previews.
 * `rest` position is [x, z]; results are offsets/targets in the object's parent space.
 */
export function evaluatePropAnimation(list: readonly PropAnimation[], frame: number, rest: {
  readonly x: number;
  readonly z: number;
}, anchor: (name: string) => readonly number[]) {
  const on = (type: string, axis?: string) => list.filter(a => a.type === type && (axis === undefined || (a as {
    axis?: string;
  }).axis === axis));
  const [x, z] = chain(on('slide'), frame, [rest.x, rest.z], a => {
    const p = anchor((a as {
      to: string;
    }).to);
    return [p[0], p[2]];
  });
  const [lift] = chain(on('lift'), frame, [0], a => [(a as {
    height: number;
  }).height]);
  const rad = (axis: string) => chain(on('rotate', axis), frame, [0], a => [(a as {
    degrees: number;
  }).degrees * Math.PI / 180])[0];
  return {
    x,
    z,
    lift,
    rx: rad('x'),
    ry: rad('y'),
    rz: rad('z')
  };
}
/**
 * Reuses the existing scene objects. Each call first restores the captured rest
 * transform of every animated prop, then assigns the requested absolute frame.
 */
export function createPropAnimator(props: Readonly<Record<string, T.Object3D>>, anchors: Readonly<Record<string, readonly number[]>> | undefined, scenes: readonly {
  readonly id: string;
  readonly propAnimations?: readonly PropAnimation[];
}[]) {
  const byScene = new Map<string, readonly PropAnimation[]>(),
    rest = new Map<string, {
      object: T.Object3D;
      position: T.Vector3;
      rx: number;
      ry: number;
      rz: number;
    }>();
  for (const scene of scenes) {
    if (!scene.propAnimations?.length) continue;
    byScene.set(scene.id, scene.propAnimations);
    for (const a of scene.propAnimations) {
      if (!Object.hasOwn(props, a.prop)) storyFail('UNKNOWN_BINDING', 'Animated prop is not bound', {
        scene: scene.id,
        details: a.prop
      });
      if (a.type === 'slide' && !(anchors && Object.hasOwn(anchors, a.to))) storyFail('UNKNOWN_BINDING', 'Slide location is not bound', {
        scene: scene.id,
        details: a.to
      });
      if (!rest.has(a.prop)) {
        const object = props[a.prop];
        object.rotation.order = 'YXZ';
        rest.set(a.prop, {
          object,
          position: object.position.clone(),
          rx: object.rotation.x,
          ry: object.rotation.y,
          rz: object.rotation.z
        });
      }
    }
  }
  const reset = () => {
    for (const r of rest.values()) {
      r.object.position.copy(r.position);
      r.object.rotation.set(r.rx, r.ry, r.rz, 'YXZ');
    }
    for (const r of rest.values()) r.object.updateMatrixWorld(true);
  };
  return Object.freeze({
    animated: rest.size > 0,
    reset,
    apply(sceneId: string, frame: number) {
      for (const r of rest.values()) {
        r.object.position.copy(r.position);
        r.object.rotation.set(r.rx, r.ry, r.rz, 'YXZ');
      }
      const list = byScene.get(sceneId);
      if (list) for (const [id, r] of rest) {
        const mine = list.filter(a => a.prop === id);
        if (!mine.length) continue;
        const v = evaluatePropAnimation(mine, frame, {
          x: r.position.x,
          z: r.position.z
        }, name => anchors![name]);
        r.object.position.set(v.x, r.position.y + v.lift, v.z);
        r.object.rotation.set(r.rx + v.rx, r.ry + v.ry, r.rz + v.rz, 'YXZ');
      }
      for (const r of rest.values()) r.object.updateMatrixWorld(true);
    }
  });
}
export type PropAnimator = ReturnType<typeof createPropAnimator>;
