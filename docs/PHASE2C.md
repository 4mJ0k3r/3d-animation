# Stage 2C verification — 2026-10-31

Verdict: **PASS for local Stage 2C implementation and software-rendering regression
verification.** Linux VM performance/balloon-pressure recertification is NOT TESTED
in this session. This is not a guarantee against host memory reclamation.
Stages 2D/2E/2F and original clinic migration have not begun.

## Changed files

| Files | Purpose |
|---|---|
| `src/toon-kit/characters/cast.ts`, `cast-types.ts`, `cast-error.ts` | Cast ownership, complete requests/snapshots, transactional evaluation, structured errors |
| `src/toon-kit/characters/semantic-targets.ts`, `target-resolver.ts` | Named/current-frame scene, support/final actor, fixed and callback targets; graph/space validation |
| `src/toon-kit/characters/pose-space.ts`, `gaze.ts`, `pointing.ts` | Pure space conversions, bounded gaze and directional pointing |
| `src/toon-kit/characters/constraints.ts` | Optional internal arm-pole hints in existing IK/clearance path; public Stage 2B function preserved |
| `src/toon-kit/characters/rig.ts` | Read-only pose preflight before whole-cast application; metrics accepts root handles |
| `src/toon-kit/characters/math.ts`, `index.ts` | Pure quaternion-vector helper and public exports |
| `scripts/tests/cast.test.cjs`, `scripts/test-characters.cjs`, `scripts/tsconfig.characters.json` | CPU tests and fixture compilation |
| `src/toon-kit-tests/cast-fixture.ts`, `cast-gpu.ts`, `cast.tsx` | Three-actor clinic-like fixture, software assertions, landscape/portrait video entry |
| `scripts/verify-characters.cjs`, `package.json` | Serial guarded cast/portrait verification commands; existing modes preserved |
| `src/toon-kit/characters/CAST.md`, `README.md`, `src/toon-kit/AGENT_INSTRUCTIONS.md`, `docs/PHASE2C.md` | Public API, defaults, constraints and verification report |

Frozen engine/bridge/postprocessing, production launchers/policy/memory guards,
dependency lockfile and original Doctor/Patient/DoctorClinicScene are unchanged.
Generated video, screenshots, benchmark JSON and compiled tests remain gitignored.

## API and evaluation contract

See [CAST.md](../src/toon-kit/characters/CAST.md) for complete types/examples.

```ts
const targets = createTargets({
  doctor: sceneMark(doctorLocator),
  patient: sceneSeat(examCushion),
  diagram: scenePoint(diagramMesh),
});
const cast = createCast(engine, {
  doctor: {stance: standAt(targets.mark('doctor'))},
  patient: {stance: sitAt(targets.seat('patient'))},
});
// Update props from this requested frame BEFORE evaluating.
const snapshot = cast.evaluate({frame, fps, poses: {
  doctor: {
    gaze: lookAt(cast.actors.patient.target('head')),
    gesture: pointAt(targets.target('diagram'), {hand:'auto'}),
  },
  patient: {gaze: lookAt(cast.actors.doctor.target('head'))},
}});
// Reaching is separate: reaches:[reachFor('left', targets.target('diagram'))].
// Engine cleanup owns shared GPU resources; cast.dispose() is idempotent.
```

Sorted actor names → current parent frames → all support poses → stable targets
→ physical reaches → directional pointing → gaze → all-rig preflight → complete
application. Immutable numeric snapshots; no previous-pose cache or live joint
reads. Omitted fields return to construction home stance/scale, visible=true,
rest arms and neutral gaze. Default home without a mark is world origin/floor 0.
Actor targets default to support snapshots so mutual gaze is nonrecursive. Explicit
final-anchor dependencies must be acyclic. Foreign actor handles/scenes and live
character scene targets are rejected. Invalid input throws before any rig apply;
do not catch an error and capture the old frame.

## Tests and determinism

| Verification | Result |
|---|---|
| TypeScript `tsc --noEmit` | PASS, zero errors |
| CPU character tests | PASS 59/59 (22 cast + 37 Stage 2A/2B) |
| Software Stage 2C assertions | PASS 50/50, both verification jobs |
| Stage 2A software assertions | PASS 27/27 |
| Stage 2B software assertions | PASS 42/42 |
| Phase 1 engine/readiness/outline/lifecycle/bridge audit | PASS, 22 engine assertions plus bridge/lifecycle fixtures |
| Memory guard simulation suite | PASS 7/7 |
| Linux VM execution in this session | NOT TESTED |

CPU coverage includes mutual gaze, distant/explicit/auto/conflicting pointing,
seated floor/dangling contact preservation, target changes, callback caching,
declaration/request order reversal, atomic rejection, spaces/parent transforms,
seat inference, missing/circular/deep targets, final dependencies, gaze limits,
omission/reset, invalid payloads without freezing caller scene objects, cross-cast
scope, reentrancy, ownership and cleanup.

Software checks use three sequential fresh offscreen engines, resource counts,
exactly-once resource disposal and context-loss checks. Two engines capture
0 → 80 → 20 → 80 → 0; the second reverses actor declaration order. Full pose JSON,
raw RGBA and direct canvas PNG bytes match for repeated frames across engines.
Distinct frames produce distinct hashes. PNG SHA-256 at 400×400, software-safe:

| Frame | PNG SHA-256 |
|---|---|
| 0 | `80cca0ef1beaf630ed0c962a6c41ae39960899fb362c8dc798ce2303b84de663` |
| 80 | `362058302eb47ee6f4fbeb5077e5feae2a0c416aaea4422e6aff9bebdf32e686` |
| 20 | `41cfc76b18eba786eaccde393c10aa203d8b6106c54a01bcbfa5a9ca561cdfd2` |

Rendered screenshots were inspected from front, oblique three-quarter, side and
close portrait. Hands/shoulders, heads/necks and floor/seat contacts stay connected;
no new detached geometry or internal seam artifacts were observed. Blue arrows
are external head-direction inspection gizmos, not eyes/facial assets. The side
view foreshortens the pointing arm and views the chart edge-on; the front/oblique
and portrait shots show the bend. Gaze arrows verify orientation of otherwise
rotationally symmetric heads. The portrait deliberately hides the third actor and
offscreen props while retaining the two-actor interaction.

## Actual local software-rendering measurements

Windows host, 16 logical CPUs / 16.9 GB RAM; Node 24.14.1. Remotion/renderer/bundler
4.0.539, Three 0.187.0, React 19.3.1, TypeScript 7.0.2. Backend `swangle`;
actual renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)
(0x0000C0DE)), SwiftShader driver)`. Software-safe, one Remotion worker,
parallel encoding disabled, hardware encoding disabled. No new postprocessing.
These timings are not predictions for a 2-vCPU VM.

| Metric | Landscape | Portrait inspector |
|---|---:|---:|
| Resolution / encoded frames | 1600×900 / 90 | 720×1280 / 3 |
| Actual video render wall time | 34.26 s | 3.77 s |
| Renderer submission median / p95 | 5.4 / 9.1 ms | 3.8 / 3.8 ms* |
| Full fixture evaluate/apply median / p95 | 2.7 / 5.6 ms | 1.7 / 1.7 ms* |
| Capture interval median / p95 | 338.8 / 394.9 ms | 223.2 / 223.2 ms* |
| Sampled peak process-tree RSS | 1271.7 MiB | 985.8 MiB |
| Sampled peak workspace temporary data | 50.6 MiB | 46.1 MiB |

Warmup frames 0/1 excluded from timing distributions (88 landscape samples;
*portrait has only one post-warmup sample, not a meaningful p95 benchmark).
Submission time alone omits asynchronous raster/capture/encoding costs; capture
interval and wall time are supplied for context. Fixture timing includes prop
updates and debug gizmos as well as solving/applying poses. Monitoring includes
verification setup; 1-second RSS/disk samples can miss transient peaks.

Each ordinary actor remains **19 meshes / 2,784 triangles**, 5 unique geometry
handles / 3 material handles within that rig. Three actors submit 8,352 base body
triangles; shared resource handles are not additive allocations. Landscape
frame-2 renderer counters (all passes, props/room/gizmos included): 311 calls,
38,134 triangles, 24 resident geometries / 20 textures. Portrait: 197 calls,
22,846 triangles, 15 geometries / 16 textures. Offscreen test-engine memory stays
at 21 geometries / 17 textures through pose changes before disposal. No per-frame
body geometry/material construction or new skinning/postprocessing.

All worker TMPDIR/TMP/TEMP and actual `os.tmpdir()` point into the owned
`D:\3d-animation\.remotion-tmp\<job-id>` directories. FFmpeg image/intermediate
paths in reports are inside the same owned scratch. Both scratch directories are
absent after completion; no monitor limits triggered. Linux `/tmp` usage,
MemAvailable and cgroup measurements are unavailable locally, reported null/
unavailable rather than fabricated. Linux admission/abort policy remains unchanged:
2.5 GiB admission; three consecutive readings below 1 GiB abort; telemetry-failure
guard, process-tree cleanup, concurrency 1 and workspace isolation remain mandatory.

## Reproduction and artifacts

Run serially from repository root (on Muse, allow the existing admission guard to
refuse if the balloon has removed required headroom):

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:cast-portrait
```

`out/phase2c/{front,three-quarter,side}.png`, `views.mp4` (3 seconds, discrete
camera/pose cuts), `validation-results.json`, `production-report.json`.
Close portrait artifacts are under `out/phase2c/portrait/`.
Screenshots are extracted from the actual H.264 video; deterministic PNG hashing
uses lossless canvas PNG bytes BEFORE video encoding. Outputs are not committed.

## Remaining limitations

- Pointing is a bounded feasible-candidate search, not an exhaustive proof that no
  mathematical pose exists. It rejects rather than stretching or breaking contacts.
- Head yaw ±60°, pitch ±25°; limited gaze reports residual direction for future
  eyes. No torso turning, facial assets, hair/clothing, walks or continuous blends.
- Supported actor parents/marks/seats remain level, positive uniformly scaled;
  arbitrary affine transforms are accepted only for prop point targets.
- Seat bounds are inferred once from rigid local mesh geometry; changing the
  geometry requires a new binding/explicit descriptor. No general prop/actor
  collision or automatic shot composition is implemented.
- Target callbacks must be synchronous/pure. Direct rig edits, mutation during
  evaluation/commit and live-joint target bindings are outside the contract.
- Short local tests cannot establish long-run OOM safety or cross-OS pixel identity.
  Muse must rerun the guarded commands for Linux VM certification.

No observed safety failure in the completed local runs. Stop here for Stage 2C
architecture and visual review.
