# Stage 2D-A — verification report, 2026-10-31

Scope: universal facial expressions, eye gaze and deterministic blinking only.
No hairstyle, clothing, appearance preset, walking, timeline blending, cinematic
automation or original clinic migration. Frozen Phase 1 rendering/bridge/camera
and production safety files are unchanged.

Verdict: **PASS locally for Stage 2D-A**, including actual SwiftShader video and
pixel/resource regression checks. Linux VM certification is NOT TESTED here.

## API

```ts
const cast = createCast(engine, {
  doctor: {stance: standAt(clinic.mark('doctor'))},
  patient: {
    stance: sitAt(clinic.seat('patient')),
    face: {blink: {period: 3.8, duration: .18, phase: .7}},
  },
});
cast.evaluate({frame, fps, poses: {
  doctor: {
    expression: 'explaining',
    gaze: lookAt(cast.actors.patient.target('head')),
    gesture: pointAt(clinic.target('diagram')),
  },
  patient: {expression: 'worried', gaze: lookAt(cast.actors.doctor.target('head'))},
}});
```

See [FACES.md](../src/toon-kit/characters/FACES.md) for complete configuration,
defaults, eye-only `eyeGaze`, explicit `blink`, mouth shapes and blush. Expressions
are neutral/happy/worried/surprised/angry/sad/explaining. Each coordinates eye
shape, eyebrows and mouth. Omitted expression resets to neutral/configured default;
omitted blink recomputes the actor's absolute-time schedule. `snapshot.faces`
contains immutable resolved facial data. Invalid inputs fail the whole cast
before body/texture publication. Stage 2C support/pointing/head-gaze math is retained.

## Changed files

| Files | Change |
|---|---|
| `src/toon-kit/characters/face.ts` | Pure expression/config validation, stable ID blink phase, absolute-time blink and bounded pupil state |
| `src/toon-kit/characters/face-paint.ts` | Coordinated procedural eyes/brows/mouth/blush, clipping and blink rasterization |
| `src/toon-kit/characters/face-view.ts` | Factory-shared curved patch; independent sRGB textures/materials; staging, upload caching and ownership |
| `src/toon-kit/characters/rig.ts`, `types.ts` | Optional face attached to existing head, initialized neutral view, preparation bridge; silhouette-only faced head |
| `src/toon-kit/characters/cast.ts`, `cast-types.ts`, `index.ts` | Declarative face inputs/snapshots, all-actor validation/preparation, exports |
| `src/toon-kit-tests/face-fixture.ts`, `faces-gpu.ts`, `faces.tsx` | Close-up, head/eye gaze, blink, interaction, portrait and lossless contact-sheet fixtures |
| `scripts/tests/faces.test.cjs`, `scripts/test-characters.cjs` | Ten new CPU cases alongside previous 59 |
| `scripts/tests/cast.test.cjs` | Replace the formerly unsupported happy-expression rejection with an actually invalid expression |
| `scripts/verify-faces.cjs`, `package.json` | Guarded serial render/extraction commands, workspace-only scratch, exclusive verification lock |
| `src/toon-kit/characters/FACES.md`, `CAST.md`, `README.md`, `src/toon-kit/AGENT_INSTRUCTIONS.md`, `docs/PHASE2DA.md` | Authoring contracts, stage boundary and verification evidence |

Original Doctor.ts, Patient.ts, DoctorClinicScene.tsx and all production policy,
memory, temporary storage, concurrency, dependency and renderer configuration
remain unchanged. Generated media/logs/benchmark files are ignored by Git.

## Rendering architecture and resources

One 24×16 unit spherical patch per factory, reused across actors. Each patch mesh
is attached to that actor's existing head joint and scaled with its head radius;
there is no new head hierarchy or camera-facing billboard. Alpha outside painted
features is zero, so there is no visible rectangular boundary. A small surface
offset clears the original head tessellation. Facial black ink is in the texture.

