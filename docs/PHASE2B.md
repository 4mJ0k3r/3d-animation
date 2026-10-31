# Stage 2B — analytic IK and character contacts

Verdict: **PASS for local Stage 2B validation**. Stop before Stage 2C. This is
Windows SwiftShader evidence; it is not fresh Linux/Muse certification.

## Scope and changed files

| File | Change |
|---|---|
| `src/toon-kit/characters/owner-ids.ts` | ID reservations stored on each engine owner, shared across its factories, cleared at engine disposal; no cross-engine mutable registry |
| `src/toon-kit/characters/rig.ts` | Use owner reservations; preserve all mesh construction, complete-pose application and GPU ownership |
| `src/toon-kit/characters/math.ts` | Pure vector/quaternion math, robust normalization and bounded character/slab clearance helpers |
| `src/toon-kit/characters/ik.ts` | Analytic two-bone solver, fixed lengths, explicit singularities, deterministic bend-plane fallbacks |
| `src/toon-kit/characters/constraint-types.ts` | Typed supports, targets, frames, results and diagnostic codes |
| `src/toon-kit/characters/targets.ts` | Immutable standing/seating/reach descriptors |
| `src/toon-kit/characters/constraints.ts` | Pure complete-pose solving for floor contact, crouch, level seating, dangling and reaches |
| `src/toon-kit/characters/index.ts` | Additive public exports |
| `src/toon-kit/characters/README.md` | Correct owner-wide ID contract and link contact documentation |
| `src/toon-kit/characters/CONTACTS.md` | API examples, coordinate contract, mathematics, posture limits and failure handling |
| `scripts/tests/characters.test.cjs` | Cross-factory/cross-engine ID and resource regression |
| `scripts/tests/constraints.test.cjs` | Analytic/semantic math, transforms, contacts, reset and determinism tests |
| `scripts/test-characters.cjs` | Run both character suites serially using the installed compiler |
| `src/toon-kit-tests/contact-fixture.ts` | Explicit standing/sitting/reaching snapshots |
| `src/toon-kit-tests/contact-gpu.ts` | PNG/RGBA/pose hashes, owner IDs, bounded allocations, reset and actual context/resource disposal |
| `src/toon-kit-tests/contacts.tsx` | Six-character, three-view, 90-frame software validation scene |
| `scripts/verify-characters.cjs` | Add guarded contacts mode, evidence manifest and verified FFmpeg timestamp extraction; preserve Stage 2A mode |
| `package.json` | `verify:contacts` command; no dependency changes |
| `docs/PHASE2B.md` | This report |

Doctor.ts, Patient.ts, DoctorClinicScene.tsx, Phase 1 renderer internals, quality
profiles, Remotion configuration, production launcher/worker/monitor/memory
policy and dependency lockfile are unchanged. No faces, hair, clothing, walking,
gesture blending, physics, skinning or final declarative orchestration was added.

## Public API

```ts
const floor = levelFloor(0);
const seat = seatTarget({
  center: [1.5, .45, 0], width: 1, depth: .9, thickness: .1, yaw: Math.PI / 12,
});

const result = solveContactPose(character.definition, {
  support: sitOn(seat, {floor, feet: 'auto'}),
});
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
character.applyPose(result.pose);
```

Alternative support/reach descriptors:

```ts
const result = solveContactPose(character.definition, {
  support: standOn(floor, {at: [0, 0], yaw: 0, crouch: .5}),
  reaches: [reachTo('left', worldPoint([.55, 1.68, .3]))],
  scale: 1,
  parent: levelFrame(), // Composite world transform of root.parent; identity here.
});
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
character.applyPose(result.pose);
```

`solveTwoBoneIK()` is the lower-level common-space analytic solver. Its limited
solutions report `reachable:false`; semantic contacts reject those solutions.
Failure is explicit `pose:null`, never a hidden previous-frame or broken pose.
Full signatures and limits are in `src/toon-kit/characters/CONTACTS.md`.

## Automated and visual verification

| Check | Result |
|---|---|
| Typecheck | PASS, zero errors |
| Character tests | PASS, 37 total: 18 foundation/ID tests and 19 constraint tests |
| Stage 2A software fixture | PASS, all 27 assertions, unchanged neutral geometry and frame hashes |
| Contact software fixture | PASS, all 42 assertions across 3 sequential offscreen contexts |
| Phase 1 audit | PASS, 22 core assertions plus lifecycle/readiness, dynamic/static bridge order, pending-unmount and expected-failure compositions |
| Memory policy tests | PASS, all 7 admission/abort/cleanup tests |
| Frame order | PASS, 0 → 80 → 20 → 80 → 0, same pose/RGBA/PNG across fresh owners/renderers |
| Different states | PASS, standing/seated/reaching produce three distinct PNG hashes |
| Rotated seats and parents | PASS, independent Three.js world-space verification with positive uniform scaling |
| Resource lifecycle | PASS, each tracked character resource disposed once; all 3 contact contexts lost after disposal; Stage 2A's 5 cycles also passed |
| Front/three-quarter/side inspection | PASS, compact/tall standing, bent/reaching and seated pairs |

