# Stage 2E-A — declarative deterministic walking

Use **`createCast`** for new scene authoring. Build the route and cast once in
`initScene`; evaluate from the requested absolute frame in `onFrame`.

```ts
import {createCast, createPaths, pathFromMarks, walkAlong, appearancePreset,
  standAt, worldMark, lookAt, pointAt, scenePoint} from './toon-kit';

// Locators belong to authored static room props, not live character joints.
const clinic = {paths: createPaths({
  toDoor: pathFromMarks([startLocator, corridorLocator, doorLocator]),
})};
const walking = walkAlong(clinic.paths.path('toDoor'), {
  startFrame:30, endFrame:270,
});
const cast = createCast(engine, {
  doctor: {appearance:appearancePreset('doctor'), stance:walking},
  patient: {appearance:appearancePreset('patient'),
    stance:standAt(worldMark([-2,0,1]))},
});

// onFrame: scene prop state first, cast evaluation second, camera last.
const snapshot = cast.evaluate({frame, fps, poses: {
  doctor: {expression:'happy', gesture:pointAt(scenePoint(chart))},
  patient: {gaze:lookAt(cast.actors.doctor.target('head'))},
}});
// snapshot.locomotion.doctor exposes phase, distance, feet and reserved arms.
// cast.dispose() detaches actors; engine.dispose() releases shared GPU resources.
```

No stride phases, root/hip coordinates, foot positions or rotations are required
from scene authors. Routes may also use explicit authored world waypoints:

```ts
const route = pathThrough([[0,0,0], [0,0,2], [1,0,4]]);
const stroll = walkAlong(route, {startFrame:30, speed:.5});
```

## Public contracts

- `pathThrough(points: readonly Vec3[]): WalkingPath`: immutable level world-space
  route through 2–32 points. Adjacent points must be separated by at least 1e-5;
  coordinates are finite within ±1e6, total length ≤10,000 scene units. Slopes,
  duplicate neighbors and corners over approximately 150° reject. Tight bends
  can still fail physical foot/body clearance even below this path limit.
- `pathFromMarks(marks: readonly Object3D[]): WalkingPath`: snapshots current
  world locator positions once. Later prop motion does not modify the route.
  Live actor joints and their descendants are rejected.
- `createPaths({name: path})`: immutable library with `.path(name)` references;
  missing/invalid names fail with `PATH_INVALID` during evaluation.
- `walkAlong(path, {startFrame?, endFrame?, speed?, strideScale?})`: stance input.
  `startFrame` defaults to 0. Supply either integer `endFrame > startFrame` or
  positive `speed`, not both. Speed is cruising world units/second; average speed
  is lower because start/stop ramps are included. Default speed scales with leg
  length. `strideScale` defaults to 1, bounded to .2–4; extremes may be physically
  infeasible and are never stretched. Cadence over five footsteps/second rejects.
- `snapshot.locomotion[name]`: immutable `WalkState`, or null for nonwalkers;
  includes phase, distance, length, unwrapped yaw, step count/phase, absolute
  interval, foot world positions/yaws/states/indices and procedural arm status.
- `planWalk(definition, intention, frame, fps, worldScale)`: advanced pure
  planner returning resolved support data and metadata. Scene authors should
  use `createCast`; do not construct `WalkingContact` or mutate a rig manually.

Keep the same descriptor active **before, during and after** its interval. It
holds the exact start standing pose before walking, and the exact endpoint
standing pose afterward. Omission resets to the construction stance, never the
last rendered endpoint. Replacing the descriptor or switching stand/sit inputs
does not automatically blend them. This stage introduces no event queue or
timeline sequencing. A single stance cannot be both seated and walking.

Routes and sole targets are world-space; dimensions and pelvis height are in
unscaled character units. Positive uniform root/ancestor scales and level parent
translation/yaw are supported by the existing contact conversion. Keep total
scale constant over a walk; time-varying scaling changes the mathematical request
and is not a supported locomotion channel. Parent translation/yaw is compensated
to preserve the explicit world route and contacts.

## Absolute-time gait and contacts

Cubic Hermite waypoint curves use a bounded 64-sample-per-segment arc-length
table and binary-search inversion. Length/progress is a numerical approximation,
not an exact symbolic integral. Tangent headings are unwrapped across ±π before
sampling, preventing artificial orientation flips.

Let `L` be leg length, `S` world scale, `D` path length,
`N = ceil(D / (.35 L S strideScale))`, `a = D/N`, and `T=N+1` step intervals.
Absolute phase is `q = clamp((frame-start)/(end-start) T, 0, T)`. Root distance is
`a(q³-.5q⁴)` during the first interval, `a(q-.5)` in the middle, and the mirrored
polynomial at the end. Position, velocity and acceleration meet at the ramps.
Start/stop roots are exact route endpoints with zero speed and acceleration.

