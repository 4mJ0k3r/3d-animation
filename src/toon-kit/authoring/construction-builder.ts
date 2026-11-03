import * as T from 'three';
import type { EnvironmentBuilder } from './environment-builders';
import { planConstruction, CONSTRUCTION_LIMITS } from './construction';
import { buildPrefab } from './prefabs';
import { createTargets, createPaths, sceneMark, scenePoint, sceneSeat, pathFromMarks, levelFloor } from '../characters';
import type { TargetLibrary } from '../characters/cast-types';
import { storyFail } from '../story/types';
import { OBJECT_LIMITS } from './composite';
import type { ObjectPlan } from './composite';
import type { createPrimitiveFactory } from '../lib';
import { createDisplayMaterial } from './display';

/**
 * Composite object parts use the same pooled primitive factory, toon materials and
 * inherited outline policy as every other construction item. Unit geometry is
 * scaled per part, so equal shapes share one pooled geometry.
 */
function buildObject(p: ReturnType<typeof createPrimitiveFactory>, plan: ObjectPlan) {
  const root = new T.Group();
  for (const part of plan.parts) {
    const [w, h, d] = part.size, color = part.color;
    let mesh: T.Mesh;
    // Fixed low-poly segment counts keep cost predictable (see OBJECT_TRIANGLES).
    if (part.shape === 'box') mesh = p.box({width: 1, height: 1, depth: 1, color});
    else if (part.shape === 'roundedBox') {
      mesh = p.roundedBox({width: w, height: h, depth: d, radius: Math.min(w, h, d) * .2, segments: 2, color});
    } else if (part.shape === 'sphere') mesh = p.sphere({radius: .5, widthSegments: 16, heightSegments: 10, color});
    else if (part.shape === 'cylinder') {
      const grow = Math.max(1, part.taper);
      mesh = p.cylinder({radiusTop: .5 * part.taper / grow, radiusBottom: .5 / grow, height: 1, radialSegments: 16, color});
    } else {
      const length = Math.round(Math.max(0, h / Math.min(w, d) - 1) * 20) / 20;
      mesh = p.capsule({radius: .5, length, capSubdivisions: 4, radialSegments: 12, color});
      mesh.scale.set(w, h / (1 + length), d);
    }
    if (part.shape === 'box' || part.shape === 'sphere' || part.shape === 'cylinder') mesh.scale.set(w, h, d);
    mesh.position.fromArray(part.center);
    mesh.name = 'ObjectPart:' + part.id;
    root.add(mesh);
    if (part.text !== undefined && part.shape === 'box') {
      const label = p.plane({
        width: Math.max(0.1, w * 0.92),
        height: Math.max(0.08, h * 0.88),
        position: [part.center[0], part.center[1], part.center[2] + d / 2 + 0.002],
        material: createDisplayMaterial(part.text, color),
        outlineMode: 'none'
      });
      label.name = 'ObjectLabel:' + part.id;
      root.add(label);
    }
  }
  return root;
}

