# Stage 2D-B verification — 2026-10-31

**PASS locally**, including actual SwiftShader renders, deterministic PNGs and
all previous regression suites. Linux Muse VM certification is NOT TESTED here.
No Stage 2E/2F work or legacy clinic migration has begun.

## Public API and architecture

```ts
const cast = createCast(engine, {
  doctor: {appearance: appearancePreset('doctor'), stance: standAt(clinic.mark('doctor'))},
  patient: {
    appearance: appearancePreset('patient', {skin:'#c89068', hair:{style:'tied-back'}}),
    stance: sitAt(clinic.seat('patient')),
  },
});
cast.evaluate({frame, fps, poses: {
  doctor: {expression:'explaining', gesture:pointAt(clinic.target('diagram'))},
  patient: {expression:'worried', gaze:lookAt(cast.actors.doctor.target('head'))},
}});
```

Complete API/defaults and authoring rules: [APPEARANCE.md](../src/toon-kit/characters/APPEARANCE.md).
Appearance is immutable construction data; actor identity, proportions and
per-frame poses remain separate. `resolveAppearance` validates/copies plain data;
`appearancePreset` composes nested overrides; `cast.actors[name].appearance`
exposes the resolved immutable data. Existing `colors`-only API is preserved;
mixing both palette sources fails clearly.

Module boundaries:

- `appearance.ts`: pure schema, validation, defaults, four presets and attachment contracts.
- `appearance-geometry.ts`: coherent hair cap, tapered tail, folded hood and merged glasses.
- `appearance-paint.ts`: static clothing, fabric/sole, hair-part and accessory maps.
- `appearance-view.ts`: factory-scoped resource pooling, body materials, anatomical bindings and resets.
- Existing `rig.ts` composes appearance onto the one hierarchy; `cast.ts` validates
  construction options and retains its existing complete transactional evaluation.

Hair uses one cap with an inset lip inside the real faceted head. Short, swept
and tied-back styles share the same anatomical head origin/radius contract;
tied-back adds a single tapered tail. Cap wrap positions/normals are joined,
including the asymmetric swept hairline. Maximum frontal brow/eye space is clear.
Hair/glasses retain actor groups and silhouette-only policy, with no black
forehead seam. Glasses are one curved merged wire frame, without opaque lenses.

Clothing conforms by using the actual existing capsule/cylinder/sphere surfaces.
Collars, lapels, seams, pockets, buttons, drawstrings, badge and stethoscope are
painted details, not duplicate planes/meshes. Sleeves and trousers use existing
limb segments/joints. The hoodie adds one folded tube embedded in the upper
capsule, clearing the maximum supported neck. Shoe styles preserve original
geometry and ground contact; sneakers add painted soles/laces. Named attachment
contracts use head, torso and neckBase; no scene-level accessory coordinates.

Static torso maps are 512×512 to keep front-quarter UV details readable in close-up;
smaller maps are 256×256, all sRGB without mipmaps or external/font assets.
Factory caches share immutable geometries/materials/maps by relevant recipe;
skin/hair variants reuse identical fabric maps. Facial textures remain private
and Stage 2D-A rendering is unchanged. No new passes or per-frame GPU allocations.
Engine disposal owns shared resources, clears caches and shrinks canvas backings.

## Changed files

| Files | Changes |
|---|---|
| `src/toon-kit/characters/appearance.ts`, `appearance-geometry.ts`, `appearance-paint.ts`, `appearance-view.ts` | Appearance schema/presets, geometry, static maps and resource/binding composition |
| `src/toon-kit/characters/rig.ts`, `types.ts` | Appearance options, materials, anatomical components and complete attachment reset |
| `src/toon-kit/characters/cast.ts`, `cast-types.ts`, `index.ts` | Validated public options, immutable appearance metadata, exports |
| `src/toon-kit-tests/appearance-fixture.ts`, `appearance-gpu.ts`, `appearance.tsx` | Four-preset scene, views, portraits, interaction, deterministic/resource assertions and costs |
| `scripts/tests/appearance.test.cjs`, `scripts/test-characters.cjs` | Thirteen new CPU tests plus previous suites |
| `scripts/verify-appearance.cjs`, `package.json` | Serial guarded production renders and workspace-safe extraction |
| `src/toon-kit/characters/APPEARANCE.md`, `README.md`, `CAST.md`, `FACES.md`, `src/toon-kit/AGENT_INSTRUCTIONS.md`, `docs/PHASE2DB.md` | Public contracts, stage boundary, validation commands and evidence |

