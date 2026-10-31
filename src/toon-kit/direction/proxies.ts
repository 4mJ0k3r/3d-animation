import * as T from 'three';
import type { NodeName, CharacterProportions } from '../characters/types';
import type { ActorVisibility, FeatureSamples, VisibilityProxy } from './visibility-types';
import type { Bounds, Vec3 } from './types';
export function boxProxy(id: string, owner: string, b: Bounds, m: T.Matrix4, plane = false): VisibilityProxy {
  const center = new T.Vector3(...b.min).add(new T.Vector3(...b.max)).multiplyScalar(.5).applyMatrix4(m).toArray();
  const axes = [0, 1, 2].map(i => new T.Vector3().setFromMatrixColumn(m, i)),
    half = [0, 1, 2].map(i => (b.max[i] - b.min[i]) * axes[i].length() / 2) as unknown as Vec3;
  return {
    id,
    owner,
    kind: plane ? 'plane' : 'box',
    center,
    axes: axes.map(a => a.normalize().toArray()),
    half
  };
}
export function actorVisibility(id: string, p: CharacterProportions, matrices: Record<NodeName, T.Matrix4>, activeHands: readonly ('left' | 'right')[]): ActorVisibility {
  const origin = (node: NodeName): Vec3 => new T.Vector3().setFromMatrixPosition(matrices[node]).toArray(),
    scale = new T.Vector3().setFromMatrixColumn(matrices.root, 0).length();
  const proxies: VisibilityProxy[] = [{
    id: id + '.head',
    owner: id,
    kind: 'sphere',
    center: origin('head'),
    radius: p.headRadius * scale * 1.08
  }];
  const torsoEnd = (sign: number): Vec3 => new T.Vector3(0, sign * p.torsoLength / 2, 0).applyMatrix4(matrices.torso).toArray();
  proxies.push({
    id: id + '.torso',
    owner: id,
    kind: 'capsule',
    a: torsoEnd(-1),
    b: torsoEnd(1),
    radius: p.torsoRadius * scale
  });
  const feature = (point: Vec3, ignore: readonly string[]): FeatureSamples => ({
    points: [point],
    ignore
  });
  const facePoints: Vec3[] = [],
    normals: Vec3[] = [];
  const surface = (yaw: number, lat: number) => {
    const n = new T.Vector3(Math.sin(yaw) * Math.cos(lat), Math.sin(lat), Math.cos(yaw) * Math.cos(lat));
    return {
      point: n.clone().multiplyScalar(p.headRadius * 1.012).applyMatrix4(matrices.head).toArray() as Vec3,
      normal: n.transformDirection(matrices.head).toArray() as Vec3
    };
  };
  for (const y of [-.28, 0, .28]) for (const x of [-.32, 0, .32]) {
    const f = surface(x, y);
    facePoints.push(f.point);
    normals.push(f.normal);
  }
  // Centers alone miss narrow occluders clipping an eye's inner/outer edge.
  // Match the canonical face-paint 256px UV layout (centers +/-39, y=103,
  // radius 25 + half the 4.5px stroke); the face patch spans 2 x 1.5 radians.
  // Six symmetric center/edge samples stay within the existing nine-point cap.
  const eyeCenter = 39 / 256 * 2, eyeEdge = (25 + 2.25) / 256 * 2 * .9;
  const eyeLatitude = (.5 - 103 / 256) * 1.5;
  const eyes = [-1, 1].flatMap(sign => [-eyeEdge, 0, eyeEdge].map(offset => surface(sign * eyeCenter + offset, eyeLatitude)));
  const features: ActorVisibility['features'] = {
    face: {
      points: facePoints,
      normals,
      ignore: [id + '.head']
    },
    eyes: {
      points: eyes.map(e => e.point),
      normals: eyes.map(e => e.normal),
      selfOccluding: [0, 2, 3, 5],
      ignore: [id + '.head']
    },
    leftHand: feature(origin('leftWrist'), []),
    rightHand: feature(origin('rightWrist'), []),
    leftFoot: feature(origin('leftAnkle'), []),
    rightFoot: feature(origin('rightAnkle'), [])
  };
  const mutable = features as Record<string, FeatureSamples>;
  for (const side of ['left', 'right'] as const) {
    for (const [part, a, b, r] of [['UpperArm', 'Shoulder', 'Elbow', p.armRadius], ['Forearm', 'Elbow', 'Wrist', p.armRadius], ['Thigh', 'Hip', 'Knee', p.legRadius], ['Shin', 'Knee', 'Ankle', p.legRadius]] as const) proxies.push({
      id: id + '.' + side + part,
      owner: id,
      kind: 'capsule',
      a: origin(side + a as NodeName),
      b: origin(side + b as NodeName),
      radius: r * scale
    });
    proxies.push({
      id: id + '.' + side + 'Hand',
      owner: id,
      kind: 'sphere',
      center: origin(side + 'Wrist' as NodeName),
      radius: p.handRadius * scale
    });
    const point = origin(side + 'Wrist' as NodeName),
      r = p.handRadius * scale;
    mutable[side + 'Hand'] = {
      points: [point, [point[0] + r * .6, point[1], point[2]], [point[0] - r * .6, point[1], point[2]], [point[0], point[1] + r * .6, point[2]], [point[0], point[1] - r * .6, point[2]]],
      ignore: [id + '.' + side + 'Hand', id + '.' + side + 'Forearm']
    };
    mutable[side + 'Foot'] = feature(origin(side + 'Ankle' as NodeName), [id + '.' + side + 'Shin']);
  }
  return {
    proxies,
    features,
    activeHands
  };
}
