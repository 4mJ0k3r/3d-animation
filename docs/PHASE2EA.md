# Stage 2E-A verification — 2026-10-31

**PASS locally.** Deterministic walking uses the existing contact/IK pipeline,
with fixed world plants, current-frame support anchors and action-priority arm
swing. Actual software-rendered video and normal-speed playback were checked.
Muse Linux VM performance/certification is **NOT TESTED** in this Windows session.
No Stage 2E-B/2F, general timeline/cinematic system or legacy migration was begun.
Base: approved Stage 2D-B `2adbf24`.

## Public API and design

Use `createCast`, not raw character factories, for scene authoring:

```ts
const paths = createPaths({
  toDoor: pathFromMarks([startLocator, corridorLocator, doorLocator]),
});
const walking = walkAlong(paths.path('toDoor'), {startFrame:30, endFrame:270});
const cast = createCast(engine, {
  doctor: {appearance:appearancePreset('doctor'), stance:walking},
  patient: {appearance:appearancePreset('patient'),
    stance:standAt(worldMark([-2,0,1]))},
});
cast.evaluate({frame, fps, poses: {
  doctor: {expression:'happy', gesture:pointAt(scenePoint(chart))},
  patient: {gaze:lookAt(cast.actors.doctor.target('head'))},
}});
```

`pathThrough([[x,y,z], ...])` accepts authored world waypoints;
`pathFromMarks` snapshots static scene locators; `createPaths` provides named
references. `walkAlong` accepts start/end frames or cruising speed, with optional
bounded stride scale. Keep the descriptor active before/after its interval to
hold the exact standing endpoints. Omission restores construction defaults.

Full contracts, equations, scaling/coordinate rules, diagnostics and limitations:
[WALKING.md](../src/toon-kit/characters/WALKING.md).
The [character entry guide](../src/toon-kit/characters/README.md) now leads with
`createCast`; outdated no-walking/no-preset/parent-transform guidance was corrected.

Static Hermite paths use bounded numerical arc-length sampling and unwrapped
tangents. Absolute frame determines root distance, step index and all foot plants.
Root start/stop ramps match position, velocity and acceleration. Alternating
quintic swings gather both feet at endpoints. Pelvis compression/lift scale with
leg length and tiny-step activity; no previous-frame integration exists.

Resolved walking support enters the same Stage 2B fixed-length analytic IK,
clearance and coordinate conversion used by standing/sitting. Shoes remain level
with independently planted headings. No competing limb solver, shifted standing
marks, new passes, physics or per-frame geometry/material construction were added.

All actors' support anchors already contain their current root/heading/pelvis
before interaction targets resolve. Reaches and pointing reserve arms first;
only remaining arms swing through the same IK/clearance validation. Bounded
amplitude reduction yields to valid actions rather than changing contacts.
Complete-pose/raster staging and atomic publication remain intact.

## Exact changed files

| Files | Change |
|---|---|
| `src/toon-kit/characters/walk-path.ts` | Immutable paths, arc-length table, tangent unwrapping, named library |
| `src/toon-kit/characters/path-bindings.ts` | Static scene-locator snapshots and live-joint rejection |
| `src/toon-kit/characters/walking.ts` | Pure absolute-time root/footstep planner and gait metadata |
| `src/toon-kit/characters/walk-arms.ts` | Reserved-action priority and constrained counter-swing |
| `src/toon-kit/characters/constraints.ts`, `constraint-types.ts` | Walking support through existing IK; floor, leg and shoe clearance |
| `src/toon-kit/characters/cast.ts`, `cast-types.ts`, `index.ts` | Current-frame support integration, priority, snapshots, public exports |
| `scripts/tests/walking.test.cjs`, `scripts/test-characters.cjs` | 17 new CPU tests, quantitative plant measurements and test registration |
| `src/toon-kit-tests/walking-fixture.ts`, `walking-gpu.ts`, `walking.tsx` | Four looks/routes, actual hierarchy/pixel/resource tests and render fixture |
| `scripts/verify-walking.cjs`, `package.json` | Guarded serial verification/render commands and image extraction |
| `src/toon-kit/characters/README.md`, `CAST.md`, `CONTACTS.md`, `FACES.md`, `APPEARANCE.md`, `WALKING.md` | Recommended high-level authoring path, current contracts and walking guide |
| `src/toon-kit/AGENT_INSTRUCTIONS.md` | Walking scope/priority/defaults; production safeguards remain mandatory |
| `docs/PHASE2EA.md` | This report |

