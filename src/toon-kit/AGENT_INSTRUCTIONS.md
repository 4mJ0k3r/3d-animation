# Toon-Kit: Phase 1

- Import the public SDK from `toon-kit/index`. Root files are compatibility exports.
- Await loaders in `initScene`, or register promises with `engine.registerReady`. Never start an untracked async loader.
- Pass CSS font descriptors via `fonts` before generating canvas text; bundle fonts for cross-machine consistency.
- `onFrame` assigns complete animation state from absolute frame/fps. The bridge restores initial transforms first, awaits your callback, updates world matrices, then frames and renders. No clocks, random(), accumulated deltas, or animation loops.
- Use primitive builders, `createStudioRoom`, and `setupCartoonLighting`.
- Outline policies inherit from groups: `full` = contours and creases; `silhouette-only` = outer actor contour without internal seams; `none` = no ink. Tag hair and lapels `silhouette-only`. Transparent decals are excluded from the solid G-buffer.
- Each top-level actor is one outline group. Use shared string/number `userData.outlineGroup` to join separate parts. Unrelated props need separate groups.
- Supply `framingSubjects` when environments are present. Studio rooms exclude themselves. `autoFrame='static'` captures a fixed initialization envelope (supply a Box3 covering the whole motion); `true`/`'dynamic'` frames the current requested transforms. Dynamic direction defaults to the initial shot direction, never the preceding frame's direction. An explicit camera change in `onFrame` wins; `false` disables framing. Static framing avoids per-frame camera jitter.
- Engine owns attached GPU resources. Do not share across live engines. Call `engine.track(object)` before removing owned assets; use `registerCleanup` for external resources.
- Gradients are scene-owned. Outside ThreeCanvas, call `dispose()` explicitly.
- Legacy Doctor.ts, Patient.ts and DoctorClinicScene.tsx remain unchanged until the approved migration stage. Use the universal cast API for new scenes.

## Phase 1.1 CPU production rules — mandatory

- The production target has 2 vCPUs, 7.7 GB RAM, no GPU or swap, and a 512 MB `/tmp`. Do not override the safety launcher, single worker, disabled parallel encoding, software GL, workspace temp paths, readiness timeout, or memory monitors to make a render pass. Stop and report incompatibilities.
- Use `npm run render:production -- --frames=24` (programmatic API worker) or `npm run render:cli -- --frames=24`. Never invoke bare `remotion render` or import raw renderMedia in a new production entry. Programmatic callers use `runProductionRender(job)` from scripts/render.cjs, which launches a child with safe environment BEFORE importing Remotion.
- `software-safe` is the default: native resolution, no GTAO/Bokeh allocation, 512px shadows, moderate primitives, fused ink/grade. Prefer 720x1280 development. Target buffers are capped; never defeat the budget with arbitrary supersampling. `balanced` and `high` are explicit opt-ins for stronger environments; Muse VM validation must use software-safe first.
- `swangle` is the initial selected backend, verified as SwiftShader locally. `swiftshader` must pass the renderer identity check before being used. Run the benchmark on Muse before claiming a VM-specific backend choice or throughput.
- `createPrimitiveFactory(engine)` reuses geometry/materials within one owner. Never share its resources with another engine. All pooled resources are tracked even if a mesh is detached; pool calls after disposal throw.
- `engine.prepare()` is a generation barrier. New registerReady calls during it are drained, including font/image/compile waits. Registration AFTER finalization reopens readiness: renderFrame throws until prepare runs again. Rejected assets remain fatal for that engine.
- Use `engine.signal` with fetch/loaders and inspect the callback `signal`. Unmount aborts waits and disposes ownership immediately. Async continuations must honor cancellation. Scene additions after disposal are disposed automatically; detached-object mutations or external effects cannot be made safe if you ignore cancellation. Register external abort/cleanup functions with registerCleanup.
- Capture handles complete once per effect, on success, cancellation, failure, or unmount. Never manually continue another component's handle.
- `gtaoPass` / `bokehPass` access throws when that effect was not enabled. `gradePass` aliases outlinePass because grading is fused. Do not enable effects merely to access their internals.
- Each production job has an exclusive active.lock and private UUID directory in `<project>/.remotion-tmp`. Never remove another job's directory, user assets, or a live lock. A stale lock after SIGKILL requires operator inspection; no automatic unsafe stale-lock deletion.
- Monitor results are sampled, not hard allocation limits or proof of zero OOM risk. No freeze for the VM until Muse runs the supplied validation commands and reviews cgroup, process RSS, `/tmp`, and workspace temp results.

