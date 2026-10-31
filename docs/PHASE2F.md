# Stage 2F — universal clinic validation, 2026-10-31

Base: approved `b290ee1`. The separate `DoctorClinicUniversal` composition uses
one universal cast for the complete five-second story. Legacy `Doctor.ts`,
`Patient.ts`, `DoctorClinicScene.tsx` and `DoctorClinicAnimation` remain intact.
See [the integration/API and reproduction guide](CLINIC_UNIVERSAL.md).

**PASS locally for Stage 2F independent review.** Muse/Linux certification is
**NOT TESTED** here. No remaining local safety/test failure was observed after
the demonstrated cancellation defect was fixed. No later stage was implemented.

## Regression results

| Verification | Result |
| --- | --- |
| Typecheck | PASS, zero TypeScript errors |
| CPU character suites, including nine clinic tests | PASS, 123/123 |
| Linux memory/admission/controlled-abort simulation | PASS, 7/7 |
| Phase 1 engine | PASS, 22/22 plus lifecycle, delayed fonts/assets, static/dynamic frame order, pending unmount and rejected asset/onFrame captures |
| Stage 2A rig / 2B contacts | PASS, 27/27 and 42/42 |
| Stage 2C cast, landscape and portrait | PASS, 50/50 each |
| Stage 2D-A faces / 2D-B appearances | PASS, 37/37 and 34/34 |
| Stage 2E-A walking / 2E-B acting | PASS, 42/42 each |
| Clinic GPU, order/fresh-engine pixels/poses, resource identities and contexts | PASS, 20/20 |
| Whole composition including captions, 0→80→20→80→0 | PASS, identical repeated hashes and three distinct requested compositions |
| Actual full videos: new 720p, new 1080p, original 720p | PASS, 150 frames each, verified SwiftShader |
| Actual Muse/Linux memory ballooning and cgroup telemetry | NOT TESTED / unavailable locally |

There are **366 passing browser assertions** in the result arrays, in addition
to the explicit bridge/capture tests. All rendering suites ran serially through
the protected launcher. The original GPU regression fixtures remain executable;
large videos, logs and scratch data are not committed. Final validation left no
active render/validation locks; the rejected render produced no output MP4.

## Implementation and changed files

| Files | Change |
| --- | --- |
| `src/clinic-universal.ts` | One cast, doctor/patient presets and proportions, semantic standing/seating, absolute prop yaw, manual portrait/diagnostic cameras, engine resource ownership. |
| `src/clinic-universal-story.ts` | Prebuilt point/explain/surprise, gaze and expression descriptors; frozen contiguous one-word captions. |
| `src/DoctorClinicUniversal.tsx`, `src/Root.tsx` | New composition, awaited fonts, real DOM caption checks and per-frame render/solve telemetry; legacy registration retained. |
| `src/ClinicEnvironment.ts`, `src/clinicTextures.ts` | Opt-in staging and stable room handles; actual cushion bounds and chart artwork UV landmarks drive targets. Default legacy appearance/placement unchanged. |
| `src/toon-kit/ThreeCanvas.tsx` | Minimal demonstrated cancellation compatibility fix described below; no renderer/shader redesign. |
| `src/toon-kit-tests/clinic-universal-gpu.ts`, `scripts/tests/clinic.test.cjs` | Scene-specific pixel/pose/resource, anatomical/contact/clearance, framing, captions, independence and cleanup regressions. |
| `src/toon-kit-tests/audit.tsx`, `run-audit.cjs` | Real failed onFrame capture and shuffled lossless whole-composition PNG capture, including HTML captions. |
| `scripts/verify-clinic.cjs`, `package.json` | Serial protected production renders and workspace-owned FFmpeg extraction. |
| `scripts/test-characters.cjs`, `scripts/tsconfig.characters.json` | Clinic CPU test registration/compilation. |
| `src/toon-kit/AGENT_INSTRUCTIONS.md`, `characters/README.md`, this report and `CLINIC_UNIVERSAL.md` | Stage scope, semantic APIs, ownership, commands and mandatory production protections. |

No rig, IK, appearance, face, walking, acting, camera-engine or rendering-pass
implementation was rewritten. Native 1080×1920 uses 2,073,600 pixels, below the
existing 2,100,000 software-safe buffer-pixel budget. No AO/Bokeh/new passes.

## Genuine compatibility defect found

Before the fix, a production render with `sourceFrame:-1` exited **0** and wrote
an invalid video. Installed Remotion 4.0.539's
`@remotion/renderer/dist/seek-to-frame.js:46` tests readiness before cancellation.
ThreeCanvas completed its frame gate after recording an error, allowing readiness
to mask cancellation. A failed lifecycle now holds one cancellation gate until
unmount; ordinary gates still complete once and owned resources dispose normally.
After the fix, the same actual production job exited **1 / CancelledError**.
Both failed asset and failed onFrame captures now reject in the Phase 1 audit.

Local before/after evidence: `out/clinic-invalid.log`,
`out/clinic-invalid-after.log`, `out/phase2f/invalid-report.json`,
`out/phase2f/invalid-after-report.json`. The pre-fix artifact is retained only as
ignored local failure evidence. The fix does not alter production limits or GL.

## Mathematical and visual evidence

