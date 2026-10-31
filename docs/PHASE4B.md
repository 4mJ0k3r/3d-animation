# Phase 4B validation

**PASS: local SDK, media playback/mux, deterministic timing and lifecycle checks.**
**NOT CERTIFIED: spoken-word accuracy of the supplied recording.** The user supplied
three sentence intervals, not word timestamps. The demo explicitly labels its
within-sentence timing `estimated`; it is not verified word synchronization.

## Changes

- SDK: new `src/toon-kit/story/audio-types.ts`, `audio-compiler.ts`,
  `audio-assets.ts`, `audio.tsx`. Extended story `types.ts`, `compiler.ts`,
  `player.ts`, `index.ts`. Local asset/clip/alignment contracts; pure quantization,
  speaker/window/conflict validation; explicit timing provenance; readiness-bound
  preparation; owner-scoped sessions; existing Remotion audio placement and trim.
- Minimal compatibility fix: story cues may continue across scene cuts. Director
  safety windows clip locally; global caption timestamps/punch age stay unchanged.
  No changes to ToonCaptions, renderer, rigs, cameras or production policies.
- Fixtures: `src/toon-kit-tests/story-audio-plan.ts`, `story-audio.tsx`,
  `story-audio-gpu.ts`, `src/Root.tsx`; old `story-plan.ts` now explicitly labels
  its equal-spacing fallback. `public/audio/phase4b-narration.mp3` is the unchanged
  user-provided recording; adjacent README records provenance and checksum.
- Checks: `scripts/story-audio-assets.cjs`, `test-story-audio.cjs`,
  `tests/story-audio.test.cjs`, `verify-story-audio.cjs`; registration in
  `package.json`, `test-characters.cjs`, `tsconfig.characters.json`.
- Documentation: story `AUDIO.md`, `README.md`, main `AGENT_INSTRUCTIONS.md`,
  this report. No new dependencies, TTS, ASR, lip-sync or Phase 4C.

Public usage and provider-neutral `SpeechRecording` contract are documented once
in [AUDIO.md](../src/toon-kit/story/AUDIO.md). Typical flow is compileStory →
prepareStoryAudio → measure/commit captions and StoryAudio → createStory with
the prepared audio → prepare → applyFrame. Audio stories reject missing media
preparation and cross-engine/cross-timeline reuse.

## Evidence

- Typecheck PASS. **36 CPU tests PASS**: 20 audio tests + 16 Phase 4A regressions.
  Includes Hindi/English punctuation, source trimming/rounding, pauses, multiple
  speakers, missing/contradictory alignments, conflicts, scene-crossing words,
  duration errors, local-file budgets, cancellation, repeated disposal/sharing.
- **32 final browser assertions PASS**, actual swangle/SwiftShader: nonsequential
  0→80→20→80→0 plus boundaries through frame 287, fresh-instance PNG/state equality,
  caption continuity across a cut at frame 83, blank caption pauses, context
  disposal. Warm residency: 19 geometries / 24 textures; no new textures, FBOs or
  renderbuffers during sampled evaluation. Existing CPU suites were focused;
  no complete historical browser rerun was needed.
- One **9.6-second, 288-frame, 720×1280, 30 fps MP4**, H.264 + AAC, using the first
  9.6 seconds of ADD1.mp3 at volume 0.9. Native caption text checked on every frame;
  measured layout feeds the existing caption-safe director. Hindi stills inspected.
  Playback reached 9.60 s at rate 1, muted=false, with decoded audio bytes >0.
- Decoded source/export waveform correlation at **0.6 / 5.3 / 8.8 seconds**:
  **0.999992 / 0.999939 / 0.999727**, lag **0 / 0 / 0 samples** at 16 kHz, relative
  gain **0.9990 / 0.9985 / 0.9947** after the expected 0.9/stereo conversion.
  Both streams decode to 153,600 analysis samples. This checks mux/trim/gain drift,
  not whether particular words were spoken at supplied timestamps.
- User sentence boundaries map to 0–138, 144–186, 192–276 with 0 ms rounding error
  at 30 fps. Arbitrary supplied word boundaries have <=16.67 ms quantization error
  at 30 fps; real word-level accuracy for ADD1.mp3 remains unmeasured.

Two one-frame diagnostic jobs verified the subsequent scene-cut/readiness fixes;
no second full-length demonstration was rendered. Temporary metadata nodes,
listeners and blob URLs are released; pending fetch/probe cancellation is tested.

## Performance / environment

Windows on a 16-logical-CPU host, Node 24.14.1, Remotion 4.0.539, Three 0.187.0, React 19.3.1, TypeScript
7.0.2. Software-safe, SwiftShader via swangle, concurrency 1, no parallel encoding.
Analysis uses the renderer's bundled FFmpeg n7.1 (WAV/PCM16 supported); it does not
assume the host FFmpeg supports raw float muxing.

| Full demonstration metric | Measured |
|---|---:|
| Capture completion median / p95 | 329.15 / 378.54 ms/frame |
| Story evaluation median / p95 | 5.00 / 7.60 ms |
| All-frame director preparation | 1433.30 ms |
| Native job wall time, including browser checks | 113.16 s |
| Peak sampled process-tree RSS | 827.04 MiB |
| Peak sampled workspace temporary storage | 60.63 MiB |
| Director certificates | 11,580,982 bytes |

Owned production/extraction scratch directories and locks were cleaned. Reports
record absolute `.remotion-tmp` paths for Chrome/FFmpeg. Linux `/tmp`, MemAvailable
and cgroup telemetry are unavailable on this host, not zero. No Muse VM rerun or
OOM guarantee is claimed; every existing Linux memory/concurrency/temp safeguard
is unchanged. Portable Devanagari font bundling remains unresolved as in 4A.

## Reproduce

```sh
npm run typecheck
npm run test:story-audio
npm run verify:story-audio
# Reanalyze the existing movie without another render:
npm run verify:story-audio -- analyze
```

`verify:story-audio` includes canonical-file preflight before the unchanged
production launcher; use that same preflight for custom CLI/programmatic jobs.
Ignored evidence is in `out/phase4b`: narrated-story.mp4, audio-*.png,
production-report.json, validation-results.json, streams.txt and final-browser-results.json.
No benchmark outputs or generated videos are committed.

Remaining limits: supplied data is validated structurally, not recognized from
speech; the demo uses estimated words. No automatic ducking, crossfades, time
stretching, multistream selection, TTS, transcription or lip-sync. No production
safety failures were observed. Stop after Phase 4B.