## Phase 1.3 memory admission — mandatory

- Linux launch requires at least 2.5 GiB `/proc/meminfo` MemAvailable. Do not substitute MemFree, RSS, total RAM or fabricated cgroup values. Failure to read MemAvailable refuses admission.
- During rendering, three consecutive readings below 1 GiB abort the owned process tree; a recovered sample resets the count. Two consecutive unavailable memory readings also abort. Thresholds/counts are centralized in scripts/render-policy.cjs; never lower them to force a render on a ballooned VM.
- Cgroup telemetry is optional: unavailable current/peak/swap fields are null, not zero. Continue with MemAvailable and process RSS when cgroups are unavailable. Existing RSS, workspace, `/tmp`, concurrency and encoding limits still apply.
- These sampled safeguards cannot guarantee survival of abrupt host reclamation between readings. Wait for memory recovery after an admission rejection, and review the report after any controlled abort.
- Run `npm run test:memory` for non-destructive, simulated low-memory rejection/tree-cleanup tests. The production job API has no fake-memory flag. Run `npm run audit:phase1` to preserve deterministic/outline/readiness/lifecycle coverage.
- `src/toon-kit-tests/software.tsx` is the tracked representative fixture available in this checkout. `src/toon-kit-tests/clinic.tsx` wraps the original clinic component for 300-frame certification; it does not rewrite a rig or change the production Root's 150-frame duration.

## Stage 2C scene authoring

- Build createCast/createTargets once in initScene. Prefer standAt/sitAt, lookAt, pointAt and reachFor over raw joint transforms. Read characters/CAST.md for the public contracts and defaults.
- Assign scene props from the requested absolute frame before cast.evaluate({frame,fps,poses}); update the camera afterward. Omitted intentions reset to documented defaults, never the previous frame.
- Bind scene points/marks/seats to actual props. Use cast.actors[name].target() for character anchors, not live actor joint matrices. Default targets use current support snapshots; final-anchor dependencies must be acyclic. Parent groups must belong to this engine scene and retain the supported level/uniform transforms.
- Pointing is directional and does not require touching the target. Reaching requires a physically reachable hand center. Do not bypass clearance failures, stretch limbs, or catch evaluation errors and capture an old pose. Let CastEvaluationError cancel the failed Remotion frame and inspect its diagnostics.
- Head direction/residual gaze is exposed for faces. Blue arrows in the Stage 2C fixture are diagnostic gizmos only; omit them in beauty previews. Static-path walking is approved below; compatible acting follows Stage 2E-B below; general story timelines and legacy clinic migration remain outside scope.
- All Phase 1 CPU production, ownership, memory admission, concurrency and temp-isolation rules above remain mandatory and unchanged.

## Stage 2D-A faces

- Read characters/FACES.md. Use declarative expression/blink/eyeGaze inputs; never paint scene-specific canvases, edit UVs, add face boxes or duplicate head joints. Casts enable faces; raw factory rigs opt in with face:{}.
- Resolve complete current-frame inputs through cast.evaluate. Omitted expression returns to its configured default; omitted blink uses absolute-time actor timing. Keep Stage 2C head/pointing/contact behavior. Invalid facial data must fail capture before any actor is applied.
- Mutable facial textures are private per character. Preserve staging-before-publication, no-upload caching, engine ownership and transparent-cutout/depth policies. Never allocate facial geometry/materials per frame or add postprocessing for faces.
- Run verify:faces and all earlier regressions serially; test:memory launches simulated jobs and must not overlap production renders. Keep source fixtures, not generated videos/logs. Hair/clothing and static-path walking follow the stages below; audio lip-sync, general story timelines, camera automation and legacy clinic migration remain out of scope.

## Stage 2D-B appearance