/** One-time geometry adapter for the pure construction plan. */
export const buildConstruction: EnvironmentBuilder = (engine, p, name, index, layout) => {
  const plan = planConstruction(layout),
    root = new T.Group();
  root.name = 'Construction:' + name;
  root.position.x = index * 20;
  engine.scene.add(root);
  engine.track(root);
  const floor = p.box({
    width: plan.ground.width,
    height: .1,
    depth: plan.ground.depth,
    position: [0, -.05, 0],
    color: ({
      sand: '#e0d4bb',
      grass: '#91af80',
      paving: '#c5c9c8',
      wood: '#b98c5c',
      slate: '#516472',
      tile: '#d5dbdb',
      carpet: '#4a687d'
    } as const)[plan.ground.finish],
    outlineMode: 'none'
  });
  root.add(floor);
  const props: Record<string, T.Object3D> = {},
    entries: Record<string, TargetLibrary['entries'][string]> = {},
    marks: Record<string, T.Group> = {};
  const colors: Record<string, string> = {
    cream: '#e8dfd1',
    brick: '#c88d78',
    slate: '#7e929e',
    white: '#fff6e5',
    wood: '#b98c5c',
    charcoal: '#3b3f45',
    metal: '#a9b3bd',
    navy: '#2f4a73',
    teal: '#2a8f8a',
    mint: '#7fd1b9',
    red: '#c9503f',
    yellow: '#e8b93a'
  };
  for (const item of plan.items) {
    const {
      spec,
      size: [w, h, d]
    } = item;
    let part: T.Group;
    if (item.object) {
      part = buildObject(p, item.object);
      part.userData.regions = item.object.regions;
      let tris = 0;
      part.traverse(o => {
        if (o instanceof T.Mesh) tris += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
      });
      if (tris > OBJECT_LIMITS.trianglesPerObject) storyFail('OBJECT_BUDGET', `${item.id}: ${tris} triangles exceeds ${OBJECT_LIMITS.trianglesPerObject}; use fewer rounded parts`);
      entries[item.id] = scenePoint(part.getObjectByName('ObjectPart:' + item.object.focus)!);
    } else if (spec.prefab) {
      const built = buildPrefab(p, spec.prefab, spec.finish, spec.text, item.mounted);
      part = built.root;
      entries[item.id] = built.seat ? sceneSeat(built.seat) : scenePoint(built.point);
    } else {
      part = new T.Group();
      const color = colors[spec.finish as keyof typeof colors] ?? colors.cream;
      if (spec.kind === 'tree') {
        part.add(p.cylinder({
          radiusTop: w * .09,
          radiusBottom: w * .12,
          height: h - w / 2,
          position: [0, (h - w / 2) / 2, 0],
          color: spec.finish ? color : '#8e6848'
        }), p.sphere({
          radius: w / 2,
          position: [0, h - w / 2, 0],
          color: '#6a9c66'
        }));
      } else if (spec.kind === 'column') part.add(p.cylinder({
        radiusTop: w / 2,
        radiusBottom: w / 2,
        height: h,
        position: [0, h / 2, 0],
        color
      }));else if (spec.kind === 'window' || spec.kind === 'door') {
        part.add(p.box({
          width: w,
          height: h,
          depth: d / 2,
          position: [0, h / 2, -d / 4],
          color: spec.finish ? color : '#516472'
        }));
        if (spec.kind === 'window') part.add(p.plane({
          width: w - .12,
          height: h - .12,
          position: [0, h / 2, d / 2],
          color: '#92c3d0',
          outlineMode: 'silhouette-only'
        }));else part.add(p.box({
          width: w - .12,
          height: h - .08,
          depth: d / 2,
          position: [0, h / 2 + .04, d / 4],
          color: spec.finish ? color : '#b98c5c'
        }));
      } else part.add(p.box({
        width: w,
        height: h,
        depth: d,
        position: [0, spec.kind === 'floor' ? -h / 2 : h / 2, 0],
        color,
        outlineMode: spec.kind === 'floor' ? 'none' : 'full'
      }));
      if (spec.kind === 'floor') {
        const mesh = part.children[0] as T.Mesh;
        const material = (mesh.material as T.Material).clone();
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;
        mesh.material = material;
      }
      entries[item.id] = scenePoint(part.children[0]);
    }
    part.name = 'ConstructionItem:' + item.id;
    part.position.fromArray(item.position);
    part.rotation.y = item.turn * Math.PI / 2;
    root.add(part);
    props[item.id] = part;
  }
  for (const [id, position] of Object.entries(plan.marks)) {
    const mark = new T.Group();
    mark.position.fromArray(position);
    if ((plan as { markYaws?: Record<string, number> }).markYaws?.[id] !== undefined) {
      mark.rotation.y = (plan as { markYaws?: Record<string, number> }).markYaws![id];
    }
    root.add(mark);
    marks[id] = mark;
    entries[id] = sceneMark(mark);
  }
  const audience = new T.Group();
  audience.position.set(0, 2.7, 5);
  root.add(audience);
  entries.audience = scenePoint(audience);
  root.updateWorldMatrix(true, true);
  const paths = Object.fromEntries(Object.entries(plan.paths).map(([id, [from, to]]) => [id, pathFromMarks([marks[from], marks[to]])]));
  // All construction toon materials use the same immutable three-step ramp.
  // Share it within this owner only; factory-tracked original maps still dispose.
  let gradient: T.Texture | undefined;
  root.traverse(o => {
    if (o instanceof T.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof T.MeshToonMaterial && m.gradientMap instanceof T.DataTexture && (m.gradientMap.image as {
      width: number;
    }).width === 3) {
      gradient ??= m.gradientMap;
      m.gradientMap = gradient;
    }
  });
  const materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  let meshes = 0,
    triangles = 0;
  root.traverse(o => {
    if (o instanceof T.Mesh) {
      meshes++;
      triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value);
      }
    }
  });
  const measurements = {
    meshes,
    triangles,
    materials: materials.size,
    textures: textures.size
  };
  for (const [key,value] of Object.entries(measurements)){const limit=key==='meshes'?plan.meshLimit:CONSTRUCTION_LIMITS[key as keyof typeof measurements];if(value>limit)storyFail('CONSTRUCTION_BUDGET',`${key}: ${value} exceeds ${limit}; simplify the composition`);}
  root.userData.construction = Object.freeze(measurements);
  engine.track(root);
  return {
    root,
    floor,
    props,
    anchors: plan.marks,
    cameraSpace: Object.freeze({
      width: 24,
      depth: 40,
      height: 6
    }),
    targets: createTargets(entries),
    paths: createPaths(paths),
    floors: {
      ground: levelFloor(0)
    }
  };
};
