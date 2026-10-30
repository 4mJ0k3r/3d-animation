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
