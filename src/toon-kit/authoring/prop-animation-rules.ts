import { storyFail } from '../story/types';
import type { StoryScene, PropAnimation } from '../story/types';
import { PROP_ANIMATION_LIMITS } from '../story/prop-animation';
import { planConstruction } from './construction';
import type { PlannedItem, Box } from './construction';
import type { EnvironmentLayout } from './environment-registry';
type V = [number, number, number];
const overlap = (a: Box, b: Box) => [0, 1, 2].every(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > 1e-5);
const body = (p: readonly number[]): Box => ({
  min: [p[0] - .65, 0, p[2] - .65],
  max: [p[0] + .65, 3.3, p[2] + .65]
});
/**
 * Authoring rules for Phase 6D-A: only independent custom-layout props animate, and every
 * conservative swept envelope must stay clear of scenery, ground edges and the actors'
 * declared standing/seat/path locations. No collision physics: a violation is rejected.
 */
export function checkPropAnimations(scene: StoryScene, layout: EnvironmentLayout) {
  const animations: readonly PropAnimation[] = scene.propAnimations ?? [];
  if (!animations.length) return;
  const reject = (code: string, message: string, details?: unknown): never => storyFail(code, message, {
    scene: scene.id,
    details
  });
  if (layout.preset !== 'custom') reject('PROP_ANIMATION_UNSUPPORTED', 'Prop animation requires a preset:"custom" layout; curated layouts keep static props');
  const plan = planConstruction(layout),
    specs = layout.composition!.items,
    byId = new Map<string, PlannedItem>(plan.items.map(i => [i.id, i])),
    marks = plan.marks as Record<string, V>;
  const eligible = plan.items.filter(i => animatable(i.id) === undefined).map(i => i.id);
  function animatable(id: string): string | undefined {
    const spec = specs[id];
    if (spec.kind !== undefined && spec.kind !== 'block') return 'structural ' + spec.kind + ' geometry is static';
    if (spec.object !== undefined) return 'composite objects are static in this release';
    if (spec.place.relation === 'attachedTo' || spec.place.relation === 'onTopOf') return 'attached or stacked props follow their parent';
    for (const [other, o] of Object.entries(specs)) if (other !== id && (o.place.relation === 'attachedTo' || o.place.relation === 'onTopOf') && (o.place as {
      target?: string;
    }).target === id) return other + ' is attached to it';
    return undefined;
  }
  // Everything the scene's actors rely on, resolved exactly as authored.
  const stands = new Set<string>(),
    seats = new Set<string>(),
    paths = new Set<string>();
  const support = (s: {
    type: string;
    at?: string;
    seat?: string;
    path?: string;
  }) => {
    if (s.type === 'stand' && s.at) stands.add(s.at);
    else if (s.type === 'sit' && s.seat) seats.add(s.seat);
    else if (s.type === 'walk' && s.path) paths.add(s.path);
  };
  for (const c of Object.values(scene.characters)) support(c.stance);
  for (const b of scene.beats) for (const a of b.actions) support(a as never);
  const slideTargets = new Map<string, string[]>();
  for (const a of animations) {
    if (!byId.has(a.prop)) reject('UNKNOWN_SLOT', `animated prop '${a.prop}' is unavailable in ${scene.setting}; choose ${eligible.join(', ') || '(none)'}`, {
      kind: 'animated prop',
      name: a.prop,
      allowed: eligible
    });
    const reason = animatable(a.prop);
    if (reason) reject('PROP_NOT_ANIMATABLE', `${a.prop}: ${reason}. Animate an independent block or prefab; choose ${eligible.join(', ') || '(none)'}`, {
      prop: a.prop,
      reason,
      allowed: eligible
    });
    if (a.type === 'slide') {
      if (!Object.hasOwn(marks, a.to)) reject('UNKNOWN_SLOT', `slide location '${a.to}' is unavailable in ${scene.setting}; choose ${Object.keys(marks).join(', ')}`, {
        kind: 'slide location',
        name: a.to,
        allowed: Object.keys(marks)
      });
      slideTargets.set(a.prop, [...(slideTargets.get(a.prop) ?? []), a.to]);
    }
  }
  const ids = [...new Set(animations.map(a => a.prop))];
  const thirdAt = layout.composition?.thirdActor?.at;
  for (const id of ids) {
    // Generated anchors are static snapshots of the REST layout; stale ones are rejected.
    const derived = [id + '.front', id + '.approach', 'to:' + id + '.front', 'to:' + id];
    const hit = [...stands].filter(n => derived.includes(n) || n === 'third' && thirdAt !== undefined && derived.includes(thirdAt)).concat([...paths].filter(n => derived.includes(n)), [...seats].filter(n => n === id));
    if (hit.length) reject('PROP_ANIMATION_STALE_TARGET', `${id} is animated, but ${hit.join(', ')} are static anchors of its rest position. Use fixed marks (entry/finish/right) for actors, or point/look at '${id}' itself`, {
      prop: id,
      references: hit
    });
  }
  const g = plan.ground, maxLift = Math.max(0, ...animations.filter(a => a.type === 'lift').map(a => (a as {
    height: number;
  }).height));
  const bodies: Box[] = [...stands].filter(n => Object.hasOwn(marks, n)).map(n => body(marks[n]));
  for (const s of seats) if (byId.has(s)) bodies.push(byId.get(s)!.box);
  for (const p of paths) {
    const ends = (plan.paths as Record<string, [string, string]>)[p];
    if (!ends) continue;
    const [a, b] = ends.map(n => marks[n]) as [V, V],
      steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / .25));
    for (let i = 0; i <= steps; i++) bodies.push(body([a[0] + (b[0] - a[0]) * i / steps, 0, a[2] + (b[2] - a[2]) * i / steps]));
  }
  for (const id of ids) {
    const item = byId.get(id)!, mine = animations.filter(a => a.prop === id);
    const yaw = mine.some(a => a.type === 'rotate' && (a as {
      axis: string;
    }).axis === 'y'), tilt = mine.some(a => a.type === 'rotate' && (a as {
      axis: string;
    }).axis !== 'y');
    const rel = {
      min: item.box.min.map((v, i) => v - item.position[i]),
      max: item.box.max.map((v, i) => v - item.position[i])
    };
    const radius = Math.max(...[rel.min[0], rel.max[0]].flatMap(x => [rel.min[2], rel.max[2]].map(z => Math.hypot(x, z)))),
      inflate = tilt ? Math.max(rel.max[1], .01) * Math.sin(PROP_ANIMATION_LIMITS.maxTiltDegrees * Math.PI / 180) : 0;
    const ylift = mine.some(a => a.type === 'lift') ? maxLift : 0;
    const envelope = (x: number, z: number): Box => yaw ? {
      min: [x - radius - inflate, item.box.min[1], z - radius - inflate],
      max: [x + radius + inflate, item.box.max[1] + ylift + (tilt ? inflate : 0), z + radius + inflate]
    } : {
      min: [x + rel.min[0] - inflate, item.box.min[1], z + rel.min[2] - inflate],
      max: [x + rel.max[0] + inflate, item.box.max[1] + ylift + (tilt ? inflate : 0), z + rel.max[2] + inflate]
    };
    // Rest position, then each slide destination in order; sample every segment.
    const stops: [number, number][] = [[item.position[0], item.position[2]], ...(slideTargets.get(id) ?? []).map(n => [marks[n][0], marks[n][2]] as [number, number])];
    const sweep: [number, number][] = [stops[0]];
    for (let i = 1; i < stops.length; i++) {
      const [a, b] = [stops[i - 1], stops[i]], n = Math.min(64, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .25)));
      for (let k = 1; k <= n; k++) sweep.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    for (const [x, z] of sweep) {
      const e = envelope(x, z);
      if (e.min[0] < -g.width / 2 || e.max[0] > g.width / 2 || e.min[2] < -g.depth / 2 || e.max[2] > g.depth / 2 || e.max[1] > 6) reject('PROP_ANIMATION_BLOCKED', `${id} would leave the ground footprint or 6m height during its animation`, {
        prop: id,
        at: [x, z]
      });
      const blocker = plan.items.find(o => o.id !== id && o.spec.kind !== 'floor' && overlap(e, o.box));
      if (blocker) reject('PROP_ANIMATION_BLOCKED', `${id} would intersect ${blocker.id} during its animation; choose a clearer slide, smaller rotation or lift, or move the scenery`, {
        prop: id,
        blocker: blocker.id,
        at: [x, z]
      });
      if (bodies.some(b => overlap(e, b))) reject('PROP_ANIMATION_BLOCKED', `${id} would enter an actor's standing, seat or walking space during its animation (no collision simulation exists)`, {
        prop: id,
        at: [x, z]
      });
    }
  }
}