- Hair/clothing/appearance presets are now approved through characters/APPEARANCE.md. Use appearancePreset or declarative appearance at construction, alongside proportions and semantic home stances. Never build separate doctor/patient rigs or migrate legacy files in this stage.
- Use the existing hair, hood and glasses anatomical bindings; do not hand-position components, add face boxes, floating lapels/pockets or stacks of hair spheres. Preserve frontal eye/brow clearance, welded cap seams, actor outline groups and silhouette-only policies.
- Fabric and hair resources are factory/engine owned and shared immutably. Do not mutate a character's shared materials/geometry, allocate new ones per frame, or dispose pooled assets from one actor. Facial textures remain private and independently mutable.
- Keep appearance out of frame intentions. Preserve complete pose resets, Stage 2C pointing/gaze/contact behavior and Stage 2D-A expressions/blinking. Run verify:appearance plus every previous regression serially through the unchanged CPU production launcher.
- Production memory limits, software GL, one worker, disabled heavy effects/parallel encoding and workspace temp rules above are mandatory. Do not lower limits to make tests pass. Static-path walking follows Stage 2E-A below. General story timelines, cinematic automation, hair/cloth simulation, hats/large accessory expansion, Stage 2F and legacy migration remain out of scope.

## Stage 2E-A walking

- The recommended authoring API is createCast, not raw factories/joint mutation. Read characters/README.md and WALKING.md. Construct createPaths/pathThrough/pathFromMarks and walkAlong once in initScene, then evaluate complete intentions from absolute frame/fps.
- Walking is a support/contact intention using the existing analytic IK and clearance solver. Never simulate it by shifting standAt marks, editing root positions, stretching bones, or accumulating gait/foot positions.
- Static paths are level world-space routes. pathFromMarks snapshots scene locators once; later prop motion does not move that route. Keep total root/ancestor uniform scale constant during a walk. Unsupported corners, speeds or contacts must fail with diagnostics, not capture a stale pose.
- Keep the walk descriptor active before and after its interval to hold start/end contacts. Omission restores the immutable construction stance; there is no implicit timeline or previous-endpoint memory. A walk and seat support cannot be combined.
- Support targets use the current locomotion snapshot. Explicit reaches and pointing reserve arms before procedural swing; swing must yield through the same IK/clearance pipeline. Never let decorative arm motion override contacts/actions.
- Preserve expressions, attachments, owner-scoped shared resources, atomic cast publication and complete reset behavior. No per-frame GPU allocations or new passes. Compatible acting follows Stage 2E-B below; general story timelines, cinematic automation, Stage 2F and legacy migration remain out of scope.
- Run test:characters, verify:walking and all earlier regressions serially. All production safety rules above remain mandatory and unchanged. Windows SwiftShader evidence is not Muse VM certification.

## Stage 2E-B acting

- Read characters/ACTING.md. Use createCast with wave/nod/shakeHead/shrug/explain/surprise/sad/worried/excited, gestureDuring(pointAt(...)), turnTo and blendExpression. Build immutable descriptors once; evaluate complete inputs from absolute frame/fps. Never create a mixer, timer, accumulated delta or previous-pose transition.
- Fade semantic hand targets and bend planes BEFORE the existing analytic IK/clearance solve. Never interpolate finished IK joint rotations to simulate preserved contacts. Support/length/clearance outrank physical reaches, then deliberate actions, free walking arms and secondary motion. Explicit hand conflicts reject; auto actions use free hands. Torso lean yields to physical reaches.
- Keep descriptor windows active through their fades. Omission restores defaults; changing an active descriptor is not a request for implicit historical blending. Walking holds its own standing endpoints. Do not claim arbitrary support or walk-to-seat blending.
- Omitted expressions follow active gesture emotion; explicit expressions override it. Use blendExpression for explicit facial endpoints. Preserve the private staged raster cache, reusable scratch canvas and owner cleanup; no per-frame canvas, GPU geometry/material or pass allocation.
- Keep shoulders attached, hips embedded, seated body contact exact, and all appearances in the existing hierarchy. Do not bypass failed contact/gesture diagnostics or capture stale frames. Use current support targets and acyclic final targets, never live character matrices.
- Validate with test:characters and verify:acting plus all earlier suites, serially through the unchanged launcher. Inspect the normal-speed video, full-body, close-up, side and portrait previews; keep diagnostic shots separate. No debug arrows in beauty previews or accidental character crops.
- Phase 1 renderer internals, legacy characters/clinic and every production memory, concurrency, software GL, temp-isolation and encoding safeguard remain unchanged. Stop before Stage 2F, cinematic automation, lip-sync, general story timelines or script-to-video orchestration.

