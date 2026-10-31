# Phase 3B — static cinematic direction, 2026-10-31

**PASS locally for the Phase 3B scope.** Base: `e7af976`. Muse/Linux certification
and advanced composition guarantees remain **NOT TESTED / out of scope**.
The legacy clinic and `DoctorClinicUniversal` remain unchanged and registered.
No frozen renderer, camera helper, rig, acting solver or production policy was
modified. Stop before Phase 3C/3D.

## Public APIs and architecture

See [direction/README.md](../src/toon-kit/direction/README.md) for the complete
Stage/Director contracts and a named-subject authoring example.

```ts
const stage = createClinicStage(engine, {
  environment: clinic.environment, targets: clinic.targets,
});
stage.bind(clinic.cast);
const director = createDirector(engine, {
  stage, shots: CLINIC_STATIC_SHOTS, durationInFrames: 150,
  aspect: width / height,
});
const sample = (frame: number) => stage.snapshot(clinic.evaluate(frame));
director.prepare({sample}); // explicit 0..149, then restore 0
// onFrame, autoFrame=false: one complete cast evaluation, then camera
director.applyFrame({frame, snapshot: sample(frame)});
```

The stage adapts the existing room, shared semantic target definitions and real
cushion/chart geometry. Snapshot bindings cache local geometry bounds once,
then transform complete poses and supported current parent transforms into
immutable world-space data. They do not read previous joint/camera transforms.
Head envelopes include bound hair/accessories; face, torso, full body, both
hands, current gesture and meaningful prop regions are exposed.

The timeline validates IDs, half-open ranges, complete coverage, overlaps,
subjects and regions. Every shot has a fixed 40-degree lens and one prepared
camera. Seven presets are implemented: establishing, twoShot, medium, fullBody,
closeUp, reaction, objectFocus. Named camera directions are front, threeQuarter
and subjectFront. No author-facing coordinates/quaternion/FOV calculations.

Preparation is synchronous, bounded to 600 frames / 32 shots and at most 601
sample callbacks, and restores frame 0 in a finally block. The live camera is
untouched. Subject-facing orientation uses the explicit shot start frame.
Accumulated envelopes are constant-size in each shot's camera axes, retaining
eight final corners rather than all sampled snapshots/point clouds. Runtime
selects a shot, checks stage/frame/envelope validity, and applies the complete
camera state. Scene/action changes require new preparation; there is no implicit
tracking. Cuts reuse the same scene/renderer and perform no GPU allocations.

The complete camera state resets position, quaternion, scale, up, FOV, aspect,
near/far, zoom, focus, film gauge/offset, layer mask, view offset, Euler order,
projection convention and matrix-update flags. Invalid states reject before
mutation. `DirectionError.diagnostic` identifies the code and applicable
shot/frame/subject. `describe(frame)` states which lower-body crops are allowed.

## Changed files

| Files | Purpose |
| --- | --- |
| `src/toon-kit/direction/types.ts` | Immutable composition, shot, camera and diagnostic contracts. |
| `direction/bounds.ts`, `bindings.ts` | Cached geometry envelopes and pose-based world snapshots. |
| `direction/timeline.ts`, `shots.ts` | Timeline validation, preset protected regions and cropping policies. |
| `direction/framing.ts`, `director.ts`, `index.ts` | Camera-axis fitting, bounded preparation, complete camera evaluation/application and exports. |
| `src/toon-kit/staging/clinic.ts`, `index.ts` | Existing-room adapter, typed marks/seat/targets/prop regions, interaction axis and camera directions. |
| `src/clinicTextures.ts` | Shared artwork metrics used by both drawing and region bounds; original pixel values preserved. |
| `src/clinic-cinematic.ts` | Existing universal clinic + one stage/director; separate four-shot camera timeline. |
| `src/DoctorClinicCinematic.tsx`, `src/Root.tsx` | Additional validation composition and existing captions; previous compositions retained. |
| `src/toon-kit-tests/direction-gpu.ts` | Fresh/order pixel/camera tests, resource probes and contact sheets. |
| `scripts/tests/direction.test.cjs` | Seventeen new CPU tests. |
| `scripts/verify-direction.cjs` | Serial protected production renders and owned FFmpeg extraction. |
| `scripts/test-characters.cjs`, `tsconfig.characters.json`, `package.json` | Test compilation/registration and `verify:direction`. |
| `src/toon-kit/index.ts` | Public staging/direction exports. |
| `src/toon-kit/AGENT_INSTRUCTIONS.md`, `direction/README.md`, this report | Authoring, ownership, limits and stage restrictions. |

