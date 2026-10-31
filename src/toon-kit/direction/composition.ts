import * as T from 'three';
import type { Bounds, CameraState, CompositionSnapshot, StaticShot, Vec3 } from './types';
import type { CompactVisibilityFrame, CompositionOptions, RequiredRegion, FeatureSamples } from './visibility-types';
import { directionFail } from './types';
import { boundsOf, corners, unionBounds, transformBounds } from './bounds';
import { shotBounds } from './shots';
import { captionAt, rectsIntersect } from '../caption-layout';
import { createProjection, estimateVisibility, projectedSphereRect } from './visibility';
import { freezeData } from '../characters/pose';
/** Documented artistic acceptance thresholds; measured in normalized image units. */
export const COMPOSITION_LIMITS = freezeData({
  maxCandidates: 6,
  maxProxies: 64,
  maxRegions: 12,
  maxSamples: 9,
  maxSignatureBytes: 16 * 1024 * 1024,
  faceVisible: .77,
  eyesVisible: 1,
  handVisible: .8,
  propVisible: .88,
  captionGap: .018,
  maxForegroundArea: .12,
  top: .08,
  side: .045,
  minHead: {
    establishing: .06,
    twoShot: .10,
    medium: .16,
    fullBody: .06,
    closeUp: .24,
    reaction: .20,
    objectFocus: 0
  }
});
const pointCenter = (b: Bounds): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
function planeSamples(b: Bounds): FeatureSamples {
  const p = corners(b),
    a = p[0],
    x = p[1],
    y = p[2],
    points: Vec3[] = [];
  for (const v of [.12, .5, .88]) for (const u of [.12, .5, .88]) points.push([0, 1, 2].map(i => a[i] + u * (x[i] - a[i]) + v * (y[i] - a[i])) as unknown as Vec3);
  return {
    points,
    ignore: []
  };
}
export function compactVisibilityFrame(shot: StaticShot, s: CompositionSnapshot): CompactVisibilityFrame {
  if (!s.visibility) directionFail('MISSING_VISIBILITY', 'Stage must register visibility proxies');
  const required: RequiredRegion[] = [];
  const ids = shot.subjects ?? [shot.subject!];
  for (const id of ids) {
    const a = Object.hasOwn(s.actors, id) ? s.actors[id] : undefined;
    if (shot.type === 'objectFocus' || shot.type === 'establishing' && !a) {
      const prop = s.props[id],
        b = prop?.regions[shot.region ?? 'full'];
      if (!b) directionFail('UNKNOWN_REGION', 'Missing prop region');
      const ignore = s.visibility.proxies.filter(p => p.owner === id).map(p => p.id),
        sample = (bounds: Bounds) => {
          const f = planeSamples(bounds);
          return {
            ...f,
            normals: f.points.map(() => prop.facing)
          };
        };
      required.push({
        id: id + '.' + (shot.region ?? 'full'),
        owner: id,
        type: 'prop',
        bounds: b,
        fraction: COMPOSITION_LIMITS.propVisible,
        ...sample(b),
        ignore
      });
      if (shot.region === 'diagram' && prop.regions.node) required.push({
        id: id + '.node',
        owner: id,
        type: 'prop',
        bounds: prop.regions.node,
        fraction: 1,
        ...sample(prop.regions.node),
        ignore
      });
      continue;
    }
    if (!a?.visibility) directionFail('MISSING_VISIBILITY', 'Actor feature samples required', {
      subject: id
    });
    for (const type of ['face', 'eyes'] as const) required.push({
      id: id + '.' + type,
      owner: id,
      type,
      bounds: a.regions.face,
      fraction: type === 'face' ? COMPOSITION_LIMITS.faceVisible : COMPOSITION_LIMITS.eyesVisible,
      ...a.visibility.features[type]
    });
    const hands = ['medium', 'reaction', 'twoShot'].includes(shot.type) ? a.visibility.activeHands.length ? a.visibility.activeHands : shot.type === 'medium' ? ['left', 'right'] as const : [] : [];
    for (const side of hands) {
      const key = side + 'Hand' as 'leftHand' | 'rightHand';
      required.push({
        id: id + '.' + key,
        owner: id,
        type: 'hand',
        bounds: a.regions[key],
        fraction: COMPOSITION_LIMITS.handVisible,
        ...a.visibility.features[key]
      });
    }
    if (shot.type === 'fullBody' || shot.type === 'establishing') for (const side of ['left', 'right'] as const) required.push({
      id: id + '.' + side + 'Foot',
      owner: id,
      type: 'foot',
      bounds: boundsOf(a.visibility.features[side + 'Foot' as 'leftFoot'].points),
      fraction: .8,
      ...a.visibility.features[side + 'Foot' as 'leftFoot']
    });
  }
  if (required.length > COMPOSITION_LIMITS.maxRegions || s.visibility.proxies.length > COMPOSITION_LIMITS.maxProxies) directionFail('VISIBILITY_BUDGET', 'Region/proxy budget exceeded');
  const vector = (v: readonly number[]) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
    idsSeen = new Set<string>();
  for (const p of s.visibility.proxies) {
    if (!p.id || idsSeen.has(p.id)) directionFail('INVALID_PROXY', 'Proxy IDs must be unique');
    idsSeen.add(p.id);
    if (p.kind === 'sphere' || p.kind === 'capsule') {
      if (!Number.isFinite(p.radius) || p.radius <= 0 || !vector(p.kind === 'sphere' ? p.center : p.a) || p.kind === 'capsule' && !vector(p.b)) directionFail('INVALID_PROXY', 'Invalid sphere/capsule');
    } else if (!['box', 'plane'].includes(p.kind) || !vector(p.center) || !vector(p.half) || p.half.some(x => x < 0) || p.axes.length !== 3 || p.axes.some(a => !vector(a) || Math.abs(Math.hypot(...a) - 1) > 1e-6)) directionFail('INVALID_PROXY', 'Invalid oriented box/plane');
  }
  for (const r of required) if (!r.points.length || r.points.length > 9 || r.points.some(p => !vector(p)) || r.normals && (r.normals.length !== r.points.length || r.normals.some(n => !vector(n) || Math.abs(Math.hypot(...n) - 1) > 1e-6))) directionFail('INVALID_FEATURE', 'Finite bounded feature samples required');
  const z = s.visibility.zone;
  if (!vector(z.origin) || !vector(z.right) || !vector(z.front) || ![z.halfWidth, z.back, z.forward, z.minHeight, z.maxHeight].every(Number.isFinite) || z.halfWidth <= 0 || z.back >= z.forward || z.minHeight >= z.maxHeight) directionFail('INVALID_CAMERA_ZONE', 'Finite ordered camera zone required');
  return {
    frame: s.frame,
    required,
    fitting: shotBounds(shot, s),
    heads: Object.entries(s.actors).filter(([, a]) => a.visible).map(([owner, a]) => {
      const proxy = a.visibility?.proxies.find(p => p.kind === 'sphere' && p.id === owner + '.head');
      if (!proxy || proxy.kind !== 'sphere') directionFail('MISSING_VISIBILITY', 'Head sphere required');
      return {
        owner,
        bounds: a.regions.head,
        center: proxy.center,
        radius: proxy.radius
      };
    }),
    proxies: s.visibility.proxies,
    zone: s.visibility.zone,
    front: s.front,
    axis: s.axis,
    viewpoints: s.visibility.viewpoints
  };
}
export function fitCompositionCamera(shotId: string, b: Bounds, direction: T.Vector3, aspect: number, bottom: number): CameraState {
  const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(direction, new T.Vector3(), new T.Vector3(0, 1, 0))),
    inv = q.clone().invert(),
    ps = corners(b).map(p => new T.Vector3(...p).applyQuaternion(inv));
  const tx = Math.tan(Math.PI / 9) * aspect,
    ty = Math.tan(Math.PI / 9),
    left = -1 + 2 * COMPOSITION_LIMITS.side,
    right = 1 - 2 * COMPOSITION_LIMITS.side,
    top = 1 - 2 * COMPOSITION_LIMITS.top,
    low = 1 - 2 * bottom;
  const ux = Math.max(...ps.map(p => p.x + right * tx * p.z)),
    lx = Math.min(...ps.map(p => p.x + left * tx * p.z)),
    uy = Math.max(...ps.map(p => p.y + top * ty * p.z)),
    ly = Math.min(...ps.map(p => p.y + low * ty * p.z));
  const z = Math.max(Math.max(...ps.map(p => p.z)) + .1, (ux - lx) / ((right - left) * tx), (uy - ly) / ((top - low) * ty)),
    x = (ux - right * tx * z + lx - left * tx * z) / 2,
    y = uy - top * ty * z;
  return freezeData({
    shotId,
    position: new T.Vector3(x, y, z).applyQuaternion(q).toArray(),
    quaternion: q.toArray(),
    up: [0, 1, 0],
    scale: [1, 1, 1],
    fov: 40,
    aspect,
    near: .05,
    far: Math.max(100, z - Math.min(...ps.map(p => p.z)) + 1),
    zoom: 1,
    focus: 10,
    filmGauge: 35,
    filmOffset: 0,
    layers: 1,
    view: null
  });
}
export function assessComposition(shot: StaticShot, frame: CompactVisibilityFrame, camera: CameraState, options: CompositionOptions) {
  const projection = createProjection(camera),
    failures: string[] = [],
    details: unknown[] = [],
    caption = options.captions ? captionAt(options.captions, frame.frame)?.rect : undefined,
    ids = shot.subjects ?? [shot.subject!];
  let score = 0,
    minVisible = 1,
    minHead = 1;
  const z = frame.zone,
    delta = new T.Vector3(...camera.position).sub(new T.Vector3(...z.origin)),
    x = delta.dot(new T.Vector3(...z.right)),
    forward = delta.dot(new T.Vector3(...z.front));
  if (Math.abs(x) > z.halfWidth || forward < z.back || forward > z.forward || delta.y < z.minHeight || delta.y > z.maxHeight) failures.push('CAMERA_ZONE');
  const axis = new T.Vector3(...frame.axis.to).sub(new T.Vector3(...frame.axis.from)),
    rightAxis = new T.Vector3(1, 0, 0).applyQuaternion(new T.Quaternion(...camera.quaternion));
  const baseline = axis.dot(new T.Vector3(frame.front[2], 0, -frame.front[0]));
  if (!shot.allowAxisCrossing && axis.dot(rightAxis) * baseline <= 1e-6) failures.push('AXIS_CROSSING');
  const fitRect = projection.rect(frame.fitting);
  if (corners(frame.fitting).some(p => !projection.point(p).inFrame)) failures.push('CROP');
  for (const r of frame.required) {
    const result = estimateVisibility(camera, r, frame.proxies),
      rect = projection.rect(r.bounds);
    minVisible = Math.min(minVisible, result.fraction);
    if (result.fraction + 1e-8 < r.fraction) failures.push('OCCLUDED:' + r.id);
    if (caption && rectsIntersect(rect, caption, COMPOSITION_LIMITS.captionGap)) failures.push('CAPTION:' + r.id);
    details.push({
      region: r.id,
      ...result
    });
  }
  for (const r of frame.required.filter(r => r.type === 'face')) {
    const normal = r.normals?.[4];
    if (normal) {
      const view = new T.Vector3(...camera.position).sub(new T.Vector3(...r.points[4])).normalize();
      score += Math.max(0, view.dot(new T.Vector3(...normal))) * .5;
    }
  }
  for (const head of frame.heads) {
    const rect = projectedSphereRect(camera, head.center, head.radius);
    if (ids.includes(head.owner)) {
      const h = rect.bottom - rect.top;
      minHead = Math.min(minHead, h);
      if (h < COMPOSITION_LIMITS.minHead[shot.type]) failures.push('SUBJECT_TOO_SMALL:' + head.owner);
      score += h * 3 - Math.abs(rect.top - .10);
    } else {
      const area = Math.max(0, Math.min(1, rect.right) - Math.max(0, rect.left)) * Math.max(0, Math.min(1, rect.bottom) - Math.max(0, rect.top)),
        depth = projection.point(head.center).depth,
        targetDepth = Math.min(...frame.required.map(r => projection.point(pointCenter(r.bounds)).depth));
      if (area > COMPOSITION_LIMITS.maxForegroundArea && depth < targetDepth) failures.push('FOREGROUND_DOMINANCE:' + head.owner);
      score -= area;
    }
  }
  if (shot.type === 'objectFocus') {
    const r = projection.rect(frame.required[0].bounds),
      area = (r.right - r.left) * (r.bottom - r.top);
    if (r.bottom - r.top < .24 || area < .08) failures.push('PROP_TOO_SMALL');
    score += area * 2;
  }
  score += (fitRect.right - fitRect.left) * (fitRect.bottom - fitRect.top) * .1;
  return {
    valid: failures.length === 0,
    failures: [...new Set(failures)],
    score,
    minVisible,
    minHead,
    details
  };
}
export function planVisibleShot(shot: StaticShot, frames: readonly CompactVisibilityFrame[], aspect: number, options: CompositionOptions, endpointView?:StaticShot['view']) {
  const first = frames[0],
    views = [...first.viewpoints];
  if (shot.subject) {
    const region = first.required.find(r => r.owner === shot.subject && r.type === 'face');
    if (region?.normals?.[4]) {
      const n = region.normals[4],
        front = new T.Vector3(...first.front);
      const yaw = Math.atan2(n[0] * front.z - n[2] * front.x, n[0] * front.x + n[2] * front.z);
      views.push({
        id: '05-subject',
        yaw
      });
    }
  }
  if(endpointView){
    const allowed=views.filter(v=>endpointView==='subjectFront'?v.id==='05-subject':Math.abs(v.yaw-(endpointView==='front'?0:Math.PI/6))<1e-8);
    views.splice(0,views.length,...allowed);
    if(!views.length)directionFail('UNSUPPORTED_MOTION_VIEW','Stage does not supply this semantic endpoint view',{shotId:shot.id});
  }
  const failures: unknown[] = [],
    valid: {
      id: string;
      camera: CameraState;
      bounds: Bounds;
      score: number;
      minVisible: number;
      minHead: number;
    }[] = [];
  if (views.length > COMPOSITION_LIMITS.maxCandidates) directionFail('CAMERA_BUDGET', 'Too many stage candidate views', {
    shotId: shot.id
  });
  for (const view of views.slice(0, COMPOSITION_LIMITS.maxCandidates)) {
    const direction = new T.Vector3(...first.front).applyAxisAngle(new T.Vector3(0, 1, 0), view.yaw);
    direction.y = shot.type === 'objectFocus' ? .03 : .08;
    direction.normalize();
    const rotation = new T.Matrix4().lookAt(direction, new T.Vector3(), new T.Vector3(0, 1, 0)),
      inverse = rotation.clone().invert();
    let aligned: Bounds | undefined;
    for (const f of frames) {
      const b = transformBounds(f.fitting, inverse),
        u = aligned ? unionBounds([aligned, b]) : b;
      aligned = {
        min: u.min,
        max: u.max
      };
    }
    const bounds = transformBounds(aligned!, rotation);
    let bottom = .95;
    for (const f of frames) {
      const rect = options.captions ? captionAt(options.captions, f.frame)?.rect : undefined;
      if (rect) bottom = Math.min(bottom, rect.top - COMPOSITION_LIMITS.captionGap);
    }
    if (bottom <= .25) directionFail('CAPTION_TOO_TALL', 'Caption leaves insufficient composition space', {
      shotId: shot.id
    });
    const camera = fitCompositionCamera(shot.id, bounds, direction, aspect, bottom);
    let score = 0,
      minVisible = 1,
      minHead = 1,
      bad = false;
    for (const frame of frames) {
      const r = assessComposition(shot, frame, camera, options);
      if (!r.valid) {
        failures.push({
          candidate: view.id,
          frame: frame.frame,
          failures: r.failures,
          details: r.details
        });
        bad = true;
        break;
      }
      score += r.score;
      minVisible = Math.min(minVisible, r.minVisible);
      minHead = Math.min(minHead, r.minHead);
    }
    if (!bad) valid.push({
      id: view.id,
      camera,
      bounds,
      score: score / frames.length,
      minVisible,
      minHead
    });
  }
  valid.sort((a, b) => Math.round(b.score * 1e6) - Math.round(a.score * 1e6) || a.id.localeCompare(b.id));
  if (!valid.length) directionFail('NO_VALID_COMPOSITION', 'No approved camera satisfies visibility, caption, zone and direction constraints', {
    shotId: shot.id,
    details: failures
  });
  return {
    ...valid[0],
    candidateCount: views.length,
    failures
  };
}
