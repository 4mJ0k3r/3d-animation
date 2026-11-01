# Phase 6A verification

Verdict: PASS for the bounded foundation on local Windows SwiftShader.
Linux VM certification was not run in this session.

## Changes

- `authoring/environment-registry.ts`: immutable environment/prefab capability
  catalogs, validated normalized layout data, expanded semantic anchor catalog.
- `authoring/environment-builders.ts`, `street.ts`, `prefabs.ts`, `starters.ts`:
  extracted existing indoor builders, one fixed street preset, six reusable
  prefabs, bounded slots/socket attachments and shared primitive ownership.
- `authoring/document.ts`, `index.ts`: public API and semantic validation integration;
  original compiler, timelines, two-actor and frame budgets remain intact.
- `authoring/display-content.ts`, `display.ts`: reuse existing Hindi display
  validation/rendering, bounded predefined background finishes.
- `staging/stage.ts`, `story/player.ts`: compound prop support in the existing
  stage. Bounds include physical furniture parts, independently registered nested
  props retain separate ownership, and occlusion uses individual physical parts.
  Existing single-mesh registration remains supported. No second camera system.
- `authoring/verification.ts`, `scripts/tests/authoring.test.cjs`: office smoke
  preparation plus registry/contact/ownership/attachment/bounds regressions.
- `examples/street-meeting.story.json`: new 90-frame semantic walking, bench
  seating, pointing, two-shot and Hindi sign object-focus fixture. Existing story
  JSON, audio, character rigs and renderer internals were not changed.
- `authoring/README.md`, `AGENT_INSTRUCTIONS.md`: API/authoring and scope guidance.

## Evidence

- `npm run typecheck`: PASS.
- `npm run test:authoring`: 77/77 PASS, including existing short/long-story,
  media validation and resume tests plus five new environment regressions.
- `npm run test:memory`: 7/7 PASS (simulated Linux telemetry and controlled abort).
- Guarded render `--verify=true`: 22/22 browser assertions PASS, including
  0 -> 80 -> 20 -> 80 -> 0 PNG equality, fresh-engine hashes, warm allocations,
  stable geometry/texture residency, context disposal, landscape, clinic and
  office preparation. No full-length historical story rerenders.
- FFprobe: H.264, 720x1280, 30 fps, 90 frames, exactly 3 seconds.
- Inspected `out/phase6a/meeting.png` and `sign.png`: seated floor contact,
  continuous limbs, recognizable bench, readable Hindi sign. The scene is a
  deliberately simple static exterior, not a detailed environment library.
- Final CPU coverage additionally verifies standing clearance and forward
  approach marks beside both street seating prefabs. Those invisible marker
  adjustments do not change the demonstrated seated/left-walk poses.

## Measurements

`out/phase6a/production-report.json` and `out/phase6a-render.log` are ignored
local evidence. Software renderer reports ANGLE Vulkan SwiftShader Device
(Subzero), profile software-safe, backend swangle, concurrency 1.

| Measurement | Result |
| --- | --- |
| 90-frame render wall time (excluding separate preflight) | 33.95 s |
| Warm engine render submission median / p95 | 2.4 / 4.4 ms |
| Capture interval median / p95 (includes software raster/capture) | 234.6 / 268.9 ms |
| Peak monitored process-tree RSS | 1227.2 MiB |
| Peak monitored worker workspace scratch | 52.22 MiB |
| Peak renderer.info draw calls / triangles across demonstration shots | 263 / 42332 |
| Warm geometry / texture residency | 28 / 28, unchanged after repeated evaluation |
| Warm primitive allocations during verification | 0 |

Renderer.info values include renderer passes, not unique scene mesh totals.
Monitoring is sampled, not an OOM guarantee or a Linux VM performance estimate.
The verification engines share the guarded browser and execute sequentially.
The authoring and worker-owned scratch paths under `.remotion-tmp` were absent
following cleanup. Reported FFmpeg image input/profile paths use workspace
scratch. Linux /tmp, MemAvailable and cgroup measurements are unavailable on
this Windows host; none are fabricated. Production policy is unchanged:
2.5 GiB admission, 1 GiB low-memory abort with three samples, concurrency 1,
no parallel encoding, native software-safe rendering, owned-temp cleanup.

## Reproduce

```sh
npm run typecheck
npm run test:authoring
npm run test:memory
npm run story -- validate --plan=examples/street-meeting.story.json
npm run story -- render --plan=examples/street-meeting.story.json --output=out/phase6a/street-meeting.mp4 --report=out/phase6a/production-report.json --verify=true
```

## Limits

Three fixed presets, six fixed prefabs, four named props/layout, one table socket
attachment level, static level surfaces and two active lanes. High chairs may
produce supported dangling feet; the low bench permits default-rig floor contact.
No arbitrary colors/transforms, navmesh, general collision solver or smooth
sit/stand transition. Camera preparation remains authoritative: naming a valid
prop does not promise every gaze/shot/prop combination can be framed. Existing
Hindi font and content-density constraints remain. No Phase 6B work.
