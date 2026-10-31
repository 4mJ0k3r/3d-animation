import * as T from 'three';
import type { CastActor, CastSnapshot } from '../characters/cast-types';
import { NODE_NAMES, NODE_PARENTS } from '../characters/types';
import type { NodeName } from '../characters/types';
import { freezeData } from '../characters/pose';
import { readLevelFrame } from '../characters/target-resolver';
import { geometryBounds, transformBounds, unionBounds } from './bounds';
import type { Bounds, CompositionActor, Vec3 } from './types';
import { directionFail } from './types';
import { actorVisibility } from './proxies';

/** Cache immutable local geometry bounds once; evaluated bounds use complete poses,
 * never the live joints' last matrices. No GPU allocations in capture(). */
export function bindActor(id: string, actor: CastActor, scene: T.Scene) {
  const pieces: {
    node: NodeName;
    local: T.Matrix4;
    bounds: Bounds;
  }[] = [];
  function visit(o: T.Object3D, node: NodeName, local: T.Matrix4) {
    const key = NODE_NAMES.find(n => o.name === `${id}:${n}`);
    if (key) {
      node = key;
      local = new T.Matrix4();
    } else {
      o.updateMatrix();
      local = local.clone().multiply(o.matrix);
    }
    if (o instanceof T.Mesh) pieces.push({
      node,
      local,
      bounds: geometryBounds(o.geometry)
    });
    o.children.forEach(c => visit(c, node, local));
  }
  visit(actor.root, 'root', new T.Matrix4());
  return (state: CastSnapshot): CompositionActor => {
    const pose = state.poses[id];
    if (!pose) directionFail('UNKNOWN_ACTOR', `Missing posed actor ${id}`);
    let owner: T.Object3D | null = actor.root;
    while (owner && owner !== scene) owner = owner.parent;
    if (owner !== scene) directionFail('INVALID_OWNER', 'Actor is detached or belongs to another engine', {
      subject: id
    });
    const parent = actor.root.parent!;
    readLevelFrame(parent);
    parent.updateWorldMatrix(true, false);
    const matrices = {} as Record<NodeName, T.Matrix4>,
      visible = {} as Record<NodeName, boolean>;
    for (const node of NODE_NAMES) {
      const t = pose[node],
        p = NODE_PARENTS[node];
      matrices[node] = (p ? matrices[p] : parent.matrixWorld).clone().multiply(new T.Matrix4().compose(new T.Vector3(...t.position), new T.Quaternion(...t.quaternion), new T.Vector3(...t.scale)));
      visible[node] = t.visible && (!p || visible[p]);
    }
    const all: Bounds[] = [],
      head: Bounds[] = [],
      torso: Bounds[] = [],
      left: Bounds[] = [],
      right: Bounds[] = [];
    for (const piece of pieces) {
      const b = transformBounds(piece.bounds, matrices[piece.node].clone().multiply(piece.local));
      all.push(b);
      if (['head', 'headShape'].includes(piece.node)) head.push(b);
      if (['torso', 'torsoShape'].includes(piece.node)) torso.push(b);
      if (piece.node === 'leftHand') left.push(b);
      if (piece.node === 'rightHand') right.push(b);
    }
    const radius = actor.definition.proportions.headRadius;
    // Surface-facing semantic patch, independent of browser-only raster geometry.
    const face = transformBounds({
      min: [-.74 * radius, -.57 * radius, .48 * radius],
      max: [.74 * radius, .57 * radius, 1.005 * radius]
    }, matrices.head);
    const facing = new T.Vector3(0, 0, 1).transformDirection(matrices.head).toArray() as unknown as Vec3;
    const l = unionBounds(left),
      r = unionBounds(right),
      a = state.acting[id],
      p = state.pointing[id];
    const hands = a && a.weight > 0 ? a.hands : undefined;
    const gesture = unionBounds(p && p.weight !== 0 ? [p.hand === 'left' ? l : r] : hands?.length ? hands.map(h => h === 'left' ? l : r) : [l, r]);
    let ancestorsVisible = true;
    for (let n: T.Object3D | null = parent; n; n = n.parent) ancestorsVisible = ancestorsVisible && n.visible;
    return freezeData({
      visibility: actorVisibility(id, actor.definition.proportions, matrices, p && p.weight !== 0 ? [p.hand] : hands ?? []),
      visible: visible.root && ancestorsVisible,
      origin: new T.Vector3().setFromMatrixPosition(matrices.root).toArray(),
      facing,
      regions: {
        head: unionBounds(head),
        face,
        torso: unionBounds(torso),
        fullBody: unionBounds(all),
        leftHand: l,
        rightHand: r,
        gesture
      }
    });
  };
}
