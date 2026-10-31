# Static direction — Phase 3B

Use `createClinicStage`, `createCast` and `createDirector` from the public SDK.
The director owns camera transforms only. It does not change contacts, gestures,
expressions, actor visibility, furniture or caption timing.

```ts
// initScene, after ThreeCanvas has awaited the requested fonts:
const stage = createClinicStage(engine);
const cast = createCast(engine, {
  doctor: {appearance: appearancePreset('doctor'),
    stance: standAt(stage.mark('doctor'))},
  patient: {appearance: appearancePreset('patient'),
    stance: sitAt(stage.seat('examSeat'), {floor: stage.floor(), feet: 'auto'})},
});
stage.bind(cast);
const director = createDirector(engine, {
  stage, durationInFrames: 150, aspect: width / height,
  shots: [
    {id:'dialogue', type:'twoShot', subjects:['doctor','patient'], startFrame:0, endFrame:43},
    {id:'chart', type:'objectFocus', ...stage.prop('medicalChart','diagram'), startFrame:43, endFrame:75},
    {id:'doctor', type:'medium', subject:'doctor', startFrame:75, endFrame:114},
    {id:'reaction', type:'reaction', subject:'patient', startFrame:114, endFrame:150},
  ],
});

const sample = (frame: number) => {
  // Assign complete authored prop state here before evaluating contacts.
  const state = cast.evaluate({frame, fps, poses: acting(frame)});
  return stage.snapshot(state);
};
director.prepare({sample});

// ThreeCanvas onFrame — autoFrame={false}, exactly one cast evaluation:
director.applyFrame({frame, snapshot: sample(frame)});
```

`acting(frame)` is the scene's existing absolute-frame character-action function.
The camera timeline is independent. Do not accumulate rotations, evaluate from
previous poses, or use the camera to alter an action. For moving level floors,
provide the current `stage.floor()` in the complete seating intention each frame.
The existing universal clinic already does this.

## Stage API

`createClinicStage(engine)` constructs the existing `ClinicEnvironment` and uses
its existing opt-in universal staging, then attaches/tracks it with the engine.
It does not reconstruct furniture. To adapt an existing universal clinic, use:

```ts
const stage = createClinicStage(engine, {
  environment: clinic.environment, targets: clinic.targets,
});
stage.bind(clinic.cast);
```

Injected targets must reference the same room's doctor marker, examination
cushion and chart. This prevents contact/framing disagreement. Exposed typed
references: `mark('doctor')`, `seat('examSeat')`, `target('diagram'|'diagramHead')`,
`prop('medicalChart','full'|'diagram'|'node')`, `floor()`, and `cameraViews`.
`snapshot.axis` is the current doctor/patient root axis projected to the level
ground plane; it is metadata, not screen-direction enforcement.

The chart diagram is derived from actual mesh bounds, texture dimensions and
the existing artwork's circle, glow, strokes and spine endpoint. Object focus
uses the selected content region, not the object pivot. No world-space chart,
pelvis, knee, ankle or camera offsets are required from scene authors.

## Snapshot and transform contract

`stage.snapshot(castState)` returns deeply frozen plain data:

- `frame`, `fps`, world-space `front` and interaction `axis`.
- Named `actors`: visibility, current root origin, head-facing vector, and
  `head`, `face`, `torso`, `fullBody`, `leftHand`, `rightHand`, `gesture` regions.
- Named `props`, each with visibility, facing vector and registered regions.
- Each region contains world AABB `min/max` and optional transformed bounding
  corner `points`. These corners preserve orientation for projection.

Head bounds include actual bound hair/accessory meshes. The face region is a
conservative surface patch, not a guarantee that both eyes face the viewer.
The active gesture region uses resolved pointing/acting hand selection; when
there is no active hand action it conservatively includes both hands.

Geometry-local bounds and static appearance bindings are cached once at bind.
Snapshots transform these using complete pose data and current parent frames,
not live joint matrices from a previous pose. No geometry, materials, textures
or render targets are created during frame evaluation. Small CPU arrays/matrices
are allocated; this is not a claim of allocation-free JavaScript execution.

Conventions: +Y up, +Z forward, anatomical left +X. World snapshots account for
uniform character scaling and level translated/yaw-rotated positive uniform
parent frames (the existing scale 0.05..20 contract). Tilt/shear/nonuniform
contact parents are unsupported. Bound geometry/appearance is immutable after
binding. Parent/scene transforms and props are evaluated before the cast.

