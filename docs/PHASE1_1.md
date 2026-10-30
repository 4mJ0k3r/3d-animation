# Phase 1.1 — verification and Muse handoff

**NOT SAFE TO FREEZE for the production VM yet.** The six defects pass local SwiftShader regression tests. The Linux VM, its 2-vCPU quota, 7.7 GB RAM, no swap, and 512 MB `/tmp` are not accessible from this session. No Phase 2 work was performed. Character and clinic source files remain untouched.

## Changed files (exact source manifest)

- `.gitignore`: exclude dependencies, private render scratch and generated output.
- `package.json`, `package-lock.json`: pin installed direct dependency versions and add safe render/audit/benchmark commands.
- `remotion.config.ts`: software backend, concurrency 1, 120s readiness, sequential encoding, no hardware encoding, 32 MiB offthread cache, disabled bundle cache, two FFmpeg encoding threads.
- `scripts/render-policy.cjs`, `scripts/render-policy.d.cts`: centralized launch budgets and TypeScript declaration.
- `scripts/render.cjs`: CLI/programmatic bootstrap, private absolute workspace temp environment, exclusive job lock, safe ownership-checked cleanup and process cleanup.
- `scripts/render-worker.cjs`: one browser per API job, explicit API safety options independent of remotion.config.ts, CLI flag enforcement, software renderer identity checks, actual video rendering and benchmark logging.
- `scripts/render-monitor.cjs`: sampled process-tree RSS, cgroup v2 memory, system `/tmp` and private workspace scratch; conservative abort budgets and Linux child temp environment evidence.
- `src/toon-kit/quality.ts`: immutable software-safe/balanced/high profiles.
- `src/toon-kit/engine.ts`: readiness generations, AbortSignal, bounded targets, optional effects, fused ink/grade, prompt disposal and late scene-addition cleanup; renderer identity logging.
- `src/toon-kit/ThreeCanvas.tsx`: baseline reset, requested-frame state before framing, deterministic static/dynamic shots, cancellation-aware waits, synchronous unmount cleanup, once-only capture handle completion and session error reporting.
- `src/toon-kit/camera.ts`: history-independent default direction/far-plane computation; explicit minimumFar preserves a background envelope.
- `src/toon-kit/lib.ts`: inherited policies, moderate primitive defaults, profile shadow maps and optional engine-owned primitive pooling.
- `src/toon-kit/index.ts`: export quality profiles.
- `src/toon-kit/internal/frame-state.ts`: scene/camera baseline transform restoration.
- `src/toon-kit/internal/readiness.ts`: generation-based asset barrier with abort support and failure propagation.
- `src/toon-kit/internal/postprocessing.ts`: none masking, alpha-test/map/alphaMap/opacity preservation, mask-program refresh, shared AO/Bokeh depth, reduced sampling and fused grade.
- `src/toon-kit/AGENT_INSTRUCTIONS.md`: mandatory CPU production and ownership/cancellation rules.
- `src/toon-kit-tests/audit.tsx`, `src/toon-kit-tests/run-audit.cjs`: expand regression coverage; require real SwiftShader; propagate failed audit exit status; portable font fixture.
- `src/toon-kit-tests/phase1.tsx`: explicitly request high quality for the existing 2x fixture.
- `src/toon-kit-tests/software.tsx`: isolated software-rendered video fixture and per-frame timing.
- `docs/PHASE1_1.md`: this evidence and handoff.

Root compatibility re-exports remain unchanged. No duplicate renderer implementation was introduced.

## Original defects

| Defect | Local result | Fix/evidence |
|---|---|---|
| Automatic framing | PASS | Restore baseline transforms and camera projection; apply/await onFrame; prepare assets; update world matrices; frame current transforms using a fixed shot direction; update camera; render. Actual bridge requests 0→80→20→80→0 repeat exactly across two fresh engines, for both static and dynamic modes. |
| Readiness race | PASS | Drain registered promises and repeat font/image/compile preparation until the generation stabilizes. New registrations after readiness reopen the barrier; renderFrame rejects until prepare runs again. Rejections are observed immediately and propagated. |
| Pending-loader disposal | PASS | Abort waits and dispose immediately on unmount. The unresolved-loader fixture observes one disposal and a lost context. Cancellable I/O must use engine.signal; external callbacks must honor cancellation. |
| Policy inheritance | PASS | Omitted primitive policies stay unset; nested parent policies and explicit child overrides are tested. |
| none intersections | PASS | Both-none sample pairs exit before depth/normal edges. No global threshold workaround. |
| Alpha cutouts | PASS | Preserve map/alphaMap, alphaTest, opacity, UV transforms, side and shader variants. Transparent facial decals remain excluded from the solid buffer. AO and optional Bokeh use the same alpha-aware depth/normal data. Late mask assignment is tested. |

