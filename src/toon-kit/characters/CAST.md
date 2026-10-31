# Stage 2C — declarative cast, targets, pointing and gaze

Build once in `initScene`, update scene props from absolute frame inputs, then
call `cast.evaluate()` once per requested frame. The evaluator throws a
`CastEvaluationError` with structured diagnostics on failure. Let that error
cancel Remotion capture; never catch it and continue rendering an old pose.

```ts
const clinic = createTargets({
  doctorMark: sceneMark(doctorLocator),
  examSeat: sceneSeat(examCushionMesh),
  diagram: scenePoint(diagramMesh),
  clock: scenePoint(clockMesh),
});

const cast = createCast(engine, {
  doctor: {stance: standAt(clinic.mark('doctorMark'))},
  patient: {
    proportions: {torsoRadius: .30, headRadius: .62},
    stance: sitAt(clinic.seat('examSeat')),
  },
});

// Inside onFrame, after updating current scene prop transforms:
const snapshot = cast.evaluate({
  frame, fps,
  poses: {
    doctor: {
      gaze: lookAt(cast.actors.patient.target('head')),
      gesture: pointAt(clinic.target('diagram')),
    },
    patient: {gaze: lookAt(cast.actors.doctor.target('head'))},
  },
});
```

Names identify universal characters, not migrated legacy rigs. Use
`appearancePreset('doctor'|'patient'|'office'|'casual')` for reusable looks.
Cast actor options are `proportions`, `colors`, `appearance`, `face`, `stance`,
`scale`, and optional scene `parent`.
`cast.actors[name]` exposes read-only definition/root handles and semantic targets.
Faces are enabled by default in casts; see [FACES.md](FACES.md) for expression,
blink, eye-gaze and construction `face` configuration. The cast owns attachment
to its parent/scene. GPU resources remain engine-owned.
Optional construction `appearance` enables the universal hair/clothing/preset
system; see [APPEARANCE.md](APPEARANCE.md). It is separate from frame intentions.
Use unique actor names across every factory/cast sharing that engine, including
after a cast is disposed; separate engines retain independent namespaces.

## Complete-input defaults and ordering

Every evaluation starts from immutable rest data, not live joints or a previous
snapshot. Actor names are sorted by code-unit order at construction/evaluation;
declaration order and `poses` property order cannot change rendering.

Omitted actors and fields resolve each frame to:

- Stance: construction-time `stance`, otherwise stand at world `(0,0,0)`, yaw 0,
  floor Y=0. Assign named home marks to avoid overlapping defaults.
- Scale: construction-time scale, otherwise 1. Visibility: true.
- Reaches/pointing: none; walking swings free arms, other stances reset them to
  rest. Gaze: neutral forward, head yaw and
  pitch zero. Expressions follow active gesture emotion when omitted, otherwise
  reset to the configured default, normally neutral;
  blinking is evaluated from absolute time and eye gaze uses residual head gaze.

The fixed evaluation order is:

1. Read current positive uniform, level parent world frames.
2. Resolve supports, including absolute-time walking root/foot targets, through
   the existing Stage 2B contact/IK solver.
3. Resolve stable current-frame character and prop targets.
4. Resolve explicit reaches and intentional actions; blend acting targets with
   the current walking/rest baseline, solve constraints, then resolve gaze/face.
5. Validate every complete pose, stage facial rasters and preflight every rig/parent.
6. Apply all poses synchronously. Return an immutable snapshot.

No rig is applied if target resolution, support, intent solving or preflight
fails. Ordinary validation failures therefore cannot leave a partially updated
cast. Arbitrary user hooks or external mutation during commit are unsupported;
the API does not attempt a history-based rollback of external code.

Precedence is **support contacts → explicit reaches → pointing/intentional
gestures → free walking arm swing → secondary motion/gaze/face**. Reaches
reserve their selected arms. An explicit pointing/reach collision rejects the
frame; auto pointing may select the other free arm. Gaze changes only the head's
orientation about its sphere center, preserving the head/neck overlap, limb
clearance volumes and all support contacts. Timed compatible target blending is
documented in [ACTING.md](ACTING.md). There is no event queue, clock, accumulated
delta or persistent animation mixer.

## Targets

`createTargets(entries)` returns `.target(name)`, `.mark(name)` and `.seat(name)`
references. Missing names are diagnosed during evaluation, not silently replaced.
All reference constructors are declarative:

| Helper | Meaning |
|---|---|
| `worldPoint([x,y,z])` | Fixed world hand/interaction point (existing 2B API) |
| `worldMark(position, yaw)` | Fixed standing mark; position Y defines its level floor |
| `scenePoint(object, local?)` | Current world position of a prop's local point, default local origin |
| `sceneMark(object, local?, yawOffset?)` | Current level standing frame from a locator |
| `sceneSeat(mesh, options?)` | Current top surface; infer local bounds from a rigid cushion/slab mesh |
| `markFrom(target, yaw?)` | Standing mark derived from another resolved point |
| `aliasTarget(name)` | Library-local named dependency |
| `frameTarget(({frame,fps,time}) => value)` | Synchronous pure target definition from absolute inputs |
| `actor.target(anchor?, phase?)` | Scoped character anchor; defaults to `head`, `support` |
| `characterTarget(name, anchor?, phase?)` | Explicit current-cast by-name reference for forward definitions |