## Correctness and regression results

| Check | Result |
| --- | --- |
| Typecheck | PASS, zero errors |
| Existing + new CPU tests | PASS, 140/140 (17 new direction tests) |
| Memory admission/controlled abort simulations | PASS, 7/7 |
| Phase 1 | PASS, 22/22 plus bridge/font/readiness/unmount/cancellation/capture checks |
| Stage 2A / 2B | PASS, 27/27 and 42/42 |
| Stage 2C landscape / portrait | PASS, 50/50 each |
| Faces / appearances | PASS, 37/37 and 34/34 |
| Walking / acting | PASS, 42/42 each |
| Universal clinic | PASS, 20/20 |
| New direction browser tests | PASS, 44/44 |

Total browser result arrays: **410 passing assertions**. Rendering suites ran
serially through the unchanged protected launcher. CPU coverage includes every
timeline boundary, malformed references/ranges, prototype-key subjects, actual
mesh-vertex containment under uniform parent/root transforms, previous-live-joint
independence, known-state restoration after preparation success/failure, all
seven presets in both aspects, intentional crop policies, camera overwrite,
fresh/order equality, stage ownership and repeated cuts/disposal. A 600-frame
test verifies constant-size prepared envelopes. A close-up head-size regression
prevents repeated world-AABB expansion from turning it into a wide shot.

Browser checks use 360×640 and 640×360. Each aspect compares two fresh engines in
order 0→80→20→80→0, plus 43/75/114/149. Camera states, direct canvas PNG bytes and
raw RGBA hashes match. All four shots produce distinct images. Warm cut loops
create zero probed WebGL textures/framebuffers/renderbuffers, hold resource and
shader counts steady, and release each context on disposal. Production rendering
uses one existing browser; fresh-engine validation does not add production workers.

Selected direct canvas PNG SHA-256 values, identical for both engines/repeats:

| Frame | Portrait 360×640 |
| --- | --- |
| 0 and 20 | `f563783e124f7dd46e7ca1b66e8a4fbeeed2e1afa1d4e05839153cc7cea98d72` |
| 80 | `a037cf79f2d1ab16eb65feb59bd3dcf2901b01f77ba6e4ae29e91c6115a9cf40` |
| 43 | `ec7a477b553b9289c23314a2fcb092a3f782786c6700daa93ed68eaf1c79c30e` |
| 114 | `540c01dc615ae4e66326446112d62f08c8ea1fada57738b4f4941d15f41069d3` |

Complete camera/PNG/RGBA results, including landscape, are reproducible in
`out/phase3b/validation-results.json`. These hashes exclude the HTML captions;
the earlier whole-composition caption capture regression also passed. Cross-OS
and font-version pixel identity is not promised.

## Actual renders and visual review

Composition: **DoctorClinicCinematic**, 150 frames / 30fps. Four static shots:
[0,43) two-shot, [43,75) diagram insert, [75,114) doctor medium, [114,150) patient
reaction. Character actions are exactly the existing universal clinic function;
the camera does not retime or stack actions.

Ignored local deliverables:

- `out/phase3b/cinematic-720.mp4`: complete five-second 720×1280 clip.
- `portrait-sheet.png`, `landscape-sheet.png`: direct WebGL 2×2 sheets, with
  360×640 and 640×360 tiles, respectively; no HTML captions in these sheets.
- `previews-two-shot.png`, `previews-object-focus.png`, `previews-medium.png`,
  `previews-reaction.png`: 720×1280 production preview stills with captions.