## Stage 2F clinic integration

- Stage 2F now permits the separate DoctorClinicUniversal composition; earlier migration exclusions describe earlier stages. Keep DoctorClinicAnimation, Doctor.ts, Patient.ts and DoctorClinicScene.tsx for A/B review. Use one createCast and existing semantic contacts, appearance presets, pointing, gaze and acting; never duplicate rigs/IK or move joints manually.
- Read docs/CLINIC_UNIVERSAL.md. Build room targets and immutable acting descriptors once; on every requested frame reset authored prop state, resolve current scene targets through cast.evaluate once, set the manual camera, then render. Keep one intentional gesture per actor, the seated start, deterministic captions and no debug arrows in beauty previews.
- Keep the ThreeCanvas cancellation latch: in pinned Remotion 4.0.539, completing readiness after an error can mask cancellation. Failed captures must reject, and unmount must release owned gates/resources. Run audit:phase1, test:characters, verify:clinic and earlier GPU suites serially before changing this behavior.
- Preserve swangle/SwiftShader, software-safe, concurrency 1, disabled heavy AO/Bokeh/parallel encoding, workspace scratch and every production admission/abort/memory limit. Windows validation does not certify Muse/Linux or protect against sudden host ballooning. Never bypass the Linux memory guard to complete this scene.
- Stop after Stage 2F review. No camera automation, voice/lip-sync, general timelines or script-to-video orchestration.

## Phase 3B static direction

- Phase 3B now approves a separate DoctorClinicCinematic validation composition. Read direction/README.md. Use createClinicStage + createDirector, named actors/prop regions and static shot presets; do not calculate author-facing camera coordinates or modify rigs/renderer internals.
- Bind one cast to the stage. Contacts and framing must use the same environment/target library. Assign complete prop state, evaluate the cast once, create the snapshot, apply the director, then render through ThreeCanvas with autoFrame=false.
- Prepare all explicit frames synchronously in initScene; restore frame 0. Do not lazily derive a camera from Remotion's first request, keep previous-camera state, or build scenes/render targets per cut. Initial limits: 600 frames/32 shots, 601 samples maximum, constant-size prepared bounds per shot.
- Framing guarantees apply to selected geometric regions, not arbitrary visibility. Non-subject foreground crops can occur. Do not claim occlusion, caption-safe positioning or screen-direction enforcement; these belong to 3C. No over-shoulder, pan/push-in, crossfade, other layouts, action timeline or automatic acting changes in 3B.
- Run verify:direction, test:characters, test:memory and earlier suites serially. Keep all swangle/software-safe, concurrency-1, workspace temp, GPU ownership, memory admission/abort and encoding safeguards unchanged. Windows measurements do not certify Muse/Linux.

## Phase 3C visibility-aware static composition

- Prefer createDirector with composition:{captions} and the SAME createCaptionLayout result in ToonCaptions. Read direction/COMPOSITION.md and DoctorClinicVisible. Await fonts, measured layout and React overlay commit before capture; prepare with the actual viewport.
- Use registered current-pose actor proxies and actual stage geometry. At most six approved candidates per static shot; test EVERY explicit frame. Never replace failure with an unvalidated wide view, hide actors, move furniture or alter acting to make a shot pass.
- Faces, eyes, active hands and named prop content must satisfy visibility, size and caption clearance; in-frame containment alone is insufficient. Proxy visibility is approximate, not pixel segmentation. Inspect native beauty renders.
- Preserve fixed per-shot cameras, stable score/ID tie breaks, scene certificates and prepare-finally restoration. Changed actions/layout require new preparation. No Phase 3D motion or Phase 3E automation is authorized here.
- Run verify:composition plus existing regression suites serially. Do not change frozen renderer/rig internals, memory limits, swangle/software-safe, concurrency 1, workspace temp or encoding safeguards. Local Windows evidence is not Linux certification.

