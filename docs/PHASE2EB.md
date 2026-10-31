# Stage 2E-B verification — 2026-10-31

**PASS locally.** Expressive acting, compatible target blending, timed pointing,
gaze and facial transitions are implemented. All 114 CPU tests, 42 new browser
assertions and earlier regression suites pass. Actual 10-second SwiftShader
playback was reviewed at 1×. Muse Linux VM certification is **NOT TESTED** here.
Base: approved Stage 2E-A `c4f264f`. Stop before Stage 2F.

## API and module map

```ts
cast.evaluate({frame, fps, poses:{
  doctor:{gesture:explain({startFrame:40, endFrame:200, intensity:.8})},
  patient:{gesture:surprise({startFrame:80, endFrame:155})},
}});
```

Public gestures: wave, nod, shakeHead, shrug, explain, surprise, sad, worried,
excited. Defaults are start 0, duration 2.4 seconds and intensity .8; arm helpers
accept auto/left/right/both. Gesture emotion follows automatically unless an
explicit expression overrides it. No raw joint rotations, IK poles or per-frame
arrays are required from authors.

`gestureDuring(pointAt(target), timing)` fades pointing from/to the current
rest/walking baseline, with default intensity 1. `turnTo(target,{from,...timing})`
blends explicit gaze endpoints; `blendExpression(from,to,timing)` blends facial
endpoints and holds the result. Existing untimed pointing/gaze APIs remain valid.
A complete current-export doctor/patient scene example, defaults, combinations
and diagnostic fixes are in [ACTING.md](../src/toon-kit/characters/ACTING.md).

- `acting.ts`: immutable semantic descriptors, validation and pure bounded timing,
  anticipation, body/head profiles and emotion metadata.
- `acting-solver.ts`: direction/radius target blending, transported bend planes,
  arm reservation, existing analytic IK integration and explicit gaze endpoints.
- `acting-face.ts`: current-frame expression endpoints/automatic emotion.
- Existing cast orchestrates support snapshots, intentions, constraints and
  atomic pose/raster publication. Existing face view/paint own reusable raster
  buffers; no renderer pass is added.

Precedence: support contacts and fixed lengths/clearance → physical reaches →
intentional actions → unreserved walking swing → secondary motion. Auto gestures
use free arms; explicit conflicts reject. Secondary torso lean yields to physical
reaches and reports ACTION_SECONDARY_YIELD. No reach target is moved to make an
animation fit. Infeasible combined intermediate states return diagnostics.

Targets blend before the same Stage 2B IK/clearance pipeline; completed IK joint
rotations are never interpolated. Pelvis-axis upper-body pitch preserves sockets;
seated capsule support height is corrected analytically. Head motion composes
with body/gaze before existing bounds. Support targets include current root/body
state, independent of actor declaration or prior frame order.

Quintic windows have exact rest endpoints. Bend-plane parallel transport avoids
the compact-wave onset defect discovered during testing. Facial crossfades use
premultiplied canvas composition and one reusable scratch canvas per face, with
no new GPU texture/pass or per-frame canvas allocation.

## Exact changed files

Paths are repository-relative; comma-separated names share the directory shown.

| Files | Change |
|---|---|
| `src/toon-kit/characters/acting.ts`, `acting-solver.ts`, `acting-face.ts` | New pure profiles, constrained target blending and facial transitions |
| `src/toon-kit/characters/cast.ts`, `cast-types.ts`, `index.ts` | Declarative integration, current support state, precedence, snapshots, exports |
| `src/toon-kit/characters/constraints.ts`, `pointing.ts`, `walk-arms.ts`, `walking.ts` | Optional internal upper-body motion through the same solver; actual walking arm ownership |
| `src/toon-kit/characters/gaze.ts` | Body-relative head/gaze composition, explicit turn targets, correct limit diagnostics |
| `src/toon-kit/characters/face.ts`, `face-paint.ts`, `face-view.ts` | Optional blend state, reusable private scratch raster and cleanup |
| `scripts/tests/acting.test.cjs`, `scripts/test-characters.cjs` | 15 new CPU tests and registration |
| `src/toon-kit-tests/acting-fixture.ts`, `acting-gpu.ts`, `acting.tsx` | Four-character interaction, deterministic/render/resource checks and stable manual previews |
| `scripts/verify-acting.cjs`, `package.json` | Guarded serial validation, video and image extraction |
| `src/toon-kit/characters/ACTING.md`, `README.md`, `CAST.md`, `WALKING.md`, `FACES.md`, `APPEARANCE.md` | Public API, complete example and current stage/precedence contracts |
| `src/toon-kit/AGENT_INSTRUCTIONS.md`, `docs/PHASE2EB.md` | Approved scope, mandatory authoring/safety rules and this report |

