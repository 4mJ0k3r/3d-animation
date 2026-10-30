import * as THREE from 'three';
import type {CartoonEngine} from '../engine';
import {createPrimitiveFactory} from '../lib';
import type {CapsuleOptions, CylinderOptions, SphereOptions} from '../lib';
import {createCharacterDefinition} from './proportions';
import {createRestPose, validateCompletePose} from './pose';
import {JOINT_NAMES, NODE_NAMES, NODE_PARENTS, PART_NAMES} from './types';
import type {AnchorName, CharacterDefinition, CharacterOptions, CharacterPose, NodeName} from './types';

/** The existing engine owns GPU resources, even while a character is detached. */
export type CharacterResourceOwner = Pick<CartoonEngine, 'profile' | 'signal' | 'track' | 'registerCleanup'>;
export interface CharacterRig {
  readonly id: string;
  readonly root: THREE.Group;
  readonly definition: CharacterDefinition;
  readonly disposed: boolean;
  /** Validates the entire pose before mutating any mesh or joint. */
  applyPose(pose: CharacterPose): void;
  /** Current posed anchor; root space excludes root placement and scale. */
  getAnchor(name: AnchorName, space?: 'root' | 'world', target?: THREE.Vector3): THREE.Vector3;
  /** Detaches this rig. GPU allocations remain engine-owned until engine.dispose(). */
  dispose(): void;
}

function checkParentScale(root: THREE.Object3D): void {
  for (let parent = root.parent; parent; parent = parent.parent) {
    const {x, y, z} = parent.scale;
    if (![x, y, z].every(Number.isFinite) || x <= 0 || Math.abs(x - y) > 1e-10 || Math.abs(x - z) > 1e-10) {
      throw new Error('Character ancestors require positive uniform scales');
    }
  }
}

/** One explicit scene-scoped pool; no global caches, counters or cross-engine resources. */
export function createCharacterFactory(owner: CharacterResourceOwner) {
  if (owner.signal.aborted) throw new Error('Character resource owner is disposed');
  // The frozen pool's generic inference exposes BasePrimitiveOptions. This local
  // facade supplies its actual builder types without changing Phase 1's API.
  const primitives: {
    sphere(options: SphereOptions): THREE.Mesh;
    capsule(options: CapsuleOptions): THREE.Mesh;
    cylinder(options: CylinderOptions): THREE.Mesh;
  } = createPrimitiveFactory(owner as CartoonEngine);
  const rigs = new Map<string, CharacterRig>();
  const usedIds = new Set<string>();
  let closed = false;
  const checkOpen = () => {if (closed || owner.signal.aborted) throw new Error('Character factory is disposed');};
  const dispose = () => {
    if (closed) return;
    closed = true;
    for (const rig of [...rigs.values()]) rig.dispose();
    rigs.clear(); usedIds.clear();
  };
  owner.registerCleanup(dispose);

  function create(options: CharacterOptions): CharacterRig {
    checkOpen();
    if (typeof options.id !== 'string' || !options.id.trim() || usedIds.has(options.id)) throw new Error('Character id must be nonempty and unique; disposed ids cannot be recycled');
    const definition = createCharacterDefinition(options.proportions);
    const initialPose = createRestPose(definition, options.placement);
    const colors = {skin: '#f2c69d', torso: '#36a9b0', limbs: '#16131a', shoes: '#16131a', ...options.colors};
    // Validate all palette values before allocating pooled meshes/materials.
    for (const color of Object.values(colors)) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Character colors must be #rrggbb');
    const nodes = {} as Record<NodeName, THREE.Object3D>;
    for (const name of JOINT_NAMES) nodes[name] = new THREE.Group();
    for (const name of PART_NAMES) {
      const common = {name, outlineMode: 'silhouette-only' as const};
      let mesh: THREE.Mesh;
      if (name === 'torsoShape') {
        mesh = primitives.capsule({...common, radius: definition.proportions.torsoRadius, length: definition.proportions.torsoLength,
          capSubdivisions: 8, radialSegments: 16, color: colors.torso, outlineMode: 'full'});
      } else if (name === 'headShape') {
        mesh = primitives.sphere({...common, radius: 1, widthSegments: 24, heightSegments: 18, color: colors.skin, outlineMode: 'full'});
      } else if (name.endsWith('Shape')) {
        mesh = name === 'neckShape'
          ? primitives.cylinder({...common, radiusTop: 1, radiusBottom: 1, height: 1, radialSegments: 12, color: colors.skin})
          : primitives.sphere({...common, radius: 1, widthSegments: 8, heightSegments: 6, color: colors.limbs});
      } else if (name.endsWith('Hand') || name.endsWith('Shoe')) {
        mesh = primitives.sphere({...common, radius: 1, widthSegments: 12, heightSegments: 8,
          color: name.endsWith('Hand') ? colors.skin : colors.shoes});
      } else {
        mesh = primitives.cylinder({...common, radiusTop: 1, radiusBottom: 1, height: 1, radialSegments: 12, color: colors.limbs});
      }
      nodes[name] = mesh;
    }
    const root = nodes.root as THREE.Group;
    root.userData.outlineMode = 'full';
    root.userData.outlineGroup = `character:${options.id}`;
    for (const name of NODE_NAMES) {
      nodes[name].name = `${options.id}:${name}`;
      const parent = NODE_PARENTS[name];
      if (parent) nodes[parent].add(nodes[name]);
    }
    let dead = false;
    const ensureLive = () => {checkOpen(); if (dead) throw new Error('Character is disposed');};
    const rig: CharacterRig = {
      id: options.id, root, definition,
      get disposed() {return dead;},
      applyPose(pose) {
        ensureLive();
        validateCompletePose(pose);
        checkParentScale(root);
        for (const name of NODE_NAMES) {
          const node = nodes[name], value = pose[name];
          node.matrixAutoUpdate = node.matrixWorldAutoUpdate = true;
          node.rotation.order = 'XYZ';
          node.position.set(...value.position);
          node.quaternion.set(...value.quaternion);
          node.scale.set(...value.scale);
          node.visible = value.visible;
          node.updateMatrix();
        }
        root.updateWorldMatrix(true, true);
      },
      getAnchor(name, space = 'root', target = new THREE.Vector3()) {
        ensureLive(); checkParentScale(root);
        const anchor = definition.anchors[name];
        if (!anchor || (space !== 'root' && space !== 'world')) throw new Error('Unknown character anchor or space');
        root.updateWorldMatrix(true, true);
        target.set(...anchor.offset).applyMatrix4(nodes[anchor.node].matrixWorld);
        return space === 'root' ? root.worldToLocal(target) : target;
      },
      dispose() {
        if (dead) return;
        // Pool tracked each mesh at creation, before scene attachment/removal.
        dead = true;
        root.removeFromParent();
        rigs.delete(options.id);
      },
    };
    rig.applyPose(initialPose);
    usedIds.add(options.id); rigs.set(options.id, rig);
    return rig;
  }
  return {create, dispose};
}

/** Count submitted triangles, including repeated instances of pooled geometry. */
export function measureCharacter(rig: CharacterRig): {meshes: number; triangles: number; geometries: number; materials: number} {
  let meshes = 0, triangles = 0;
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  rig.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  return {meshes, triangles, geometries: geometries.size, materials: materials.size};
}
