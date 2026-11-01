import * as T from 'three';
import { freezeData } from '../characters/pose';
import { storyFail } from './types';
import type { StoryEffect } from './types';
/**
 * Phase 6D-B: two fixed-duration cartoon effects. All geometry/materials are made
 * once per declared effect; frames only set transform, opacity and visibility.
 */
export const EFFECT_LIMITS = freezeData({
  perScene: 6,
  perStory: 8,
  simultaneous: 3,
  durations: {
    impactFlash: 8,
    dustPuff: 16
  },
  intensity: {
    low: .7,
    medium: 1,
    high: 1.4
  },
  puffs: 6
});
const obj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
export const effectEnd = (e: StoryEffect) => e.startFrame + EFFECT_LIMITS.durations[e.type];
/** Pure schema/budget validation; target names are checked by authoring/player. */
export function validateEffects(input: unknown, scene: {
  readonly id: string;
  readonly startFrame: number;
  readonly endFrame: number;
}): readonly StoryEffect[] {
  const fail = (code: string, message: string, details?: unknown): never => storyFail(code, message, {
    scene: scene.id,
    details
  });
  if (!Array.isArray(input) || !input.length) fail('INVALID_EFFECT', 'effects must be a nonempty array');
  if ((input as unknown[]).length > EFFECT_LIMITS.perScene) fail('EFFECT_BUDGET', 'Use at most ' + EFFECT_LIMITS.perScene + ' effects per scene', {
    count: (input as unknown[]).length,
    max: EFFECT_LIMITS.perScene
  });
  const list: StoryEffect[] = [];
  for (const raw of input as unknown[]) {
    if (!obj(raw)) fail('INVALID_EFFECT', 'Each effect must be an object');
    const e = raw as Record<string, unknown>;
    if (e.type !== 'impactFlash' && e.type !== 'dustPuff') fail('INVALID_EFFECT', 'type must be impactFlash or dustPuff', {
      type: e.type
    });
    const extra = Object.keys(e).filter(k => !['type', 'target', 'startFrame', 'intensity'].includes(k));
    if (extra.length) fail('INVALID_EFFECT', 'Unsupported effect fields (durations are fixed; no positions, colors or shaders): ' + extra.join(', '), {
      extra
    });
    if (typeof e.target !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(e.target)) fail('INVALID_EFFECT', 'target must name a layout prop or ground mark');
    if (e.intensity !== undefined && !Object.hasOwn(EFFECT_LIMITS.intensity, e.intensity as string)) fail('INVALID_EFFECT', 'intensity must be low, medium or high');
    const d = EFFECT_LIMITS.durations[e.type as StoryEffect['type']];
    if (!Number.isInteger(e.startFrame) || (e.startFrame as number) < scene.startFrame || (e.startFrame as number) + d > scene.endFrame) fail('INVALID_EFFECT', `${e.type} lasts ${d} frames and must start and finish inside the scene`, {
      startFrame: e.startFrame,
      duration: d,
      scene: [scene.startFrame, scene.endFrame]
    });
    list.push(Object.freeze({
      type: e.type,
      target: e.target,
      startFrame: e.startFrame,
      intensity: e.intensity ?? 'medium'
    }) as StoryEffect);
  }
  list.sort((a, b) => a.startFrame - b.startFrame || a.type.localeCompare(b.type) || a.target.localeCompare(b.target));
  for (const e of list) {
    const active = list.filter(o => o.startFrame < effectEnd(e) && effectEnd(o) > e.startFrame && o.startFrame <= e.startFrame).length;
    if (active > EFFECT_LIMITS.simultaneous) fail('EFFECT_BUDGET', `At most ${EFFECT_LIMITS.simultaneous} effects may be active at once`, {
      frame: e.startFrame,
      active,
      max: EFFECT_LIMITS.simultaneous
    });
  }
  return Object.freeze(list);
}
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
/** Pure per-frame visual parameters; no state between calls. */
export function effectState(e: StoryEffect, frame: number) {
  const d = EFFECT_LIMITS.durations[e.type], k = EFFECT_LIMITS.intensity[e.intensity ?? 'medium'];
  if (frame < e.startFrame || frame >= e.startFrame + d) return null;
  const t = (frame - e.startFrame) / (d - 1);
  if (e.type === 'impactFlash') return {
    t,
    scale: k * (.35 + .9 * easeOut(Math.min(1, t * 2))),
    opacity: t < .5 ? 1 : 1 - (t - .5) / .5 * .95
  };
  return {
    t,
    scale: k,
    spread: .25 + .75 * easeOut(t),
    rise: .35 * t,
    puff: .5 + .7 * easeOut(t),
    opacity: .85 * (1 - t)
  };
}
function starGeometry(points: number, outer: number, inner: number) {
  const s = new T.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + i * Math.PI / points, r = i % 2 ? inner : outer;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new T.ShapeGeometry(s);
}
const basic = (color: string) => new T.MeshBasicMaterial({
  color,
  transparent: true,
  depthWrite: false,
  side: T.DoubleSide,
  toneMapped: false
});
/** Deterministic dust layout: fixed angles and radii, no random state. */
const PUFF = Array.from({length: EFFECT_LIMITS.puffs}, (_, i) => ({
  angle: i / EFFECT_LIMITS.puffs * Math.PI * 2 + .35 * (i % 2),
  reach: .8 + .2 * ((i * 7) % 3) / 2,
  size: .8 + .25 * ((i * 5) % 3) / 2
}));
type Resolver = (target: string) => {
  readonly center: T.Vector3;
  readonly base: T.Vector3;
  readonly size: number;
  readonly front: T.Vector3;
};
/**
 * One reusable object per declared effect, created at construction and tracked by the
 * engine owner. Objects live outside setting roots, so stage bounds/proxies are unchanged.
 */