## Phase 3D deterministic camera motion

- Read direction/MOTION.md. Use optional shot.motion pushIn/pan/move through createDirector with composition:{captions}; no raw camera coordinates, timers, previous-camera smoothing, extra render cameras or postprocessing. Omitted motion remains a hard cut/static plan.
- Keep outer-shot subjects/regions explicit. Pan targets must already be protected sampled face/hand/prop regions. Prepare every frame and bounded half-frame checks before capture; retain exact endpoints, upright focus interpolation, scene certificates and structured path failures. Never hide actors/change actions or weaken safety/composition limits to pass.
- Prefer test:motion and verify:motion for this stage. Reuse fixtures; one short demonstration suffices. No Phase 3E orchestration/action timelines are approved. All CPU-only, memory, concurrency, ownership and temp rules remain unchanged.

## Phase 3 cinematic authoring (verified office + clinic)

Build scene geometry/marks with existing primitives before creating the stage.
Use createStage for any setting; createClinicStage remains a compatibility adapter.
The floor placement and scenery dimensions are immutable for that stage; translated,
yaw-rotated positive-uniform root transforms are supported. Props may move only
as part of the explicitly prepared absolute-frame scene state. The stage owns
metadata; the engine owns GPU resources. Read direction/MOTION.md for limits.

```tsx
// Async ThreeCanvas.initScene; room/floor/board and left/right scene marks exist.
const captions = await engine.wait(createCaptionLayout({width,height,words,
  fontSize:44,strokeWidth:3,bottom:64}, engine.signal));
// Commit the SAME layout to <ToonCaptions layout={captions}/> before init resolves;
// office.tsx demonstrates the existing layout-effect readiness handshake.
const stage = createStage(engine, {root:room, floor, axis:['designer','manager']});
stage.registerProp('board', board);
const targets = createTargets({left:sceneMark(left),right:sceneMark(right)});
const cast = createCast(engine, {
  designer:{appearance:appearancePreset('casual'),stance:standAt(targets.mark('left')),
    proportions:{headRadius:.46}},
  manager:{appearance:appearancePreset('office'),stance:standAt(targets.mark('right')),
    proportions:{headRadius:.54,torsoRadius:.25}},
});
stage.bind(cast);
const director = createDirector(engine, {stage,aspect:width/height,durationInFrames:90,
  composition:{captions},shots:[
    {id:'team',type:'twoShot',subjects:['designer','manager'],startFrame:0,endFrame:30},
    {id:'idea',type:'closeUp',subject:'designer',startFrame:30,endFrame:60,
      motion:{type:'pushIn',amount:'subtle'}},
    {id:'plan',type:'objectFocus',...stage.prop('board'),startFrame:60,endFrame:90},
  ]});
const sample = (frame:number) => stage.snapshot(cast.evaluate({frame,fps:30,
  poses:{designer:{expression:'happy'},manager:{expression:'worried'}}}));
director.prepare({sample});
// ThreeCanvas autoFrame={false}; onFrame:
// director.applyFrame({frame,snapshot:sample(frame)});
```

For a generic stage, registerProp derives its full region/box-or-plane proxy from
actual mesh geometry; registerOccluder registers additional opaque proxies.
Construct/bind before preparing. Do not supply hand-built snapshots or camera math.
Use full named prop regions for this lean adapter; specialized art subregions
remain the responsibility of an existing specialized adapter such as the clinic.
Run test:characters, test:memory, audit:phase1 and verify:phase3 serially for the
closeout gate. No speech synthesis, lip-sync or unrestricted script generation is authorized.
All existing software-safe/swangle, memory, concurrency and temp rules still apply.
Actor and prop semantic names must be distinct; the internal scenery owner name stage is reserved.
Visibility now samples eye centers and edges; naturally hidden curved periphery is reported as selfOccluded. Centers and facing edges remain protected. Finite proxies still require visual review.

## Phase 4A: structured story authoring

