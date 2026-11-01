# Toon-Kit project handoff

Read this first, then inspect the checkout and the linked canonical guides.
This handoff is documentation only; it does not authorize the next feature stage.
No previous chat, Codex account or shared memory server is required.

## A. Ultimate project goal

Toon-Kit is a deterministic Three.js + Remotion cartoon-animation engine. The
long-term goal is for weaker coding agents, including Muse Spark 1.3, to turn
Hindi/English scripts into original 2.5D cartoon videos through declarative JSON
and semantic APIs, without hand-authoring geometry, joint or camera mathematics.
The target is clean cel shading and black outlines, expressive round-headed
characters, cinematic staging and synchronized dialogue/captions.

The reusable SDK is the product. Clinic/office/school films are validation
fixtures. Arbitrary natural-language interpretation, unrestricted world creation
and consistently studio-quality output are **not completed capabilities**.
An external coding agent currently translates a script into a bounded structured
plan; the engine validates and evaluates that plan.

## B. Implemented architecture and validation status

| Stage | Current implementation |
| --- | --- |
| Phase 1 | Software-safe deterministic renderer, depth/normal outline policies, primitive pooling, color handling, readiness barrier, Remotion bridge, disposal and guarded production launchers. |
| Phase 2 | One universal rigid-part rig, complete poses, analytic IK/contact solving, semantic multi-character cast, expressions/gaze, hair/clothing presets, level walking and deterministic acting. Legacy rigs remain for regression/reference. |
| Phase 3 | Semantic staging and subjects, existing shot presets, bounded proxy visibility/caption-safe selection, deterministic cuts, pushIn/pan/move. |
| Phase 4 | StoryPlan compiler/player, local narration/dialogue and word alignment, JSON authoring, sequential scene-cut orchestration up to 60 seconds at 30fps with resumable segments. |
| Phase 5 | Independent Muse-authored Hindi story; whole-story preflight, actionable gaze/framing diagnostics, board text and POSTURE_CUT warnings; real supplied dialogue MP3s integrated in the 28-second v3 story. Recordings were identified by the owner as ElevenLabs output: this is local-file integration, **not an ElevenLabs API/TTS integration**. |
| Phase 6A | Immutable environment/prefab registries; office/clinic/street, named slots, finishes, semantic props and bounded table attachments. |
| Phase 6B | JSON-only custom construction from reusable structures/prefabs, semantic relationships, conservative overlaps, derived safe marks/paths and resource caps. School/garden are JSON examples, not hardcoded presets. |
| Phase 6C-A | Opt-in third static contact role in custom layouts, including standing and selected seating. Existing cast/director reused; visibility budget unchanged. |

Evidence is incremental, not a claim that every historical suite was rerun on
HEAD. Phase 6B recorded 83 authoring tests, 7 memory tests and 46 browser assertions.
Latest 6C-A ran typecheck, 12 focused authoring/cast/compatibility tests and 19
SwiftShader assertions, including shuffled-frame/fresh-engine equality and
cleanup. Only 24 diagnostic video frames plus one all-three-actors still were
captured, at 720x1280. Local sampled peak RSS was about 1052MiB and worker scratch
49.5MiB. Logs/media are local ignored artifacts, not checked-in certificates.

These recent validations ran on **Windows software SwiftShader**, not the Linux
production VM. Earlier owner/Muse reports certified Phase 1.1 software rendering,
including 720p/1080p 300-frame runs; final migrated-clinic/current-branch Linux
certification remains incomplete, with host memory ballooning a known blocker.
Do not treat historical reports or Windows results as Linux certification.
Historical reports in [docs](docs) describe their own commits, not necessarily
current limits. Current code and newer scope notes take precedence.

## C. Source map (paths verified in this checkout)