Additional tests cover neutral sRGB conversion, same-renderer portrait/landscape/portrait resizing, fresh-instance PNG hashes, delayed real font/asset loading during React re-renders, required-asset rejection, post-finalization registrations, cancellation, shared primitive ownership, and eight repeated context/resource disposal cycles. Development-only StrictMode effect replay is not claimed from a production bundle.

`npm run typecheck` passes. JSON assertions and PNG samples are in `out/phase1.1-audit`; bridge/lifecycle results are in its browser-log.json. The prior `out/phase1-audit` report is retained as historical failing evidence, not the current status.

## Quality profiles

| Profile | Resolution multiplier | AO / Bokeh defaults | Shadow map | Sphere / radial segments | Outline directions |
|---|---|---|---|---|---|
| software-safe (default) | 1 | off / off, not allocated | 512 | 24 / 16 | 4 |
| balanced | 1 | off / off | 1024 | 32 / 24 | 4 |
| high | 2 | 0.12 / subtle | 2048 | 36 / 24 | 8 |

Software/balanced targets are limited to 2.1 million pixels; high to 8.4 million. Maximum target dimension is 8192. Default pipeline: normal/depth prepass, actor policy prepass, beauty, fused ink/grade, sRGB output. The composer uses unsigned-byte color targets. Optional AO/Bokeh are constructed only when enabled. The engine-owned primitive factory avoids cross-engine/global resource caches.

Remaining compromises: native-resolution edges have less subpixel smoothing than 2x; 512px shadows are softer/coarser; no AO contact shading or cinematic blur by default; 8-bit color intermediates have less grading headroom; four outline sample directions replace eight. Warm high-key illumination, actual stepped cel ramps, silhouette policies and sRGB conversion remain.

API compatibility notes: public primitive names and root exports remain. `gradePass` now aliases outlinePass; GTAO/Bokeh getters throw when disabled instead of allocating expensive effects just for inspection. Supply a fixed Box3 motion envelope with autoFrame='static' to avoid shot breathing; true/'dynamic' follows current bounds. Explicit camera changes in onFrame win. Framing helper defaults no longer inherit prior camera direction/far expansion.

## Measured local software rendering

Host: Windows, Node 24.14.1, 16 logical CPUs, about 15.7 GiB RAM. This is **not** the Muse VM, and no 2-vCPU throughput extrapolation is claimed. Real H.264 MP4 renders used one Remotion worker and sequential encoding. The WebGL string was:

`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`

Both backend flags were tried. `swangle` produced verified SwiftShader. The installed Chrome's `swiftshader` flag fell back to Microsoft Basic Render Driver / D3D11 WARP; it was rejected rather than counted as a SwiftShader benchmark. Therefore swangle is selected locally; the fastest compatible Linux backend remains unverified.

The timings below are steady-state **capture completion intervals**, including screenshot overhead, not just the JavaScript WebGL submission timer. The first two frames are excluded from quantiles. Totals include scene startup and final encoding. These are short-run measurements, not capacity guarantees.

| Resolution | Variant | Frames | Median ms/frame | p95 ms/frame | Total seconds |
|---|---|---|---|---|---|
| 720x1280 | software-safe + base | 12 | 223.8 | 238.0 | 3.67 |
| 720x1280 | software-safe + ao | 12 | 1031.2 | 1066.9 | 13.35 |
| 720x1280 | software-safe + bokeh | 12 | 361.8 | 379.0 | 5.37 |
| 720x1280 | software-safe + no-shadows | 12 | 173.8 | 194.0 | 3.05 |
| 1080x1920 | software-safe | 24 | 430.0 | 450.8 | 11.55 |

AO alone is substantially more expensive than base; Bokeh also adds measurable cost. Both remain disabled in software-safe. Keeping low-resolution shadows costs less and preserves visual grounding.

| Job | Sampled peak process-tree RSS MiB | Sampled peak private workspace temp MiB |
|---|---|---|
| 720 effect benchmark | 945.5 | 46.0 |
| 1080 video | 1043.8 | 46.6 |
| CLI video | 1240.6 | 45.9 |

Process RSS sums can double-count shared pages. One-second polling can miss short allocation spikes. Windows has no Linux cgroup or `/tmp`, so those two measurements are **NOT TESTED**, not zero. The monitor captures cgroup v2 values, `/tmp` bytes and read errors when run on Linux. Historical cgroup memory.peak is not exclusively attributable to this job. No long-duration soak, exact VM Node 24.22.1 test, cross-platform PNG bitwise equality, or zero-OOM claim is made.

Versions actually used: Remotion/renderer/bundler 4.0.539, Three 0.187.0, React 19.3.1, TypeScript 7.0.2; exact direct dependencies are pinned and package-lock contains Linux native compositor packages. The local render used Remotion's bundled FFmpeg n7.1, **not** the host/Muse PATH FFmpeg 8.1.2. The worker reports its actual executable/version. Python is not part of the production render path.