Prefer `compileStory(plan)` + `createStory(engine,{timeline,settings,captions})`
for validated structured stories; see [story/README.md](story/README.md) and the
complete data-only `TEN_SECOND_STORY` example in `../toon-kit-tests/story-plan.ts`.
Bind existing semantic environments once, commit the same measured caption layout
to ToonCaptions, call `prepare()` before capture, then only `applyFrame(frame)`.
All plan frames are absolute and intervals half-open. Conflicts reject; never
resolve them by previous-frame state or manual joint/camera math. Keep settings
static and preserve contact-transition diagnostics. Dispose the player on teardown.
Phase 4A adds no audio, natural-language understanding or Phase 4B/4C features.
All production software-safe/swangle, memory admission/abort, single-worker and
workspace-temp protections remain mandatory. Run focused story/motion tests and
`verify:story` serially after timeline changes; do not weaken safety to render.

## Phase 4B: recorded audio

Read [story/AUDIO.md](story/AUDIO.md). Use local immutable `public/audio` assets,
Node `validateStoryAudioFiles` before the production launcher, and await
`prepareStoryAudio(engine,timeline)` inside initScene. Pass the result as `audio`
to createStory and commit `<StoryAudio prepared={audio}/>` with the existing
measured caption layout before capture. Never invent another clock or decode
audio per frame. Keep audio metadata, timings and speaker IDs explicit.
Word cues require `timing:'supplied'` with source-file word seconds, or the
explicitly labeled `timing:'estimated'` fallback. Sentence timestamps are not word
alignment; never describe estimates as verified speech synchronization. Supplied
data is structurally validated, not recognized from speech. Preserve pauses,
punctuation, scene-cut continuity and readiness/disposal guards.
Run test:story-audio and verify:story-audio serially. No TTS provider, ASR, forced
alignment or lip-sync is authorized. Phase 4C-A follows below; all production rules above stand.

## Phase 4C-A: Muse one-shot authoring

For new stories, read [authoring/README.md](authoring/README.md), copy
`examples/office-idea.story.json`, and edit JSON plus local assets only. Use
`npm run story -- validate --plan=examples/name.story.json`, then
`npm run story -- render --plan=examples/name.story.json --output=out/name.mp4 --report=out/name.json`.
Do not write a new scene, onFrame callback, composition, camera vector, rig math,
layout coordinates or renderer. The registered AuthoredStory composition delegates
to the existing story/cast/director/audio/caption APIs. Two curated starters only:
office/clinic, two active actors in distinct semantic roles, default body dimensions.
Use documented marks/seats/path/props; unsupported actions/layouts must fail visibly.
The bundled pinned OFL Noto Sans Devanagari font must pass integrity/readiness
before caption measurement; never substitute Windows fonts or estimated speech sync.
Keep the 600-frame per-render budget. Run test:authoring and test:memory serially; optional
--verify=true runs bounded checks inside the one guarded production browser.
All prior memory admission/abort, concurrency 1, software-safe/swangle, temp and
ownership safeguards remain mandatory. Phase 4C-B bounded orchestration follows below; no Phase 5, TTS, ASR or NLP is authorized.

## Phase 4C-B: bounded long stories

Use the same story CLI and global JSON timing; up to 1800 frames at 30fps, scenes
<=600 frames, at most 8 logical scenes (six 300-frame scenes for a minute),
explicit hard scene cuts only. One scene/segment, sequential guarded
rendering; no parallel browsers or lowered certificate/memory limits. Read
`authoring/README.md` before resuming a job. Keep the <=600-frame short path.
Full FFmpeg + ffprobe on PATH is required for guarded stream-copy assembly and
one global audio mix. Never encode/mux independent segment AAC tracks or invent
speech timings. Never edit manifests, bypass fingerprints/locks, overwrite user
assets, delete active recovery data or report an incomplete output as success.
Preserve completed segments on failure. All original Linux admission/abort and
workspace-temp safeguards remain mandatory. Approved Phase 5B corrections follow below.

## Phase 5B: preparation and diagnostics

`story render` must preflight every segment before encoding any video. Use
`npm run story -- prepare --plan=...` for guarded preparation without encoding;
`story validate` only checks static data/files and reports risk warnings, not
camera visibility. Never skip preflight or lower memory/visibility limits to
force a partial render; fix gaze/shot intentions or wait for VM memory recovery.
The existing `chair` slot/contact API is unchanged. These Phase 5B corrections
are approved; no other Phase 5 story features, effects, environments or TTS.

