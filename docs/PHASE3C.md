# Phase 3C — visibility-aware static cinematic composition

Verdict: **PASS on local Windows SwiftShader; Muse/Linux revalidation outstanding.**
Phase 3D/3E are not implemented. Renderer, rigs, actor actions, contacts,
expressions, furniture, Linux policy, memory thresholds and concurrency remain
unchanged. Phase 3B remains the default; DoctorClinicVisible opts into 3C.

## Architecture and public API

Read [COMPOSITION.md](../src/toon-kit/direction/COMPOSITION.md) for exact public
APIs, the authoring example, diagnostic fields, thresholds and cost bounds.

- Caption style is shared by the overlay and actual loaded-font DOM measurement.
- Current complete poses produce analytic actor proxies; actual room geometry
  produces furniture boxes and chart plane. No extra mesh, pass or render target.
- The director prepares every frame, evaluates <=6 approved candidates/shot,
  rejects visibility/caption/axis/size/zone failures, then locks one static camera.
- Exact bounded scene certificates detect unexpected changes at runtime.
  Preparation restores frame 0 even on failure. No previous-frame camera input.

Selected portrait views: conversation +22.5 degrees; chart front; doctor +30
degrees; reaction subject-facing. Worst required visibility fractions are
.777778, 1, 1, 1 respectively. Face/eye fractions are distinct from containment.
The minimum head image heights over these actor shots are .135816, .288217,
.327167; diagram focus uses its own size threshold, not a head-height metric.

## Test results

| Check | Result |
| --- | --- |
| TypeScript, exact installed dependencies | PASS, zero errors |
| Complete CPU character/director suite | PASS, 156 tests (16 composition tests) |
| Memory admission/abort unit tests | PASS, 7 tests |
| Phase 1 audit | PASS, 22 assertions |
| Stage 2A, 2B, 2C landscape + portrait | PASS, 27 + 42 + 50 + 50 assertions |
| Expressions, appearance, walking, acting | PASS, 37 + 34 + 42 + 42 assertions |
| Universal clinic and Phase 3B director | PASS, 20 + 44 assertions |
| New composition software-WebGL suite | PASS, 48 assertions |
| Actual native caption overlay containment/collision | PASS, all 150 720p frames and 30 1080p montage frames |
| Full 720p video / 1080p four-shot montage | PASS, 150 / 30 frames |
| Normal-speed playback / native still inspection | PASS, all four shots, portrait and landscape |
| Muse/Linux performance, /proc/meminfo, /tmp and cgroups | NOT TESTED here |

458 browser assertions across old and new suites passed serially. Memory tests
ran separately from rendering. Existing reduced-cost suite modes were used:
expressions-only, appearance audit-only, walking/acting views-only, clinic and
3B previews. No claim that every historic long-video variant was rerendered.

Composition cases cover foreground patient dominance, fully/partially hidden
faces, own-torso/furniture hand blockage, chart/node obstruction, mid-shot
blockage, camera-side alternatives, explicit axis exception, impossible views,
near/image boundaries, long words, large fonts, max-punch ink and shadows,
reversed candidate declaration order, fresh owners, complete frame resets,
changed scene certificates, detached/hidden occluders and malformed data.

Four fresh software-WebGL contexts (two per aspect) each request
`0 -> 80 -> 20 -> 80 -> 0 -> 43 -> 75 -> 114 -> 149`.
Camera JSON, PNG SHA-256 and raw RGBA SHA-256 match repeated/fresh requests.
Stable warm resources: 32 geometries, 19 textures; shader count unchanged;
zero createTexture/createFramebuffer/createRenderbuffer calls after warm-up.
All four disposed contexts report context loss. No cross-platform hash claim.

## Visual comparison and artifacts

Generated files are intentionally ignored by Git; rerun the commands below.
Before images are rerendered from the retained 3B path with the same scene.

| View | Before | After |
| --- | --- | --- |
| Two-shot | [3B](../out/phase3b/previews-two-shot.png) | [3C](../out/phase3c/previews-two-shot.png) |
| Doctor medium | [3B](../out/phase3b/previews-medium.png) | [3C](../out/phase3c/previews-medium.png) |
| Chart | [3B](../out/phase3b/previews-object-focus.png) | [3C](../out/phase3c/previews-object-focus.png) |
| Reaction | [3B](../out/phase3b/previews-reaction.png) | [3C](../out/phase3c/previews-reaction.png) |
| Landscape two-shot | [3B](../out/phase3b/landscape-two-shot.png) | [3C](../out/phase3c/landscape-two-shot.png) |
| Landscape medium | [3B](../out/phase3b/landscape-medium.png) | [3C](../out/phase3c/landscape-medium.png) |

[720p full video](../out/phase3c/cinematic-720.mp4),
[1080p short montage](../out/phase3c/validation-1080.mp4),
[close-up](../out/phase3c/close-up.png),
[wrapped long word](../out/phase3c/long-word.png),
[larger font](../out/phase3c/large-font.png).

The medium no longer contains the distracting foreground patient head; neither
actor is hidden. The same doctor action is now seen from the selected clear
view. Two-shot protected-content headroom is anchored near the top instead of
centering the actors beneath excessive ceiling. Both faces remain readable;
oblique eyes naturally foreshorten during the existing chart-pointing turn.
The chart figure and yellow node remain unobstructed and large. The reaction
retains its expressive face and raised hand. Captions may overlap legs/table
background, but not protected face/eye/hand/diagram regions. Conservative
caption margins leave lower negative space, especially in the two-shot/insert.

## Measurements

