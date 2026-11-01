# Phase 4C-B — bounded long-story orchestration

Verdict: **PASS locally**. Linux VM certification remains external; no Phase 5.

## Authoring and recovery

The existing version-1 JSON envelope and CLI are unchanged. Long plans accept
1800 frames at 30fps and at most eight logical scenes. Each scene must fit 600
frames; six 300-frame scenes are recommended for a minute. Each renderer receives
one scene with the original 600-frame, four-scene and 16 MiB certificate bounds.
Other asset, word, character, layout and production safety budgets remain intact.
Only explicit scene hard cuts are segment boundaries. No mid-shot/action slicing,
seamless cross-segment transitions, extra effects, TTS, ASR or NLP.

```sh
npm run story -- validate --plan=examples/long-story.json
npm run story -- render --plan=examples/long-story.json --output=out/long-story.mp4 --report=out/long-story-report.json
# Resume: repeat exactly the same render command.
npm run typecheck
npm run test:authoring
npm run test:memory
node scripts/verify-long-story.cjs out/long-story.mp4
```

One guarded renderer/browser/worker runs at a time. The authoring reservation
also excludes unrelated guarded jobs between segments and during assembly.
Completed videos and an atomic manifest remain beside the output in
`<output>.segments/`. Plan bytes, source, lockfile, policy, versions, full FFmpeg/
ffprobe binaries, font/license and audio hashes must match for reuse. Hashing
large binaries/videos streams through a 64 KiB buffer. Corrupt/mismatched caches
reject without deleting completed work; use a new output path. Private partial
files are replaceable on retry; unknown nonempty directories are never adopted.
An older successful output can remain after a failed attempt. No partial output
is published as success. SIGKILL/stale locks still require operator inspection.

The global compiler remains the source of truth. Local actions translate their
intervals; the existing cast evaluates with the original absolute clock, including
automatic blinks. Layout placement preserves its canonical global order. Caption
display uses original global word intervals/punch phase; only local framing
reservations are clipped. Audio is absent from independently encoded segments.
Full FFmpeg (with checked filters) stream-copies compatible H264 segments, then
mixes all clips once at 48000 Hz stereo: exactly 1600 samples/frame, deterministic
trim, gain, silence and overlap. AAC is encoded once. Headers/SPS/PPS, color
metadata, frame count and duration are verified. Source audio gets bounded
metadata validation before rendering; final decode/mux failures cannot publish.

## Changed files

- `src/toon-kit/authoring/{document.ts,segments.ts,index.ts}`: bounded global
  validation, pure segment planning and delegation to the original compiler.
- `src/toon-kit/authoring/{view.tsx,starters.ts,verification.ts}`: segment-local
  Remotion bridge, global captions/placement, fresh-engine/browser checks.
- `src/toon-kit/story/{compiler.ts,player.ts}`: data-only bounded orchestration
  compiler; guarded 600-frame player and explicit global cast clock offset.
- `src/Root.tsx`: existing generic composition metadata selects a segment.
- `scripts/{story.cjs,story-worker.cjs,story-segments.cjs}`: guarded CLI/bootstrap,
  manifests, sequential rendering, hashing, compatible stream-copy/audio assembly.
- `scripts/render.cjs`: minimal authoring-owner exclusion check; existing memory,
  renderer, concurrency, encoding and temp policies unchanged.
- `scripts/{test-authoring.cjs,tsconfig.authoring.json,verify-long-story.cjs}` and
  `scripts/tests/story-segments.test.cjs`: focused tests and reproducible signal
  boundary verification.
- `examples/long-story.json`, `public/audio/long-story-signal.wav` and its
  `long-story-signal.LICENSE.txt`: original 27-second “Quiet Radio” office fixture,
  with a continuous original CC0 non-speech test signal (not narration/TTS).
- `src/toon-kit/authoring/README.md`, `src/toon-kit/AGENT_INSTRUCTIONS.md` and this
  report: workflow, limits and production rules.

No frozen renderer internals, character rigs or clinic scenes changed. Generated
media, recovery directories and benchmark logs are ignored and not committed.

## Validation

- Typecheck: PASS. Focused authoring/story/audio tests: **66 PASS**.
- Existing memory admission/controlled-abort tests: **7 PASS** (simulated Linux
  telemetry; not a real ballooning event).