## Phase 5D: displays and continuity

Use layout `displays.board.text` for readable office board content and the existing
objectFocus shot; never hand-build text geometry or change camera math. Read
`authoring/README.md` for font/text bounds. Review `POSTURE_CUT` warnings; preserve
posture across cuts or author deliberate contact cuts. Stand/sit remains instant,
not a stand-up animation. All production/preflight safeguards remain mandatory.
No further story features, effects, environments, TTS or transition system.


## Phase 6A: curated environment registry

Phase 6A permits office/clinic/street selection and bounded prefab placement.
Use authoring/README.md and examples/street-meeting.story.json; select named
slots, finishes, semantic prop/seat/approach/path targets. Never emit geometry,
coordinates, custom shaders or runtime registry mutation in story JSON.
Keep the two-active-actor limit, four-prop limit, guarded whole-story preflight,
software-safe rendering, concurrency 1, memory admission/abort limits, workspace
temp isolation and engine ownership unchanged. Existing audio and story examples
remain unchanged. Stop at Phase 6A; Phase 6B is not authorized.


## Phase 6B: composable custom scenes

Phase 6B authorizes `preset:custom` and bounded structural construction. Read
`authoring/CONSTRUCTION.md`; use kind/prefab, semantic relations, safe generated
anchors and existing cinematic/story APIs. Do not hardcode script-specific
presets, coordinates, shaders, geometry callbacks or imported assets. Review
structured overlap/attachment/path/framing diagnostics rather than bypassing
them. Keep two active actors, four layouts, construction resource limits and
all existing production memory, concurrency, readiness and workspace-temp
safeguards. Structures are static, paths level and straight; decorative doors
are not navigation portals. Stop at Phase 6B; no Phase 6C is authorized.


Phase 6C-A exception: custom layouts can opt into one third static contact role
via composition.thirdActor.at (see authoring/CONSTRUCTION.md). Keep the 28-mesh
three-actor cap and existing 64-proxy budget; never expand curated layout capacity
or change rigs/director/renderer/audio/timelines. Stop after 6C-A, not 6C-B/6D.

Phase 6C-B exception: `groupShot` (exactly three subjects, custom thirdActor layouts)
reuses the existing director, visibility proxies and 64-proxy budget; only that shot
type centers the camera vertically. The third actor stays static; no group
conversation automation, walking lanes, new rigs or renderer changes. Stop after 6C-B, not 6D.

Phase 6D-A exception: custom-layout scenes may declare `propAnimations` (slide to a
named mark, bounded lift, bounded rotate) per authoring/CONSTRUCTION.md. The story
player resets animated props to rest and assigns the absolute frame before cast and
stage evaluation; no new meshes, passes or history. Do not animate structures, use
an animated item's generated anchors, or start Phase 6D-B.

Phase 6D-B exception: scenes may declare `effects` (`impactFlash`, `dustPuff`) at a
layout prop or ground mark, per authoring/README.md. Effect objects are built once,
reset and assigned from the absolute frame after prop animation; transparent unlit
materials, no new passes, shaders, particles or randomness. Stop after 6D-B, not 6E.

Phase 6E-A exception: custom-layout items may declare `object` (named primitive
parts placed with on/beside/centeredOn), per authoring/CONSTRUCTION.md. Build them
only through JSON; no per-object TypeScript, coordinates, imported meshes or
shaders. Objects are static. Stop after 6E-A.

Phase 6E-B exception: freestanding composite objects may be animated as whole
units with existing `propAnimations`. No per-part, hinged or keyframed motion.
Stop after 6E-B.

Phase 7A: portable render jobs. Use `npm run job -- package|verify|run` (see
RENDER_JOBS.md). Packages carry only story JSON, referenced public/audio files and
a checksummed manifest; the worker reuses `story render` and every production
guard. No server, upload, polling or cloud transport. Stop after 7A.

Phase 7B-A: optional private relay (RENDER_JOBS.md). Muse may run only `job
submit`, `job status` and `job fetch`, never `job worker` or a polling loop.
Never print, commit or invent relay credentials. Stop after 7B-A.