Frozen Phase 1 renderer/bridge/postprocessing/resource modules, production
launcher/policy/configuration, dependency lockfile and legacy Doctor/Patient/clinic
files remain unchanged. No dependency, GPU effect, physics or skinning was added.

## Automated results

| Suite | Result |
|---|---|
| Typecheck | PASS, zero errors |
| CPU character suite | PASS, 114/114 (previous 99 + 15 acting) |
| New gesture sweep | PASS, 14,742 poses: nine profiles × three proportions × stand/seat/walk × intensity .8/1 × 91 frames |
| Memory guards | PASS, 7/7 simulated Linux admission/abort/cleanup tests |
| Phase 1 | PASS, 22 engine assertions plus lifecycle/assets/fonts, dynamic/static bridge order, pending unmount and failed readiness capture |
| Stage 2A | PASS, 27 browser assertions |
| Stage 2B | PASS, 42 browser assertions |
| Stage 2C | PASS, 50 browser assertions each in landscape and portrait |
| Stage 2D-A | PASS, 37 browser assertions, expressions-only |
| Stage 2D-B | PASS, 34 browser assertions, audit-only |
| Stage 2E-A | PASS, 42 browser assertions, views-only; CPU planting/length/order tests included above |
| Stage 2E-B | PASS, 42 browser assertions and actual 300-frame software render |

Tests cover exact onset/completion, resets after arbitrary mutations, physical
reach conflicts/sharing, walking wave/point handovers, standing/seat contacts,
parent yaw/translation/scale, fixed bone lengths, current posture targets, reversed
actor declarations, explicit gaze/facial endpoints, appearance independence,
allocation stability and repeated owner cleanup. All supported sampled gestures
remain finite and constrained. Maximum elbow displacement over adjacent 1/15-s
sweep samples was .109006 scene units; no bend-plane flip was observed.

The browser compares actual animated hierarchy/head directions/sole positions to
pure snapshots, checks no per-frame GPU or canvas allocation, verifies atomic
failure, owner retention and exactly-once geometry/material/texture disposal.
Both fresh contexts report lost after cleanup; 83 tracked scene resources per
instance were disposed once.

At 640×400, complete snapshots, PNGs and raw RGBA match across fresh/reversed
instances and `0 → 80 → 20 → 80 → 0`, plus frames 100/155/285. Six distinct frames
produce distinct images. Representative SHA-256 evidence:

| Frame | Raw RGBA | PNG |
|---|---|---|
| 0 | `f265a6f8b91602526c8a087ad784c09618442a8e4502adef3c3fd0f8850f2400` | `c969cdd6e718031685774b66d8a25c9c3c1d366fd25634575c33b36a73b6b836` |
| 80 | `72d1ca32b63ca463f5d9171ed0273913edbcc62e85144fc538018946396e04a2` | `c2eabe6e5985d7b982604d91a558eb996db1f2dd0e0e9e3f9370f9ecfc74d62e` |
| 20 | `61b438367902bcfc5ec933df6cf3fae62f6b8918761d01e18f337ca484114b14` | `ed36baa58b6600c622682177bd5dc2b9ed8a892b00befd00c8ff4b6e47425993` |

Full arrays: out/phase2eb/validation-results.json. These are unencoded canvas
captures; extracted preview PNGs pass through H.264. Cross-platform/Chrome-version
pixel identity is not claimed. The earlier walking frame-0 raw RGBA still matches
its Stage 2E-A baseline (`b577d948…d25ab`) when acting is absent.

## Measured transition continuity

Actual solved root/wrist/ankle/head/elbow positions were sampled immediately
before/at/after onset and completion at 1/3000-second intervals, for standing and
walking wave/explain/nod/surprise. The table includes expected ongoing locomotion,
not only the acting residual. Exact boundary poses also match the baseline.

| Maximum adjacent displacement | Scene units |
|---|---:|
| Root | .000183333333334 |
| Wrist | .000140044016402 |
| Ankle | .000334036285062 |
| Head center | .000190933991191 |
| Elbow | .000163346187980 |

Maximum adjacent composed head rotation: 5.514354519584809e-11 radians at these
boundaries. Thresholds are .001 scene units/radians per sample. This is a finite
regression measurement, not proof for arbitrary target trajectories. Matched
walk-start/end standing handoffs also pass; arbitrary walk-to-seat is unsupported.
Raw results: out/phase2eb/transition-continuity.json and pose-sweep.json.