Each character has its own 256×256 texture, material and two staging canvases;
512×512 is optional. They are not shared across characters/engines. sRGB texture,
alpha blending/test, depth test/no depth writes and outline `none` use the existing
pipeline without a new pass. The opaque head supplies depth; alpha-aware buffers
preserve feature cutouts. Faced heads use the existing silhouette-only policy,
which removed grazing faceted-sphere crease specks observed during visual review.
Raw faceless Stage 2A/2B rigs retain their previous full head outline policy.

Pure resolution validates all current inputs. Every needed raster is prepared on
private staging data before any actor is applied or texture published. Unchanged
resolved data avoids redraw/upload; changes clear and paint the entire staging
surface. Closure/pupil values are deterministically quantized to 1/256 to remove
subpixel floating-point residue. No previous frame is an input. Geometry/materials
are never constructed during frame evaluation. Engine disposal owns shared GPU
resources and shrinks both backing canvases; cast disposal only detaches rigs.

Faced ordinary character: **20 meshes / 3,552 triangles** (previous 19 / 2,784).
The addition is one mesh / 768 triangles. Within a rig: 6 unique geometry handles,
4 materials. Two actors in one factory share the patch geometry. A 256 texture
plus two RGBA canvas buffers has nominal uncompressed storage ~0.75 MiB per actor;
512 is ~3 MiB, before browser/driver bookkeeping. This is an estimate, not measured
browser allocation accounting.

## Automated verification

| Check | Result |
|---|---|
| TypeScript | PASS, zero errors |
| Character CPU suite | PASS 69/69, including 10 new face cases |
| Facial SwiftShader assertions | PASS 37/37; see `out/phase2da/validation-results.json` |
| Memory admission/controlled-abort tests | PASS 7/7 |
| Phase 1 rendering/readiness/lifecycle/bridge audit | PASS, 22 engine assertions plus bridge/lifecycle fixtures |
| Stage 2A/2B/2C software suites | PASS 27/27, 42/42, 50/50 |
| Linux Muse VM execution this session | NOT TESTED |

CPU cases cover all expressions on two head sizes, mouth/blush/default reset,
atomic invalid-input rejection, config validation/copying, blink phases/closure,
bounded mirrored eye-only gaze, residual head gaze, nonsequential/fresh/reversed
snapshots, disabled faces and repeated owner cleanup. Previous 59 body/contact/
cast tests remain executable. Test ordering is serial where jobs launch processes.

Software tests use fresh independent engines and reversed actor declarations.
0 → 80 → 20 → 80 → 0 compares direct canvas PNG SHA-256 and complete snapshots.
Frame 80 includes an actual automatic blink closure, not only static open eyes;
different frames produce different pixels. Checks include distinct raster pixels
for all seven expressions, private textures, geometry sharing, alpha/sRGB/depth
settings, no-upload caching, late-actor invalid-input atomicity, independent blink,
omitted expression reset, attachment reset, stable GPU allocation counts,
exactly-once resource disposal, backing-canvas release and context loss.

Direct PNG SHA-256 at 720×480, identical across both fresh/reversed engines and
repeated visits in the nonsequential sequence:

| Frame | PNG SHA-256 |
|---|---|
| 0 | `23c5fe0bb71ede276d2d454b6e23121a299a8a1899d3c27dc6098ec610e2837f` |
| 80 | `b48c3a59791ee0407af0d0b9f69355a636a4a86f5f58b18c0476bc14249e61a6` |
| 20 | `e8a564a65714c6880549949bc99ad708044d1a5e205e83d97f08dcf3834754ae` |

## Actual local software performance

Windows, Node 24.14.1, 16 logical CPUs / 16.9 GB RAM. Remotion/renderer/bundler
4.0.539, Three 0.187.0, React 19.3.1, TypeScript 7.0.2. `swangle` selected and
actual renderer verified as ANGLE / Vulkan SwiftShader Device (Subzero).
Software-safe, native resolution, one worker, hardware encoding and parallel
encoding disabled. These are not 2-vCPU Linux VM performance claims.