The frozen engine, bridge, outline/postprocessing, resource helpers, production
launcher/policy/configuration, lockfile, Doctor.ts, Patient.ts and original clinic
scene were not modified. No dependency was added or upgraded.

## Tests and determinism

All commands ran serially through the existing production launcher where relevant.

| Check | Result |
|---|---|
| TypeScript | PASS, zero errors |
| CPU character suite | PASS, 99/99; previous 82 plus 17 walking tests |
| Memory/admission/controlled-abort suite | PASS, 7/7, simulated Linux telemetry |
| Phase 1 | PASS, 22 engine assertions plus lifecycle/fonts/assets, dynamic/static bridge order, pending unmount and failed readiness capture |
| Stage 2A | PASS, 27 browser assertions |
| Stage 2B | PASS, 42 browser assertions |
| Stage 2C | PASS, 50 browser assertions in landscape and 50 in portrait |
| Stage 2D-A | PASS, 37 browser assertions (`expressions-only`) |
| Stage 2D-B | PASS, 34 browser assertions (`audit-only`) |
| Stage 2E-A | PASS, 42 browser assertions and actual 300-frame video |

Walking tests cover straight/curved/multiple waypoints, tangent wrap, start/stop,
speed/duration validation, tiny paths, invalid/oversized strides, multiple
proportions, uniform root/parent scales, fixed lengths, complete resets,
independent actors, reserved actions, moving/mutual targets, reversed declaration
order, atomic failure and owner-scoped cleanup. Fresh software renderer instances
produce identical complete snapshots, PNGs and raw RGBA for
`0 → 80 → 20 → 80 → 0`, plus repeated frame 120. Different frames differ.

Representative SHA-256 evidence at 640×400 (full ordered arrays in
`out/phase2ea/validation-results.json`):

| Frame | Raw RGBA SHA-256 |
|---|---|
| 0 | `b577d948bcb6cc174b303a258ae6ea74ab19545b6b4a3a8f49975f263d3d25ab` |
| 20 | `d785e5076e1662d627c22b5cd810a9e2f488a14f5a402d37ee43230380750ef6` |
| 80 | `5dc10179fb09f365d3a2a0df712446fe524a988d475670442d273e881ce1b9f5` |
| 120 | `85f22fdc2d00924d77e6ca8cd4d519aff80d3c2ff907c92eaba9b1a835e28a81` |

Frame 80 PNG hash is
`0ede43d9a2bcbdcd8ecd73c5522da284d0808d012c4cd65962a18d5ea118d160`;
both frame-80 occurrences and the fresh reversed-cast instance match.
These are unencoded canvas captures, not PNGs extracted from lossy video.
Cross-machine/Chrome-version pixel identity is not claimed.

Actual applied rig sole measurements, in world scene units:

| Measurement | Result |
|---|---|
| CPU plant coverage | 206 indexed plants, 4,356 stance samples, three proportions × two routes × two root scales, parent scale 1.3 |
| Maximum planted-sole displacement | `2.8480250268881563e-15` |
| Maximum sole-target error | `2.85708963318944e-15` |
| Maximum forward-vector/yaw error | `6.867796182650152e-16` |
| Maximum numerical floor penetration | `8.881784197001252e-16` |
| Browser hierarchy plants | 76 indexed plants over two fresh instances; max slip `1.3358046614212626e-15` |

Tolerance is 1e-8. These residuals are floating-point noise, not visible sliding.
Production code stores no plant history; test-only maps measure repeated contacts.
Resources remain stable across shuffled poses; geometry/material/texture disposal
events fire exactly once at owner cleanup, and both tested contexts report lost.

## Render, memory and geometry measurements