Update scene transforms **before** evaluation. Each evaluate call has fresh
target/matrix caches; no cache survives to a later frame. Callbacks resolve once
per referenced definition in that evaluation and must be pure and synchronous.
Do not load assets or mutate scene/actor transforms inside a target callback.

Scene points support finite affine object transforms, including rotated or
nonuniformly scaled props. Standing marks, seat surfaces and actor parents use
the Stage 2B level yaw/uniform-scale convention, scale 0.05..20. Point coordinates
are bounded to ±1e6. Scene seats infer static **local** mesh bounds once, then
resolve the current world transform each frame. If a prop deforms or its internal
geometry changes, bind an appropriate explicit local anchor/dimension definition
rather than relying on the old inferred bounds. Group seats require explicit
surface/dimensions. Slabs retain Stage 2B's open-front geometry and contact limits.

Actor targets default to the current **support snapshot**, including walking
root placement and pelvis bob for the requested frame. Head centers therefore
resolve correctly for mutual gaze without recursion or evaluation-order effects.
A wrist support target is
the support/rest-arm wrist, not a final pointing wrist. Use explicit `'final'`
for an acyclic dependency on a solved hand or other final anchor. Final targets
cannot drive support placement. Named/support/final cycles, callback recursion,
missing actors/anchors and graphs deeper than 64 are diagnosed. Actor handle
references are scoped to their cast; foreign handles cannot alias equal names
in another cast. Scene props/parents cannot belong to a foreign engine scene.

Never bind `scenePoint()` to live character joints. Such bindings are rejected
because they would read old joint transforms. Use semantic actor targets instead.
No target resolution needs manual world-coordinate conversion from scene authors.

## Pointing versus reaching

`reachFor('left', target)` is the semantic cast counterpart of Stage 2B
`reachTo()`. Both require the hand center to reach a physically feasible point.

`pointAt(target, {hand:'auto'|'left'|'right'})` instead aims toward the target.
Targets can be arbitrarily distant within the numerical coordinate domain. The
forearm ray must point at the resolved target, but the hand stays on its fixed
limb chain and stops before it. A 25–105 degree elbow bend keeps it readable.

The bounded search tries at most 32 elbow candidates (16 per available arm).
Candidates construct goals and bend hints only; the existing Stage 2B analytic
IK and full body/limb/floor/seat clearance pipeline solve and validate every
candidate. No competing solver or limb stretching is introduced. Handedness is
chosen from the target's character-space side, preferring right for central
targets; then the other free arm may be tried. Selection is independent of camera
and history. Explicit hand selection is honored or fails clearly.

A valid 3D pointing pose can still be foreshortened or occluded by a camera or
unrelated scene prop. Shot design remains scene work, not a hidden camera-driven
arm change. The validation scene uses camera cuts with readable silhouettes.

## Gaze

`lookAt(target)` solves head yaw ±60 degrees and pitch ±25 degrees from the
current world target, then applies a complete quaternion. Upward targets use
negative X pitch in the +Z-forward convention. Overhead targets choose zero yaw;
exact rear targets choose the positive-yaw bound deterministically. Coincident
head targets return neutral forward and an informational diagnostic.

Outside limits, the head is bounded and `GAZE_LIMITED` is reported. The returned
`snapshot.gaze[name]` exposes target world position, desired world direction,
actual head world direction, residual head-local eye direction, yaw, pitch and
limit status. Omission resets gaze fully. Expressions, eyes, brows, mouth, blush
and blinking are provided through [FACES.md](FACES.md).

## Errors, performance and ownership

`CastEvaluationError.diagnostics` contains stable codes such as `TARGET_MISSING`,
`TARGET_INVALID`, `TARGET_CYCLE`, `TARGET_PHASE`, `TARGET_DEPTH`, `UNKNOWN_ACTOR`,
`INVALID_PARENT`, `ACTOR_SCENE_TARGET`, `INTENT_CONFLICT`, `POINTING_UNREACHABLE`,
`POINTING_COINCIDENT`, `CONTACT_FAILED` and `POSE_PREFLIGHT`. Contact errors retain
their Stage 2B details. Expected gaze limits/coincidence are informational.

The cast performs no per-frame geometry/material construction, adds no rendering
passes and keeps no previous-frame pose cache. Support results are reused within
the current evaluation when there are no physical reaches. GPU sharing/disposal
still follows the existing engine owner; `cast.dispose()` is idempotent and
invalidates evaluation. No cross-engine GPU caches are added. No general
inter-character/prop collision, arbitrary body turning or story timeline exists.
Static-path walking and path-tangent body facing are documented in
[WALKING.md](WALKING.md). Keep the same walk descriptor before/after its time
window to hold its endpoints; omission restores the construction stance,
never the previous walk's end position.

## Validation commands

Run serially through the unchanged production guard:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:cast-portrait
```

Landscape output: `out/phase2c/{front,three-quarter,side}.png`, `views.mp4`,
`validation-results.json`, `production-report.json`. Portrait output is under
`out/phase2c/portrait/`. The blue arrows are external validation gizmos showing
head direction, not facial features or part of the character mesh budget.
Portrait is a close two-actor inspector shot; other actors/props are explicitly
hidden through current request/scene inputs. No originals are migrated. Generated
outputs remain gitignored. Never override production concurrency, software GL,
memory admission/abort policy, timeout or workspace temp rules to make tests pass.
