# Phase 4A validation

**PASS locally.** Reusable structured story compilation and orchestration only;
Phase 4B/4C, audio and unrestricted language parsing are not implemented.

## Changed files

- SDK: `src/toon-kit/story/{types,compiler,player,index}.ts`, its README and the
  public `src/toon-kit/index.ts` export. Schema/compiler are pure; player delegates
  to existing cast, contact, walking, acting, stage, director and caption APIs.
- Fixtures: `src/toon-kit-tests/story-{plan,fixture,gpu}.ts`, `story.tsx`,
  `src/Root.tsx`. One complete 300-frame data plan; two settings, two actors,
  walking, sitting, pointing, gaze, gestures, reactions, English/Hindi captions,
  five shots and a subtle push-in. A separate 60-frame excerpt limits render cost.
- Verification: `scripts/test-story.cjs`, `scripts/tests/story.test.cjs`,
  `scripts/verify-story.cjs`; registrations in `package.json`,
  `scripts/test-characters.cjs`, `scripts/tsconfig.characters.json`.
- Instructions: `src/toon-kit/AGENT_INSTRUCTIONS.md`, story README, this report.
  Frozen renderers, rigs, legacy clinic and production policies are unchanged.

## Checks performed

- Typecheck: PASS. Story tests: 16/16, including zero-intensity reaction reset.
  Existing director/composition/motion: 50/50.
- Browser: 70/70 assertions using actual SwiftShader via swangle. Portrait
  360×640 and landscape 640×360, two fresh engines each. Nonsequential
  0 → 80 → 20 → 80 → 0 and additional action/shot/scene boundaries through 299.
  Repeated/fresh PNG hashes, raw RGBA hashes and complete state match exactly.
- Both aspects prepare all 300 frames. CPU tests cover conflict/schema errors,
  persistent defaults, inactive actors, order independence, caption readiness,
  contact discontinuities, multi-setting clocks, repeated disposal and reset.
- Warm browser evaluation creates zero additional WebGL textures/framebuffers/
  renderbuffers; geometry/texture/program counts stay stable. Four test contexts
  are explicitly disposed. Native first exposure uploads are bounded:
  18→19 geometries and 16→21 textures across new views/settings, not a claim of
  zero first-use allocations.
- Actual MP4: 60 frames, 720×1280, 30 fps, software-safe, one worker. Captions
  checked against committed DOM layout on every captured frame. Still review
  confirmed legible Devanagari; normal-speed playback reached 2.00 s at rate 1.
  The complete 300-frame example is registered, but no full 300-frame MP4 was run.

## Measurements

Local Windows host, Node 24.14.1, Remotion 4.0.539, Three 0.187.0, TypeScript
7.0.2; CPU software WebGL (ANGLE Vulkan SwiftShader/Subzero), no hardware GPU.

| Measurement | Result |
|---|---:|
| Native frame completion median / p95 | 300.20 / 355.67 ms |
| Story apply median / p95 | 5.30 / 9.40 ms |
| Cold compile / all-frame preparation | 27.60 / 2229.40 ms |
| Peak sampled process-tree RSS | 727.88 MiB |
| Peak sampled workspace temporary storage | 49.40 MiB |
| Combined director certificates | 12,542,566 bytes (11.96 MiB) |
| Job wall time, including browser assertions | 45.39 s |

Production report records workspace-owned temporary paths; owned job/extraction
directories were cleaned. Linux `/tmp`, MemAvailable and cgroup measurements are
unavailable on this host and are not reported as zero. Frozen Linux admission and
abort guards remain in effect; this is not certification of Muse's VM or an OOM
guarantee. No dependency changes or additional rendering passes.

## Reproduce / limitations

Run `npm run typecheck`, `npm run test:story`, `npm run test:motion`, then
`npm run verify:story` serially. See the story README for the full-example command.
Ignored evidence: `out/phase4a/{story-excerpt.mp4,story-*.png,validation-results.json,
production-report.json,render.log}`. No videos or benchmark outputs are committed.

Bindings must be static and use existing semantic geometry. Stand/sit changes
need cuts; walking/contact transitions must agree rather than teleport silently.
Visibility remains the existing finite-proxy model. Initial clip/certificate
bounds are deliberate. Linux must provide a Devanagari font; the example's
Windows font is not bundled. Focused tests were run; the entire historical CPU
and browser suites were not rerun because shared infrastructure was unchanged.
