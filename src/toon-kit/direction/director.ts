import * as T from 'three';
import type { CartoonEngine } from '../engine';
import { fitStaticRegion } from './framing';
import { freezeData } from '../characters/pose';
import { compileShotTimeline } from './timeline';
import { shotBounds, croppingForShot } from './shots';
import { corners, unionBounds, transformBounds } from './bounds';
import type { Bounds, CameraState, CompositionSnapshot, StaticShot, Vec3 } from './types';
import { directionFail } from './types';
import type { CompositionOptions, CompactVisibilityFrame } from './visibility-types';
import { compactVisibilityFrame, planVisibleShot, COMPOSITION_LIMITS } from './composition';
import { prepareCameraMotion, evaluateCameraMotion, motionTarget } from './motion';
import type { PreparedMotion } from './motion';
export function applyCameraState(camera: T.PerspectiveCamera, state: CameraState) {
  const vector = (v: readonly number[], length: number) => Array.isArray(v) && v.length === length && v.every(Number.isFinite);
  if (!state || !vector(state.position, 3) || !vector(state.quaternion, 4) || !vector(state.up, 3) || !vector(state.scale, 3) || state.scale.some(v => v !== 1) || ![state.fov, state.aspect, state.near, state.far, state.zoom, state.focus, state.filmGauge, state.filmOffset].every(Number.isFinite) || state.fov <= 0 || state.fov >= 180 || state.aspect <= 0 || state.near <= 0 || state.far <= state.near || state.zoom <= 0 || state.filmGauge <= 0 || state.focus <= 0 || state.view !== null || !Number.isInteger(state.layers) || Math.abs(Math.hypot(...state.quaternion) - 1) > 1e-6 || Math.abs(Math.hypot(...state.up) - 1) > 1e-6) directionFail('INVALID_CAMERA_STATE', 'Complete finite perspective camera state required');
  if (camera.parent) directionFail('INVALID_CAMERA_PARENT', 'Director requires an unparented engine camera');
  camera.rotation.order = 'XYZ';
  camera.position.set(...state.position);
  camera.quaternion.set(...state.quaternion);
  camera.scale.set(...state.scale);
  camera.up.set(...state.up);
  camera.fov = state.fov;
  camera.aspect = state.aspect;
  camera.near = state.near;
  camera.far = state.far;
  camera.zoom = state.zoom;
  camera.focus = state.focus;
  camera.filmGauge = state.filmGauge;
  camera.filmOffset = state.filmOffset;
  camera.view = null;
  camera.layers.mask = state.layers;
  camera.matrixAutoUpdate = camera.matrixWorldAutoUpdate = true;
  camera.coordinateSystem = T.WebGLCoordinateSystem;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
export function projectedBoundsFit(bounds: Bounds, state: CameraState) {
  const camera = new T.PerspectiveCamera();
  applyCameraState(camera, state);
  return corners(bounds).every(p => {
    const v = new T.Vector3(...p).project(camera);
    return Number.isFinite(v.x) && Math.abs(v.x) <= 1 + 1e-7 && Math.abs(v.y) <= 1 + 1e-7 && v.z >= -1 && v.z <= 1;
  });
}
export function createDirector(engine: CartoonEngine, options: {
  stage: {
    accepts(s: CompositionSnapshot): void;
  };
  shots: readonly StaticShot[];
  durationInFrames: number;
  aspect: number;
  composition?: CompositionOptions;
}) {
  options = {
    ...options,
    composition: options.composition ? {
      ...options.composition
    } : undefined
  }; // caller edits must not change an already compiled policy
  if (!Number.isFinite(options.aspect) || options.aspect <= 0) directionFail('INVALID_ASPECT', 'Positive viewport aspect required');
  const timeline = compileShotTimeline(options.shots, options.durationInFrames),
    plans = new Map<string, {
      camera: CameraState;
      bounds: Bounds;
      envelope: Bounds;
      composition?: ReturnType<typeof planVisibleShot>;
      motion?: PreparedMotion;
    }>();
  for (const shot of timeline.shots) {
    if (shot.motion && !options.composition) directionFail('MOTION_REQUIRES_COMPOSITION', 'Camera motion requires composition:{} or composition:{captions}', {
      shotId: shot.id
    });
    if (shot.motion && shot.endFrame - shot.startFrame < 2) directionFail('INVALID_MOTION_RANGE', 'Motion needs at least two frames', {
      shotId: shot.id
    });
  }
  const frameData = (shot: StaticShot, s: CompositionSnapshot) => {
    const main = compactVisibilityFrame(shot, s);
    if (shot.motion?.type === 'pan') for (const ref of [shot.motion.from, shot.motion.to]) {
      motionTarget(s, ref);
      const region = ref.region ?? (Object.hasOwn(s.actors, ref.subject) ? 'face' : 'full');
      if (!main.required.some(r => r.id === ref.subject + '.' + region)) directionFail('UNPROTECTED_PAN_TARGET', 'Pan targets must be sampled face/hand/prop regions protected by the outer shot', {
        shotId: shot.id,
        subject: ref.subject
      });
    }
    const endpoints = shot.motion?.type === 'move' ? [shot.motion.from, shot.motion.to].map(p => {
      const endpoint = {
        ...p,
        id: shot.id,
        startFrame: shot.startFrame,
        endFrame: shot.endFrame
      };
      for (const id of p.subjects ?? [p.subject!]) if (Object.hasOwn(s.props, id) && !Object.hasOwn(s.props[id].regions, p.region ?? 'full')) directionFail('UNKNOWN_REGION', 'Unknown motion endpoint prop region', {
        shotId: shot.id,
        subject: id
      });
      shotBounds(endpoint, s); // Same semantic validation as ordinary shots.
      return compactVisibilityFrame(endpoint, s);
    }) : [];
    return {
      main,
      endpoints
    };
  };
  const signatures = new Map<number, string>();
  let ready = false,
    busy = false,
    dead = false;
  const live = () => {
    if (dead || engine.signal.aborted) directionFail('DIRECTOR_DISPOSED', 'Director disposed');
  };
  const dispose = () => {
    dead = true;
    ready = false;
    plans.clear();
    signatures.clear();
  };
  engine.registerCleanup(dispose);
  const check = (s: CompositionSnapshot, frame: number) => {
    options.stage.accepts(s);
    if (s.frame !== frame) directionFail('STALE_SNAPSHOT', 'Snapshot frame differs from requested frame', {
      frame
    });
  };
  return Object.freeze({
    timeline,
    /** Exactly duration+1 samples (<=601), in ascending order; final sample 0
     * restores props and complete cast state even after preparation failure.
     * No rendering or live camera mutation occurs during preparation. */
    prepare({
      sample
    }: {
      sample: (frame: number) => CompositionSnapshot;
    }) {
      live();
      if (ready || busy) directionFail('PREPARATION_STATE', 'Prepare a director exactly once');
      busy = true;
      const boxes = new Map<string, Bounds>(),
        alignedBoxes = new Map<string, Bounds>(),
        directions = new Map<string, {
          direction: T.Vector3;
          rotation: T.Matrix4;
          inverse: T.Matrix4;
        }>();
      const visibilityFrames = new Map<string, CompactVisibilityFrame[]>();
      const endpointFrames = new Map<string, CompactVisibilityFrame[][]>();
      const panTargets = new Map<string, readonly Vec3[]>();
      let signatureBytes = 0;
      const compact = (b: Bounds): Bounds => ({
        min: b.min,
        max: b.max
      });
      try {
        if (options.composition?.captions && (Math.abs(options.composition.captions.width / options.composition.captions.height - options.aspect) > 1e-8 || Number.isFinite(engine.width) && (engine.width !== options.composition.captions.width || engine.height !== options.composition.captions.height))) directionFail('CAPTION_VIEWPORT', 'Caption layout viewport differs from camera');
        for (let frame = 0; frame < options.durationInFrames; frame++) {
          const s = sample(frame);
          check(s, frame);
          const shot = timeline.select(frame),
            b = shotBounds(shot, s),
            old = boxes.get(shot.id);
          if (options.composition) {
            const data = frameData(shot, s),
              compactFrame = data.main,
              frames = visibilityFrames.get(shot.id) ?? [];
            frames.push(compactFrame);
            visibilityFrames.set(shot.id, frames);
            if (data.endpoints.length) {
              const pair = endpointFrames.get(shot.id) ?? [[], []];
              data.endpoints.forEach((f, i) => pair[i].push(f));
              endpointFrames.set(shot.id, pair);
            }
            if (shot.motion?.type === 'pan' && frame === shot.startFrame) panTargets.set(shot.id, [motionTarget(s, shot.motion.from), motionTarget(s, shot.motion.to)]);
            const signature = JSON.stringify(data);
            signatureBytes += signature.length * 2;
            if (signatureBytes > COMPOSITION_LIMITS.maxSignatureBytes) directionFail('PREPARATION_BUDGET', 'Visibility certificates exceed memory budget');
            signatures.set(frame, signature);
          }
          boxes.set(shot.id, compact(old ? unionBounds([old, b]) : b));
          if (!directions.has(shot.id)) {
            // Explicit reference is startFrame, reached by this bounded preparation
            // pass, never the first frame requested by Remotion.
            const face = shot.subject ? s.actors[shot.subject]?.facing ?? s.props[shot.subject]?.facing : undefined;
            const direction = new T.Vector3(...(shot.view === 'subjectFront' ? face ?? s.front : s.front));
            if (shot.view === 'threeQuarter') direction.applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 6);
            direction.y += shot.type === 'objectFocus' ? .03 : .08;
            direction.normalize();
            const rotation = new T.Matrix4().lookAt(direction, new T.Vector3(), new T.Vector3(0, 1, 0));
            directions.set(shot.id, {
              direction,
              rotation,
              inverse: rotation.clone().invert()
            });
          }
          const aligned = transformBounds(b, directions.get(shot.id)!.inverse),
            previous = alignedBoxes.get(shot.id);
          alignedBoxes.set(shot.id, compact(previous ? unionBounds([previous, aligned]) : aligned));
        }
        for (const shot of timeline.shots) {
          const {
              direction,
              rotation
            } = directions.get(shot.id)!,
            bounds = transformBounds(alignedBoxes.get(shot.id)!, rotation);
          const camera = fitStaticRegion(bounds, direction, options.aspect);
          const state: CameraState = freezeData({
            shotId: shot.id,
            position: camera.position.toArray(),
            quaternion: camera.quaternion.toArray(),
            up: [0, 1, 0],
            scale: [1, 1, 1],
            fov: 40,
            aspect: options.aspect,
            near: .05,
            far: camera.far,
            zoom: 1,
            focus: 10,
            filmGauge: 35,
            filmOffset: 0,
            layers: 1,
            view: null
          });
          if (!projectedBoundsFit(bounds, state)) directionFail('FRAMING_FAILED', 'Region cannot fit the static shot', {
            shotId: shot.id
          });
          plans.set(shot.id, {
            camera: state,
            bounds: freezeData(bounds),
            envelope: freezeData(boxes.get(shot.id)!)
          });
          if (options.composition) {
            const result = planVisibleShot(shot, visibilityFrames.get(shot.id)!, options.aspect, options.composition);
            plans.set(shot.id, {
              camera: result.camera,
              bounds: result.bounds,
              envelope: freezeData(boxes.get(shot.id)!),
              composition: freezeData(result)
            });
            if (shot.motion) {
              const motion = prepareCameraMotion(shot, visibilityFrames.get(shot.id)!, result, options.composition, index => endpointFrames.get(shot.id)![index], index => panTargets.get(shot.id)![index]);
              plans.set(shot.id, {
                ...plans.get(shot.id)!,
                motion
              });
            }
          }
        }
      } finally {
        try {
          const restored = sample(0);
          check(restored, 0);
        } finally {
          busy = false;
        }
      }
      ready = true;
    },
    evaluate({
      frame,
      snapshot
    }: {
      frame: number;
      snapshot: CompositionSnapshot;
    }) {
      live();
      if (!ready) directionFail('NOT_PREPARED', 'Prepare explicit reference frames before capture');
      check(snapshot, frame);
      const shot = timeline.select(frame),
        plan = plans.get(shot.id)!;
      const current = shotBounds(shot, snapshot);
      if (options.composition && JSON.stringify(frameData(shot, snapshot)) !== signatures.get(frame)) directionFail('COMPOSITION_CHANGED', 'Current visibility state differs from certified preparation; prepare a new director', {
        shotId: shot.id,
        frame
      });
      // A changed stage/action must not silently make the static camera follow it.
      for (let i = 0; i < 3; i++) if (current.min[i] < plan.envelope.min[i] - 1e-6 || current.max[i] > plan.envelope.max[i] + 1e-6) directionFail('REFRAME_REQUIRED', 'Scene/action moved outside prepared envelope', {
        shotId: shot.id,
        frame
      });
      return plan.motion ? evaluateCameraMotion(plan.motion, frame) : plan.camera;
    },
    applyFrame(input: {
      frame: number;
      snapshot: CompositionSnapshot;
    }) {
      const state = this.evaluate(input);
      applyCameraState(engine.camera, state);
      return state;
    },
    describe(frame: number) {
      live();
      if (!ready) directionFail('NOT_PREPARED', 'Director not prepared');
      const shot = timeline.select(frame);
      return freezeData({
        shot,
        cropping: croppingForShot(shot),
        protectedBounds: plans.get(shot.id)!.bounds,
        composition: plans.get(shot.id)!.composition,
        motion: plans.get(shot.id)!.motion
      });
    },
    preparationStats() {
      live();
      if (!ready) directionFail('NOT_PREPARED', 'Director not prepared');
      return freezeData({
        sampleCount: options.durationInFrames + 1,
        signatureBytes: [...signatures.values()].reduce((n, s) => n + s.length * 2, 0),
        candidateCount: [...plans.values()].reduce((n, p) => n + (p.composition?.candidateCount ?? 0), 0),
        certifiedFrames: signatures.size,
        motionChecks: [...plans.values()].reduce((n, p) => n + (p.motion?.checks ?? 0), 0),
        motionEndpointCandidates: [...plans.values()].reduce((n, p) => n + (p.motion?.endpointCandidates ?? 0), 0)
      });
    },
    dispose
  });
}