## Phase 7D: Local One-Shot Production Workflow

Phase 7D establishes the canonical one-shot production command and step-by-step authoring workflow for local coding agents producing original Hindi/English cartoon animations on a Windows PC.

### The Agent Production Pipeline

```
User Script (Hindi/English)
       │
       ▼
Local Coding Agent authors StoryDocument JSON (examples/name.story.json)
       │
       ▼
npm run produce -- --plan=examples/name.story.json [--output=out/name.mp4]
       │
       ├─► 1. Fast Story Validation (Schema, asset paths, font sha256, slot bounds)
       ├─► 2. Whole-Story Preparation (Preflight bounds, camera visibility, proxy budget)
       ├─► 3. Guarded CPU Rendering (Software-safe SwiftShader, segment caching & resumption)
       ├─► 4. Output Verification (File existence, non-empty bitstream check)
       ├─► 5. Automated QA & Contact Sheet (Decode, black detect, freeze correlation, audio sync)
       └─► 6. Unified Production Report (Metrics, issues, review guidance)
       │
       ▼
Agent inspects Contact Sheet (out/name-contact-sheet.png) & Delivers MP4
```

### Step-by-Step Agent Authoring Guide

When given a natural-language script, the coding agent creates a structured `StoryDocument` JSON without writing raw 3D engine code:

1. **Characters & Appearance:**
   - Define actors in `story.characters` using supported appearance presets (`doctor`, `patient`, `office`, `casual`). Note: `hoodie` and `jacket` are clothing style options (`clothing.style`), and `glasses` is an accessory option (`accessories`), not appearance presets.
   - Set starting emotional expression (`neutral`, `happy`, `worried`, `surprised`, `focused`).
2. **Environment & Layout Construction:**
   - Choose a curated preset (`office`, `clinic`, `street`) or construct a custom environment with `preset: "custom"`.
   - Place ground, backdrops, and props using semantic relations (`relation: "near" | "alongBoundary" | "attachedTo"`).
   - Build composite props via `object` with named primitive parts (`antenna`, `dome`, `base`).
3. **Staging & Stances:**
   - Staging anchors: `at: "entry" | "left" | "right" | "center"` for standing; `seat: "chair" | "table"` for seated.
   - Maintain actor axis in `scene.axis` across scene cuts.
4. **Cinematic Camera Shots:**
   - Choose from supported shot types: `establishing`, `twoShot`, `medium`, `closeUp`, `objectFocus`, `groupShot`.
   - Keep subjects visible: do not turn actors fully away during `twoShot` or `groupShot` without cutting to close-up or objectFocus.
5. **Character Acting & Beats:**
   - Use declarative actions: `walk` (along paths), `look` (target actor or prop), `point` (hand target), `gesture` (`nod`, `explain`, `shrug`, `wave`, `worried`), `react` (`surprised`, `excited`).
6. **Captions & Audio Narration:**
   - Dialogue cues: `kind: "dialogue"`, `language: "hi" | "en"`, `mode: "words" | "line"`.
   - Place referenced audio clips in `public/audio/...` and declare them in `story.audio.assets`.
7. **Fast Early Validation:**
   - Run `npm run story -- validate --plan=examples/name.story.json` before rendering. Fix schema or asset errors immediately.
8. **One-Command Production:**
   - Run `npm run produce -- --plan=examples/name.story.json --output=out/name.mp4`.
9. **QA Interpretation & Inspection Guidance:**
   - **Technical Integrity (Automated):** Objectively verified by software decoders. Bitstream is clean, audio duration matches video within ±0.5s, frame count is exact, no unexpected black screens or render stalls.
   - **Story Pacing & Continuity (Automated):** Shot lengths, scene cut contiguity, and caption timing boundaries match plan.
   - **Artistic & Visual Quality (Requires Agent/Human Review):** Automated QA does NOT certify artistic appeal. Inspect `out/name-contact-sheet.png` (4x4 labeled grid) to check character framing, gesture clarity, and silhouette readability before delivering.
10. **Delivery:**
    - Deliver the final MP4 and point to the production report and contact sheet.