Feet alternate from their indexed previous plant to their next indexed plant.
The first step advances `a`, ordinary steps `2a`, and the final gather step `a`.
Plants are computed directly from route station, hip spacing and shoe sole
offset; stance positions and headings stay fixed in **world space**. Swing
interpolation is quintic, with a smooth bounded lift. Shoes stay level; no
heel/toe rolling is attempted. Pelvis compression is 3–6% of leg length during
full gait, faded at endpoints and scaled down for tiny steps. Lift is capped at
7.5% of leg length or 30% of step advance. This reduces the excessive crouch
identified in the first normal-speed preview while retaining curved-path reach.

These targets enter the existing support solver and Stage 2B analytic IK.
The same fixed-length checks, floor/body/limb clearances and ankle orientation
conversion apply. Walking adds leg/leg and shoe/shoe clearance checks; no general
collision engine or second IK solver is introduced. Unsupported foot/body yaw
over 60°, infeasible strides or collisions reject the whole cast atomically.

Support-phase actor anchors already contain **this frame's** route position,
orientation and pelvis bob. Mutual tracking and reversed actor declaration order
therefore resolve consistently without reading previously applied joint matrices.

## Arm priority, diagnostics and resources

Order: support contacts → explicit reaches → pointing/intentional gestures → free arm swing → gaze
and face. Reaches reserve their arms; pointing reserves its selected free arm.
Only remaining arms counter-swing. Candidate targets pass through the **same**
IK/clearance pipeline, retaining the solved pointing elbow/hand. If full swing
fails, weights .6 and .3 are tried, then valid rest arms are kept. Higher-priority
actions never move to accommodate decorative swing. `WALK_ARM_YIELD` is
informational; `WalkState.arms/swingWeight` report the result. This bounded fallback
is not general smooth gesture blending; amplitude can change discretely at a
clearance boundary in adversarial action combinations.

[Stage 2E-B acting](ACTING.md) now blends deliberate gesture targets from/to
the current frame's walking baseline, reserving gesture arms before publication.
The legacy bounded swing fallback remains conservative at tight clearances.

Failures use `CastEvaluationError.diagnostics`: `PATH_INVALID`, `WALK_INVALID`,
`WALK_SPEED`, or `WALK_UNREACHABLE` with underlying contact diagnostics such as
`STANCE_UNREACHABLE`, `JOINT_LIMIT`, `FLOOR_CLEARANCE` or `LIMB_CLEARANCE`.
Invalid/missing paths, incompatible seat fields, impossible requests and stale
live-joint references must fail capture, never continue rendering an old pose.

No geometry/materials are created per frame, no extra passes or physics are used,
and character mesh counts are unchanged. Paths contain only immutable CPU data
with at most 1,985 table entries. Owner-scoped pools and private face textures
retain their existing disposal behavior. Complete poses still reset all controlled
transforms/visibility; appearances remain attached to the existing hierarchy.

Limits: static level paths, no obstacles/inter-character avoidance, stairs,
backward/strafe locomotion, foot roll, general story timelines, cinematic
automation or legacy clinic migration. Sharp turns may reject even on a valid
path; use gentler routes/shorter strides instead of bypassing diagnostics.

## Reproduce verification

Run serially; never overlap render jobs or memory-abort tests:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
node scripts/verify-faces.cjs expressions-only
node scripts/verify-appearance.cjs audit-only
npm run verify:walking
```

`verify:walking` uses the unchanged production launcher, software-safe, SwiftShader
via swangle, concurrency one, disabled parallel encoding, admission/abort guards
and private workspace scratch. `views-only` and `demo-only` are optional arguments
to `node scripts/verify-walking.cjs`. Results are in gitignored `out/phase2ea/`:
front/three-quarter/side doctor inspection PNGs, foot close-up PNG, `walking.mp4`
(300 frames at 1280×720/30fps), reports, 42 GPU assertions, raw-pixel/PNG hashes,
and quantitative actual-rig foot planting measurements. The movie contains all
four dressed presets, a curved route, a patient stopping by a chair and a fixed
close side shot. The three inspection views isolate the doctor at the same
mid-swing pose and are relative to the character's forward direction.

The tests cover shuffled frames, fresh engines, action priority, moving targets,
parent transforms, all looks, fixed bone lengths, rejected requests, resource
stability and cleanup. Review the MP4 at normal speed as well as screenshots.
Windows SwiftShader results do not certify Muse's 2-vCPU Linux VM. Preserve every
production safety limit; no sampled monitor guarantees survival of sudden host
memory reclamation. Compatible acting is approved through Stage 2E-B; stop before Stage 2F.