Every character mesh vertex across all 150 beauty frames remains within:
X **5.88%–93.05%**, Y **16.94%–74.62%**. Captions remain below the actors.
Front/three-quarter diagnostics also check full character bounds. The doctor
stands clear of the table silhouette; the patient is naturally seated on the
actual cushion with supported dangling feet. Minimum sampled mesh clearance from
cabinet front is **0.0055 world units**; shin/rim contact is tangent within
floating-point tolerance (~3e-16). Fixed lengths and torso/cushion contact hold
for all frames. At full pointing weight, the solved forearm ray aligns to the
actual visible yellow chart node (cross-product error <1e-8).

Native close-ups show worried/surprised eyes, brows and mouth; the dedicated
doctor close-up shows the pointing face and arm. The existing room, lighting,
warm palette, coat/hoodie presets and outline settings are retained. Normal-speed
1080p playback was reviewed: observe → chart pointing → explanation → surprise,
with no observed black frames, flicker, detached limbs or unexpected pose jumps.
Compared with the original 720p clip, the new patient no longer clips at the
right edge, limbs are connected and facial features are clearly readable.

Review artifacts (ignored, reproducible):

- `out/phase2f/universal-1080.mp4`: full 150-frame 1080×1920 clip.
- `universal-720.mp4`, `legacy-720.mp4`: full 720×1280 A/B clips.
- `observe.png`, `point.png`, `explain.png`, `reaction.png`: beauty story stills.
- `worried-close.png`, `surprised-close.png`, `point-close.png`: close-ups.
- `front.png`, `three-quarter.png`: diagnostic views.

## Windows software-rendering measurements

Node 24.14.1; Remotion 4.0.539; Three 0.187.0; React 19.3.1; TS 7.0.2;
Remotion-bundled FFmpeg n7.1. Windows host: 16 logical CPUs, 15.71 GiB RAM.
These are **not 2-vCPU Muse benchmarks**. Renderer actually reported
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
All runs used `software-safe`, swangle, one worker, native resolution and disabled
parallel encoding/hardware acceleration. No production policy files changed.

| Full 150-frame render | renderMedia wall | Capture median / p95 | Sampled peak tree RSS | Peak owned scratch |
| --- | ---: | ---: | ---: | ---: |
| Universal 720×1280 | 58.34 s | 361 / 426 ms | 1176.9 MiB | 57.38 MiB |
| Universal 1080×1920 | 106.40 s | 652 / 760 ms | 1279.2 MiB | 64.28 MiB |
| Legacy 720×1280 | 57.34 s | 347 / 411 ms | 738.9 MiB | 55.69 MiB |

CPU cast/camera/DOM-check median/p95: **3.1/5.8 ms** at 720p,
**2.8/6.1 ms** at 1080p. CPU-side `renderFrame` enqueue median/p95 is
5.1/9.8 ms and 4.4/9.2 ms respectively; these are **not** GPU completion or
whole capture timings. Capture progress intervals above include the practical
software-rendering/capture cost. Warm samples exclude frames 0/1.

Both full universal clips hold **32 geometries, 19 textures, 18 programs** and
**230 draw submissions / 37,616 submitted triangles per frame across passes**.
The new scene costs more memory than legacy; its richer universal appearances
are intentionally different. RSS is sampled process-tree telemetry, not a
continuous high-water measurement or cgroup total. No local policy limit fired.

`worker.temp`, TMPDIR/TMP/TEMP, browser profile/cache and FFmpeg frame/intermediate
paths use each job's absolute `D:/3d-animation/.remotion-tmp/<UUID>` directory.
The three full-render scratch directories were verified absent after completion.
Raw reports: `out/phase2f/{universal-720,universal-1080,legacy-720}-report.json`.
System `/tmp`, Linux MemAvailable and cgroup measurements are **unavailable** on
this host, not zero. Existing Linux admission/abort tests use simulated telemetry;
actual Muse admission/balloon behavior is not certified by these runs.

## Determinism evidence

Whole-composition lossless PNGs (360×640, including HTML captions), separate fresh
capture pages in order **0 → 80 → 20 → 80 → 0**:

| Frame | SHA-256 |
| --- | --- |
| 0, both requests | `1799315c940d2abc37830cdc02fdce55afa1211dccc1e8c49128de4d1e428dc6` |
| 80, both requests | `e71411671c0120f2c6feaf01ac77f35a77d87c3bd7c1250d694c16bd03bbb78c` |
| 20 | `0e25c50ca4925529c4977721638c1a46a7b7722e4f781cff2f67190e1193409f` |

The dedicated clinic GPU test additionally compares complete poses, direct canvas
PNG and raw RGBA at 0/80/20/80/0/50/105/135 across two fresh engine instances.
It verifies stable geometry/material identity, bounded resources and released
contexts. Frames 0/20 legitimately share the same 3D rest pose, while their HTML
captions differ. H.264-extracted PNGs are not used as the pixel determinism oracle.

## Limitations and scope

Full-body portrait framing limits face magnification; close-ups are separate
review outputs, not automatic shots. Doctor profile views naturally hide one eye.
The approved raster facial crossfade can briefly overlap expression lines.
Moderate tessellation and native-resolution software-safe outlines remain visible
in enlarged close-ups. Some gaze directions hit supported anatomical bounds.
This is a fixed level-room staging, not general obstacle/furniture collision.
No voices, lip-sync, camera automation, general timeline or script-to-video system.

Windows evidence cannot certify Muse/Linux. Host ballooning can reclaim memory
faster than any sampled guard can react; existing 2.5-GiB admission, 1-GiB/
three-sample abort, 5.5-GiB RSS limit and workspace isolation remain mandatory.
No zero-OOM-risk claim is made. Stop after Stage 2F review.
