import { freezeData } from '../characters/pose';
import { storyFail } from '../story/types';
import { PREFABS } from './environment-registry';
import type { EnvironmentLayout, PrefabName } from './environment-registry';
import { validateDisplayText } from './display-content';
import { planObject, OBJECT_LIMITS } from './composite';
import type { CompositeObject, ObjectPlan } from './composite';
export const CONSTRUCTION_LIMITS = freezeData({
  items: 24,
  structures: 18,
  props: 6,
  meshes: 40,
  threeActorMeshes: 28,
  triangles: 12000,
  materials: 24,
  textures: 6,
  textTextures: 4,
  attachmentDepth: 2
});
export const STRUCTURES = freezeData({
  floor: {
    size: [3, .04, 3],
    min: [1, .04, 1],
    max: [8, .04, 8]
  },
  wall: {
    size: [6, 3.8, .25],
    min: [1, 1.5, .12],
    max: [12, 5, .5]
  },
  panel: {
    size: [2, 1, .12],
    min: [.5, .4, .08],
    max: [4, 3, .25]
  },
  trim: {
    size: [4, .15, .04],
    min: [.4, .04, .02],
    max: [12, .4, .1]
  },
  window: {
    size: [1.4, 1, .08],
    min: [.6, .6, .08],
    max: [4, 2.2, .15]
  },
  door: {
    size: [1.3, 2.5, .1],
    min: [.8, 2, .08],
    max: [1.8, 3, .15]
  },
  platform: {
    size: [2, .3, 2],
    min: [.5, .1, .5],
    max: [4, .6, 4]
  },
  barrier: {
    size: [3, .65, .2],
    min: [.5, .3, .12],
    max: [5, 1, .4]
  },
  column: {
    size: [.4, 3, .4],
    min: [.2, 1, .2],
    max: [.8, 4, .8]
  },
  block: {
    size: [1, 1, 1],
    min: [.3, .3, .3],
    max: [3, 3, 3]
  },
  tree: {
    size: [1.4, 2.6, 1.4],
    min: [1, 2, 1],
    max: [2, 3.5, 2]
  }
} as const);
export type StructureKind = keyof typeof STRUCTURES;
export const STRUCTURE_FINISHES = freezeData([
  'cream',
  'brick',
  'slate',
  'white',
  'wood',
  'charcoal',
  'metal',
  'navy',
  'teal',
  'mint',
  'red',
  'yellow'
] as const);
export type StructureFinish = typeof STRUCTURE_FINISHES[number];