Local Windows, 16 logical CPUs, 16,866,881,536 bytes total RAM, Node 24.14.1.
Installed Remotion/renderer/bundler 4.0.539, Three.js 0.187.0, React 19.3.1,
TypeScript 7.0.2; bundled FFmpeg n7.1. This is not the 2-vCPU Muse VM.
Verified renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)
(0x0000C0DE)), SwiftShader driver)`, backend `swangle`, `software-safe`.

| 1280×720, 300 frames at 30fps | Result |
|---|---|
| Render/capture/encode wall time | 88.27 s |
| Four-actor JS evaluation median / p95 | 5.9 / 10.3 ms |
| Engine render callback median / p95 | 7.6 / 12.5 ms |
| Capture interval median / p95 | 279.81 / 339.29 ms |
| Sampled process-tree RSS peak | 1,015.83 MiB |
| Sampled owned workspace scratch peak | 60.03 MiB |
| GPU geometry / texture count after warm-up | Constant 22 / 29 |
| All-pass submitted draws / triangles | 362–380 / 68,622–77,502, including room, shadows and outline passes |
| Worker / encoding | Concurrency 1; parallel encoding disabled |

Frame percentiles exclude the first two warm-up samples (298 samples). Engine
callback time is not complete frame time or a GPU timer; capture intervals include
software raster/capture overhead. Process CPU utilization was not separately
sampled. Geometry totals for one ordinary submitted body are unchanged:

| Preset | Meshes | Triangles |
|---|---:|---:|
| Doctor | 21 | 4,632 |
| Patient | 22 | 4,920 |
| Office | 22 | 5,976 |
| Casual | 22 | 4,856 |

Worker `os.tmpdir()` and TMPDIR/TMP/TEMP all resolved to
`D:\3d-animation\.remotion-tmp\7fd4206a-d51d-4528-b4a3-2bd5be5a8256`.
Recorded Chrome profile and FFmpeg command paths use this owned workspace tree;
that directory is absent after successful cleanup. Image extraction also uses a
private owned workspace directory, removed afterward. No active render lock or
owned scratch remained after the serial suite. No monitor limit was exceeded.

Linux MemAvailable, cgroups and `/tmp` measurements are **unavailable on this
Windows host**, reported as null/unavailable, not fabricated zeros. The existing
Linux 2.5-GiB admission threshold, three-below-1-GiB abort policy, process limits,
temp isolation and single worker remain unchanged. The simulated guard tests
pass; ballooned-VM behavior/performance still requires Muse. Sampling cannot
guarantee survival of sudden host memory reclamation or prove zero OOM risk.

## Visual evidence, limitations and reproduction

Artifacts in gitignored `out/phase2ea/`:

- `walking.mp4`: 10 seconds, four dressed presets, clinic-like room, patient
  approaching/stopping by a chair, curved office route, different casual
  proportions, and a fixed close side shot for the final four seconds.
- `front.png`, `three-quarter.png`, `side.png`: same mid-walk doctor pose,
  isolated and framed relative to character forward for joint inspection.
- `footsteps.png`: close-up extracted at 6.5 seconds.
- `validation-results.json`, `foot-plant-math.json`, `views-report.json`,
  `walking-report.json`, plus logs and `views.mp4`.

Actual 1× video playback was reviewed before and after reducing the initially
excessive crouch. The initial attempted shallower setting failed a scaled curved
contact regression; the delivered 3–6% compression passed the full suite and
re-render. Final review found no obvious detached joints/accessories, floating
stance soles, ground penetration, foot pop or abrupt path-heading flip. Doctor
pointing remains reserved during locomotion. There is still a deliberately
simple cartoon gait, no heel/toe roll, natural face foreshortening and some wide
shot actor overlap. Static inspection shots isolate the joints to avoid that
occlusion. Fine motion polish remains subject to human review of the MP4.

Limits are static level routes, constant total scale, conservative clearance,
no pathfinding/obstacle or inter-character avoidance, no backwards/strafe walk,
no automatic walk-to-seat transition, no general blending or camera automation.
Extreme turns/strides can reject with diagnostics. Procedural arm amplitude can
change discretely at a clearance threshold; explicit actions never lose priority.
No sampled safety failure was observed; Linux certification remains pending.

Commands (repository root, serially):

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:cast-portrait
node scripts/verify-faces.cjs expressions-only
node scripts/verify-appearance.cjs audit-only
npm run verify:walking
```

Do not weaken memory admission or remove live locks if Muse refuses launch.
Source fixtures/tests are tracked; generated media, benchmarks and temporary
outputs are not committed. Stop for Stage 2E-A review.
