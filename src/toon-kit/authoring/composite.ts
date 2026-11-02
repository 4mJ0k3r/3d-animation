import { freezeData } from '../characters/pose';
import { storyFail } from '../story/types';
import { validateDisplayText } from './display-content';
/**
 * Phase 6E-A composite objects: a few named primitive parts placed by relations,
 * never by coordinates. Pure planning only; geometry is built by the construction builder.
 */
export const OBJECT_LIMITS = freezeData({
  objects: 4,
  parts: 8,
  depth: 4,
  partMin: .04,
  partMax: 3,
  extent: [3, 4.5, 3],
  gapMax: .5,
  trianglesPerObject: 2500
});
export const OBJECT_SHAPES = freezeData(['box', 'roundedBox', 'sphere', 'cylinder', 'capsule'] as const);
/** Conservative per-part upper bounds for the builder's fixed segment counts. */
export const OBJECT_TRIANGLES = freezeData({
  box: 12,
  roundedBox: 400,
  sphere: 300,
  cylinder: 64,
  capsule: 300
});
export const OBJECT_FINISHES = freezeData({
  cream: '#e8dfd1',
  white: '#fff6e5',
  wood: '#b98c5c',
  brick: '#c88d78',
  slate: '#7e929e',
  charcoal: '#3b3f45',
  metal: '#a9b3bd',
  navy: '#2f4a73',
  teal: '#2a8f8a',
  mint: '#7fd1b9',
  red: '#c9503f',
  yellow: '#e8b93a',
  glow: '#fff2a8'
});
export type ObjectShape = typeof OBJECT_SHAPES[number];
export type ObjectFinish = keyof typeof OBJECT_FINISHES;
export type PartPlacement = {
  readonly on: string;
} | {
  readonly beside: string;
  readonly side: 'left' | 'right' | 'front' | 'back';
  readonly align?: 'bottom' | 'middle' | 'top';
  readonly gap?: number;
} | {
  readonly centeredOn: string;
};
export interface ObjectPart {
  readonly shape: ObjectShape;
  readonly size: Readonly<{
    width: number;
    height: number;
    depth?: number;
  }>;
  readonly finish?: ObjectFinish;
  /** Cylinder only: top diameter as a fraction of the base diameter. */
  readonly taper?: number;
  /** Omit for exactly one root part, which stands on the ground at the object origin. */
  readonly place?: PartPlacement;
  /** Optional readable Hindi/English label for flat box parts. */
  readonly text?: string;
}
export interface CompositeObject {
  readonly parts: Readonly<Record<string, ObjectPart>>;
  /** Part used as the pointing/gaze target; defaults to the root part. */
  readonly focus?: string;
}
type V = [number, number, number];
export interface PlannedPart {
  readonly id: string;
  readonly shape: ObjectShape;
  readonly size: V;
  readonly taper: number;
  readonly center: V;
  readonly color: string;
  readonly depth: number;
  readonly text?: string;
}
const SAFE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export function planObject(itemId: string, input: unknown) {
  const fail = (code: string, message: string): never => storyFail(code, itemId + '.object: ' + message);
  const obj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const only = (v: unknown, allowed: readonly string[], where: string) => {
    if (!obj(v)) fail('INVALID_OBJECT', where + ' must be an object');
    const extra = Object.keys(v as object).filter(k => !allowed.includes(k));
    if (extra.length) fail('INVALID_OBJECT', `${where}: unsupported ${extra.join(', ')}; use only ${allowed.join(', ')} (no coordinates, meshes or shaders)`);
  };
  only(input, ['parts', 'focus'], 'object');
  const def = input as CompositeObject;
  if (!obj(def.parts)) fail('INVALID_OBJECT', 'declare parts as named objects');
  const ids = Object.keys(def.parts).sort();
  if (!ids.length || ids.length > OBJECT_LIMITS.parts) fail('OBJECT_BUDGET', `use 1..${OBJECT_LIMITS.parts} parts (got ${ids.length})`);
  const num = (v: unknown, min: number, max: number, where: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('INVALID_OBJECT', `${where}: use a number in ${min}..${max}`);
    return v as number;
  };
  for (const id of ids) {
    if (!SAFE.test(id)) fail('INVALID_OBJECT', 'unsafe part name ' + id);
    const p = def.parts[id];
    only(p, ['shape', 'size', 'finish', 'taper', 'place', 'text'], 'part ' + id);
    if (!OBJECT_SHAPES.includes(p.shape)) fail('INVALID_OBJECT', `part ${id}: shape must be ${OBJECT_SHAPES.join(', ')}`);
    only(p.size, ['width', 'height', 'depth'], `part ${id}.size`);
    for (const k of ['width', 'height'] as const) num(p.size[k], OBJECT_LIMITS.partMin, OBJECT_LIMITS.partMax, `part ${id}.size.${k}`);
    if (p.size.depth !== undefined) num(p.size.depth, OBJECT_LIMITS.partMin, OBJECT_LIMITS.partMax, `part ${id}.size.depth`);
    if (p.finish !== undefined && !Object.hasOwn(OBJECT_FINISHES, p.finish)) fail('INVALID_OBJECT', `part ${id}: finish must be ${Object.keys(OBJECT_FINISHES).join(', ')}`);
    if (p.taper !== undefined) {
      if (p.shape !== 'cylinder') fail('INVALID_OBJECT', `part ${id}: taper applies only to cylinders`);
      num(p.taper, .1, 2, `part ${id}.taper`);
    }
    if (p.text !== undefined) {
      if (p.shape !== 'box') fail('INVALID_OBJECT', `part ${id}: text applies only to flat box parts`);
      if (p.size.width < .20 || p.size.height < .10) fail('INVALID_OBJECT', `part ${id}: text box part must be at least 0.20m wide and 0.10m high for readability`);
      validateDisplayText(p.text);
    }
    if (p.place !== undefined) {
      const keys = 'on' in p.place ? ['on'] : 'beside' in p.place ? ['beside', 'side', 'align', 'gap'] : ['centeredOn'];
      only(p.place, keys, `part ${id}.place`);
      const pl = p.place as Record<string, unknown>;
      if ('beside' in pl) {
        if (!['left', 'right', 'front', 'back'].includes(pl.side as string)) fail('INVALID_OBJECT', `part ${id}: beside needs side left, right, front or back`);
        if (pl.align !== undefined && !['bottom', 'middle', 'top'].includes(pl.align as string)) fail('INVALID_OBJECT', `part ${id}: align must be bottom, middle or top`);
        if (pl.gap !== undefined) num(pl.gap, 0, OBJECT_LIMITS.gapMax, `part ${id}.gap`);
      }
      const parent = (pl.on ?? pl.beside ?? pl.centeredOn) as unknown;
      if (typeof parent !== 'string' || !Object.hasOwn(def.parts, parent)) fail('OBJECT_PLACEMENT', `part ${id} refers to unknown part ${String(parent)}; choose ${ids.filter(x => x !== id).join(', ')}`);
    }
  }
  const roots = ids.filter(id => def.parts[id].place === undefined);
  if (roots.length !== 1) fail('OBJECT_PLACEMENT', `exactly one part must omit place (the ground root); found ${roots.length ? roots.join(', ') : 'none'}`);
  if (def.focus !== undefined && (typeof def.focus !== 'string' || !Object.hasOwn(def.parts, def.focus))) fail('OBJECT_PLACEMENT', 'focus must name a part');
  const textParts = ids.filter(id => def.parts[id].text !== undefined);
  if (textParts.length > 2) fail('OBJECT_BUDGET', 'Use at most 2 text parts per composite object');
  const done = new Map<string, PlannedPart>(), active = new Set<string>();
  const resolve = (id: string): PlannedPart => {
    if (done.has(id)) return done.get(id)!;
    if (active.has(id)) fail('OBJECT_PLACEMENT', 'cyclic part placement at ' + id);
    active.add(id);
    const p = def.parts[id], taper = p.taper ?? 1, grow = p.shape === 'cylinder' ? Math.max(1, taper) : 1;
    const size: V = [p.size.width * grow, p.size.height, (p.size.depth ?? p.size.width) * grow];
    let center: V = [0, size[1] / 2, 0], depth = 0;
    if (p.place) {
      const pl = p.place as Record<string, string | number | undefined>, parent = resolve((pl.on ?? pl.beside ?? pl.centeredOn) as string);
      depth = parent.depth + 1;
      if (depth > OBJECT_LIMITS.depth) fail('OBJECT_PLACEMENT', `part ${id} is ${depth} levels from the root; maximum is ${OBJECT_LIMITS.depth}`);
      const pc = parent.center, ps = parent.size;
      if ('on' in pl) center = [pc[0], pc[1] + ps[1] / 2 + size[1] / 2, pc[2]];
      else if ('centeredOn' in pl) center = [...pc];
      else {
        const gap = (pl.gap as number | undefined) ?? 0, y = pl.align === 'bottom' ? pc[1] - ps[1] / 2 + size[1] / 2 : pl.align === 'top' ? pc[1] + ps[1] / 2 - size[1] / 2 : pc[1];
        center = pl.side === 'left' ? [pc[0] - ps[0] / 2 - gap - size[0] / 2, y, pc[2]] : pl.side === 'right' ? [pc[0] + ps[0] / 2 + gap + size[0] / 2, y, pc[2]] : pl.side === 'front' ? [pc[0], y, pc[2] + ps[2] / 2 + gap + size[2] / 2] : [pc[0], y, pc[2] - ps[2] / 2 - gap - size[2] / 2];
      }
      if (center[1] - size[1] / 2 < -1e-9) fail('OBJECT_PLACEMENT', `part ${id} would sink below the ground; use align middle/top on a taller parent or place it on a part`);
    }
    const color = OBJECT_FINISHES[p.finish ?? 'cream'];
    const planned = freezeData({
      id,
      shape: p.shape,
      size,
      taper,
      center,
      color,
      depth,
      ...(p.text !== undefined ? { text: p.text } : {})
    }) as PlannedPart;
    done.set(id, planned);
    active.delete(id);
    return planned;
  };
  ids.forEach(resolve);
  const parts = ids.map(id => done.get(id)!);
  const min: V = [0, 1, 2].map(i => Math.min(...parts.map(p => p.center[i] - p.size[i] / 2))) as V,
    max: V = [0, 1, 2].map(i => Math.max(...parts.map(p => p.center[i] + p.size[i] / 2))) as V;
  const triangles = parts.reduce((n, p) => n + OBJECT_TRIANGLES[p.shape] + (p.text !== undefined ? 2 : 0), 0);
  if (triangles > OBJECT_LIMITS.trianglesPerObject) fail('OBJECT_BUDGET', `estimated ${triangles} triangles exceeds ${OBJECT_LIMITS.trianglesPerObject}; replace some rounded parts (sphere/capsule/roundedBox) with box or cylinder`);
  const extent = [0, 1, 2].map(i => max[i] - min[i]);
  if (extent.some((e, i) => e > OBJECT_LIMITS.extent[i] + 1e-9)) fail('OBJECT_BUDGET', `overall size ${extent.map(e => e.toFixed(2)).join(' x ')}m exceeds ${OBJECT_LIMITS.extent.join(' x ')}m (width x height x depth)`);
  const regions: Record<string, { min: V; max: V }> = {
    full: { min, max }
  };
  for (const part of parts) {
    const pMin: V = [0, 1, 2].map(i => part.center[i] - part.size[i] / 2) as V;
    const pMax: V = [0, 1, 2].map(i => part.center[i] + part.size[i] / 2) as V;
    regions[part.id] = { min: pMin, max: pMax };
  }
  if (textParts.length > 0) {
    const primary = done.get(textParts[0])!;
    const dMin: V = [0, 1, 2].map(i => primary.center[i] - primary.size[i] / 2) as V;
    const dMax: V = [0, 1, 2].map(i => primary.center[i] + primary.size[i] / 2) as V;
    const dBox = { min: dMin, max: dMax };
    regions.display = dBox;
    regions.screen = dBox;
    regions.label = dBox;
    regions.detail = dBox;
  } else if (def.focus !== undefined) {
    const fPart = done.get(def.focus)!;
    const fMin: V = [0, 1, 2].map(i => fPart.center[i] - fPart.size[i] / 2) as V;
    const fMax: V = [0, 1, 2].map(i => fPart.center[i] + fPart.size[i] / 2) as V;
    regions.detail = { min: fMin, max: fMax };
  }
  if (def.focus !== undefined) {
    const fPart = done.get(def.focus)!;
    const fMin: V = [0, 1, 2].map(i => fPart.center[i] - fPart.size[i] / 2) as V;
    const fMax: V = [0, 1, 2].map(i => fPart.center[i] + fPart.size[i] / 2) as V;
    regions.focus = { min: fMin, max: fMax };
  }
  return freezeData({
    parts,
    triangles,
    focus: def.focus ?? roots[0],
    local: {min, max},
    regions
  });
}
export type ObjectPlan = ReturnType<typeof planObject>;