Frozen engine, bridge, camera helpers, postprocessing, lighting/primitives,
production/memory policy and launchers, dependency versions/lockfile, original
Doctor.ts, Patient.ts and DoctorClinicScene.tsx are unchanged. Only fixture shot
framing uses existing helpers explicitly; no cinematic automation is introduced.
Generated media/logs/benchmark data remain gitignored.

## Automated results

| Verification | Result |
|---|---|
| `npm run typecheck` | PASS, zero errors |
| Character CPU suite | PASS 82/82 (13 new appearance cases + 69 prior) |
| Appearance SwiftShader suite | PASS 34/34 |
| Stage 2D-A facial software suite | PASS 37/37 |
| Stage 2A / 2B / 2C software suites | PASS 27/27, 42/42, 50/50 |
| Phase 1 engine/readiness/lifecycle/bridge audit | PASS, 22 engine assertions plus lifecycle/bridge fixtures |
| Memory admission/controlled-abort simulations | PASS 7/7 |
| Actual Muse Linux VM execution this session | NOT TESTED |

CPU tests cover presets, invalid schemas/colors/accessories, palette conflicts,
unchanged body poses/contacts/gaze across appearances, anatomical hierarchy,
frontal feature clearance for all styles/two head sizes, closed cap wrap positions
and normals, complete transform/visibility resets, embedded hood/neck clearance,
resource sharing/independence, fabric reuse across skin/hair variation, caller-data
independence/canonical ordering and six repeated create/dispose cycles.

Software tests warm all visible resources, then compare stable allocation counts
through 0 → 80 → 20 → 80 → 0. Two fresh engines reverse actor declaration order;
complete snapshots and lossless PNG SHA-256 match at every repeated request.
Distinct frames differ. Checks also cover wearing clothes while sitting/pointing,
facial state, atomic errors, named attachments/outline policy, preset budgets,
owner-scoped retention, exactly-once disposal and released contexts.

PNG hashes at 640×400, software-safe, matching both fresh instances/repeated visits:

| Frame | SHA-256 |
|---|---|
| 0 | `d6db3de174d418d59155ddde5003c8abfd42358984a59dee6a4cfa67b70e3a1f` |
| 80 | `0b17d27ea8bbd2e5a5c130d49de09317541c1b1423073e02dfe49ee1ff1021a8` |
| 20 | `d95908d77b9791fd908b4c68f055374272671a95cfe69c6bfbd59f70a60c6933` |

## Geometry and draw costs

Compared with a faced Stage 2D-A character: **20 meshes / 3,552 triangles**.
Same-view measured baseline: **84 calls / 13,448 triangles across all passes**,
including shared floor and postprocessing. Model counts are separate from
multipass renderer counters. Different proportions keep the same base topology.

| Preset | Meshes (delta) | Model triangles (delta) | Unique geometry/material handles in rig | Measured calls (delta) | Multipass triangles |
|---|---:|---:|---:|---:|---:|
| Doctor | 21 (+1) | 4,632 (+1,080) | 7 / 8 | 88 (+4) | 17,768 |
| Patient | 22 (+2) | 4,920 (+1,368) | 8 / 9 | 92 (+8) | 18,920 |
| Office | 22 (+2) | 5,976 (+2,424) | 8 / 9 | 91 (+7) | 21,800 |
| Casual | 22 (+2) | 4,856 (+1,304) | 8 / 8 | 92 (+8) | 18,664 |

Four dressed characters total **87 meshes / 20,384 base triangles**. Static badges,
stethoscope, garment details and sneakers add no meshes. Glasses do not add a
shadow draw. Counts include existing facial geometry; unique handles are not
additive allocations because compatible resources are pooled.

## Actual local software rendering

