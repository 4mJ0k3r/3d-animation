# Phase 3E — cinematic engine validation and closeout

**Phase 3 final verdict: PASS on local CPU-only SwiftShader.** Muse/Linux
recertification remains NOT TESTED. No Phase 4, narration, lip-sync, script
creation or additional camera effects were implemented.

## Generic SDK corrections

1. **Staging blocker:** createClinicStage required ClinicEnvironment,
   doctor/examSeat landmarks and medical-chart artwork. The director itself was
   already generic. Added createStage(engine,{root,floor,axis}) as a small metadata
   adapter using existing bindActor/bounds/proxy helpers. Floor/scenery geometry
   supplies camera limits; registerProp derives a named full region from a mesh.
   No camera coordinates/quaternions, clinic dependency or new environment library.
   Existing clinic staging remains intact. Actor/prop name collisions reject.
2. **Primitive typing:** pooled builders inferred BasePrimitiveOptions under the
   installed compiler and rejected width/radius options. Explicit generic types
   restore shape-specific public options; runtime primitive code is unchanged.
3. **Actual visibility defect:** the first office renders exposed a post clipping
   an eye although its center sample passed. Eye coverage now uses six symmetric
   center/edge samples within the existing nine-point cap. Centers stay mandatory;
   naturally back-facing peripheral points are reported as selfOccluded, while
   facing edges still test external blockers. No global visibility thresholds
   were relaxed. Regression tests reproduce the old false acceptance and verify
   the clear replacement view. Final renders/gates were regenerated after this fix.

One verified semantic authoring example lives in
[src/toon-kit/AGENT_INSTRUCTIONS.md](../src/toon-kit/AGENT_INSTRUCTIONS.md).
The office fixture calls the public cast/director APIs and the generic stage;
an isolated import test proves that stage.ts loads no ClinicEnvironment/textures.

## Fixture changes and evidence

- Office: a few existing primitives, two different cast presets, a desk, board
  and foreground post. Two-shot, close-up push-in and named board object focus.
  Portrait selects +22.5-degree alternatives to avoid the post; landscape uses
  its independently validated views. Scene geometry was not moved to force a pass.
- Clinic: existing four-shot story, actions, contacts, expressions and captions;
  only the final reaction adds a subtle push-in. Other shots stay static.
- [Integrated 150-frame 720p MP4](../out/phase3e/integrated.mp4),
  [office contact sheet](../out/phase3e/office-sheet.png),
  [landscape two-shot](../out/phase3e/landscape-0.png).
  Native office samples cover frames 0/15/29/30/45/59/60/75/89; landscape covers
  15/45/75. No full 1080p render. Media/logs remain ignored by Git.
- Final native stills and 1x integrated playback inspected. Office eyes remain
  clear of the post; object-focus content and caption clearance are readable.

## Regression gate

| Check | Result |
| --- | --- |
| Installed-dependency typecheck | PASS, zero errors |
| Full CPU correctness suite, including director/motion | PASS, 184 tests |
| Memory admission/abort/cleanup unit suite | PASS, 7 tests |
| Critical Phase 1 browser audit | PASS, 22 assertions |
| Phase 2 neutral / contacts / cast / faces / original universal clinic | PASS, 27 / 42 / 50 / 37 / 20 assertions |
| Two-setting/aspect closeout browser suite | PASS, 112 assertions |

**310 browser assertions total.** Both scenes use two fresh engines in each
aspect, request 0 -> 80 -> 20 -> 80 -> 0 plus shot boundaries/intermediates,
and compare PNG SHA-256, complete camera JSON and composition snapshots.
Preparation also validates every explicit scene frame and motion half-frame.
After warming distinct views, texture/framebuffer/renderbuffer creation remains
zero; geometry/texture/program counts stay stable. Eight closeout contexts report
context loss after disposal. Earlier Phase 1/2 suites cover rig/resource ownership.
Actual caption DOM checks pass on all 150 clinic and 12 office/aspect output frames.

## Measurements

Windows 16-logical-CPU, 15.71 GiB host; Node 24.14.1, Remotion 4.0.539,
Three 0.187.0, TypeScript 7.0.2. ANGLE Vulkan SwiftShader verified, software-safe,
native resolution, concurrency 1, hardware/parallel encoding disabled.

| Metric | Clinic 720x1280 / 150f | Office 720x1280 / 9 sampled frames |
| --- | ---: | ---: |
| Wall time | 85.94 s, includes critical browser assertions/init | 4.88 s |
| Capture interval median / p95 | 299.07 / 334.67 ms | 292.42 / 307.52 ms |
| Director median / p95 | .60 / 1.30 ms | .50 / 1.30 ms |
| Construction + preparation | 657.0 ms | 465.4 ms |
| Certificates / candidates | 5567836 bytes / 22 | 2643760 bytes / 16 |
| Warm geometries / textures | 32 / 19 | 20 / 25 |
| Peak sampled process-tree RSS | 907665408 bytes (865.62 MiB) | 1273376768 bytes (1214.39 MiB) |
| Peak workspace temp | 60668406 bytes (57.86 MiB) | 49322741 bytes (47.04 MiB) |

The three-frame 1280x720 aspect check passed in 3.24 s; too few frames for a
useful throughput estimate. Short samples/one-second monitors can miss transient
peaks. These are Windows software-renderer measurements, not 2-vCPU VM forecasts.
Owned UUID temp directories and Chromium profile paths used absolute workspace
storage, were removed afterward, and left no active locks. Linux /tmp, cgroups
and MemAvailable telemetry are unavailable here, not zero. Existing Linux
admission/abort, RSS, temp, encoding and concurrency policies are unchanged;
short tests cannot guarantee survival of sudden host memory reclamation.

## Remaining limits / reproduction

Visibility remains a finite proxy estimate; fine geometry/alpha cutouts and
between-sample obstructions need suitable proxies and visual inspection. Profile
eye foreshortening is allowed. Generic staging requires an explicit two-actor
conversation axis, a horizontal floor aligned with its level positive-uniform
root, immutable floor/scenery dimensions, and currently full-mesh prop regions.
Special artwork subregions stay in specialized adapters. No automatic layout generation,
tracking/orbit cameras, story/action generation or cinematic automation were added.

Run serially: npm run typecheck; npm run test:characters; npm run test:memory;
npm run audit:phase1; npm run verify:phase3. The last command reuses existing
critical browser functions, renders the integrated clip and short office samples.
Use npm run verify:phase3 -- stills to re-extract without a new render.

Changed SDK: staging/stage.ts (new), staging/index.ts, lib.ts types,
direction/proxies.ts, visibility.ts, visibility-types.ts.
Fixtures/tools: office-fixture.ts, office.tsx, phase3-gpu.ts (new),
DoctorClinicCinematic.tsx, clinic-cinematic.ts, Root.tsx, scripts/verify-phase3.cjs
and tests/staging.test.cjs (new), test-characters.cjs, tsconfig.characters.json,
package.json. Documentation: AGENT_INSTRUCTIONS.md, direction/README.md, this report.
Renderer internals, character rigs/appearance/actions and production policy files
are unchanged. Stop after Phase 3E for review.