| Area | Actual entry points / modules |
| --- | --- |
| Composition and exports | [src/Root.tsx](src/Root.tsx), [src/index.ts](src/index.ts), [src/toon-kit/index.ts](src/toon-kit/index.ts) |
| Renderer/bridge/geometry | [engine.ts](src/toon-kit/engine.ts), [ThreeCanvas.tsx](src/toon-kit/ThreeCanvas.tsx), [quality.ts](src/toon-kit/quality.ts), [lib.ts](src/toon-kit/lib.ts), [camera.ts](src/toon-kit/camera.ts) |
| Ownership/readiness/outline passes | [internal/resources.ts](src/toon-kit/internal/resources.ts), [readiness.ts](src/toon-kit/internal/readiness.ts), [policy.ts](src/toon-kit/internal/policy.ts), [postprocessing.ts](src/toon-kit/internal/postprocessing.ts) |
| Universal rig and contacts | [characters/rig.ts](src/toon-kit/characters/rig.ts), [proportions.ts](src/toon-kit/characters/proportions.ts), [pose.ts](src/toon-kit/characters/pose.ts), [ik.ts](src/toon-kit/characters/ik.ts), [constraints.ts](src/toon-kit/characters/constraints.ts), [semantic-targets.ts](src/toon-kit/characters/semantic-targets.ts), [cast.ts](src/toon-kit/characters/cast.ts) |
| Faces/appearance/motion | [face.ts](src/toon-kit/characters/face.ts), [face-view.ts](src/toon-kit/characters/face-view.ts), [gaze.ts](src/toon-kit/characters/gaze.ts), [appearance.ts](src/toon-kit/characters/appearance.ts), [walking.ts](src/toon-kit/characters/walking.ts), [walk-path.ts](src/toon-kit/characters/walk-path.ts), [acting.ts](src/toon-kit/characters/acting.ts), [acting-solver.ts](src/toon-kit/characters/acting-solver.ts) |
| Cinematic staging/director | [staging/stage.ts](src/toon-kit/staging/stage.ts), [direction/director.ts](src/toon-kit/direction/director.ts), [composition.ts](src/toon-kit/direction/composition.ts), [visibility.ts](src/toon-kit/direction/visibility.ts), [proxies.ts](src/toon-kit/direction/proxies.ts), [motion.ts](src/toon-kit/direction/motion.ts) |
| Story and audio | [story/types.ts](src/toon-kit/story/types.ts), [compiler.ts](src/toon-kit/story/compiler.ts), [player.ts](src/toon-kit/story/player.ts), [audio-compiler.ts](src/toon-kit/story/audio-compiler.ts), [audio-assets.ts](src/toon-kit/story/audio-assets.ts), [audio.tsx](src/toon-kit/story/audio.tsx) |
| Captions | [caption-layout.ts](src/toon-kit/caption-layout.ts), [captions.tsx](src/toon-kit/captions.tsx), [caption-style.ts](src/toon-kit/caption-style.ts) |
| JSON validation/composition | [authoring/document.ts](src/toon-kit/authoring/document.ts), [view.tsx](src/toon-kit/authoring/view.tsx), [diagnostics.ts](src/toon-kit/authoring/diagnostics.ts), [segments.ts](src/toon-kit/authoring/segments.ts) |
| Environments/props/assembly | [environment-registry.ts](src/toon-kit/authoring/environment-registry.ts), [starters.ts](src/toon-kit/authoring/starters.ts), [environment-builders.ts](src/toon-kit/authoring/environment-builders.ts), [prefabs.ts](src/toon-kit/authoring/prefabs.ts), [construction.ts](src/toon-kit/authoring/construction.ts), [construction-builder.ts](src/toon-kit/authoring/construction-builder.ts) |
| Production execution | [scripts/story.cjs](scripts/story.cjs), [story-worker.cjs](scripts/story-worker.cjs), [story-segments.cjs](scripts/story-segments.cjs), [render.cjs](scripts/render.cjs), [render-worker.cjs](scripts/render-worker.cjs), [render-policy.cjs](scripts/render-policy.cjs), [linux-memory.cjs](scripts/linux-memory.cjs), [render-monitor.cjs](scripts/render-monitor.cjs), [remotion.config.ts](remotion.config.ts) |
| Regression fixtures/tests | [scripts/tests](scripts/tests), [src/toon-kit-tests](src/toon-kit-tests), [authoring/verification.ts](src/toon-kit/authoring/verification.ts), phase-specific scripts/verify-*.cjs |