- `landscape-*.png`: 1280×720 production preview stills.
- `close-up.png`: separate 720×1280 close-up with captions.

Reviewed sheets, individual stills and the final five-second video at 1× through
completion. Selected faces/hair and relevant medium-shot hands remain framed;
fullBody protects shoes. The diagram is clearly visible in this particular
object-focus insert. Cameras stay fixed inside each shot; cuts are intentional.
No observed black frames, camera drift, unexpected reset or missing selected actor.
Non-subject foreground crops remain visible and are not an occlusion guarantee.

## Performance, memory and scratch

Windows host, Node 24.14.1; installed Remotion 4.0.539, Three 0.187.0,
React 19.3.1, TS 7.0.2, bundled FFmpeg n7.1. Host has 16 logical CPUs and
15.71 GiB RAM: **these are not Muse 2-vCPU measurements**. Renderer identity
verified ANGLE Vulkan SwiftShader Device (Subzero), backend swangle, software-safe,
native resolution, concurrency 1, disabled parallel encoding/hardware encoding.

Final full 150-frame **720×1280** render:

| Metric | Measured |
| --- | ---: |
| renderMedia wall time | 52.31 s |
| Capture interval median / p95 | 316.2 / 362.9 ms |
| Cast + snapshot + camera CPU median / p95 | 4.1 / 7.9 ms |
| CPU render enqueue median / p95 | 4.6 / 8.6 ms |
| Explicit 151-sample preparation | 667.9 ms |
| Sampled peak process-tree RSS | 1076.34 MiB |
| Peak owned workspace scratch | 55.02 MiB |
| Geometry / texture counts throughout | 32 / 19 |

Enqueue timing is not completed software rasterization; capture intervals are the
practical throughput measure. Native landscape 1280×720 four-frame preview also
passed (8.74s wall, 927.26 MiB sampled RSS, 46.50 MiB scratch). New native-1080
cinematic certification was **not run**; the guarded optional command is supplied.

Reports preserve actual UUID scratch paths, Node TMPDIR/TMP/TEMP, browser and
FFmpeg paths under `D:/3d-animation/.remotion-tmp`. All four final render jobs'
owned UUID directories were verified removed after completion. No local safety
limit fired. RSS is sampled, not a continuous high-water or cgroup total.
Linux MemAvailable, cgroups and system `/tmp` telemetry are unavailable here,
not zero. Existing Linux 2.5-GiB admission, 1-GiB/three-sample abort, RSS/scratch
limits, concurrency and storage isolation remain unchanged. Sudden host ballooning
can still cause OOM; Windows results do not certify the VM.

## Reproduce

Run serially from the project root:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:cast-portrait
npm run verify:faces -- expressions-only
npm run verify:appearance -- audit-only
npm run verify:walking -- views-only
npm run verify:acting -- views-only
npm run verify:clinic -- previews
npm run verify:direction
```

`verify:direction` modes: `previews`, `720`, `1080`; default runs previews and
the full 720p clip. Optional guarded native 1080p render:

```sh
npm run verify:direction -- 1080
node scripts/render.cjs --entry=src/index.ts --composition=DoctorClinicCinematic --width=720 --height=1280 --frames=150 --output=out/cinematic.mp4 --report=out/cinematic.json
```

Use `--mode=cli` with the protected launcher for CLI validation; never bypass the
launcher with bare Remotion. Source fixtures are committed; media/logs are ignored.

## Limitations reserved for later review

No occlusion solver, candidate search, caption-safe projection, screen-direction
enforcement, overShoulder, motion, crossfades, other layouts or action timeline.
Foreground actors may crop or overlap selected regions; geometric containment
does not guarantee feature visibility. The medium shot's large foreground edge
is a known 3C composition limitation. Conservative bounds can leave extra space.
The unchanged surprise gesture extends to frame 164 beyond this clip; it is not
truncated or silently retimed. Facial crossfade overlap and moderate tessellation
remain the existing rig's visual compromises. These results establish a static
direction foundation, not full cinematic production readiness.
