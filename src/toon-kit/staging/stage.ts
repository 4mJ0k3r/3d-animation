import * as T from 'three';
import type { CartoonEngine } from '../engine';
import type { CastActor, CastSnapshot } from '../characters/cast-types';
import { readLevelFrame } from '../characters/target-resolver';
import { freezeData } from '../characters/pose';
import { bindActor } from '../direction/bindings';
import { geometryBounds, transformBounds, unionBounds } from '../direction/bounds';
import { boxProxy } from '../direction/proxies';
import { directionFail } from '../direction/types';
import type { Bounds, CompositionSnapshot, Vec3 } from '../direction/types';
/** Geometry adapter only: no room construction, actor posing or camera coordinates. */
export function createStage(engine: CartoonEngine, options: {
  root: T.Group;
  floor: T.Mesh;
  axis: readonly [string, string];
}) {
  const {
      root,
      floor
    } = options,
    axis = [...options.axis];
  let closed = false,
    bindings: Record<string, ReturnType<typeof bindActor>> | null = null;
  const issued = new WeakSet<CompositionSnapshot>(),
    props = new Map<string, {
      mesh: T.Mesh;
      bounds: Bounds;
    }>(),
    occluders = new Map<T.Mesh, {
      id: string;
      owner: string;
      bounds: Bounds;
      plane: boolean;
    }>();
  const live = () => {
    if (closed || engine.signal.aborted) directionFail('STAGE_DISPOSED', 'Stage disposed');
  };
  const belongs = (o: T.Object3D) => {
    for (let p: T.Object3D | null = o; p; p = p.parent) if (p === engine.scene) return true;
    return false;
  };
  const visible = (o: T.Object3D) => {
    for (let p: T.Object3D | null = o; p; p = p.parent) {
      if (!p.visible) return false;
      if (p === engine.scene) return true;
    }
    return false;
  };
  const owned = (o: T.Object3D) => {
    if (!belongs(o)) directionFail('INVALID_OWNER', 'Stage geometry must belong to this engine');
  };
  live();
  owned(root);
  owned(floor);
  if (axis.length !== 2 || axis.some(x => typeof x !== 'string' || !x.trim()) || axis[0] === axis[1]) directionFail('INVALID_AXIS', 'Choose two distinct cast actor names');
  root.updateWorldMatrix(true, true);
  readLevelFrame(root);
  let ancestor: T.Object3D | null = floor;
  while (ancestor && ancestor !== root) ancestor = ancestor.parent;
  if (ancestor !== root) directionFail('INVALID_FLOOR', 'Floor must descend from the stage root');
  const inverse = root.matrixWorld.clone().invert(),
    floorLocal = transformBounds(geometryBounds(floor.geometry), inverse.clone().multiply(floor.matrixWorld));
  const floorMatrix = inverse.clone().multiply(floor.matrixWorld),
    floorGeometry = floor.geometry;
  const width = floorLocal.max[0] - floorLocal.min[0],
    depth = floorLocal.max[2] - floorLocal.min[2],
    ground = floorLocal.max[1];
  const normal = new T.Vector3(...(floor.geometry.type === 'PlaneGeometry' ? [0, 0, 1] as const : [0, 1, 0] as const)).transformDirection(inverse.clone().multiply(floor.matrixWorld));
  if (width <= 0 || depth <= 0 || normal.y < 1 - 1e-6) directionFail('INVALID_FLOOR', 'Use a horizontal upward-facing floor aligned with the stage');
  const scenery: Bounds[] = [];
  root.traverse(o => {
    if (o instanceof T.Mesh) {
      const b = geometryBounds(o.geometry);
      scenery.push(transformBounds(b, inverse.clone().multiply(o.matrixWorld)));
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (o !== floor && o.geometry.type === 'BoxGeometry' && materials.every(m => !m.transparent && !m.alphaTest)) occluders.set(o, {
        id: 'scenery.' + occluders.size,
        owner: 'stage',
        bounds: b,
        plane: false
      });
    }
  });
  const height = unionBounds(scenery).max[1] - ground;
  if (!Number.isFinite(height) || height <= .2) directionFail('INVALID_STAGE_BOUNDS', 'Scenery must define usable vertical camera space; construct the stage before binding actors');
  const floorCenter: Vec3 = [(floorLocal.min[0] + floorLocal.max[0]) / 2, ground, (floorLocal.min[2] + floorLocal.max[2]) / 2];
  const add = (id: string, mesh: T.Mesh, owner: string, kind: 'box' | 'plane') => {
    live();
    owned(mesh);
    if (!id.trim() || [...occluders.values()].some(x => x.id === id)) directionFail('INVALID_PROXY', 'Use unique proxy IDs');
    for (let p: T.Object3D | null = mesh; p; p = p.parent) if (String(p.userData.outlineGroup ?? '').startsWith('character:')) directionFail('INVALID_PROXY', 'Actor proxies come from complete cast poses');
    occluders.set(mesh, {
      id,
      owner,
      bounds: geometryBounds(mesh.geometry),
      plane: kind === 'plane'
    });
  };
  const dispose = () => {
    closed = true;
    bindings = null;
    props.clear();
    occluders.clear();
  };
  engine.registerCleanup(dispose);
  return Object.freeze({
    bind(cast: {
      actors: Readonly<Record<string, CastActor>>;
    }) {
      live();
      if (bindings) directionFail('ALREADY_BOUND', 'Bind once');
      if(Object.keys(cast.actors).some(id=>id==='stage'||props.has(id)))directionFail('DUPLICATE_SUBJECT','Actor/prop names must be distinct; stage is reserved');
      if (axis.some(id => !Object.hasOwn(cast.actors, id))) directionFail('INVALID_AXIS', 'Axis names must exist in the bound cast');
      bindings = Object.fromEntries(Object.entries(cast.actors).map(([id, a]) => [id, bindActor(id, a, engine.scene)]));
    },
    registerProp(name: string, mesh: T.Mesh) {
      live();
      if (!name.trim() || props.has(name)) directionFail('INVALID_PROP', 'Use a unique prop name');
      if(name==='stage'||bindings&&Object.hasOwn(bindings,name))directionFail('DUPLICATE_SUBJECT','Actor/prop names must be distinct; stage is reserved');
      add('prop.' + name, mesh, name, mesh.geometry.type === 'PlaneGeometry' ? 'plane' : 'box');
      props.set(name, {
        mesh,
        bounds: geometryBounds(mesh.geometry)
      });
    },
    registerOccluder(id: string, mesh: T.Mesh, kind: 'box' | 'plane' = 'box') {
      add('occluder.' + id, mesh, 'stage', kind);
    },
    prop(name: string) {
      live();
      if (!props.has(name)) directionFail('UNKNOWN_PROP', 'Register the named prop first', {
        subject: name
      });
      return Object.freeze({
        subject: name,
        region: 'full'
      });
    },
    snapshot(state: CastSnapshot): CompositionSnapshot {
      live();
      owned(root);
      const level = readLevelFrame(root);
      root.updateWorldMatrix(true, true);
      const relativeFloor = root.matrixWorld.clone().invert().multiply(floor.matrixWorld);
      if (floor.geometry !== floorGeometry || relativeFloor.elements.some((v, i) => Math.abs(v - floorMatrix.elements[i]) > 1e-7)) directionFail('STAGE_GEOMETRY_CHANGED', 'Floor geometry/placement is immutable; construct a new stage');
      if (!bindings) directionFail('CAST_NOT_BOUND', 'Call stage.bind(cast)');
      if (!Number.isInteger(state.frame) || state.frame < 0 || !Number.isFinite(state.fps) || state.fps <= 0) directionFail('INVALID_FRAME', 'Invalid composition frame');
      const actors = Object.fromEntries(Object.entries(bindings).map(([id, capture]) => [id, capture(state)]));
      const front = new T.Vector3(0, 0, 1).transformDirection(root.matrixWorld).toArray(),
        origin = new T.Vector3(...floorCenter).applyMatrix4(root.matrixWorld).toArray();
      const result: CompositionSnapshot = freezeData({
        frame: state.frame,
        fps: state.fps,
        actors,
        front,
        axis: {
          from: [actors[axis[0]].origin[0], origin[1], actors[axis[0]].origin[2]],
          to: [actors[axis[1]].origin[0], origin[1], actors[axis[1]].origin[2]]
        },
        props: Object.fromEntries([...props].map(([id, p]) => {
          p.mesh.updateWorldMatrix(true, false);
          return [id, {
            visible: visible(p.mesh),
            facing: new T.Vector3(0, 0, 1).transformDirection(p.mesh.matrixWorld).toArray(),
            regions: {
              full: transformBounds(p.bounds, p.mesh.matrixWorld)
            }
          }];
        })),
        visibility: {
          proxies: [...Object.values(actors).filter(a => a.visible).flatMap(a => a.visibility?.proxies ?? []), ...[...occluders].filter(([m]) => visible(m)).map(([m, p]) => {
            m.updateWorldMatrix(true, false);
            return boxProxy(p.id, p.owner, p.bounds, m.matrixWorld, p.plane);
          })],
          zone: {
            origin,
            right: new T.Vector3(1, 0, 0).transformDirection(root.matrixWorld).toArray(),
            front,
            halfWidth: width * level.scale / 2,
            back: -depth * level.scale / 2 + .06 * level.scale,
            forward: depth * level.scale / 2,
            minHeight: .1 * level.scale,
            maxHeight: height * .95 * level.scale
          },
          viewpoints: [{
            id: '00-front',
            yaw: 0
          }, {
            id: '01-left15',
            yaw: -Math.PI / 12
          }, {
            id: '02-right15',
            yaw: Math.PI / 12
          }, {
            id: '03-right22',
            yaw: Math.PI / 8
          }, {
            id: '04-right30',
            yaw: Math.PI / 6
          }]
        }
      });
      issued.add(result);
      return result;
    },
    accepts(s: CompositionSnapshot) {
      live();
      if (!issued.has(s)) directionFail('INVALID_SNAPSHOT', 'Snapshot belongs to another stage');
    },
    dispose
  });
}
export type Stage = ReturnType<typeof createStage>;