Mathematical coverage includes fixed segment lengths, full extension, full fold,
zero-distance unequal/equal lengths, degenerate bend planes, antiparallel and
near-antiparallel axes, subnormal hints, invalid numeric domains, left/right
symmetry, mesh endpoints at joints, level shoes, floor contact, body-to-seat
alignment, front-edge clearance, excessive seat height, short-leg dangling,
unreachable targets, conflicting requests, complete resets and independent
characters. Pure solver data is checked against Three.js matrix results.

Direct pre-encoding canvas PNG SHA-256 (repeats and fresh instances matched):

| State/frame | SHA-256 |
|---|---|
| Standing / 0 | `3df12a481c88de46af8c645bd5f87b72f91b03580755aeb404fa2e8bbf2ccb06` |
| Sitting / 20 | `3f71b6652420ba111e302274ebb6743174c7ee3d21e3b1521deedc1c6492c981` |
| Crouching/reaching / 80 | `75f5f767954d85c046967fbd3e69c102b7d26484039070cbd66156da87239a47` |

The screenshot PNGs are separate artifacts extracted from H.264 at 0/1/2 seconds;
their checksums are in `out/phase2b/validation-results.json`. The three-second
video uses camera cuts only, not an animation/blending implementation.

Visual inspection found connected shoulder/limb/neck/hand/shoe geometry, rounded
bends without seam rings, clear seat slabs and no floating required floor feet.
The short seated character intentionally dangles; the tall one reaches the floor.
Exact side projection naturally occludes near/far limbs.

## Rendering and resource measurements

Local Windows, Node 24.14.1, Remotion/renderer/bundler 4.0.539, Three.js 0.187.0,
React 19.3.1, TypeScript 7.0.2. Verified renderer:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.

Profile: software-safe, 1600x900 native resolution, 90 frames, concurrency 1,
disabled parallel encoding, original memory limits. Six characters:

| Measurement | Result |
|---|---|
| Per-character meshes / triangles | 19 / 2,784, unchanged from 2A |
| Character triangles in the six-character scene | 16,704 |
| Submitted draw calls / triangles across all existing passes | 507 / 67,784 per frame |
| Renderer geometries / textures during measured video frames | Constant 20 / 24, including scene props and renderer resources |
| RenderFrame time median / p95 | 6.8 / 11.8 ms, 88 warmed samples |
| Six solves + pose applications + fixture prop updates median / p95 | 2.6 / 5.1 ms |
| Capture interval median / p95 | 337.3 / 388.1 ms |
| renderMedia wall time | 33.74 s; excludes bundle/browser bootstrap |
| Sampled peak process-tree RSS | 1,051.20 MiB |
| Sampled peak owned workspace temporary data | 51.77 MiB |
| Monitor limit exceeded | None |

There are no new passes or per-pose geometry/material allocations. Resource
counter stability is not a proof of zero long-duration memory growth or OOM risk.
These are local host measurements, not 2-vCPU VM throughput estimates.

Worker temp/profile data used the absolute workspace directory
`D:\3d-animation\.remotion-tmp\895d6147-4511-4d40-b0cb-11b35402ff9f`.
It was absent after completion; extraction used its own checked UUID directory,
also cleaned. MemAvailable, Linux /tmp and cgroup measurements are unavailable
on this host and remain reported unavailable, never fabricated.

The initial screenshot attempt exposed the pinned compositor FFmpeg's missing
select filter (confirmed using its filter inventory). Extraction now uses tested
accurate seeks; the final full command passed. No renderer change was needed.

## Reproduce, serially

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
```

Outputs: `out/phase2b/{front,three-quarter,side}.png`, `views.mp4`,
`validation-results.json`, `production-report.json`. All generated benchmarks,
video and scratch remain gitignored. Muse should run the same commands with
the unchanged memory admission guard; do not lower limits if ballooning refuses
admission. No production safety override was introduced.

## Remaining limits

- Only level floors, level rectangular open-front seat slabs and yaw/uniform
  parent frames are supported. Root/parent contact scales are 0.05..20.
- Seating uses upright bodies and level thighs. Auto dangling/floor selection
  does not search alternate perching or leaning configurations.
- Joint/seat/body clearance is conservative; false-positive rejection near
  rounded corners is possible. Other props and undeclared seat backs/legs/aprons
  are not collision-tested. Leave the declared contact space clear.
- Semantic reaches enforce outward shoulder exit and at most 150-degree elbow
  flexion. Singularities are deterministic, not guaranteed continuous through
  every possible pole crossing.
- Reach points are hand centers. Surface-normal offsets, wrist orientation for
  tools, facial animation, gestures and character migration are later work.
- Linux/Muse recertification and longer endurance measurements remain external
  validation. No safeguard guarantees survival of sudden host memory reclamation.

No known unresolved Stage 2B correctness or safety failure in the tested domain.
