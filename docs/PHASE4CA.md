# Phase 4C-A — one-shot authoring

**PASS locally.** New stories require JSON and assets, with no author-written
Three.js scene, character math, camera vectors or Remotion composition.

## API / workflow

Canonical contract: `StoryDocument` + `compileStoryDocument()` in
`src/toon-kit/authoring/document.ts`; normative story/action/audio semantics remain
the existing StoryPlan/compiler. See [Muse instructions](../src/toon-kit/authoring/README.md).
The envelope selects viewport, pinned font and named layouts; it does not create
a second timeline or renderer. Runtime `createStoryEnvironments` binds named slots,
and the registered generic AuthoredStory delegates to existing createStory/cast,
director, audio and captions.

```sh
npm run story -- validate --plan=examples/office-idea.story.json
npm run story -- render --plan=examples/office-idea.story.json --output=out/phase4ca/office-idea.mp4 --report=out/phase4ca/production-report.json --verify=true
```

Muse translates the natural-language script into JSON outside Toon-Kit. Validation
checks schema, slots, local assets and pinned font; rendering additionally checks
actual audio decode/contact/visibility/caption framing before capture. Both CLI
and exported `runAuthoredStory()` use a workspace-temp bootstrap and the unchanged
guarded production launcher. No quality, concurrency or memory-limit override.

## Changes

- New SDK `src/toon-kit/authoring/{document,starters,font,index}.ts`, `view.tsx`,
  `verification.ts`, `README.md`; public export in `src/toon-kit/index.ts`.
- CLI `scripts/story.cjs`, `story-worker.cjs`, `story-authoring-assets.cjs`,
  `tsconfig.authoring.json`, `test-authoring.cjs`, `tests/authoring.test.cjs`.
- New `examples/office-idea.story.json`; generic composition in `src/Root.tsx`.
  JSON imports enabled in `tsconfig.json`; CPU-test includes/registrations updated.
- Bundled `public/fonts/noto-devanagari/{NotoSansDevanagari.ttf,OFL.txt,README.md}`.
  Unmodified Noto font, pinned upstream commit and SHA-256, with original OFL license.
- Package scripts, main AGENT_INSTRUCTIONS and this report. Frozen renderer,
  character/contact/camera internals, legacy clinic and production policies unchanged.

Office exposes entry/finish/right standing marks, chair, board, audience and toDesk
path. Clinic reuses the actual ClinicEnvironment doctor/seat/diagram bindings.
Both expose ground floor. Curated scenes use two default-size actors in distinct
roles; occupancy checks reject overlapping slot assignments. The general rig SDK
remains available outside this intentionally limited authoring workflow.

## Verification

- Typecheck PASS. 54 focused CPU tests PASS (18 authoring + prior 36 story/audio),
  plus seven existing memory-safety tests. Includes CLI canonical input/output
  paths, real workspace-temp validation, cancellation cleanup, production-lock
  preservation, missing/tampered fonts, unknown actors/actions/slots/layouts,
  conflicts, capacity/occupancy, two-standing office and impossible caption framing.
- 23 browser assertions PASS on actual swangle/SwiftShader: order
  0→80→20→80→0, shot boundaries through 239, fresh-engine PNG/state equality,
  stable warm residency (19 geometries / 22 textures), no warm texture/FBO/renderbuffer
  allocation, explicit context disposal, landscape and clinic starter framing.
- One full original **eight-second office story**, 240 frames, 720×1280, 30 fps,
  H.264 MP4. New Meera/Kabir story about solving a deadline problem; every action,
  expression, caption and shot is JSON-driven. The example is intentionally silent,
  with explicitly estimated Hindi/English captions. Recorded audio remains supported
  through the unchanged Phase 4B contract; no new narration was synthesized.
- Exported streams inspected and Hindi stills reviewed. Normal-speed playback
  reviewed. Caption text checked against compiled timing during native capture;
  the same measured pinned-font layout feeds camera safety. No redundant 1080p
  or second full demonstration render.

## Measurements / limits

Windows 16-logical-CPU host, Node 24.14.1, Remotion 4.0.539, Three 0.187.0,
TypeScript 7.0.2. One render worker; software-safe; swangle verified SwiftShader.

| Full 720p render | Measured |
|---|---:|
| Native job wall time, including diagnostics | 96.63 s |
| Frame completion median / p95 | 306.22 / 349.70 ms |
| Story evaluation median / p95 | 6.00 / 9.60 ms |
| All-frame preparation | 1800.30 ms |
| Peak sampled render-worker process-tree RSS | 768.98 MiB |
| Peak private render scratch | 58.50 MiB |
| Director certificates | 10,609,542 bytes |

Bootstrap and render scratch folders/locks were cleaned. The temp measurement
covers the render's UUID directory, not the separate small compiler bootstrap;
RSS excludes ancestor CLI/bootstrap processes. Both use absolute workspace temp
paths before TypeScript/Remotion/Chrome/FFmpeg launch. Linux MemAvailable, cgroup
and `/tmp` measurements are unavailable here, not zero. Muse VM certification and
cross-platform PNG identity are not claimed; sampled guards cannot guarantee OOM
survival after sudden host memory reclamation.

Limits: 600 frames, four scenes/layouts, two active actors per curated scene,
default body dimensions, fixed semantic slots and limited named paths. No arbitrary
environments/props, general collision engine, TTS, NLP, speech recognition, long-video
orchestration or Phase 4C-B/5. Estimated words are not verified speech alignment.
Runtime framing may reject unsuitable combinations; diagnostics remain explicit.

Ignored evidence: `out/phase4ca/{office-idea.mp4,production-report.json,
validation-results.json,streams.txt,view-*.png}` and authoring test/render logs.
Only source JSON, font/license, SDK and tests are committed. Stop after 4C-A.
