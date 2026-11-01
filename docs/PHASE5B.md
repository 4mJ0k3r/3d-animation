# Phase 5B — whole-story preflight and office seating

**PASS locally**, based on `d7247c9`. No new story features/effects/environments/TTS.

## Changes

- `scripts/story.cjs`, `scripts/story-worker.cjs`: guarded `story prepare` command;
  automatic whole-story preflight before either short rendering or long segment
  rendering/cache handling. Static validation returns warnings and
  `visibilityValidated:false`. Derived report paths cannot overwrite plans or
  follow redirects. Structured failures reach the final CLI line and programmatic
  caller through owned bootstrap error data, not just child logs. Cancellation and the authoring reservation cover preparation.
- `scripts/render.cjs`, `scripts/render-worker.cjs`: preparation-only mode reuses
  the same bundle/composition/ThreeCanvas/readiness/`createStory().prepare()`.
  One browser, one page/segment sequentially; each still page closes before the
  next. A diagnostic still resolves readiness after certification of every frame
  and motion sample. No video encoder starts. The browser closes before video
  workers launch. Structured camera/constraint failures and their report path
  propagate; memory-abort reasons retain priority. Safety policy is unchanged.
- `src/toon-kit/authoring/{diagnostics.ts,document.ts,view.tsx}`: deterministic
  `TWO_SHOT_GAZE_RISK` warnings with scene/shot/actor/global-frame/target; actionable
  audience-gaze or closeUp/medium/objectFocus guidance. Warnings are conservative,
  non-blocking risks, not a claim that a shot is impossible or already certified.
- `src/toon-kit/authoring/starters.ts`: replace office pedestal with four legs
  and an attached backrest. The semantic seat mesh, surface Y=1.1, dimensions,
  transforms and `chair` target/contact APIs are unchanged. Four extra meshes,
  shared primitive/material resources, no renderer or rig changes.
- `scripts/tests/authoring.test.cjs`, `scripts/verify-preflight.cjs`: focused
  warning/contact/path-safety assertions and reproducible guarded browser tests.
- `src/toon-kit/authoring/README.md`, `src/toon-kit/AGENT_INSTRUCTIONS.md`, this
  report: workflow, scope and cache review. No cache implementation changed.

## Commands

```sh
npm run story -- validate --plan=examples/long-story.json
npm run story -- prepare --plan=examples/long-story.json --report=out/preflight.json
npm run story -- render --plan=examples/long-story.json --output=out/story.mp4
npm run typecheck
npm run test:authoring
npm run test:memory
node scripts/verify-preflight.cjs
```

The existing `runAuthoredStory` programmatic API also accepts `command:'prepare'`.
Preparation reports use `<report>.preflight.json`; render always preflights again,
including resume attempts. There is no reusable stale preparation certificate.

## Verification

- Typecheck PASS; **69 focused tests PASS**; **7 memory guard tests PASS**
  (simulated Linux telemetry). Includes deterministic warning order, unchanged
  seat/ground attachments, repeated cleanup, frame-order/fresh-player tests and
  original story/audio/segment recovery regressions.
- Actual software browser: valid three-segment/810-frame plan fully prepares
  all three segments, **zero encoding runs**. Invalid later-shot fixture prepares
  segment 0, then rejects segment 1 with `CAPTION_TOO_TALL` at
  `small-adjustment/team`. No first-segment MP4, segment output directory or
  encoder arguments are created. This is a deliberately impossible caption-safe
  composition with off-axis gaze; it is not a reproduction of Muse's unavailable
  original JSON. The same generic error propagation covers
  `NO_VALID_COMPOSITION` and actor-constraint errors without code-specific fallback.
- Office preview: **30 frames / 1 second, 720x1280**, software-safe/swangle
  SwiftShader/Subzero verified. **17 browser assertions PASS**, including fresh
  engine PNG/frame-order equality, warm allocations/residency and disposal.
  Preview inspected: recognizable backrest/legs and seated contact; the existing
  actor full-body framing crops the lowest chair-leg tips. Camera architecture
  was not changed for this fixture.
- Measured Windows worker-tree RSS peaks: valid whole-story preparation
  **1269 MiB**, invalid preparation **1007 MiB**, preview **1189 MiB**.
  Private scratch peaks **48.3–49.5 MiB**. Preview capture median/p95
  **301/334 ms**; video-worker wall **20.13s**, including optional browser checks.
  RSS is sampled and excludes ancestor CLI/bootstrap processes; these are not
  cgroup/whole-job peaks or measurements on the 2-vCPU Linux VM. No Linux `/tmp`
  or balloon measurements are fabricated. All owned scratch/locks cleaned up.

Evidence (ignored, not committed): `out/phase5b/results.json`,
`invalid-report.json.preflight.json`, `valid-all-report.json.preflight.json`,
`office-seating-report.json*`, `office-seating.mp4`, `office-seating.png`;
`out/phase5b-{tests,memory,final-browser}.log`. No long-story video was rendered.

## Cache review — assessment only

Unaffected visual segments could be reused safely with explicit dependency-based
fingerprints, **not merely a hash of one scene's JSON**. Required inputs include
its global start/timebase (automatic blinks), complete actions/defaults/shots,
referenced actor IDs/appearance, semantic setting geometry and canonical layout
placement/order, lighting, overlapping caption words with original intervals and
font metrics, relevant assets, renderer/SDK versions and render settings. An edit
that shifts earlier timing must invalidate downstream segments; cross-boundary
captions can invalidate both neighbors. Final audio mixing needs a separate
whole-timeline fingerprint. Even when visual segments are reused, whole-story
preparation should remain mandatory. Current conservative whole-plan/source
fingerprints stay unchanged; SDK/plan changes still require a new output path.

## Limits

Static gaze warnings can be false positives; only actual preparation certifies
supported camera/actor constraints. Preparation adds bounded CPU/startup work and
can itself refuse/abort under memory pressure. It uses the existing analytic
visibility model, not a new pixel-visibility guarantee. Memory admission,
concurrency=1, CPU WebGL, ownership, timeouts and workspace temp safeguards remain
intact; sudden host reclamation can still cause failure. Fresh Linux VM/Muse
certification remains external. Stop after Phase 5B.
