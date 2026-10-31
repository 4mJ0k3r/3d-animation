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
- Character/clinic refactoring belongs to later phases.

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
- Head direction/residual gaze is exposed for faces. Blue arrows in the Stage 2C fixture are diagnostic gizmos only; omit them in beauty previews. Hair, clothing, walking, interpolation/blending and legacy clinic migration remain outside the approved scope.
- All Phase 1 CPU production, ownership, memory admission, concurrency and temp-isolation rules above remain mandatory and unchanged.

## Stage 2D-A faces

- Read characters/FACES.md. Use declarative expression/blink/eyeGaze inputs; never paint scene-specific canvases, edit UVs, add face boxes or duplicate head joints. Casts enable faces; raw factory rigs opt in with face:{}.
- Resolve complete current-frame inputs through cast.evaluate. Omitted expression returns to its configured default; omitted blink uses absolute-time actor timing. Keep Stage 2C head/pointing/contact behavior. Invalid facial data must fail capture before any actor is applied.
- Mutable facial textures are private per character. Preserve staging-before-publication, no-upload caching, engine ownership and transparent-cutout/depth policies. Never allocate facial geometry/materials per frame or add postprocessing for faces.
- Run verify:faces and all earlier regressions serially; test:memory launches simulated jobs and must not overlap production renders. Keep source fixtures, not generated videos/logs. Stop before hair/clothing/appearance presets, audio lip-sync, walking, blending, camera automation and legacy clinic migration.