## D. Public workflow and canonical contracts

Start with [authoring/README.md](src/toon-kit/authoring/README.md),
[CONSTRUCTION.md](src/toon-kit/authoring/CONSTRUCTION.md),
[story/README.md](src/toon-kit/story/README.md) and
[story/AUDIO.md](src/toon-kit/story/AUDIO.md).
Lower-level APIs: [characters](src/toon-kit/characters/README.md),
[semantic cast](src/toon-kit/characters/CAST.md),
[camera director](src/toon-kit/direction/README.md).

Workflow: script -> externally AI-authored JSON -> schema/assets validation ->
guarded whole-story preparation -> sequential render/assembly -> finished MP4.
Declare a StoryDocument with version, video, pinned font, named layouts and story.
The existing StoryPlan supplies FPS/duration, character appearance/expression
presets, scenes, support defaults, timed beats/actions, caption cues and shots.
Scene.setting selects a layout; scene.axis names two active actors defining the
conversation axis even when three actors are active. Frames are absolute,
intervals half-open. Characters use stand/sit/walk/look/point/gesture/expression/
react. Shots use semantic actor/prop IDs; no author camera vectors or joint math.

Curated layouts use named slots. Custom compositions combine structural kinds
and existing prefabs with alongBoundary, beside, behind, inFrontOf, near,
attachedTo and onTopOf. Dimensions/finishes/facing are bounded. Item IDs provide
point/gaze/object-focus subjects; safe item.front/seat.approach marks and clear
level paths are derived. Query environmentCatalog instead of assuming a mark or
path exists. Unknown, blocked or incompatible requests reject; no unsafe fallback.

Default layouts require two active actors. **Only custom layouts** can opt into
three with composition.thirdActor:{"at":"guestSeat.approach"} (or a clear
item.front). It reserves the third role and exposes standing alias third. A
selected seat.approach also assigns that seat to the role. Any actor can occupy
any distinct available role. TwoShot selects exactly two actors; single-subject
shots can target the third. Do not raise budgets to force an impossible shot.

Place supported audio in public/audio; use public-relative src values such as
audio/phase5e/naina_01.mp3, measured duration metadata, asset IDs and frame-based
clips/speakers/trims/volume. Match cues and external word timing through
alignmentId. Word seconds refer to untrimmed source audio. Supplied timestamps
are caller-supplied, **not automatically verified**. Estimated timing must retain
its provenance; the Phase 5F explicit word timestamps are manual estimates.
Use the existing readiness/font/audio preparation, not per-frame decoding.

Examples: [office](examples/office-idea.story.json),
[street](examples/street-meeting.story.json),
[custom school](examples/custom-school.story.json),
[custom garden](examples/custom-garden.story.json),
[three actors](examples/custom-three-actors.story.json),
[long story](examples/long-story.json),
[narrated Hindi v3](examples/phase5e-nikalna-v3.story.json).
The long-story signal is an original non-speech boundary-test signal, not narration.
The pinned Hindi/English font and OFL license live in [public/fonts/noto-devanagari](public/fonts/noto-devanagari).

## E. Hardware and production safety — mandatory

Previous Muse VM: 2 vCPUs, about 7.7GB RAM, zero hardware GPU, zero swap, only
512MB /tmp; workspace storage had ample capacity. Host ballooning can suddenly
reduce available RAM. Current Windows measurements are not VM throughput estimates.

Source of truth: scripts/render-policy.cjs, linux-memory.cjs, render-monitor.cjs
and src/toon-kit/quality.ts. Current settings:

| Policy | Value |
| --- | --- |
| Software backend / quality default | swangle (ANGLE SwiftShader), software-safe; identity checked |
| Worker concurrency / readiness timeout | 1 / 120000ms |
| Parallel encoding / hardware acceleration | disallowed / disabled |
| Node heap / media cache / offthread cache | 1536MiB / 32MiB / 32MiB |
| Process-tree RSS or available cgroup-current budget | 5.5GiB |
| Owned worker temporary budget / monitored system /tmp abort | 8GiB / above 440MiB |
| Linux admission | MemAvailable >=2.5GiB; missing telemetry refuses launch |
| During-render Linux abort | below 1GiB for 3 consecutive samples; missing telemetry for 2 samples also aborts |
| Monitor sampling | 1000ms; sampled, not a hard OOM guarantee |
| Software-safe buffers/shadows | native 1x, no GTAO/Bokeh, 512px shadows, 2100000 buffer-pixel cap |

A discrete GPU is not required. Never silently use hardware WebGL, lower memory
limits, enable heavy effects or add concurrent browsers/encoding jobs to force
completion. Cgroup telemetry can be unavailable; report null/unavailable and use
supported Linux MemAvailable/RSS telemetry. Sudden host reclamation between
samples can still kill the process; wait for memory recovery after rejection.

Always use npm run story or runAuthoredStory from scripts/story.cjs. Lower-level
production jobs use runProductionRender from scripts/render.cjs. These bootstraps
set absolute workspace TMPDIR/TMP/TEMP before importing/launching the render
worker, Chromium or FFmpeg. Remotion's verified installed launch behavior places
profiles under that workspace temp context; inspect actual process commands/env
in reports on a new host. Do not invent unsupported browser cache configuration.
remotion.config.ts alone does not configure programmatic APIs. Do not invoke bare
remotion render or raw renderMedia from a new production entry point.

Owned UUID scratch and locks live in .remotion-tmp. One guarded pipeline owns
the work; preflight browsers close before sequential video workers start. Dispose
engine/cast/director resources and respect engine.signal/readiness cancellation.
No frame may depend on previously requested frames or wall-clock time.

## F. Current limits (check source before changing)

- Structures: floor, wall, panel, window, door, platform, barrier, column, block,
  tree. Prefabs: chair, bench, table, sign, screen, planter. Predefined flat finishes;
  no raw shaders, arbitrary imported meshes or unbounded procedural generation.
- Static assembly; cardinal quarter-turn facing, bounded dimensions/spacing,
  conservative AABBs and at most two attachment levels. Ground footprint 10..20m
  per axis; built geometry height <=6m. Doors/windows are facade inserts, not holes.
- Custom layouts: <=24 items (18 structures/6 prefabs), 40 environment meshes by
  default or 28 with third-role opt-in; 12000 triangles, 24 scene materials,
  6 referenced textures, at most 4 text textures. These exclude character geometry.
- Curated props remain <=4 per layout; <=4 named layouts. Actor proportions/scale
  in JSON authoring remain the supported defaults. Two actors normally; up to
  three only in opt-in custom layouts. No crowd system or third-lane walking.
- Custom-derived paths are straight, level, conservatively cleared. Lower-level
  static walking APIs support bounded multi-waypoint curves; this does **not**
  mean JSON custom assembly supplies routing/pathfinding. Raised platforms are
  decorative supports, not automatically traversable floors. No general physics,
  collision avoidance, navmesh or unrestricted character/prop choreography.
- Stand/sit contact cuts are instantaneous, not animated sit-to-stand transitions.
  Review POSTURE_CUT and off-axis TWO_SHOT_GAZE_RISK warnings; fix intentions or
  acknowledge intentional cuts, never disable actual preparation checks.
- Approximate proxy visibility: 64 proxies, 12 required regions, 9 samples/region,
  at most 6 candidates, 16MiB signature budget. Three actors use 36 character
  proxies; the smaller environment cap preserves headroom. A three-person
  establishing shot plus gesture regions can exceed limits and correctly reject.