## Shot presets and preparation

| Type | Protected regions / intentional cropping |
| --- | --- |
| establishing | Full bodies and/or named props; shoes included for actors. |
| twoShot | Both actors' heads, faces, torsos and hands; lower bodies may crop. |
| medium | Actor head, face, torso and both hands; lower body may crop. |
| fullBody | Complete mesh envelope, including shoes and sole plane. |
| closeUp | Head/hair and face; lower body may crop deliberately. |
| reaction | Head, face and gesture-hand envelope; lower body may crop. |
| objectFocus | Named prop content region, default `full`. |

The fixed lens is 40 degrees. Views are `front` (stage front, default),
`threeQuarter` (fixed 30-degree side) and `subjectFront` (single subject's
facing at the shot's explicit start frame). These are deterministic directions,
not searched camera zones or a guarantee of unobstructed views.

`prepare({sample})` is synchronous and must complete in `initScene`. It samples
every integer frame in ascending order, then explicitly samples frame 0 in a
finally block to restore known prop/cast state, including after a failed sample.
The live camera is untouched. A disposed engine cannot be restored. The initial
limits are 1..600 frames and 1..32 shots: at most 601 callback invocations.
No lazy initialization from the first Remotion request is allowed.

The solver accumulates constant-size bounds in each shot's fixed camera axes;
it does not retain every frame's snapshot or point cloud. It reuses Phase 1's
framing mathematics in those axes, avoiding repeated rotated-AABB inflation.
After preparation each shot has one immutable camera state. Runtime never
reframes or smooths based on history. Changing the layout/actions requires a
new director/preparation; leaving the prepared world envelope rejects with
`REFRAME_REQUIRED` instead of silently following the subject.

Intervals are half-open, cover the entire clip exactly once, and may be declared
out of order. Invalid/duplicate IDs, invalid ranges, gaps, overlaps, unsupported
options and unknown subjects/regions reject. There is no implicit gap policy.

## Camera and resource contract

`evaluate({frame,snapshot})` returns an immutable camera state without mutating
the scene. `applyFrame(...)` evaluates and applies it to the engine camera.
`describe(frame)` reports the shot, cropping policy and protected envelope.
Snapshots from another stage or another requested frame reject.

Camera states include position, quaternion, up, scale, FOV, aspect, near/far,
zoom, focus, film gauge/offset, layers and a cleared view offset. Application
resets Euler order, matrix-update flags and WebGL projection convention, then
updates projection/world/inverse matrices. The engine camera must be unparented.
Malformed states reject before mutation. `DirectionError.diagnostic` supplies
code, message and applicable shot/frame/subject fields.

Stage/director disposal is idempotent and registered with the engine. A stage
adapter does not separately dispose shared room textures or cast resources;
the engine retains ownership. No GPU caches cross engines, and cuts reuse one
scene, renderer and camera. New preparation after resize belongs to the new
ThreeCanvas lifecycle, with the new aspect ratio.

## Deliberately excluded

No occlusion optimization, candidate-camera search, caption-safe fitting,
screen-direction enforcement, over-shoulder preset, camera motion, crossfade,
other layout templates or action timeline. A non-subject actor can enter/crop
at a shot edge. Captions may overlap scene content. These are 3C/3D concerns.
Do not hide actors or enable expensive effects to conceal such limitations.
All existing CPU-only production safety rules remain mandatory.

## Opt-in Phase 3C

The exclusions above describe the retained Phase 3B default. For bounded
visibility-aware candidate selection, measured caption clearance and axis
checks, pass `composition:{captions}` and read [COMPOSITION.md](COMPOSITION.md).
The DoctorClinicVisible composition demonstrates the complete readiness bridge.

## Phase 3D motion

Optional deterministic `shot.motion` is documented in [MOTION.md](MOTION.md).
Preparation and frame application use the same director; static shots retain
Phase 3B/3C behavior.

Phase 3E adds a minimal generic `createStage(engine,{root,floor,axis})` adapter.
See the single verified scene example in ../AGENT_INSTRUCTIONS.md and the
independent office-fixture.ts. It uses the same director and existing cast;
no clinic geometry, chart artwork or camera coordinates are needed.
Eye coverage includes center/edge samples; diagnostics separately report naturally self-occluded peripheral samples. See docs/PHASE3E.md for the closeout gate and limitations.