| Metric | Two-character demo | Native portrait |
|---|---:|---:|
| Resolution | 1080×720 | 720×1280 |
| Frames / duration | 180 / 6 s | 84 / 2.8 s |
| Render wall time | 36.84 s | 22.94 s |
| Render median / p95 | 2.5 / 5.5 ms | 1.8 / 6.0 ms |
| Fixture solve/apply/raster median / p95 | 1.8 / 3.3 ms | 2.5 / 4.6 ms |
| Capture interval median / p95 | 193.1 / 223.6 ms | 246.0 / 326.1 ms |
| Sampled peak process-tree RSS | 987.6 MiB | 1005.7 MiB |
| Sampled peak workspace temporary data | 52.2 MiB | 48.8 MiB |

Frames 0/1 excluded from timing distributions: 178 and 82 samples. Fixture timing
includes full body/contact/face resolution, any raster work and scene mutation,
not just the face painter. Render timings alone omit screenshot/encoding overhead;
wall and capture intervals are provided. Sampling interval is 1 second and may
miss transient peaks. No conclusion about long-run OOM safety follows.

Example demo frame 2: 100 render calls / 20,546 submitted triangles across all
passes, including body shadows/outline passes, with 8 resident geometries and
14 textures. Portrait frame 2: 45 calls / 9,890 triangles, 7 geometries / 11 textures;
the second actor is explicitly hidden. Base model triangle counts above are
separate from multipass renderer counters.

All worker TMPDIR/TMP/TEMP and actual os.tmpdir point inside private workspace
`.remotion-tmp/<job-id>`. Reported FFmpeg image/intermediate paths are there too.
Owned scratch is absent after completed jobs. Contact-sheet extraction also uses
private marked workspace scratch installed before importing Remotion/launching
FFmpeg. No limit triggered in the completed validation renders. Windows cannot
measure Linux `/tmp`, `/proc/meminfo` or cgroups: those are unavailable/null,
not zero. Existing Linux admission/low-memory abort/RSS/disk guards are unchanged.

## Visual inspection and reproduction

Inspected actual WebGL-rendered close-ups, not face-only 2D mockups: all seven
expressions, two proportions/skin colors, frontal/oblique/profile, five gaze
directions, three blink closures, expressive head rotations and a two-actor
explaining/pointing versus worried interaction. No rectangular boundary, floating
face box, visible z-fighting, new internal seam or detached facial geometry was
observed. Angry/sad eyelids and worried mouth were refined after review to
separate emotions at ordinary viewing size. Beauty previews have no arrows;
original Stage 2C diagnostic captures retain them.

Run from repository root, serially:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:faces
```

Artifacts in `out/phase2da/`: `contact-sheet.png`, `gaze-blink-sheet.png`,
`demo.mp4`, `interaction.mp4`, `portrait.mp4`, `portrait/01.png`,
`closeup-512/01.png`, `validation-results.json`, per-job reports/logs and PNG
frames. Contact sheets combine lossless 720×480 software WebGL captures on a 2D
canvas; large sheet sizes do not imply large WebGL targets. MP4s are actual H.264
production renders. Extracted video screenshots are lossy; determinism compares
lossless PNG bytes before video compression.

## Limits

At true profile angles, facial features foreshorten and far eyes are naturally
occluded; they do not cheat toward the camera. Head tessellation retains a mildly
polygonal silhouette at large magnification. Default in-range gaze aims the head
at the target, leaving centered pupils; eyes-only glances are explicit. Eye/head
bounds can prevent exact gaze toward extreme or rear targets. No eye-leading
motion, audio lip-sync, expression blending, nose, hair/clothing, walking or
cinematic automation was added. Static expression changes are discrete.

Muse must repeat the guarded validation for Linux VM certification. Sampled guards
cannot guarantee survival of sudden host memory balloon reclamation. Stop here
before Stage 2D-B.