- <=600 frames per render segment. Long orchestration <=1800 frames/60s at 30fps,
  <=8 logical scenes, with complete-scene hard cuts. No seamless cross-segment
  actions/camera transitions; no unrestricted long videos. Caption/story budgets
  remain enforced by compiler; do not remove limits for a demo.
- No built-in LLM/NLP, TTS provider, ASR/forced alignment or general speech-driven
  lip-sync. Expressive mouths are not phoneme animation. Timing estimates are not
  word-perfect speech synchronization. Finite floor edges/distant text can remain
  visible; cinematic/visual quality needs independent review, not just test PASS.
- Current-branch Linux production/visual certification is unfinished. The original
  migrated clinic's final VM certification was blocked by balloon-related memory
  availability; no claim of zero OOM risk or complete Linux certification.

## G. Proposed roadmap — not implemented or authorized by this document

1. Phase 6C-B: more flexible multi-character interaction/staging within existing budgets.
2. Phase 6D: reusable animation/effects only where they materially improve story flexibility.
3. Richer scene/prop vocabulary without bespoke TypeScript for each story.
4. Optional speech-driven facial/mouth animation.
5. Independent Muse testing on entirely new scripts and environments.
6. Final production reliability, performance and visual-quality certification.

Treat unrestricted world creation as an incremental goal, not a promised finished
feature. Recommended next task: inspect current code and design a bounded 6C-B
proposal, then obtain an explicit implementation assignment. Do not start it as
part of this documentation handoff.

## H. Verified command names and recovery

Run from the repository root. Commands below were checked against package.json
and script files; **not executed again for this documentation-only task**.
Node 24 is the current project environment (local 24.14.1; previous VM reportedly
24.22.1). Dependencies are lockfile-pinned: Remotion 4.0.539, Three.js 0.187.0,
TypeScript 7.0.2. Install full FFmpeg/ffprobe on PATH for segmented assembly and
inspection; rendering itself uses Remotion's pinned bundled FFmpeg. Restore the
tracked font/audio files before validation. First browser provisioning must also
use the guarded launcher rather than an unguarded production render.

```sh
npm ci
npm run typecheck

# Compile once, then run only the CPU tests relevant to your change.
node node_modules/typescript/bin/tsc -p scripts/tsconfig.characters.json
node --test --test-concurrency=1 scripts/tests/characters.test.cjs scripts/tests/constraints.test.cjs scripts/tests/cast.test.cjs
node --test --test-concurrency=1 --test-name-pattern='three-actor|third role' scripts/tests/authoring.test.cjs
npm run test:motion
npm run test:memory

# Broader authoring gate when warranted (includes stories, audio and segments).
npm run test:authoring
# npm run test:characters is a broad historical suite, NOT the default focused check.

npm run story -- validate --plan=examples/custom-three-actors.story.json
npm run story -- prepare --plan=examples/custom-three-actors.story.json --report=out/phase6ca/preflight.json
npm run story -- render --plan=examples/custom-three-actors.story.json --output=out/phase6ca/three-actors.mp4 --report=out/phase6ca/report.json --verify=true

# General production entry, examples use software-safe policy by default.
npm run story -- render --plan=examples/office-idea.story.json --output=out/new-story.mp4 --report=out/new-story.json
npm run story -- render --plan=examples/long-story.json --output=out/long-story.mp4 --report=out/long-story-report.json
```

Validate checks schema/assets/static risk warnings; it does **not** certify full
visibility. Prepare validates all segments before video encoding. Render runs
whole-story preflight automatically, including resumed jobs. Programmatic callers
use the same runAuthoredStory({command,plan,output,report,verify}) contract.
Use phase-specific verify scripts only when their browser/render costs are needed;
do not run every historical video for a small change.

For interrupted long renders, rerun the **same render command** with unchanged
inputs/output. Recovery lives at out/<name>.mp4.segments/manifest.json, completed
segments and reports, with a separate 512MiB persistent recovery-data budget.
Input plan bytes, source/scripts, lockfile, policy, tools, font/audio hashes and
output configuration must match. Never edit manifests or reuse mismatched pieces.
Use a new output path after input/code/config changes or invalid completed files;
old completed work is preserved. Moving to a different checkout/output location
can invalidate resume. Do not edit source during rendering: integrity checks
reject it. Final output publishes only after complete validation; nonzero failure
is not success and an older successful MP4 may still exist at the output path.

