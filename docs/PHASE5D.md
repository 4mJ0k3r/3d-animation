# Phase 5D — readable props and posture continuity

PASS locally. Baseline `3a9550b`; no renderer, rig, camera, audio or production
policy changes. The original 28-second video was sampled at the board reveal;
its decorative bars and the adjacent-scene posture jump were confirmed against
Muse's JSON. Original video/JSON were not modified or staged.

## Public JSON

```json
"layouts": {
  "workspace": {
    "preset": "office",
    "displays": {"board": {"text": "टीम बैठक\nकल सुबह १० बजे"}}
  }
}
```

Use the existing `{type:"objectFocus",subject:"board",region:"full",...}` shot.
The board remains the same registered mesh/target at the same position; text
replaces its decorative bars. Without content, existing appearance is preserved.
Text is literal, static per named layout, up to 160 Unicode code points and four
wrapped lines. Hindi/Devanagari, ASCII English and a verified punctuation subset
use the existing pinned OFL Noto font; unsupported glyphs reject, avoiding OS font
fallbacks. Preparation checks actual font metrics; overly dense text fails with
`DISPLAY_TEXT_TOO_DENSE` rather than clipping or becoming tiny. No coordinates,
font URLs, material parameters or extra author callbacks are needed.

One immutable 1024x704 sRGB CanvasTexture (2.75 MiB RGBA storage before runtime
copies) per configured display; no mipmaps, extra mesh, per-frame allocation or
new rendering pass. Factory/engine ownership disposes material and texture.

`POSTURE_CUT` is a non-blocking warning with actor, scene/shot, global boundary
frame and previous/current posture. It compares final held support intentions
against initial next-scene intentions, including actions. It does not mutate
poses. Keep posture consistent, use an earlier explicit contact cut, or review an
intentional time jump. A stand command at that very boundary is still an instant
posture cut, not an animated stand-up. No transition system was implemented.

## Changed files

- `src/toon-kit/authoring/document.ts`: optional bounded display schema,
  supported-glyph checks, immutable copying and segment compatibility.
- `src/toon-kit/authoring/display.ts`: one-time font-ready text rasterization,
  measured wrapping and engine-owned texture/material creation.
- `src/toon-kit/authoring/starters.ts`: bind text to the existing office board.
- `src/toon-kit/authoring/diagnostics.ts`: scene-boundary posture warnings.
- `scripts/tests/authoring.test.cjs`: text/schema/font/resource and continuity tests.
- `examples/display-board.story.json`: original one-second Hindi object-focus sample.
- `src/toon-kit/authoring/README.md`, `src/toon-kit/AGENT_INSTRUCTIONS.md`, this report.

## Verification and reproduction

```sh
npm run typecheck
npm run test:authoring
npm run test:memory
npm run story -- validate --plan=examples/display-board.story.json
npm run story -- render --plan=examples/display-board.story.json --output=out/display-board.mp4 --verify=true
```

- Typecheck PASS; **72 focused tests PASS**, **7 memory tests PASS**.
- **17 actual SwiftShader browser assertions PASS**: frame-order/fresh-instance
  PNG equality, stable warm residency, zero warm GL allocation and disposal,
  portrait/landscape/clinic compatibility. Display font/texture readiness uses
  the existing guarded whole-story preflight.
- **30-frame / 1-second 720x1280 sample** rendered and inspected: Hindi shaping,
  readable high-contrast text, no decorative bars/internal geometry seams, same
  object-focus framing. No full 28-second video render.
- Static validation of the original Muse JSON reports Arjun's seated-to-standing
  cut at **frame 280**, `buri-khabar` → `hairani-aur-sach`. Prior gaze warnings stay.
- Tested held-action endpoints, same-posture boundaries, both posture directions,
  instant-at-boundary warnings, independent display resources, exact-once map
  disposal, missing font rejection, bounded content and dense-text rejection.
- Windows software-safe/swangle, ANGLE Vulkan SwiftShader/Subzero verified;
  Remotion 4.0.539, Three 0.187.0. Sample capture median/p95 **261/304 ms**;
  video-worker wall **16.29s**, including optional verification contexts.
  Sampled worker-tree peak RSS **1225 MiB**, private scratch **48.9 MiB**;
  these exclude CLI/bootstrap ancestors and are not Linux/cgroup measurements.
  No safety thresholds, concurrency, temp paths or resource budgets changed.

Evidence (ignored, not committed): `out/phase5d/display-board.mp4`,
`display-board.png`, `reference-board.png`, `production-report.json*`;
`out/phase5d-{tests,memory,render,muse-validation}.log`. Existing untracked
`examples/phase5a-nikalna.story.json` remains user-owned.

## Limits

Initial binding is office `board` only, not arbitrary prop placement/content.
Text is static across scenes sharing that layout; no rich text, images, animated
reveals or new font provisioning. Use objectFocus for readability; distant wide
shots cannot guarantee readable text. Posture warnings are conservative notices,
not a general motion/collision continuity solver; actors absent from an adjacent
scene are skipped and intentional time jumps may warn. No sit/stand animation or
automatic story edits. Existing preflight, memory admission/abort, concurrency=1,
software rendering and workspace temp protections remain mandatory. Linux VM
certification is not repeated here; sudden host memory reclamation remains a risk.
Stop after Phase 5D.
