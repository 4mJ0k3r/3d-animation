# Phase 6B: composable construction verification

Verdict: PASS locally on Windows SwiftShader. Linux VM validation remains
NOT TESTED in this session; this is not an OOM-safety guarantee.

## Public API and examples

[CONSTRUCTION.md](../src/toon-kit/authoring/CONSTRUCTION.md) is the concise JSON
contract, relationship/anchor reference, budgets and reproduction guide.
`planConstruction`, `STRUCTURES`, `CONSTRUCTION_LIMITS` and associated types are
exported through toon-kit/authoring. Existing compileStoryDocument,
createStoryEnvironments, createStory, cast, director and CLI remain the pipeline.

- `examples/custom-school.story.json`: facade, door, two windows, attached school
  sign, porch, tree, freestanding notice board and bench; walking, pointing,
  seated contact, establishing/two-shot/object-focus shots.
- `examples/custom-garden.story.json`: grass, a floor region, raised plinth,
  supported planter, column, rotated barrier, trees and sign, with existing
  characters/actions/camera shots. No school/garden TypeScript builder exists.

## Exact changed files

- New `src/toon-kit/authoring/construction.ts`: pure bounded validation, dependency
  resolution, quarter-turn AABBs, contact/overlap checks and safe anchor/path plan.
- New `src/toon-kit/authoring/construction-builder.ts`: one-time primitive/prefab
  adapter, shared gradients, floor-region offset and measured resource budgets.
- `src/toon-kit/authoring/environment-registry.ts`, `index.ts`, `starters.ts`,
  `prefabs.ts`: custom dispatch and API integration; reuse the existing six
  prefab builders and retain curated layouts unchanged.
- `src/toon-kit/staging/stage.ts`, `src/toon-kit/story/player.ts`: optional exterior
  camera-space binding. The discovered blocker was that existing stages require
  cameras inside the physical floor footprint; compact outdoor actor shots
  failed CAMERA_ZONE despite valid visibility. Only custom bindings opt into a
  fixed bounded volume through the existing stage. No camera/renderer replacement.
- `scripts/tests/authoring.test.cjs`: six focused construction regressions.
- `src/toon-kit/authoring/verification.ts`: existing browser checks additionally
  prepare the original street fixture, alongside clinic/office/landscape.
- New `scripts/verify-construction.cjs`: sequential guarded sample renders,
  workspace-owned extraction scratch and frame-count inspection.
- New two example JSON files above, `authoring/CONSTRUCTION.md`, this report;
  updated `authoring/README.md` and `src/toon-kit/AGENT_INSTRUCTIONS.md`.

No renderer internals, character rigs, audio code, existing example JSON,
production policy, concurrency or memory/temporary-file limits changed.

## Verification

- Typecheck: PASS with installed dependencies unchanged (Remotion 4.0.539,
  Three.js 0.187.0, TypeScript 7.0.2).
- Focused authoring regression suite: 83/83 PASS. Six new tests cover canonical
  assembly, all relationship types, orientation, finite dimensions, overlap and
  invalid attachment/target/cycle rejection, resource budgets, generated paths,
  floor contact, 0 -> 80 -> 20 -> 80 -> 0 complete poses, three fresh owners per
  composition, exact-once cleanup and translated scene-local anchors.
- Memory guards: 7/7 PASS (simulated Linux telemetry/admission/abort/cleanup).
- Browser: 23/23 assertions for EACH custom scene. PNG hashes match repeated
  frames and fresh engines; warm texture/framebuffer/renderbuffer allocations zero, residency stable, contexts
  disposed; original clinic/office/street and landscape preparation all pass.
- Actual school MP4: H.264, 720x1280, 30fps, 90 frames, exactly 3.000 seconds.
  School frames 0/45/75 inspected: facade/entrance, grounded seated contact and
  readable Hindi object-focus notice. Garden frame 0 inspected: distinct floor,
  platform, column, barrier and planter assembly. The garden capture encodes only
  three frames for a lightweight still; browser assertions use its full 90-frame
  plan. No second full demonstration or historical long story was rendered.

## Measurements

Windows, software-safe native 720x1280, swangle, one worker. Actual GL identity:
ANGLE Vulkan SwiftShader Device (Subzero), Google driver. GPU hardware was not
used. Values below are sampled local observations, not 2-vCPU VM predictions.

| Measurement | School | Garden screenshot capture |
| --- | --- | --- |
| Encoded frames | 90 | 3 |
| Render wall time including browser verification | 38.23s | 24.12s |
| Warm engine submission median / p95 | 3.5 / 5.1ms | insufficient samples |
| Capture interval median / p95 | 244.9 / 291.2ms | insufficient samples |
| Peak process-tree RSS | 1244.3MiB | 1183.7MiB |
| Peak monitored worker workspace scratch | 52.49MiB | 48.64MiB |
| Peak renderer.info calls / triangles | 257 / 42170 | 208 / 45386 |
| Warm geometry / texture residency | 29 / 19 | 23 / 18 |
| Environment meshes / mesh-instance triangles | 23 / 1092 | 14 / 2778 |

Renderer.info includes all existing passes/actors; environment geometry counts
exclude actors and are unchanged by text materials. Warm residency comes from
repeated-evaluation browser assertions; it is not the count of every lazily
allocated resource at all shots. Submission timing excludes completed software
rasterization; capture intervals include raster/capture overhead. Separate school
whole-story preflight is excluded from the render wall-time entry.

Both worker scratch directories and the school authoring directory were absent
following cleanup. Extraction scratch was removed. FFmpeg/browser paths and temp
environment evidence are in ignored local `out/phase6b/*-report.json`; all owned
scratch uses absolute workspace `.remotion-tmp` paths. Linux MemAvailable,
/tmp and cgroup metrics are unavailable here, never reported as zero. Existing
2.5GiB admission, 1GiB/3-sample abort, concurrency 1, swangle, no parallel
encoding, readiness and ownership safeguards remain mandatory.

## Reproduce

```sh
npm run typecheck
npm run test:authoring
npm run test:memory
npm run story -- validate --plan=examples/custom-school.story.json
npm run story -- validate --plan=examples/custom-garden.story.json
node scripts/verify-construction.cjs
```

Outputs: `out/phase6b/school.mp4`, `school-0.png`, `school-45.png`,
`school-75.png`, `garden-sample-0.png`, reports/logs. Generated files are ignored,
not committed. To reuse the completed school render, run helper mode `garden`;
`stills` performs extraction only.

## Remaining limits

Two actors, four layouts, 24 items, 40 environment meshes, level straight paths,
static structures, two attachment levels, predefined finishes and quarter turns.
Conservative AABBs can reject arrangements legal for rounded forms. Unclear
anchors/paths are omitted and unavailable-name requests reject; no automatic
routing or collision/physics system. Doors/windows do not cut holes. Raised
platforms are not traversable floors. The finite floor edge and distant sign
readability depend on shots; use existing object-focus for text. Structurally
valid data does not guarantee every shot/gaze combination passes visibility;
attached decorations can occlude a parent surface. No Phase 6C work.
