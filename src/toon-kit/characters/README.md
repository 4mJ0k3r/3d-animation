# Universal characters — Stages 2A–2E-B

**Use `createCast` for scene authoring.** It resolves contacts, walking, pointing,
gaze, expressions and complete poses without scene-specific joint mathematics.
Build the cast and static paths once in `initScene`; evaluate from absolute
`frame`/`fps` in `onFrame`. Never accumulate motion or move standing marks to walk.

```ts
import {createCast, createPaths, pathThrough, walkAlong, appearancePreset,
  standAt, worldMark, lookAt} from './toon-kit';

const paths = createPaths({toDoor: pathThrough([[0,0,0], [0,0,2], [1,0,4]])});
const cast = createCast(engine, {
  doctor: {appearance: appearancePreset('doctor'),
    stance: walkAlong(paths.path('toDoor'), {startFrame:30, endFrame:270})},
  patient: {appearance: appearancePreset('patient'),
    stance: standAt(worldMark([-2,0,1]))},
});

// onFrame: update any scene props first, then evaluate, then set the camera.
cast.evaluate({frame, fps, poses: {
  doctor: {expression:'happy'},
  patient: {gaze:lookAt(cast.actors.doctor.target('head'))},
}});
// cast.dispose() detaches actors; engine.dispose() releases shared GPU resources.
```

[CAST.md](CAST.md): evaluator, targets and precedence.
[WALKING.md](WALKING.md): paths, root motion and planted contacts.
[ACTING.md](ACTING.md): timed gestures, compatible target blending and expressive posture.
[FACES.md](FACES.md): expressions, gaze and blinking.
[APPEARANCE.md](APPEARANCE.md): hair, garments and four appearance presets.
[CONTACTS.md](CONTACTS.md): advanced pure IK/contact API.
No general story timelines, cinematic automation, lip-sync or legacy migration.

## Coordinates and anatomy

- Units are scene units. Default crown height is derived, not a separate scale.
- Neutral root `(0,0,0)` lies on the ground plane, centered between ankle projections.
  Shoes point forward; their lowest points are slightly forward of root Z.
- +Y is up, +Z is forward. Anatomical left is +X and right is -X. A character
  looking toward the viewer therefore has its left on the viewer's right.
- Pelvis is the midpoint of the hip joints. Torso origin is the capsule center.
  Torso straight length excludes hemispheres. Neck origin is the torso crown;
  neck top is the head's bottom. Head origin is the sphere center.
- Shoulder surface anchors lie on the torso cylinder at `y=.35*torsoLength`.
  Shoulder joints embed by `1.05*armRadius` along the inward surface normal.
  Upper arms have a symmetric, fixed 18-degree rest splay.
- Hip surface normals are `(±hipSpread,-sqrt(1-hipSpread²),0)` on the lower
  hemisphere. Hip joints embed by `1.05*legRadius` along those normals.
- Elbow/knee origins are exact segment endpoints. Wrist is the hand center.
  Ankle lies inside its shoe; it is not the shoe's top or sole.
- `definition.anchors` are immutable **node-local** offsets. `getAnchor(name,
  'root')` returns a current posed point in unscaled root space. `'world'`
  includes root placement, uniform scaling and ancestor transforms. The result
  is a fresh Vector3 unless an output Vector3 is supplied.
- `poseAnchorPosition` calculates anchors directly from pose data. Its `'parent'`
  option includes the root transform into the root parent's coordinate space;
  it does not claim to calculate world space without scene inputs.
- Scale the character only through root placement: positive uniform scale
  `0.05..20`. Other joint scales are one. Mesh scales encode construction sizes.
  Contact parents support finite translation (including Y), yaw and positive
  uniform scale, with no pitch/roll. The solver compensates parent transforms
  to preserve the explicitly selected world floor. Keep total uniform scale
  fixed throughout a walk; scaling is not a locomotion animation channel.

Hierarchy:

```text
root (ground placement)
  pelvis
    torso
      neck → head
      left/right shoulder → elbow → wrist
    left/right hip → knee → ankle
```

## Mathematics and pose ownership

`createCharacterDefinition()` validates dimensions, body ratios, hand/torso
clearance, shoe/ankle enclosure, shoe separation and ground clearance before any
mesh allocation. Unsupported combinations throw; arbitrary proportions are not
silently stretched into a valid character. Head, torso and limb dimensions remain
independent parameters within these supported limits.

The entire definition, including nested rest transforms and anchor offsets, is
frozen. Complete poses contain all 17 joint and 19 mesh transforms: local position,
unit quaternion, positive scale and visibility. `applyPose()` validates first,
then overwrites all 36 transforms, visibility and automatic matrix update flags.
It does not read a previous pose or construct geometry. Root placement defaults
to identity when omitted; it does not preserve an earlier placement.

These are the low-level pose contracts used internally by `createCast`.
Arbitrarily edited poses can violate attachment or contact constraints. Advanced
integrations may use `createCharacterFactory`, `createRestPose`, `solveContactPose`
and `rig.applyPose`; ordinary scene authors should use declarative cast inputs.
Do not add an accumulated-time animation loop or partial-pose mutation API.
Reparenting rig nodes, changing topology, and mutating shared materials/geometries
are unsupported.

## Rendering and resources

- 19 meshes, 2,784 submitted triangles per neutral character; 5 unique geometries
  and 3 materials with the default palette. Different torso ratios require their
  own pooled capsule. Head, rod, joint, hand/shoe geometry is shared across sizes.
- Skin and torso use the existing toon materials. Thin black limbs, joint rounds,
  hands, shoes and neck use `silhouette-only`; head/torso use `full`. Parts share
  `character:<id>` outline groups. IDs are enforced across all factories sharing
  the same engine owner, including detached characters. Separate owners have
  independent namespaces. No extra rendering passes or shader changes.
- Pool geometry/materials/gradients are immutable by contract and belong to this
  engine only. Use palette options before construction to vary appearance.
- `rig.dispose()` detaches and invalidates a character, without freeing shared
  GPU data. `factory.dispose()` does this for every live character. Both are
  idempotent. Disposed IDs cannot be recycled within that engine lifetime, even
  through a different factory. Invalid input before allocation does not reserve
  an ID; an allocation failure retains it until engine disposal.
- Engine disposal automatically closes the factory and releases pooled resources
  exactly once, including never-attached or already-detached meshes. Never share
  resources between engines. Build a bounded cast during initialization, not a
  new factory/character every frame. GPU reclamation is engine-lifetime scoped.

## Verification

From the project root, run serially:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
```

`verify:characters` uses the unchanged production launcher: concurrency one,
SwiftShader via swangle, software-safe profile, memory admission and monitoring,
workspace scratch and disabled parallel encoding. It runs 27 browser assertions
over five sequential contexts, then captures front/three-quarter/side views of
two different proportion sets at 1280x720. The three PNGs are extracted from the
three-frame video. Raw RGBA hashes test determinism before video encoding.

Outputs, resource measurements, hashes and reports are under `out/phase2a/`
(gitignored). Never run another render or the memory abort integration test while
a production job holds `active.lock`. Do not remove a live lock or lower any
production memory threshold to get a test to pass.
