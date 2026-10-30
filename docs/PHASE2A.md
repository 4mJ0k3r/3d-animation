# Phase 2A — neutral character foundation

Scope: construction, proportions, anchors, immutable complete pose data and
resource ownership. Phase 2B and later features are not implemented. Doctor.ts,
Patient.ts, DoctorClinicScene.tsx and frozen renderer internals are unchanged.

## Changed files

- `src/toon-kit/characters/types.ts`: coordinate, proportion, anchor and complete-pose contracts.
- `src/toon-kit/characters/proportions.ts`: validated dimensions and derived neutral layout.
- `src/toon-kit/characters/pose.ts`: pure rest placement and anchor calculation; transactional pose validation.
- `src/toon-kit/characters/rig.ts`: hierarchy, pooled geometry/materials, full pose application and ownership.
- `src/toon-kit/characters/index.ts`: public character exports.
- `src/toon-kit/characters/README.md`: API, exact coordinate/anchor conventions and lifecycle contract.
- `src/toon-kit/index.ts`: additive public character export only.
- `src/toon-kit-tests/character-fixture.ts`: shared compact/tall proportion fixtures.
- `src/toon-kit-tests/character-gpu.ts`: software pixel determinism and GPU lifecycle assertions.
- `src/toon-kit-tests/characters.tsx`: dedicated three-view neutral validation composition.
- `scripts/tests/characters.test.cjs`: mathematical, pose and ownership tests.
- `scripts/tsconfig.characters.json`, `scripts/test-characters.cjs`: test compilation with installed TypeScript.
- `scripts/verify-characters.cjs`: guarded production verification, PNG extraction and evidence manifest.
- `package.json`: two verification scripts; no dependency changes.
- This report.

## Local validation

Windows, Node 24.14.1; installed Remotion/renderer/bundler 4.0.539, Three.js
0.187.0, React 19.3.1 and TypeScript 7.0.2. This is local software-rendering
evidence, not fresh Linux VM certification or a long-duration memory guarantee.

| Check | Result |
|---|---|
| Typecheck | PASS |
| Mathematical/pose/resource tests | PASS, 17 tests |
| Production memory tests | PASS, 7 tests, serial execution |
| Frozen Phase 1 audit | PASS, all 22 core assertions and bridge/readiness/unmount/failure compositions |
| Character software assertions | PASS, 27 checks over 5 sequential contexts |
| Nonsequential frames, fresh contexts | PASS, 0 → 80 → 20 → 80 → 0; three distinct frame hashes |
| Character resources/context release | PASS, disposal events once; all 5 contexts lost after disposal |
| Neutral video | PASS, 1280x720, software-safe, 3 frames |
| Portrait video | PASS, 720x1280, software-safe, 3 frames |
| Manual front/three-quarter/side inspection | PASS, both characters connected, grounded, smooth joints and outlines |

Renderer identity: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)
(0x0000C0DE)), SwiftShader driver)` through `swangle`. No hardware renderer used.

Neutral geometry: **19 meshes, 2,784 triangles, 5 unique geometries and 3 materials
per character**. Compact crown height 3.0738823801; tall crown height 3.3957782817.
The ordinary-character 6,000–8,000 triangle target includes later facial/hair and
accessory detail, absent from this stage.

Final landscape verification sampled peak process-tree RSS 946.73 MiB and owned
scratch 45.79 MiB, with no monitor limit exceeded. The three captured frame render
times were 101.3, 4.8 and 4.1 ms. Portrait verification sampled peak RSS 849.50 MiB,
scratch 44.98 MiB, and frame times 90.1, 14.6 and 6.6 ms. These tiny samples are not meaningful throughput
or p95 benchmark. Scratch/profile paths were inside the project `.remotion-tmp`
UUID directory and cleaned after completion. Linux MemAvailable, `/tmp` and
cgroup measurements are unavailable on this Windows host, reported as unavailable.
They have not been fabricated or substituted with Windows measurements.

One early memory-test attempt collided with an active visual render and was
correctly refused by the production lock. It passed when rerun after the render.
This was test scheduling, not a reason to weaken single-job admission.

## Reproduction

Run each command to completion before starting the next:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
```

The last command writes `out/phase2a/front.png`, `three-quarter.png`, `side.png`,
`views.mp4`, `validation-results.json` and `production-report.json`. Results include
raw pre-encoding RGBA hashes and hashes of the extracted PNG artifacts. Large
outputs and temporary files remain gitignored.

Optional portrait capture after completing verification (POSIX shell):

```sh
npm run render:production -- --entry=src/toon-kit-tests/characters.tsx --composition=CharacterValidation --width=720 --height=1280 --frames=3 --inputProps='{"verify":false}' --output=out/phase2a/portrait.mp4 --report=out/phase2a/portrait-report.json
```

Portable PowerShell/POSIX alternative using the guarded programmatic API:

```sh
node -e "require('./scripts/render.cjs').runProductionRender({entry:'src/toon-kit-tests/characters.tsx',composition:'CharacterValidation',width:720,height:1280,frames:3,inputProps:{verify:false},output:'out/phase2a/portrait.mp4',report:'out/phase2a/portrait-report.json'}).catch(e=>{console.error(e);process.exitCode=1;})"
```

## Limits

- Only generated neutral poses guarantee attachment and floor contact. Low-level
  edited poses are representationally validated; IK and semantic constraints are
  explicitly deferred.
- Shoes are rounded ellipsoids touching at their lowest points, not a modeled
  flat sole. Joint rounds are low-poly smooth-shaded spheres.
- Near/far limbs overlap in exact side projection; this is occlusion, not a gap.
- Faces/hair/clothes/accessories are deliberately absent.
- Rendered views change pair placement along the camera's horizontal axis to keep
  both characters visible; body proportions, root yaw and camera distance are
  consistent across the three landscape views.
- Shared GPU resources remain alive until engine disposal. This supports bounded
  casts, not unlimited runtime spawn/despawn churn.
- Determinism comparisons are within the installed software stack. Cross-machine
  pixel identity across different Chrome/SwiftShader versions is not established.
- Linux VM tests must run with the unchanged admission guard and memory limits.

Verdict: **PASS for Stage 2A**. Stop for architecture and visual review before 2B.
