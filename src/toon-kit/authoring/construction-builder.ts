import * as T from 'three';
import type { EnvironmentBuilder } from './environment-builders';
import { planConstruction, CONSTRUCTION_LIMITS } from './construction';
import { buildPrefab } from './prefabs';
import { createTargets, createPaths, sceneMark, scenePoint, sceneSeat, pathFromMarks, levelFloor } from '../characters';
import type { TargetLibrary } from '../characters/cast-types';
import { storyFail } from '../story/types';

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
      paving: '#c5c9c8'
    } as const)[plan.ground.finish],
    outlineMode: 'none'
  });
  root.add(floor);
  const props: Record<string, T.Object3D> = {},
    entries: Record<string, TargetLibrary['entries'][string]> = {},
    marks: Record<string, T.Group> = {};
  const colors = {
    cream: '#e8dfd1',
    brick: '#c88d78',
    slate: '#7e929e',
    white: '#fff6e5',
    wood: '#b98c5c'
  };
  for (const item of plan.items) {
    const {
      spec,
      size: [w, h, d]
    } = item;
    let part: T.Group;
    if (spec.prefab) {
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