export function createEffectPlayer(engine: {
  readonly scene: T.Scene;
  track(o: T.Object3D): void;
}, scenes: readonly {
  readonly id: string;
  readonly effects?: readonly StoryEffect[];
}[], resolve: (sceneId: string) => Resolver) {
  const all = scenes.flatMap(s => (s.effects ?? []).map(e => ({scene: s.id, e})));
  if (all.length > EFFECT_LIMITS.perStory) storyFail('EFFECT_BUDGET', 'At most ' + EFFECT_LIMITS.perStory + ' effects per rendered story/segment', {
    details: {
      count: all.length,
      max: EFFECT_LIMITS.perStory
    }
  });
  const group = new T.Group();
  group.name = 'StoryEffects';
  group.userData.outlineMode = 'none';
  const star = all.some(x => x.e.type === 'impactFlash') ? [starGeometry(8, .55, .24), starGeometry(8, .32, .15)] : [],
    puff = all.some(x => x.e.type === 'dustPuff') ? new T.SphereGeometry(.18, 10, 6) : undefined;
  const items = all.map(({scene, e}) => {
    const root = new T.Group(), parts: T.Mesh[] = [];
    if (e.type === 'impactFlash') {
      parts.push(new T.Mesh(star[0], basic('#ffd84a')), new T.Mesh(star[1], basic('#fffbe8')));
      parts[1].position.z = .005;
      parts[1].rotation.z = Math.PI / 8;
    } else {
      const m = basic('#d8cbb4');
      for (let i = 0; i < EFFECT_LIMITS.puffs; i++) parts.push(new T.Mesh(puff!, m));
    }
    for (const p of parts) {
      p.castShadow = p.receiveShadow = false;
      p.renderOrder = 10;
      p.userData.outlineMode = 'none';
      root.add(p);
    }
    root.visible = false;
    group.add(root);
    return {scene, e, root, parts};
  });
  engine.scene.add(group);
  engine.track(group);
  // Canonical hidden state: every frame starts here, so no object state survives between requests.
  const hide = () => {
    for (const i of items) {
      i.root.visible = false;
      i.root.position.set(0, 0, 0);
      i.root.quaternion.identity();
      i.root.scale.setScalar(1);
      for (const p of i.parts) {
        if (i.e.type === 'dustPuff') {
          p.position.set(0, 0, 0);
          p.scale.setScalar(1);
        }
        (p.material as T.MeshBasicMaterial).opacity = 0;
      }
    }
  };
  return Object.freeze({
    count: items.length,
    group,
    apply(sceneId: string, frame: number) {
      hide();
      for (const i of items) {
        if (i.scene !== sceneId) continue;
        const s = effectState(i.e, frame);
        if (!s) continue;
        const at = resolve(sceneId)(i.e.target);
        i.root.visible = true;
        if (i.e.type === 'impactFlash') {
          // Facing the stage front (approved cameras are within 30 degrees of it).
          i.root.position.copy(at.center).addScaledVector(at.front, at.size * .5 + .05);
          i.root.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), at.front);
          i.root.scale.setScalar(s.scale * Math.max(.6, at.size));
          for (const p of i.parts) (p.material as T.MeshBasicMaterial).opacity = s.opacity;
        } else {
          i.root.position.copy(at.base);
          i.root.quaternion.identity();
          i.root.scale.setScalar(1);
          // Start just outside the target footprint and spread outward.
          const r = (at.size * .5 + .1 + .55 * s.spread!) * s.scale;
          i.parts.forEach((p, n) => {
            const q = PUFF[n];
            p.position.set(Math.cos(q.angle) * r * q.reach, .12 + s.rise! * q.size, Math.sin(q.angle) * r * q.reach);
            p.scale.setScalar(s.puff! * q.size * s.scale);
          });
          (i.parts[0].material as T.MeshBasicMaterial).opacity = s.opacity!;
        }
      }
      group.updateMatrixWorld(true);
    },
    dispose() {
      hide();
      group.removeFromParent();
    }
  });
}
export type EffectPlayer = ReturnType<typeof createEffectPlayer>;