## Temporary storage and cleanup evidence

Launcher sets TMPDIR, TMP and TEMP to `<absolute project>/.remotion-tmp/<UUID>` before spawning the worker. The worker checks os.tmpdir() against that exact path before importing Remotion. Programmatic and CLI jobs use this same bootstrap.

Observed Node scratch, Chromium `--user-data-dir` and FFmpeg frame/stitch paths are stored in `out/phase1.1/video-1080.json` and `cli-720.json`. For example, FFmpeg's `-i` uses `.remotion-tmp/<UUID>/react-motion-render.../element-...jpeg`, and its intermediate output also stays in that UUID directory. Chromium's 256 MiB disk cache is the installed Remotion launch default inside the private profile, not an invented Config API. Remotion's source uses os.tmpdir() to create profiles and disables /dev/shm usage. On Linux the monitor additionally reads only the TMPDIR/TMP/TEMP keys from descendants' /proc environments; direct child environment introspection on Windows is NOT TESTED.

No unsupported profile/cache configuration method or magic Remotion temp environment variable was used. Completed jobs left `.remotion-tmp` empty. Cleanup checks UUID ownership, canonical path and containment, and never recursively deletes the parent directory. Active.lock rejects overlapping production jobs; failed-job browser cleanup matches the live profile command line, not a stale PID. A SIGKILL/power loss can leave a stale lock or scratch; operator inspection is intentionally required rather than deleting potentially active data.

Budgets: one worker, 1536 MiB Node heap, 32 MiB media caches, two FFmpeg encoding threads, sequential render/encode, conservative abort above 5.5 GiB sampled process/cgroup usage, 8 GiB private scratch, or 440 MiB total system `/tmp`; require 12 GiB free workspace storage. These are monitoring/preflight limits, not hard OS reservations or proof of no OOM.

## Commands for Muse

Run from the project root. For initial dependency installation, also keep npm's temporary files on workspace storage:

```bash
mkdir -p "$PWD/.remotion-tmp"
TMPDIR="$PWD/.remotion-tmp" TMP="$PWD/.remotion-tmp" TEMP="$PWD/.remotion-tmp" npm ci
npm run typecheck
npm run audit:phase1 -- --report=out/muse/audit-environment.json
npm run benchmark:software -- --backend=swangle --frames=24 --report=out/muse/swangle.json
npm run benchmark:software -- --backend=swiftshader --frames=24 --report=out/muse/swiftshader.json
npm run render:production -- --width=720 --height=1280 --frames=30 --report=out/muse/video-720.json
npm run render:production -- --width=1080 --height=1920 --frames=30 --report=out/muse/video-1080.json
npm run render:cli -- --frames=12 --report=out/muse/cli.json
```

Run these sequentially. A backend rejection is evidence of incompatibility, not permission to disable verification. Check every report's limitExceeded/failure, renderer identity, cgroup, `/tmp`, workspace bytes and unreadable-path errors. Increase duration gradually only with conservative RAM/disk headroom; do not infer a zero-OOM guarantee from 30 frames.

Default commands render the isolated `SoftwarePortrait` fixture. For a compatible production scene pass `--entry=src/index.ts --composition=YourComposition --output=out/movie.mp4`. The existing clinic still explicitly requests 2x and Bokeh; its unsafe 1080p request now fails the software profile's target budget. Do not override the budget to force it through. Migrate those scene options deliberately when the clinic is next authorized for changes. No clinic/rigger migration is claimed here.

Programmatic callers (no implicit config application):

```js
const {runProductionRender} = require('./scripts/render.cjs');
await runProductionRender({
  entry: 'src/toon-kit-tests/software.tsx', composition: 'SoftwarePortrait',
  quality: 'software-safe', backend: 'swangle', width: 720, height: 1280,
  frames: 30, output: 'out/movie.mp4', report: 'out/render-report.json'
});
```

The API launches a fresh safe worker rather than mutating the calling agent's environment. The CLI worker explicitly supplies --concurrency=1, --gl, timeout, cache budgets, disabled hardware/parallel encoding; remotion.config.ts also sets concurrency 1. Raw Remotion APIs/CLI can bypass the launcher, so AGENT_INSTRUCTIONS explicitly prohibits that production bypass. No unsupported claim that configuration files automatically govern raw programmatic APIs is made.

## Freeze recommendation

**NOT SAFE TO FREEZE for Muse production.** Local software tests fix the six defects and validate both launch routes. Remaining gates are Linux/Muse backend comparison, actual 2-vCPU and cgroup memory behavior, `/tmp` enforcement/evidence, and a longer representative-content soak. The unchanged clinic's explicit expensive render options also need a deliberate migration before that scene is a production target. Phase 2 remains untouched.
