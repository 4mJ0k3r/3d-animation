# Visibility-aware static composition — Phase 3C

Opt in with `createDirector(..., {composition: {captions}})`. Omitting
`composition` preserves Phase 3B behavior. Use the public `toon-kit` exports;
scene authors need no ray, projection, lens or joint-coordinate calculations.

```tsx
// Inside async ThreeCanvas.initScene, with autoFrame={false}:
const captions = await engine.wait(createCaptionLayout({
  width, height, words, fontSize: 44, strokeWidth: 3, bottom: 64,
}, engine.signal));
// Commit this same layout to the React ToonCaptions overlay before init finishes.
// DoctorClinicVisible demonstrates the layout-effect readiness handshake.
const stage = createClinicStage(engine, {
  environment: clinic.environment, targets: clinic.targets,
});
stage.bind(clinic.cast);
const director = createDirector(engine, {
  stage, durationInFrames: 150, aspect: width / height,
  shots: [
    {id:'conversation', type:'twoShot', subjects:['doctor','patient'], startFrame:0, endFrame:43},
    {id:'chart', type:'objectFocus', ...stage.prop('medicalChart','diagram'), startFrame:43, endFrame:75},
    {id:'doctor', type:'medium', subject:'doctor', startFrame:75, endFrame:114},
    {id:'reaction', type:'reaction', subject:'patient', startFrame:114, endFrame:150},
  ],
  composition: {captions},
});
const sample = (frame: number) => stage.snapshot(clinic.evaluate(frame));
director.prepare({sample});
// onFrame: director.applyFrame({frame, snapshot: sample(frame)});
// React overlay: <ToonCaptions layout={captions} />
// engine.dispose() owns cleanup; director.dispose()/stage.dispose() are idempotent.
```

`createCaptionLayout` requires a browser DOM and loaded fonts. Use the same
viewport and layout in both director and overlay; prepare again after resizing.
It awaits the font set, measures actual styled DOM text, wraps long words, and
reserves stroke, conservative shadow extent and maximum 1.18 punch. Inactive
caption intervals reserve nothing. Lower-body/background overlap is allowed;
faces, eyes, active hands and required prop content are protected. Legacy
ToonCaptions callers retain their old styling and timing.

## Registered geometry and diagnostics

`stage.snapshot(state).visibility` contains current world-space data derived
from complete current poses and actual room geometry: head spheres, torso/limb
capsules, hand spheres, furniture/wall oriented boxes and the chart plane.
Faces, eyes and hands have small surface sample sets. Own head is excluded
only for face/eyes; own torso still occludes a hand. Relevant self-occluders are
excluded narrowly rather than ignoring an entire actor.

`stage.registerOccluder('addedCabinet', attachedMesh, 'box')` registers existing
scene-owned geometry without adding a mesh, GPU resource or camera behavior.
`'plane'` is supported too. Register before preparation. Use opaque proxy
geometry; these tests do not sample texture alpha or arbitrary triangle meshes.

Advanced diagnostics (not required authoring):

- `estimateVisibility(cameraState, feature, proxies)` reports
  `fraction`, `inFrameFraction`, `backFacing`, and blocking proxy IDs.
- `compactVisibilityFrame(shot, snapshot)` creates bounded plain data.
- `assessComposition(shot, frame, cameraState, {captions})` reports validity,
  score and structured failures. Image containment is distinct from visibility.
- `director.describe(frame).composition` reports selected candidate, worst-case
  visibility/prominence and rejected-candidate reasons.
- `director.preparationStats()` reports sample/candidate/frame/signature counts.

Failures throw `DirectionError` with structured diagnostics. No acceptable view
produces `NO_VALID_COMPOSITION` with candidate/frame/region/blocker details;
there is no hidden wide-shot fallback. Post-preparation scene/pose changes
produce `COMPOSITION_CHANGED`; reprepare a new director. Invalid/mismatched
captions, malformed proxies, excessive budgets and unsupported transforms fail.

## Deterministic bounded selection

1. Sample every explicit integer frame in ascending order; restore frame 0 in
   finally. Existing 600-frame/32-shot bounds still apply.
2. For each shot, use at most six approved directions: front, -15, +15, +22.5,
   +30 degrees, plus a single-subject-facing view at explicit shot start.
   Fit a fixed 40-degree static lens inside the actual room camera zone.
3. Accumulate an eight-corner envelope per candidate. Asymmetric perspective
   fitting anchors protected content near the image top and above the earliest
   active caption ink. No camera motion or previous-camera state is used.
4. Reject crop, zone, screen-side, insufficient visibility/prominence, caption
   collision, oversized foreground head or unreadable prop failures over ALL
   frames. A view valid only at shot opening cannot pass.
5. Score surviving views for readable subject size, headroom, facial frontality
   and prop area. Quantize scores to 1e-6, then use stable candidate ID ties.
   Candidate declaration order does not change the winner.

`COMPOSITION_LIMITS` is deeply immutable: six candidates, 64 proxies/frame,
12 required regions, nine samples/region, 16 MiB serialized certificates.
Worst-case proxy testing is O(frames × 6 × 12 × 9 × 64), with early rejection.
Each actual prepared clip has a bounded collection of compact frames, not full
rig snapshots. Runtime compares its exact compact certificate and applies one
static camera; no candidate search or occlusion analysis occurs per render.

Acceptance thresholds (normalized image units): face >=.77 (7/9), eyes 1,
hand >=.8 (4/5), prop >=.88 (8/9); chart node requires 1. Samples must face the
camera with normal dot/view length >.06. Minimum head height: establishing/
fullBody .06, twoShot .10, groupShot .07, medium .16, closeUp .24, reaction .20. Object focus
requires height .24 and area .08. Foreground non-subject heads closer than the
subject may occupy at most .12 image area. Top/side margins .08/.045; caption
gap .018. These are tested artistic acceptance limits, not pixel guarantees.

Conversation screen order must agree with the stage-front interaction axis.
A shot may explicitly declare `allowAxisCrossing:true`; this relaxes only the
axis rule. It does not bypass visibility, room-zone or caption checks.

## Limitations and ownership

Finite surface samples and simplified proxies estimate visibility. Unregistered
fine accessories, thin geometry, transparent texture cutouts and between-sample
obstructions can differ from pixels. Oblique eyes can be visibly foreshortened
without being occluded. Register appropriate conservative prop proxies and
inspect beauty renders. Level positive-uniform translated/yaw-rotated parents
remain supported; tilted/sheared/nonuniform contact parents remain unsupported.

No new GPU resources, fullscreen passes, renderer instances, actor mutations,
physics, cinematic motion or action automation are introduced. CPU matrices,
arrays and bounded certificates are allocated. All renderer, memory admission,
abort, concurrency-1 and workspace-temporary protections remain mandatory.
Run `npm run verify:composition` serially. Windows SwiftShader results do not
certify Muse's Linux VM or promise identical fonts/hashes across operating systems.