- Actual software-rendering assertions: **51 PASS** across the three complete
  segments, plus **17 PASS** in a 12-frame tail sample of a six-scene 60-second
  plan. Fresh-instance PNG hashes, frame order 0→80→20→80→0, stable residency,
  zero warm GL allocations, disposal, portrait/landscape and clinic checks pass.
- Tests compare complete cast/camera snapshots at the same absolute frames in a
  global timeline and translated segment, including blink/gesture/expression.
- Recovery test simulates failure during the second renderer call, using real
  small H264 artifacts and real FFmpeg assembly. Only the first completed segment
  is reused; changed input/tampered output rejects. Also exercises multiple audio
  clips sharing a source, source trimming, two speaker kinds and cache isolation.
- Full integration: **one** 720×1280/30fps/software-safe render; 3×270 frames;
  final **810 frames / 27.000s** H264 video and **27.000s** AAC stereo audio.
  The same authored Hindi line stays visible across each cut; selected boundary
  images inspected. Audio boundary correlation at 9s/18s: **0 samples shift**,
  relative RMS error 0.384% / 0.351% against the PCM reference (AAC loss).
- Decoding exposes 384 codec padding samples after the presentation endpoint;
  MP4 presentation duration stays exactly 27s. This is not a join gap or duplicated
  timeline content. Speech synchronization is not claimed for the non-speech
  fixture; supplied Hindi word timestamps spanning a cut are tested separately.
- Actual segment SPS/PPS and color metadata match under the final strengthened
  stream-compatibility check. The 60s logical-scene extension, streaming hash and
  probe hardening use focused final tests; no redundant full video rerender.

## Measurements and evidence

Windows host: Node 24.14.1; Remotion 4.0.539; renderer bundled FFmpeg n7.1;
assembly FFmpeg/ffprobe **8.1.2**; software backend **swangle**, ANGLE Vulkan
SwiftShader/Subzero verified; concurrency **1**. No hardware GPU rendering.

| Segment | Capture median / p95 ms | Sampled worker-tree peak RSS MiB | Private scratch peak MiB |
|---|---:|---:|---:|
| 0 | 221.8 / 258.3 | 769.2 | 59.1 |
| 1 | 232.5 / 320.8 | 1326.6 | 59.1 |
| 2 | 218.5 / 247.0 | 1276.5 | 59.6 |

End-to-end wall time **292.84s**, including optional diagnostic contexts and all
launches/assembly. Persistent recovery/assembly peak **3.90 MiB**, retained after
cleanup **1.42 MiB**, final MP4 **1,463,958 bytes**. Persistent artifacts have a
separate conservative 512 MiB cap with monitoring; the original private scratch
limit is unchanged. Stable warm residency: 19 geometries / 21 textures.

RSS is sampled at 1s and includes the render-worker process tree, **excluding
ancestor CLI/bootstrap processes**. Scratch figures exclude compiler bootstrap
and persistent artifacts. They are not whole-job/cgroup peaks. Linux MemAvailable,
cgroup and `/tmp` measurements are **unavailable on this Windows host**. Windows
host CPU performance is not a 2-vCPU VM certification. The original 2.5 GiB
admission, 1 GiB/three-sample abort and workspace-temp policies remain unchanged;
no safeguard guarantees survival of sudden host memory reclamation.

Local evidence (not committed): `out/phase4cb/long-story.mp4`,
`production-report.json`, `measurements.json`, `audio-boundaries.json`,
`minute-tail-report.json`, `boundary-1.png` through `boundary-4.png`; logs:
`out/phase4cb-{tests,memory,render,minute-sample,final-segment-tests}.log`.
Compiler/browser/FFmpeg child temps use absolute workspace `.remotion-tmp`
paths. Owned scratch and locks were cleaned after completion.

## Remaining limits

- Scene cuts only; add a meaningful cut when a scene cannot meet unchanged
  certificate or per-render frame limits. A complex 600-frame scene can still
  reject; limits are never relaxed automatically.
- Default-sized two-actor office/clinic starters; four layouts, eight global
  characters, 256 words. Long plans have eight logical scenes; short compiler
  retains four scenes and its prior FPS support.
- Full FFmpeg + ffprobe on PATH is required; tool changes invalidate recovery.
- One full 27s render and one 60s tail sample were tested, not a complete 60s
  render, multiple resolutions or fresh Linux VM certification.

Stop after Phase 4C-B.