## CPU, memory and render measurements

Local Windows, 16 logical CPUs, 16,866,881,536 bytes total RAM; Node 24.14.1.
Installed Remotion/renderer/bundler 4.0.539, Three.js .187.0, React 19.3.1,
TypeScript 7.0.2 and bundled FFmpeg n7.1. Backend swangle actually reports
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)),
SwiftShader driver)`, software-safe, native resolution, one worker.

| 1280×720 interaction, 300 frames / 30fps | Measurement |
|---|---:|
| Render/capture/encode wall time | 69.96 s |
| Four-character evaluation median / p95 | 2.4 / 3.8 ms |
| Engine render callback median / p95 | 4.1 / 6.0 ms |
| Capture interval median / p95 | 220.80 / 262.62 ms |
| Sampled process-tree RSS peak | 1,258.29 MiB |
| Sampled owned workspace scratch peak | 60.40 MiB |
| Warm GPU geometries / textures | Constant 22 / 29 |
| All-pass submitted calls / triangles | Constant 380 / 77,502 |

Percentiles exclude the first two warm-up samples (298 samples). Callback times
are not total process CPU time or GPU timers. Process CPU utilization was not
separately sampled. Capture intervals include software raster/capture overhead.
This fixture/camera differs from the walking benchmark; do not infer a general
engine speedup from the wall times.

Other sampled RSS peaks: browser-audit/views 1,062.91 MiB, native portrait
1,005.46 MiB, diagnostic 912.73 MiB. Portrait is a single 720×1280 preview frame,
not a throughput/long-run portrait benchmark. Mesh/triangle counts remain doctor
21/4,632; patient 22/4,920; office 22/5,976; casual 22/4,856.

Worker os.tmpdir and TMPDIR/TMP/TEMP resolve to
`D:\3d-animation\.remotion-tmp\034b2a2a-03e6-4e72-a3a1-b88043818888`.
Chrome profile/FFmpeg paths are workspace-owned; this directory is absent after
cleanup, as are the other completed job/extraction directories. No monitor limit
was exceeded. Parallel encoding remains disabled.

Linux MemAvailable, cgroups and `/tmp` telemetry are unavailable on Windows and
reported null/unavailable. No cgroup measurement is fabricated. Existing Linux
2.5-GiB admission, three-consecutive-below-1-GiB abort, process/temp budgets and
single-worker safeguards were not weakened. Simulated guard tests pass, but
ballooned Muse VM certification/performance remains pending. Sampled monitoring
cannot guarantee survival of sudden host reclamation or prove zero OOM risk.

## Visual evidence and remaining limitations

Actual 1× playback was reviewed before/after refining gesture readability and
the fixed three-quarter preview. The final clip contains explaining doctor,
surprised patient, nodding office character and walking/waving casual character,
with smooth entry/recovery and existing outfits. Full-body and portrait previews
keep the characters inside frame; close-up/diagnostic crops are intentional.
No obvious detached geometry/accessories, foot pop, support penetration or new
forehead/clothing seam was observed. Fine artistic motion polish remains subject
to human review. Some background actors overlap as they pass; there is no hidden
camera/avoidance system to restage them.

Artifacts (ignored out/phase2eb): interaction.mp4 (10 seconds), full-body.png,
close-up.png, side.png, native portrait.png, diagnostic.png, views.mp4, portrait.mp4,
diagnostic.mp4, validation-results.json, continuity/sweep JSON, logs and per-job
reports. Beauty previews have no debug arrows; diagnostic image is separate.

Limits: one intentional gesture per actor, fixed body/profile vocabulary, no
unrestricted shoulder translation, physics, finger poses, jumping, heel/toe roll,
obstacle avoidance or arbitrary support blending. Profile views naturally
foreshorten/occlude arms/faces. Facial raster crossfades can show overlapping
lines; there is no lip-sync or geometric mouth morph. Very short requested windows
can feel abrupt despite eased endpoints. The existing conservative walking swing
fallback can still change amplitude discretely at difficult clearance thresholds.
Unsupported intermediate combinations reject rather than stretch or overwrite
contacts. Keep descriptors/hand reservations stable through a transition window.

No Stage 2F, cinematic automation, general story timeline, script-to-video system
or legacy clinic migration is included. No local safety failure was observed.

## Reproduce

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
node scripts/verify-faces.cjs expressions-only
node scripts/verify-appearance.cjs audit-only
node scripts/verify-walking.cjs views-only
npm run verify:acting
```

Source tests/fixtures are committed, not generated media/benchmarks. Do not lower
memory thresholds or remove live render locks if Muse refuses admission.