export const GROUND_FINISHES = freezeData(['sand', 'grass', 'paving', 'wood', 'slate', 'tile', 'carpet'] as const);
export type GroundFinish = typeof GROUND_FINISHES[number];
type Facing = 'front' | 'right' | 'back' | 'left';
type Align = 'center' | 'start' | 'end';
export type Placement = {
  relation: 'alongBoundary';
  boundary: 'back' | 'front' | 'left' | 'right';
  align?: Align;
  gap?: number;
} | {
  relation: 'beside' | 'behind' | 'inFrontOf';
  target: string;
  side?: 'left' | 'right';
  align?: Align;
  gap?: number;
} | {
  relation: 'near';
  target: string;
  side: 'left' | 'right' | 'front' | 'behind';
  gap?: number;
} | {
  relation: 'onTopOf';
  target: string;
} | {
  relation: 'attachedTo';
  target: string;
  face: 'front';
  align?: Align;
  vertical?: 'bottom' | 'middle' | 'top';
};
export interface ConstructionItem {
  readonly kind?: StructureKind;
  readonly prefab?: PrefabName;
  /** Phase 6E-A: composite object built from named primitive parts. */
  readonly object?: CompositeObject;
  readonly size?: Readonly<{
    width?: number;
    height?: number;
    depth?: number;
  }>;
  readonly facing?: Facing;
  readonly finish?: string;
  readonly text?: string;
  readonly place: Placement;
}
export interface Construction {
  /** Opt-in third contact role at a generated item.front or seat.approach mark. */
  readonly thirdActor?: Readonly<{at:string}>;
  readonly ground: Readonly<{
    width: number;
    depth: number;
    finish?: GroundFinish;
  }>;
  readonly items: Readonly<Record<string, ConstructionItem>>;
}
type V = [number, number, number];
export interface Box {
  min: V;
  max: V;
}
export interface PlannedItem {
  id: string;
  spec: ConstructionItem;
  size: V;
  local: Box;
  box: Box;
  position: V;
  turn: number;
  mounted: boolean;
  depth: number;
  object?: ObjectPlan;
}
function fail(code: string, message: string): never {
  return storyFail(code, message);
}
const keys = (v: unknown, allowed: readonly string[]) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !allowed.includes(k))) fail('INVALID_CONSTRUCTION', 'Use only ' + allowed.join(', '));
};
const number = (v: unknown, min: number, max: number, label: string) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('INVALID_DIMENSION', `${label}: use a finite value in ${min}..${max}`);
  return v as number;
};
const option = (v: unknown, allowed: readonly string[], label: string) => {
  if (typeof v !== 'string' || !allowed.includes(v)) fail('INVALID_PLACEMENT', label + ': choose ' + allowed.join(', '));
};
const safe = (id: string) => /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id) && !['constructor', 'prototype', 'stage', 'entry', 'finish', 'right', 'ground', 'audience', 'toMeeting'].includes(id);
const rotate = (x: number, z: number, q: number): [number, number] => q === 0 ? [x, z] : q === 1 ? [z, -x] : q === 2 ? [-x, -z] : [-z, x];
const move = (b: Box, p: V): Box => ({
  min: b.min.map((n, i) => n + p[i]) as V,
  max: b.max.map((n, i) => n + p[i]) as V
});
function oriented(b: Box, q: number): Box {
  const corners = [rotate(b.min[0], b.min[2], q), rotate(b.min[0], b.max[2], q), rotate(b.max[0], b.min[2], q), rotate(b.max[0], b.max[2], q)];
  return {
    min: [Math.min(...corners.map(c => c[0])), b.min[1], Math.min(...corners.map(c => c[1]))],
    max: [Math.max(...corners.map(c => c[0])), b.max[1], Math.max(...corners.map(c => c[1]))]
  };
}
const overlap = (a: Box, b: Box) => [0, 1, 2].every(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > 1e-5);
const center = (b: Box, i: number) => (b.min[i] + b.max[i]) / 2;
const align = (parent: Box, child: Box, i: number, a: Align = 'center', inset = 0) => a === 'start' ? parent.min[i] + inset - child.min[i] : a === 'end' ? parent.max[i] - inset - child.max[i] : center(parent, i) - center(child, i);
const markers: Record<string, V> = freezeData({
  entry: [-1.1, 0, -.1],
  finish: [-1.1, 0, .6],
  right: [1.15, 0, .35],
  audience: [0, 2.7, 5]
});
const body = (p: V): Box => ({
  min: [p[0] - .65, 0, p[2] - .65],
  max: [p[0] + .65, 3.3, p[2] + .65]
});
// Conservative fixed prefab envelopes match the shared Phase 6A builders.
function prefabBox(kind: PrefabName, mounted: boolean): Box {
  if (kind === 'chair' || kind === 'bench') return {
    min: [kind === 'chair' ? -.55 : -.75, 0, -.5],
    max: [kind === 'chair' ? .55 : .75, kind === 'chair' ? 1.9 : 1.24, .475]
  };
  if (kind === 'table') return {
    min: [-.7, 0, -.425],
    max: [.7, .9, .425]
  };
  if (kind === 'planter') return {
    min: [-.28, 0, -.28],
    max: [.28, .86, .28]
  };
  return {
    min: [mounted ? -.56 : -.86, 0, -.09],
    max: [mounted ? .56 : .86, mounted ? .95375 : 3.06, .025]
  };
}
/** Pure bounded planner. No Three.js objects, renderer state or mutable caches. */
export function planConstruction(input: unknown) {
  keys(input, ['preset', 'composition']);
  const layout = input as EnvironmentLayout;
  if (layout.preset !== 'custom') fail('INVALID_CONSTRUCTION', 'Select preset:custom');
  keys(layout.composition, ['ground', 'items', 'thirdActor']);
  const c = layout.composition!;
  if(c.thirdActor!==undefined){keys(c.thirdActor,['at']);if(typeof c.thirdActor.at!=='string'||!/^\w[\w-]*\.(front|approach)$/.test(c.thirdActor.at))fail('THIRD_ACTOR_PLACEMENT','thirdActor.at must name a generated item.front or seat.approach mark');}
  const meshLimit=c.thirdActor?CONSTRUCTION_LIMITS.threeActorMeshes:CONSTRUCTION_LIMITS.meshes;
  keys(c.ground, ['width', 'depth', 'finish']);
  const width = number(c.ground.width, 10, 20, 'ground.width'),
    depth = number(c.ground.depth, 10, 20, 'ground.depth');
  if (c.ground.finish !== undefined) option(c.ground.finish, GROUND_FINISHES, 'ground.finish');
  if (!c.items || typeof c.items !== 'object' || Array.isArray(c.items) || !Object.keys(c.items).length || Object.keys(c.items).length > CONSTRUCTION_LIMITS.items) fail('CONSTRUCTION_BUDGET', 'Declare 1..24 construction items');
  const specs: Record<string, ConstructionItem> = {};
  let structures = 0,
    props = 0,
    textures = 0,
    objects = 0;
  const objectPlans: Record<string, ObjectPlan> = {};
  for (const id of Object.keys(c.items).sort()) {
    if (!safe(id)) fail('INVALID_CONSTRUCTION_ID', 'Use a safe unique item ID, distinct from built-in anchors: ' + id);
    const s = c.items[id];
    keys(s, ['kind', 'prefab', 'object', 'size', 'facing', 'finish', 'text', 'place']);
    if ([s.kind, s.prefab, s.object].filter(v => v !== undefined).length !== 1) fail('INVALID_CONSTRUCTION', id + ': choose exactly one kind, prefab or object');
    if (s.object !== undefined) {
      if (++objects > OBJECT_LIMITS.objects) fail('OBJECT_BUDGET', `Use at most ${OBJECT_LIMITS.objects} composite objects per layout`);
      if (s.size !== undefined || s.finish !== undefined || s.text !== undefined) fail('INVALID_OBJECT', id + ': set size and finish on each object part; objects have no text');
      objectPlans[id] = planObject(id, s.object);
    } else if (s.kind !== undefined) {
      if (!Object.hasOwn(STRUCTURES, s.kind)) fail('UNKNOWN_STRUCTURE', id + ': choose ' + Object.keys(STRUCTURES).join(', '));
      structures++;
      if (s.finish !== undefined) option(s.finish, STRUCTURE_FINISHES, id + '.finish');
    } else {
      if (!Object.hasOwn(PREFABS, s.prefab!)) fail('UNSUPPORTED_PREFAB', id + ': unknown prefab ' + s.prefab);
      props++;
      if (s.finish !== undefined && !PREFABS[s.prefab!].finishes.includes(s.finish)) fail('UNSUPPORTED_APPEARANCE', id + ': choose ' + PREFABS[s.prefab!].finishes.join(', '));
    }
    if (s.size !== undefined) {
      keys(s.size, ['width', 'height', 'depth']);
      if (s.prefab) fail('INVALID_DIMENSION', id + ': prefab sizes are fixed');
      for (const [i, key] of (['width', 'height', 'depth'] as const).entries()) if (s.size[key] !== undefined) number(s.size[key], STRUCTURES[s.kind!].min[i], STRUCTURES[s.kind!].max[i], id + '.size.' + key);
    }
    if (s.facing !== undefined) option(s.facing, ['front', 'right', 'back', 'left'], id + '.facing');
    if (s.text !== undefined) {
      if (!s.prefab || !PREFABS[s.prefab].display) fail('INCOMPATIBLE_PROP_CONTENT', id + ': use a sign or screen for text');
      validateDisplayText(s.text);
      textures++;
    }
    keys(s.place, ['relation', 'target', 'boundary', 'side', 'align', 'gap', 'face', 'vertical']);
    const p = s.place;
    option(p.relation, ['alongBoundary', 'beside', 'behind', 'inFrontOf', 'near', 'onTopOf', 'attachedTo'], id + '.place.relation');
    const allowed = p.relation === 'alongBoundary' ? ['relation', 'boundary', 'align', 'gap'] : p.relation === 'attachedTo' ? ['relation', 'target', 'face', 'align', 'vertical'] : p.relation === 'onTopOf' ? ['relation', 'target'] : p.relation === 'near' ? ['relation', 'target', 'side', 'gap'] : ['relation', 'target', 'side', 'align', 'gap'];
    keys(p, allowed);
    if (p.relation === 'alongBoundary') option(p.boundary, ['back', 'front', 'left', 'right'], id + '.boundary');else if (typeof p.target !== 'string' || !p.target) fail('MISSING_CONSTRUCTION_TARGET', id + ': provide a named placement target');
    if ('align' in p && p.align !== undefined) option(p.align, ['center', 'start', 'end'], id + '.align');
    if ('gap' in p && p.gap !== undefined) number(p.gap, 0, 3, id + '.gap');
    if (p.relation === 'near') option(p.side, ['left', 'right', 'front', 'behind'], id + '.side');
    if (p.relation === 'beside') option(p.side, ['left', 'right'], id + '.side');
    if ((p.relation === 'behind' || p.relation === 'inFrontOf') && p.side !== undefined) fail('INVALID_PLACEMENT', id + ': use align rather than side');
    if (p.relation === 'attachedTo') {
      option(p.face, ['front'], id + '.face');
      if (p.vertical !== undefined) option(p.vertical, ['bottom', 'middle', 'top'], id + '.vertical');
    }
    specs[id] = JSON.parse(JSON.stringify(s));
  }
  if (structures > CONSTRUCTION_LIMITS.structures || props > CONSTRUCTION_LIMITS.props || textures > CONSTRUCTION_LIMITS.textTextures) fail('CONSTRUCTION_BUDGET', 'Use at most 18 structures, 6 prefabs and 4 text textures');
  const meshes = 1 + Object.values(specs).reduce((n, s) => n + (s.prefab ? {
    chair: 6,
    bench: 6,
    table: 5,
    sign: 3,
    screen: 3,
    planter: 2
  }[s.prefab] : s.object ? Object.keys(s.object.parts).length : ['tree', 'window', 'door'].includes(s.kind!) ? 2 : 1), 0);
  if (meshes > meshLimit) fail('CONSTRUCTION_BUDGET', 'Construction needs ' + meshes + ' meshes; maximum is ' + meshLimit + (c.thirdActor?' with three actors':''));
  const resolved = new Map<string, PlannedItem>(),
    active = new Set<string>();
  const groundBox: Box = {
    min: [-width / 2, -.1, -depth / 2],
    max: [width / 2, 0, depth / 2]
  };
  function resolve(id: string): PlannedItem {
    if (resolved.has(id)) return resolved.get(id)!;
    if (!Object.hasOwn(specs, id)) fail('MISSING_CONSTRUCTION_TARGET', 'Unknown construction target ' + id);
    if (active.has(id)) fail('PLACEMENT_CYCLE', 'Cyclic placement dependency at ' + id);
    active.add(id);
    const spec = specs[id],
      p = spec.place,
      mounted = p.relation === 'attachedTo' || p.relation === 'onTopOf';
    let turn = ['front', 'right', 'back', 'left'].indexOf(spec.facing ?? 'front'),
      attachmentDepth = 0;
    const size: V = spec.kind ? STRUCTURES[spec.kind].size.map((v, i) => number(spec.size?.[(['width', 'height', 'depth'] as const)[i]] ?? v, STRUCTURES[spec.kind!].min[i], STRUCTURES[spec.kind!].max[i], id + '.size')) as V : [0, 0, 0];
    if (spec.kind === 'column' && size[0] !== size[2] || spec.kind === 'tree' && size[0] !== size[2]) fail('INVALID_DIMENSION', id + ': width and depth must match');
    const local = objectPlans[id] ? {
      min: [...objectPlans[id].local.min] as V,
      max: [...objectPlans[id].local.max] as V
    } : spec.prefab ? prefabBox(spec.prefab, mounted) : {
      min: [-size[0] / 2, spec.kind === 'floor' ? -size[1] : 0, -size[2] / 2] as V,
      max: [size[0] / 2, spec.kind === 'floor' ? 0 : size[1], size[2] / 2] as V
    };
    let b = oriented(local, turn),
      position: V = [0, 0, 0];
    if (p.relation === 'alongBoundary') {
      const axis = p.boundary === 'left' || p.boundary === 'right' ? 0 : 2,
        tangent = axis === 0 ? 2 : 0,
        positive = p.boundary === 'right' || p.boundary === 'front',
        gap = p.gap ?? .3;
      position[axis] = positive ? groundBox.max[axis] - gap - b.max[axis] : groundBox.min[axis] + gap - b.min[axis];
      position[tangent] = align(groundBox, b, tangent, p.align, .3);
    } else if (p.relation === 'near') {
      const target = Object.hasOwn(markers, p.target) ? markers[p.target] : p.target.endsWith('.front') ? front(resolve(p.target.slice(0, -6))) : undefined;
      if (!target || p.target === 'audience') fail('MISSING_CONSTRUCTION_TARGET', id + ': near requires entry, finish, right or an item.front ground location');
      const axis = p.side === 'left' || p.side === 'right' ? 0 : 2,
        positive = p.side === 'right' || p.side === 'front';
      position = [target[0], 0, target[2]];
      position[axis] = positive ? target[axis] + .65 + (p.gap ?? .5) - b.min[axis] : target[axis] - .65 - (p.gap ?? .5) - b.max[axis];
    } else {
      const parent = resolve(p.target);
      if (p.relation === 'attachedTo') {
        if (!['wall', 'panel'].includes(parent.spec.kind ?? '') || !['window', 'door', 'panel', 'trim', 'sign', 'screen'].includes(spec.kind ?? spec.prefab ?? '')) fail('INVALID_ATTACHMENT', id + ': attach window/door/panel/trim/sign/screen to a wall or panel front');
        if (spec.facing !== undefined && turn !== parent.turn) fail('INVALID_ATTACHMENT', id + ': attached facing inherits the parent');
        turn = parent.turn;
        b = oriented(local, turn);
        attachmentDepth = parent.depth + 1;
        const x = align(parent.local, local, 0, p.align, .15),
          y = align(parent.local, local, 1, p.vertical === 'top' ? 'end' : p.vertical === 'bottom' ? 'start' : 'center', .15),
          z = parent.local.max[2] + .01 - local.min[2];
        if (local.max[0] - local.min[0] > parent.local.max[0] - parent.local.min[0] - .3 || local.max[1] - local.min[1] > parent.local.max[1] - parent.local.min[1] - .3) fail('INVALID_ATTACHMENT', id + ': attachment must fit inside its parent face with 0.15m margins');
        const [rx, rz] = rotate(x, z, parent.turn);
        position = [parent.position[0] + rx, parent.position[1] + y, parent.position[2] + rz];
      } else if (p.relation === 'onTopOf') {
        if (!['platform', 'block', 'table'].includes(parent.spec.kind ?? parent.spec.prefab ?? '') || !['column', 'block', 'planter', 'sign', 'screen', 'object'].includes(spec.kind ?? spec.prefab ?? (spec.object ? 'object' : ''))) fail('INVALID_ATTACHMENT', id + ': top support must be platform/block/table; child column/block/planter/sign/screen/object');
        attachmentDepth = parent.depth + 1;
        position = [align(parent.box, b, 0), parent.box.max[1] - b.min[1], align(parent.box, b, 2)];
        if (b.max[0] - b.min[0] > parent.box.max[0] - parent.box.min[0] || b.max[2] - b.min[2] > parent.box.max[2] - parent.box.min[2]) fail('INVALID_ATTACHMENT', id + ': child footprint exceeds top support');
      } else {
        const axis = p.relation === 'beside' ? 0 : 2,
          tangent = axis === 0 ? 2 : 0,
          positive = p.relation === 'inFrontOf' || p.relation === 'beside' && p.side === 'right';
        position[axis] = positive ? parent.box.max[axis] + (p.gap ?? .3) - b.min[axis] : parent.box.min[axis] - (p.gap ?? .3) - b.max[axis];
        position[tangent] = align(parent.box, b, tangent, p.align);
      }
    }
    if (attachmentDepth > CONSTRUCTION_LIMITS.attachmentDepth) fail('ATTACHMENT_DEPTH', id + ': maximum attachment depth is 2');
    const box = move(b, position);
    if (box.min[0] < groundBox.min[0] - 1e-5 || box.max[0] > groundBox.max[0] + 1e-5 || box.min[2] < groundBox.min[2] - 1e-5 || box.max[2] > groundBox.max[2] + 1e-5 || box.max[1] > 6) fail('OUTSIDE_GROUND', id + ': keep the piece within the ground footprint and 6m height budget');
    const item = {
      id,
      spec,
      size,
      local,
      box,
      position,
      turn,
      mounted,
      depth: attachmentDepth,
      ...(objectPlans[id] ? {
        object: objectPlans[id]
      } : {})
    };
    resolved.set(id, item);
    active.delete(id);
    return item;
  }
  function front(item: PlannedItem): V {
    const [dx, dz] = rotate(0, item.local.max[2] + 1.2, item.turn);
    return [item.position[0] + dx, 0, item.position[2] + dz];
  }
  Object.keys(specs).forEach(resolve);
  const items = Object.keys(specs).map(id => resolved.get(id)!);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (overlap(items[i].box, items[j].box)) fail('STRUCTURAL_OVERLAP', `${items[i].id} intersects ${items[j].id}; change relation, align or gap`);
  const clear = (p: V) => p[0] - .65 >= groundBox.min[0] && p[0] + .65 <= groundBox.max[0] && p[2] - .65 >= groundBox.min[2] && p[2] + .65 <= groundBox.max[2] && !items.some(i => i.spec.kind !== 'floor' && overlap(body(p), i.box));
  // Exact line-vs-expanded-AABB test on a level plane, not a navigation solver.
  const clearPath = (a: V, b: V, extra: readonly Box[] = []) => ![...items.map(i=>i.box),...extra].some(box => {
    if (box.max[1] <= .001) return false;
    let lo = 0,
      hi = 1;
    for (const k of [0, 2]) {
      const min = box.min[k] - .65,
        max = box.max[k] + .65,
        d = b[k] - a[k];
      if (Math.abs(d) < 1e-9) {
        if (a[k] < min || a[k] > max) return false;
      } else {
        let t0 = (min - a[k]) / d,
          t1 = (max - a[k]) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        lo = Math.max(lo, t0);
        hi = Math.min(hi, t1);
        if (lo > hi) return false;
      }
    }
    return hi >= lo;
  });
  for (const id of ['entry', 'finish', 'right']) if (!clear(markers[id])) fail('BLOCKED_INTERACTION', id + ' standing clearance intersects construction; move structures away from the actor area');
  if (!clearPath(markers.entry, markers.finish)) fail('BLOCKED_INTERACTION', 'Default toMeeting path intersects construction');
  const marks: Record<string, V> = {
      entry: [...markers.entry],
      finish: [...markers.finish],
      right: [...markers.right]
    },
    roles: Record<string, 'left' | 'right' | 'third'> = {
      entry: 'left',
      finish: 'left',
      right: 'right',
      toMeeting: 'left'
    },
    paths: Record<string, [string, string]> = {
      toMeeting: ['entry', 'finish']
    };
  const seats: string[] = [];
  for (const item of items) {
    const id = item.id,
      location = front(item),
      name = id + '.front',
      role = location[0] <= 0 ? 'left' : 'right';
    if (clear(location)) {
      marks[name] = location;
      roles[name] = role;
      const from = role === 'left' ? 'entry' : 'right';
      if (Math.hypot(location[0] - marks[from][0], location[2] - marks[from][2]) > .05 && clearPath(marks[from], location)) {
        paths['to:' + name] = [from, name];
        roles['to:' + name] = role;
      }
    }
    if (item.spec.prefab && PREFABS[item.spec.prefab].seat) {
      seats.push(id);
      roles[id] = item.position[0] <= 0 ? 'left' : 'right';
      const [dx, dz] = rotate(0, item.local.max[2] + .75, item.turn),
        approach: V = [item.position[0] + dx, 0, item.position[2] + dz],
        an = id + '.approach';
      if (clear(approach)) {
        marks[an] = approach;
        roles[an] = roles[id];
        const from = roles[id] === 'left' ? 'entry' : 'right';
        if (Math.hypot(approach[0] - marks[from][0], approach[2] - marks[from][2]) > .05 && clearPath(marks[from], approach)) {
          paths['to:' + id] = [from, an];
          roles['to:' + id] = roles[id];
        }
      }
    }
  }
  if(c.thirdActor){
    const at=c.thirdActor.at,anchor=marks[at];
    if(!anchor||Object.hasOwn(specs,'third'))fail('THIRD_ACTOR_PLACEMENT','Choose a clear generated ground mark and reserve the name third');
    const seatId=at.endsWith('.approach')?at.slice(0,-9):undefined;
    let reserved=body(anchor);
    const seatEnvelope=(item:PlannedItem)=>move(oriented({min:[-.75,0,-.15],max:[.75,3.3,1.4]},item.turn),item.position);
    if(seatId){
      const seat=resolved.get(seatId)!;
      const contact=seatEnvelope(seat);
      reserved={min:reserved.min.map((v,i)=>Math.min(v,contact.min[i])) as V,max:reserved.max.map((v,i)=>Math.max(v,contact.max[i])) as V};
    }
    if(items.some(i=>i.id!==seatId&&i.spec.kind!=='floor'&&overlap(reserved,i.box))||['entry','finish','right'].some(id=>overlap(reserved,body(marks[id]))))fail('THIRD_ACTOR_PLACEMENT','Third contact space intersects scenery or the existing lanes; move the chosen item or select another clear mark');
    // Reuse the existing swept-AABB clearance for the new static reservation.
    if([0,2].some(k=>reserved.min[k]<groundBox.min[k]||reserved.max[k]>groundBox.max[k]))fail('THIRD_ACTOR_PLACEMENT','Third contact space must fit inside the ground');
    if(!clearPath(marks.entry,marks.finish,[reserved]))fail('THIRD_ACTOR_PLACEMENT','Third contact space blocks toMeeting; choose another mark');
    for(const id of Object.keys(marks))if(id!==at&&overlap(reserved,body(marks[id]))){delete marks[id];delete roles[id];}
    for(let i=seats.length-1;i>=0;i--)if(seats[i]!==seatId&&overlap(reserved,seatEnvelope(resolved.get(seats[i])!))){delete roles[seats[i]];seats.splice(i,1);}
    for(const [id,[from,to]]of Object.entries(paths))if(!marks[from]||!marks[to]||to===at||!clearPath(marks[from],marks[to],[reserved])){delete paths[id];delete roles[id];}
    marks.third=[...anchor];roles.third=roles[at]='third';
    if(seatId)roles[seatId]='third';
  }
  const normalized: EnvironmentLayout = {
    preset: 'custom',
    composition: {
      ground: {
        width,
        depth,
        finish: c.ground.finish ?? 'sand'
      },
      items: specs,
      ...(c.thirdActor?{thirdActor:{at:c.thirdActor.at}}:{})
    }
  };
  return freezeData({
    layout: normalized,
    meshLimit,
    items,
    ground: {
      width,
      depth,
      finish: c.ground.finish ?? 'sand'
    },
    marks,
    paths,
    catalog: {
      marks: Object.keys(marks),
      seats,
      points: ['audience', ...items.map(i => i.id)],
      props: items.map(i => i.id),
      floors: ['ground'],
      paths: Object.keys(paths),
      roles
    }
  });
}