Windows 16-logical-CPU / 15.71 GiB host, Node 24.14.1; Remotion 4.0.539,
Three 0.187.0, React 19.3.1, TypeScript 7.0.2. swangle reports ANGLE Vulkan
SwiftShader Device (Subzero), software-safe, native resolution, concurrency 1,
parallel encoding disabled and hardware encoding disabled.

| Measurement | 720x1280 / 150 frames | 1080x1920 / 30-frame montage |
| --- | ---: | ---: |
| Whole job wall time | 52.52 s | 24.83 s |
| Capture interval median / p95 | 335.89 / 398.46 ms | 662.36 / 777.36 ms |
| WebGL enqueue median / p95 | 3.30 / 7.00 ms | 4.30 / 7.70 ms |
| Director median / p95 | .50 / 1.00 ms | .50 / .90 ms |
| Complete action/director/DOM check median / p95 | 4.70 / 9.10 ms | 5.70 / 9.80 ms |
| Preparation (construction + cast samples + planning) | 1010.60 ms | 915.90 ms |
| Caption measurement + React commit | 4.40 ms | 6.00 ms |
| Peak sampled process-tree RSS | 1192914944 B (1.11 GiB) | 1186426880 B (1.10 GiB) |
| Peak workspace scratch | 58347650 B (55.64 MiB) | 51706886 B (49.31 MiB) |

Preparation: 151 callbacks including frame-0 restore; 22 candidates across
four shots; 150 certified frames; 5396440 serialized certificate bytes (5.15
MiB), below the 16 MiB limit. Per-frame overhead includes current-certificate
serialization, not renewed visibility search. Enqueue time is not completed
GPU/capture time; capture intervals better reflect software rendering cost.
One-second memory/disk sampling can miss short-lived peaks.

Job reports prove absolute `.remotion-tmp/<owned-UUID>` storage and Chromium
`--user-data-dir` beneath it. TMPDIR/TMP/TEMP and worker temp paths match the
owned workspace. Both recorded UUID directories were absent after cleanup;
no active render/validation locks remained. Reports:
`out/phase3c/cinematic-720-report.json`, `validation-1080-report.json`.
Cgroup and system `/tmp` telemetry are **unavailable** on this Windows host,
not zero. Linux memory protections remain unchanged but were not exercised
against real ballooning here. These short local tests cannot rule out OOM.

## Reproduction

Run serially from the checkout, with installed lockfile dependencies:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run verify:composition -- previews
npm run verify:composition -- 720
npm run verify:composition -- 1080
```

`npm run verify:composition` runs all three groups serially. The previews group
runs the 48 WebGL assertions, portrait/landscape, close-up and caption cases.
The 1080p montage samples all four shot types and boundaries; it is not a full
150-frame 1080p certification. The wrapper always launches the existing guarded
production runner. On Muse the existing 2.5 GiB admission threshold may reject
a job; do not lower it. Existing regressions: audit:phase1, verify:characters,
verify:contacts, verify:cast, verify:cast-portrait, verify:faces -- expressions-only,
verify:appearance -- audit-only, verify:walking -- views-only, verify:acting --
views-only, verify:clinic -- previews, verify:direction -- previews.

## Limits and corrected validation failure

The first landscape test exposed an overly conservative near-camera foreground
head rectangle: an off-screen sphere was incorrectly treated as filling the
image. Frustum rejection and perspective sphere extents corrected it; subsequent
portrait/landscape tests and complete rendering passed. Detached registered
props are also excluded from occlusion, with an explicit regression test.

Visibility remains a bounded proxy estimate. Fine hair/accessories, alpha-cutout
textures and small between-sample obstructions need suitable conservative
proxies and visual review. Supported transform restrictions remain unchanged.
Only the registered clinic stage is supplied; no automatic new-room staging,
over-shoulder preset, moving camera, crossfade or new acting system is added.
An impossible composition fails explicitly instead of altering the story.

## Changed files

New implementation: caption-style.ts, caption-layout.ts, direction/visibility-types.ts,
direction/proxies.ts, direction/visibility.ts, direction/composition.ts under
src/toon-kit. Existing integration: captions.tsx, index.ts, direction/bindings.ts,
direction/director.ts, direction/index.ts, direction/timeline.ts, direction/types.ts,
staging/clinic.ts; src/DoctorClinicCinematic.tsx, src/clinic-cinematic.ts, src/Root.tsx.
Tests/tools: scripts/tests/composition-helpers.cjs, scripts/tests/composition.test.cjs,
scripts/verify-composition.cjs, scripts/test-characters.cjs,
src/toon-kit-tests/composition-gpu.ts, package.json.
Documentation: this report, direction/COMPOSITION.md, direction/README.md,
src/toon-kit/AGENT_INSTRUCTIONS.md. No generated media or benchmark logs committed.

## Deterministic PNG evidence

SHA-256 of direct WebGL PNGs (caption overlay is separately validated in native captures):

| Size | Frame | PNG SHA-256 |
| --- | ---: | --- |
| 360x640 | 0 | a2ad020d00acc29f1a9902f5d7350586b893226dbda932ee93c1716748796e5f |
| 360x640 | 80 | 03fdedd038f7b7b08571aaec95a6efa0b1e2099b09ceb54a5d5042be66c6fc8d |
| 360x640 | 20 | a2ad020d00acc29f1a9902f5d7350586b893226dbda932ee93c1716748796e5f |
| 640x360 | 0 | 7cedef1c02b34513a0f91e5e45128fff5428518ada3c0b5b38c34ed28242b07d |
| 640x360 | 80 | b9b8937c92faddf1be51557aaae885cc7721d85511ab58c9536148541fdaaa4e |
| 640x360 | 20 | 7cedef1c02b34513a0f91e5e45128fff5428518ada3c0b5b38c34ed28242b07d |