Windows, Node 24.14.1, 16 logical CPUs / 16.9 GB RAM. Remotion/renderer/bundler
4.0.539, Three 0.187.0, React 19.3.1, TypeScript 7.0.2. Backend `swangle`, renderer
verified as ANGLE / Vulkan SwiftShader Device (Subzero). Software-safe, native
resolution, concurrency 1, disabled hardware/parallel encoding. These numbers are
not a prediction for the 2-vCPU Muse VM.

| Metric | Four-character interaction |
|---|---:|
| Resolution / frames | 1600×900 / 90 (3 seconds) |
| Video render wall time | 31.75 s |
| Renderer median / p95 | 4.5 / 8.6 ms |
| Full fixture solve/apply median / p95 | 1.9 / 4.6 ms |
| Capture interval median / p95 | 300.3 / 430.0 ms |
| Sampled peak process-tree RSS | 1060.9 MiB |
| Sampled peak workspace temporary data | 52.9 MiB |

Warmup frames 0/1 excluded (88 samples). Renderer timings alone omit capture and
encoding overhead, so wall/capture timings are also supplied. Solve timing includes
body/contact/facial evaluation and attachment resets, not just appearance work.
One-second RSS/disk sampling can miss transient peaks. Example frame 2: 348 draw
calls / 77,128 submitted triangles across all passes, 16 resident geometries / 25
textures. Seat geometry becomes resident later when it is shown; the audit warms
that state first, then verifies stable counts. The audit also renders an isolated
undressed baseline; that measurement-only cast is absent from the production video.

Actual native 720×1280 doctor/casual portrait jobs also passed. Single-frame wall
times were 2.11 / 3.21 seconds, peak RSS 940.5 / 911.4 MiB; they have no meaningful
post-warmup median or p95. Audit peak RSS was 1070.9 MiB with 47.7 MiB workspace
temporary data, including sheets/two sequential fresh engines.

All worker TMPDIR/TMP/TEMP and os.tmpdir are absolute workspace
`.remotion-tmp/<job-id>` paths. FFmpeg image/intermediate paths and extraction
scratch use the workspace too. Owned scratch is absent after each completed job,
and no normal render exceeded monitor limits. Linux `/tmp`, MemAvailable and
cgroup telemetry are unavailable/null locally, not fabricated zero values.
Existing Linux 2.5 GiB admission, low-memory abort, RSS/disk limits and child-tree
cleanup are unchanged. Short local runs cannot guarantee survival of sudden host
memory balloon reclamation or prove long-run OOM safety.

## Visual evidence and commands

Inspected actual front, three-quarter and side sheets for all four presets, head
close-ups, two native portraits, and the interaction frame showing a doctor pointing
in a coat while the patient sits in a hoodie. Hairline/UV closure, glasses under
head rotation, limb/neck continuity, seated garments, clothing visibility and
ground contact were checked. No unwanted forehead ink seam, floating clothing
plane or detached accessory was observed. Side-face occlusion is natural.
The swept wrap defect found in review is fixed and covered by the seam test.

Run serially from repository root, allowing admission rejection on a ballooned VM:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:faces -- expressions-only
npm run verify:appearance
```

Artifacts: `out/phase2db/{front,three-quarter,side,heads}.png`, `portrait.png`,
`portrait-casual.png`, `interaction.mp4`/`interaction.png`, per-job production
reports and `validation-results.json`. Sheets are lossless software WebGL captures
composed on a 2D canvas; larger sheet sizes do not allocate oversized WebGL targets.
Video/portrait PNGs extracted from H.264 are distinct from lossless determinism
captures. The tracked source fixtures preserve reproducibility; media is ignored.

## Limits and stage boundary

Garments remain fitted capsule/stick-limb cartoons: no loose fabric, hanging coat
tails, raised hoodie, wide trousers, cloth/hair dynamics or runtime wardrobe swaps.
Accessories are glasses, painted badge and stethoscope, without hats/arbitrary
props. Decorative hair/glasses do not extend Stage 2B's body-only collision model
into a general accessory collision system. Very close contact with decorative
surfaces needs future explicit constraints. At true profile the face foreshortens;
the system does not rotate faces toward the camera. Mild polygonal/toon shading
bands remain visible under magnification. Linux VM certification remains pending.

No known safety failure in the completed local validation. Stop before Stage 2E/2F.
