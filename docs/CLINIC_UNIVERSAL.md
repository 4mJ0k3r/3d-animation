# Universal clinic — Stage 2F

`DoctorClinicUniversal` is a separate 150-frame, 30-fps, portrait composition.
`DoctorClinicAnimation` and its legacy rigs/controllers remain available unchanged.
The recommended authoring path is still `createCast`, not raw factory rigs.

```ts
// initScene — the helper constructs one cast, room targets and acting cues.
const clinic = createUniversalClinic(engine);
// onFrame — absolute prop state → current targets/one complete cast → camera.
clinic.evaluate(frame, fps);
clinic.camera('portrait'); // manually authored, no automatic camera direction
```

The React composition uses the existing `ThreeCanvas` readiness/font barrier,
`ToonCaptions`, software-safe profile and production launcher. It checks the
actual caption DOM before capture. Invalid source frames and failed constraints
reject capture rather than publishing stale poses.

## Ownership and scene integration

- `src/clinic-universal.ts`: construction, supported scene-level prop animation,
  manual cameras, one cast, engine ownership.
- `src/clinic-universal-story.ts`: immutable gesture/gaze/expression descriptors
  and word timings. Plain absolute-frame branches sequence one intentional
  gesture per actor; this is not a general timeline.
- `src/DoctorClinicUniversal.tsx`: Remotion composition and caption integration.
- `src/ClinicEnvironment.ts`: existing room plus semantic handles. Construction
  preserves legacy placement. Only `stageUniversalPortrait()` moves the table
  to X=.4, rotates it .45 radians around Y, and sets the doctor mark.

`clinic.dispose()` detaches its cast. `engine.dispose()` aborts pending work,
detaches actors and releases all tracked room/cast resources. Do not also call
the legacy room's texture-only `dispose()` on this engine-owned scene. Nothing
creates GPU geometry/materials per frame; face textures use the existing private
per-character cache. Room geometry/materials remain the existing environment.

## Semantic handles and coordinates

Y is up, +Z is forward. Descriptor coordinates are local to their referenced
scene object; the target resolver reads current world matrices per evaluation.

| Handle | Meaning |
| --- | --- |
| `environment.doctorMark` / `targets.mark('doctor')` | Standing locator, Y=ground; authored yaw is reset from absolute frame before target resolution. |
| `environment.examinationCushion` / `targets.seat('examSeat')` | `sceneSeat` derives top, width, depth, thickness and +Z front edge from the actual cushion bounds and world transform. No pelvis/knee/ankle offsets. |
| `targets.target('diagram')` | Visible yellow medical-chart node. Local position is derived from chart bounds and `MEDICAL_CHART_POINTS.node` (top-left-origin canvas UV). |
| `targets.target('diagramHead')` | Alternate circular head of the same diagram, derived from its canvas UV. |
| `clinic.patientGazeTarget` | Semantic patient head target; `cast.actors.patient.target('head')`. |
| `clinic.framingSubjects` | Doctor root, patient root, chart; optional subjects for a separately authored camera. |
| `environment.floorTarget()` | Current world Y of the level room floor. |

Level translated/yaw-rotated, positive uniformly scaled room transforms are
supported by existing contact/target contracts. Tilt, shear and nonuniform
contact transforms are unsupported. The floor helper describes a **level** floor;
it does not turn tilted geometry into a valid floor. Manual cameras are calibrated
for the default staged room and must be reauthored if the entire room is moved.

The high examination table produces supported dangling feet. The existing solver
places torso support exactly on the cushion and keeps shins/shoes outside the
cabinet; it does not simulate furniture collisions or walk-to-seat transitions.

## Story and preview inputs

Doctor observes, turns/points at frames 32–77, then explains at 77–119. Patient
begins seated/worried and transitions to surprise at 115–127. The final reaction
continues beyond the clip endpoint deliberately. Existing bounded head/eye gaze
and absolute-time blinking remain active. Some rearward targets legitimately
report `GAZE_LIMITED`; no anatomical bounds are bypassed.

`view`: `portrait`, `front`, `quarter`, `close`, or `point-close`. `sourceFrame`: a fixed frame in
[0,150) for still previews. Close mode isolates the patient for expression review;
`point-close` isolates the doctor's face/arm; normal beauty output shows both actors. `previewFrames`/`previewViews` are the
validation montage inputs. `verify:true` runs the dedicated GPU assertions before
the preview. These are diagnostic inputs, not cinematic automation.

## Reproduce safely

Run from the repository root, serially:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:cast-portrait
npm run verify:faces
npm run verify:appearance -- audit-only
npm run verify:walking -- views-only
npm run verify:acting -- views-only
npm run verify:clinic
```

`verify:clinic` renders nine native-1080 previews, the complete 720p and 1080p
universal clips, and a 720p legacy clip. Optional modes: `previews`, `720`, `1080`,
`legacy`. Outputs, screenshots, logs and reports are ignored under `out/phase2f`.
The wrapper invokes the unchanged protected production launcher for every job.

```sh
node scripts/render.cjs --entry=src/index.ts --composition=DoctorClinicUniversal --width=720 --height=1280 --frames=150 --output=out/clinic-720.mp4 --report=out/clinic-720.json
node scripts/render.cjs --entry=src/index.ts --composition=DoctorClinicUniversal --width=1080 --height=1920 --frames=150 --output=out/clinic-1080.mp4 --report=out/clinic-1080.json
```

Add `--mode=cli` for the guarded CLI path. Both paths enforce concurrency 1,
swangle/SwiftShader, workspace-local scratch and disabled parallel encoding.
Do not invoke bare Remotion to bypass the launcher. On Linux, keep the 2.5-GiB
admission threshold and 1-GiB/three-sample abort policy unchanged. Sudden host
ballooning can still OOM a process; a Windows render is not Muse certification.

`audit:phase1` includes deliberately failed asset/onFrame captures and shuffled
lossless **whole-composition** PNG hashes (including HTML captions). The clinic
preview additionally compares direct WebGL PNG/raw-RGBA hashes and complete poses
in shuffled order across two fresh engines, checks stable resource identity and
counts, then verifies context release. H.264 preview PNGs are visual artifacts,
not the determinism oracle. Cross-platform/font-version pixel identity is not
promised.