Graceful cancellation cleans owned temporary work and retains completed segments.
After SIGKILL, inspect .remotion-tmp/authoring.lock and active.lock, owner.json,
PID/command and actual process liveness before any operator cleanup. Never remove
a live lock or recursively delete the scratch root, user media or active render
data. Stop/wait if ownership is unclear. Archive/delete completed recovery data
only when no job is active and it is no longer needed.

## I. Development rules for the incoming agent

Read [src/toon-kit/AGENT_INSTRUCTIONS.md](src/toon-kit/AGENT_INSTRUCTIONS.md) and
canonical guides before editing. Latest explicit scope instructions supersede
historical phase stop notes. Preserve working architecture and compatibility;
prioritize reusable SDK behavior, not cosmetic perfection of one fixture.
Do not duplicate renderer, IK/cast, director or story clocks. Never accumulate
frame deltas, velocities or previous poses. Keep changes scoped, use focused
CPU/browser tests, preserve regressions and resource ownership, and avoid redundant
full-length/resolution renders. Never weaken production memory/temp/concurrency
constraints. Commit coherent work with exact test evidence and limitations;
stop at the assigned milestone. Windows PASS is never Linux certification.

## J. Latest repository state and recovery checkpoint

Engine baseline inspected before this documentation change:
**087ad11a82a96ea1f1c6c5d06c89842db8a76619**, branch **main**.
The subsequent handoff commit changes only PROJECT_HANDOFF.md and the README
link. Its own hash cannot be embedded in itself; inspect current checkout HEAD
with git rev-parse HEAD and the handoff commit with git log -1 -- PROJECT_HANDOFF.md.
The annotated checkpoint toon-kit-phase-6ca targets the tested engine baseline,
not the documentation commit.

| Recent commit | Meaning |
| --- | --- |
| 087ad11 | Custom third contact role; latest tested engine baseline |
| 184024f | Composable custom construction |
| b79b51e | Environment/prefab registry |
| 9cffe94 | Real Hindi dialogue integration, Phase 5F |
| 5a895c0 | Display text and posture-cut diagnostics |
| 3a9550b | Whole-story preflight and office seating correction |
| d7247c9 | Bounded long stories and recovery |
| 9efb7d5 | JSON authoring workflow |
| 031105c | Recorded audio/alignment APIs |
| 74eefa0 | Phase 3 cinematic closeout |

At inspection, tracked files were clean; only these owner-local paths were
untracked: assests/audio/ (five original MP3s; spelling is intentional) and
examples/phase5a-nikalna.story.json (older Muse-specific plan). They were neither
modified nor staged for this handoff. After committing the documentation,
these untracked paths are expected to remain; inspect git status rather than
assuming the workspace is completely clean.

GitHub preserves public/audio/phase5e/*.mp3 (canonical byte-identical copies),
other tracked audio fixtures, the licensed font, current narrated-v3 JSON and
new custom scene examples. GitHub does **not** preserve node_modules/, out/ or
.remotion-tmp/ (see .gitignore), nor the untracked originals/older plan above.
Important local outputs include out/phase5e-nikalna-v3.mp4,
out/phase5e-nikalna-v3-narrated.mp4, out/phase6ca/three-actors.mp4 and
out/phase6ca/all-three-0.png. Reports, PNG hashes, contact sheets, benchmark logs
and segment manifests under out/ also require a separate backup if wanted;
new agents must regenerate them if only the Git clone is available. Do not
transfer active scratch directories as if they were validated recovery caches.

Resume: clone/pull main, read this file, inspect git status and the canonical
sources, restore any wanted local-only artifacts, then choose one explicitly
approved next task. Do not infer authorization to implement 6C-B from this roadmap.
