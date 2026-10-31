# Phase 3D — deterministic camera motion

**PASS locally; Muse/Linux not tested.** One existing director now supports
semantic pushIn, pan and move. No rigs, gestures, appearances, legacy clinic,
renderer or Linux production policies changed. No Phase 3E work.

Public API and supported limits: [MOTION.md](../src/toon-kit/direction/MOTION.md).
Examples and a neutral existing-cast fixture: src/toon-kit-tests/motion-fixture.ts.

## Verification

- Typecheck: zero errors with installed Remotion 4.0.539 / Three 0.187.0.
- Focused CPU suite: 50 passed (17 new motion + 33 existing director/composition).
  No full unrelated rig regression run.
- SwiftShader browser assertions: 58 passed. Portrait 360x640 and landscape
  640x360, two fresh engines each, order 0/80/20/80/0 plus boundaries/intermediates.
  PNG hashes and complete camera snapshots match repeats/fresh instances.
- Tests cover exact endpoints, linear/quintic easing, nonzero starts, dense
  continuity, fixed-position pan, interpolated focus, caption safety, cuts,
  invalid schemas/regions, unsupported unprotected pan references, vertical
  focus singularity, intermediate-only obstruction and cleanup.
- Every 720p output frame passed actual caption DOM containment and protected
  region clearance checks. Native boundary stills and 1x playback inspected.

One 90-frame (3-second) 720x1280 software-safe MP4:
[out/phase3d/motion.mp4](../out/phase3d/motion.mp4).
Boundary/intermediate PNGs boundary-01..09 correspond to frames
0/15/29, 30/45/59, 60/75/89. Outputs/logs are ignored, not committed.

## Measured cost — local Windows, swangle/SwiftShader

| Metric | Result |
| --- | ---: |
| Capture interval median / p95 | 343.18 / 421.27 ms |
| Whole render job (including browser assertions/init) | 47.59 s |
| Per-frame director median / p95 | .80 / 2.20 ms |
| Native fixture construction + planning | 532.50 ms |
| Preparation callbacks / candidates | 91 / 17 base + 2 endpoint |
| Motion path assessments / certificates | 266 / 5218900 bytes (4.98 MiB) |
| Peak sampled process-tree RSS | 763068416 bytes (727.72 MiB) |
| Peak workspace scratch | 54353789 bytes (51.84 MiB) |

At 30fps, maximum within-shot position/rotation steps (portrait fixture):
push .02152 world units / 0 degrees; pan 0 / .56411 degrees;
move .15942 world units / 1.69243 degrees. No cut jumps are included in these
continuity metrics. Quintic endpoint derivatives are zero; duration controls speed.
Pure interpolation measured about 2.8–5.6 microseconds/call in the first browser
instance; total director cost includes certificate checking.

Stable warm GPU state: 32 geometries/19 textures, unchanged shader count,
zero createTexture/createFramebuffer/createRenderbuffer calls during the audited
sequence; all four contexts lost after disposal. The first portrait pan uploads
one already-created off-screen doctor's texture (18 ->19). The initial assertion
incorrectly treated this normal first exposure as a leak; warming all shot views
before steady-state counters corrected the test. Native render data confirms
bounded first exposure, not continuing growth.

Workspace UUID/profile/temp ownership and cleanup passed; no active locks remain.
Linux /proc/meminfo, /tmp and cgroup telemetry are unavailable here, not zero.
Existing admission/abort limits were preserved. This short Windows result does
not certify Muse or guarantee survival of host memory reclamation.

## Reproduce / limitations

`npm run typecheck`, `npm run test:motion`, `npm run verify:motion` (serial).
`npm run verify:motion -- stills` only re-extracts existing video frames.
The bundled FFmpeg rejected a select filter; extraction now uses verified
single-frame seeks under owned workspace temp, without rerendering the video.

Paths use fixed prepared endpoint plans, upright orientation and fixed projection.
No target chasing, orbit, automatic cross-cut matching, obstacle rerouting or lens
animation. Pan only accepts targets protected by its enclosing shot. Half-frame
checks against adjacent poses do not model arbitrary subframe actor motion;
visibility remains proxy-based. Unsupported paths fail instead of changing actors.

## Changed files

SDK: direction/types.ts, timeline.ts, motion-contract.ts (new), motion.ts (new),
director.ts, composition.ts, index.ts. Documentation: direction/MOTION.md (new),
direction/README.md, toon-kit/AGENT_INSTRUCTIONS.md, docs/PHASE3D.md (new).
Fixtures: toon-kit-tests/motion-fixture.ts, motion-gpu.ts, motion.tsx (new), Root.tsx.
Tools/tests: scripts/test-motion.cjs, verify-motion.cjs, tests/motion.test.cjs (new),
scripts/test-characters.cjs, tsconfig.characters.json, package.json.
