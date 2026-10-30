# Phase 1.3 — final Muse validation

The six Phase 1.1 fixes and Linux 300-frame software-fixture certification were reported as passing by Muse. This pass migrates the original clinic and adds host-memory pressure handling; it does not redo renderer architecture or start Phase 2.

## Changes

- `src/DoctorClinicScene.tsx`: explicitly select software-safe; remove mandatory 2x supersampling and Bokeh overrides. Keep all rigs, placement, room, palette, lighting, outline settings, captions and camera code unchanged.
- `scripts/linux-memory.cjs`: strict MemAvailable parsing, Linux pre-render admission, consecutive low-memory/unavailable-telemetry counters. No production fake-memory input or job override.
- `scripts/render-policy.cjs`, `scripts/render-policy.d.cts`: add configurable 2.5 GiB admission threshold, 1 GiB abort threshold, three consecutive low readings, two consecutive unreadable readings. All existing budgets remain unchanged.
- `scripts/render.cjs`: refuse before spawning a worker when Linux memory is insufficient; persist a rejection report; share the guard with monitoring; surface controlled-abort reasons.
- `scripts/render-monitor.cjs`: sample MemAvailable before process/disk work, preserve minimum observed availability and counters, abort the owned process tree on confirmed pressure, and explicitly label absent cgroup telemetry. Missing cgroup numbers are null, never converted from null to zero.
- `scripts/tests/memory.test.cjs`, `scripts/tests/memory-process.cjs`: parser/policy tests and isolated launcher admission/abort integration tests. A harmless Node process and descendant replace the render worker during fault injection; production termination and ownership cleanup execute normally.
- `package.json`: add `npm run test:memory`.
- `src/toon-kit-tests/clinic.tsx`: a small 300-frame composition wrapping the original DoctorClinicScene. The ordinary Root remains 150 frames. For frames 150–299, original time-based animation continues, the existing dolly remains clamped and existing captions have ended; no new scene action is invented.
- `src/toon-kit/AGENT_INSTRUCTIONS.md`: mandatory pressure policy and retained fixture contracts.
- `docs/PHASE1_3.md`: this handoff. Generated videos, previews, test reports and scratch remain ignored.

Muse's untracked representative file was not accessible in this checkout. Equivalent coverage is retained through the tracked `software.tsx` warm-room/character/prop fixture, `audit.tsx` deterministic/outline/alpha/readiness/disposal fixtures, and the original-clinic wrapper. No claim of an exact copy of the unavailable file is made.

## Safety behavior

Linux admission reads `/proc/meminfo` immediately before render setup. Below 2.5 GiB MemAvailable, it writes a report with `launched:false` and a clear refusal reason. It does not open Chrome, create a job lock, or allocate renderer targets. Missing/malformed MemAvailable fails closed.

During a render, the existing monitor polls at a nominal one-second interval. It aborts after three consecutive readings below 1 GiB; a healthy sample resets the streak. Two consecutive failed reads also abort. Monitoring does not require cgroups. Reports retain `cgroup:null`, `cgroupTelemetry:"unavailable"` and `peakCgroupBytes:null` when unavailable, while MemAvailable/process telemetry continues.

The existing termination path stops the owned worker process tree, verifies/removes owned scratch, and releases the job lock. Tests confirm worker and descendant shutdown and scratch/lock removal. No user assets or other jobs' scratch are removed. Existing 5.5 GiB RSS/cgroup, 8 GiB scratch, 440 MiB `/tmp`, single-worker and sequential encoding limits have not been relaxed.

Polling and process termination cannot guarantee survival of a sudden virtio balloon reclaim. MemAvailable can drop between admission and launch or between samples. Cgroup interfaces on Muse are known to be unavailable; no cgroup results are fabricated. Windows native MemAvailable testing is not possible; local integration tests inject Linux-shaped readings in an isolated test subprocess, not into the production CLI/API.

## Local verification

- Typecheck: PASS.
- Memory tests: seven tests cover parsing, equality/below admission thresholds, missing telemetry, noise/reset/consecutive readings, non-Linux unavailability, no-launch rejection, and controlled-abort process-tree/temp cleanup. No real memory exhaustion is induced.
- Original clinic: 30-frame software-only H.264 renders PASS at 720x1280 and 1080x1920; renderer identity is SwiftShader via swangle and native-resolution targets remain within budget. Local capture intervals were about 388/449 ms median/p95 at 720p and 717/782 ms at 1080p on the Windows host. These are not Muse throughput measurements.
- The 720p visual preview was reviewed: original colors, room, outline style, captions and camera composition are retained; native-resolution edge smoothing is the expected compromise. Existing limb/attachment gaps and right-edge cropping remain visible. They are pre-existing art/rig/framing limitations, not hidden fixes or a Phase 2 rewrite.
- Full renderer audit: see the current local JSON results under ignored `out/phase1.1-audit` and environment report `out/phase1.3/audit.json`. The regression command remains executable from source.
- Linux live admission/balloon response and this clinic's 300-frame VM run remain for Muse. Prior Muse 300-frame certification concerned the representative scene, not this migrated clinic.

An initial fault-injection test harness accidentally intercepted the kill helper and timed out; the harness was restricted to replacing only the intended render worker, its owned stale test data was quarantined outside active scratch, and the admission/abort tests then passed. No safety threshold was lowered and no production OOM was induced.

## Muse commands

Run sequentially from the repository root after pulling this commit. A memory refusal means wait for VM memory recovery; do not override the policy.

```bash
npm run typecheck
npm run test:memory
npm run audit:phase1 -- --report=out/phase1.3/muse-audit.json

# Original production composition, 720p, 30 frames.
npm run render:production -- --entry=src/index.ts --composition=DoctorClinicAnimation --width=720 --height=1280 --frames=30 --output=out/phase1.3/clinic-720.mp4 --report=out/phase1.3/clinic-720.json

# Original production composition, 1080p, 30 frames.
npm run render:production -- --entry=src/index.ts --composition=DoctorClinicAnimation --width=1080 --height=1920 --frames=30 --output=out/phase1.3/clinic-1080.mp4 --report=out/phase1.3/clinic-1080.json

# Same original scene via the duration-only certification wrapper, 300 frames.
npm run render:production -- --entry=src/toon-kit-tests/clinic.tsx --composition=DoctorClinicAnimation --width=1080 --height=1920 --frames=300 --output=out/phase1.3/clinic-1080-300.mp4 --report=out/phase1.3/clinic-1080-300.json
```

`npm run test:memory` deterministically exercises low-memory rejection and controlled abort without allocating GiBs or asking Muse to induce host pressure. It verifies a report with no worker launch for admission failure, then a pressure-confirmed abort with no surviving dummy worker/descendant, scratch directory or active lock. Native telemetry is tested by the normal render commands; inspect `admission`, `stats.minimumAvailableMemoryBytes`, `stats.samples[].memory`, `stats.cgroupTelemetry`, `stats.limitExceeded`, temp errors and renderer identity. When cgroups are unavailable, null is expected and does not fail a render by itself.

## Freeze gate

Prepared for Muse's final validation, not a claim of immunity to balloon OOM. Freeze the Phase 1 renderer only after the migrated clinic's 300-frame VM run and native admission/abort telemetry review. No outstanding local code-test safety failure is accepted for freeze. Phase 2 has not begun.
