# Structured story timelines

Use `compileStory(plan)` and `createStory(engine, {timeline, settings, captions})`
from `toon-kit`. A plan is validated JSON data; it contains no callbacks, joint
coordinates, cameras or Three.js objects. Environment bindings supply existing
named marks, seats, paths and prop meshes once, before preparation.

The complete 10-second Hindi/English example is
[`TEN_SECOND_STORY`](../../toon-kit-tests/story-plan.ts), its reusable environment
bindings are in [story-fixture.ts](../../toon-kit-tests/story-fixture.ts), and the
Remotion integration is in [story.tsx](../../toon-kit-tests/story.tsx).

```ts
const timeline = compileStory(plan);
const captions = await engine.wait(createCaptionLayout({
  width, height, words: timeline.captionWords,
}, engine.signal));
// Commit this same layout to ToonCaptions before finishing initScene.
const story = createStory(engine, {timeline, settings, captions});
story.prepare();
// ThreeCanvas autoFrame={false}; onFrame:
story.applyFrame(frame);
// on teardown: story.dispose(); engine retains GPU-resource ownership.
```

`settings` maps every referenced setting name (and no unused settings) to
`{root, floor, targets, props?, paths?, floors?}`. Use existing `createTargets`,
`sceneMark`, seat targets, `pathFromMarks` and primitive helpers. Roots must be
distinct, non-nested groups owned by this engine; keep binding geometry and
registries static after preparation. Props use their full existing semantic
regions. Actor IDs and prop names must be distinct. `axis` names two active
actors for the existing stage adapter.

## Plan and timing contract

- `version:1`, `fps`, `durationInFrames`, global `characters`, and `scenes`.
  Each scene names a setting, character defaults, axis, beats, cues and shots.
  All frame numbers are **absolute integers**; intervals are `[startFrame,endFrame)`.
  Scenes cover the clip; shots independently cover each scene, without gaps.
- Beat actions: `stand`, `sit`, `walk`, `look`, `point`, `gesture`, `expression`,
  `react`. Targets are binding names or `{actor,anchor?}`; no author-side joint math.
  Shots accept the existing static/visibility-aware types and semantic motions.
- Stance, gaze and expression hold their last declaration. Walking holds its
  endpoint after its interval. Pointing, gestures and reactions return to the
  declared baseline at the boundary. Unspecified active actors use complete
  scene defaults; inactive actors are explicitly hidden. No state carries
  implicitly between scenes. Sampling order cannot change results.
- Gaze/expression transitions use existing absolute-frame helpers; default is up
  to eight frames. Set zero for an intentional hard change, otherwise use at least
  four and fewer than the beat's frames. Transient gestures need at least five
  frames; reactions need eleven. Reactions reserve both gesture and expression
  channels. Ordinary gestures do not implicitly change the declared face.
- Overlapping actions on the same actor/channel reject with `ACTION_CONFLICT`;
  independent channels and actors may overlap. No silent last-writer wins.
  Stand/sit changes require a shot/scene cut. Other support transitions must
  agree in position and heading or reject with `SUPPORT_DISCONTINUITY`. This
  stage does not invent stand-to-sit motion or general transition choreography.
- Dialogue/caption cues accept Hindi/English text, speaker, `mode:'line'|'words'`
  and optional unique `alignmentId`. `captionWords` feeds existing caption APIs;
  `alignment` retains cue metadata and timing provenance; `audio.alignments`
  accepts externally supplied source-file word timestamps.
  Word cues require `timing:'supplied'|'estimated'`; see [AUDIO.md](AUDIO.md) for
  recorded audio and external word timestamps. There is no TTS, transcription,
  lip-sync or natural-language interpretation.
  Load an appropriate Devanagari font before measuring and commit the identical
  caption layout used for director safety checks.

`compileStory` returns immutable `plan`, `clips`, `captionWords`, `alignment` and
`sample(frame)` (complete semantic intents and shot/cue selection).
`createStory` returns `prepare()`, `applyFrame(frame)`, `describe(frame)`,
`preparationStats()` and idempotent `dispose()`. Global cast/caption time and
scene-local director time are coordinated internally. `StoryError.diagnostic`
includes a code, message and applicable scene/beat/actor/frame/cause details.
Preparation must finish before capture; failures require disposing the player.

Initial bounds: 1–60 integer fps, 600 frames, four scenes, eight global actors,
128 beats, 512 actions, 128 cues and 256 caption words. Combined director
certificates retain the existing 16 MiB limit; existing proxy/visibility budgets
can further restrict a setting. One cast and the existing stage/director helpers
do the work; there is no additional animation system, render pass or browser.

## Verification

```sh
npm run typecheck
npm run test:story
npm run test:motion
npm run verify:story
```

`verify:story` produces a 60-frame 720p excerpt of the example, software-renderer
assertions, stills and an owned-temp production report in ignored `out/phase4a`.
The full data example is also registered as `DeclarativeStoryExample` (300 frames):

```sh
npm run render:production -- --entry=src/index.ts --composition=DeclarativeStoryExample --frames=300 --width=720 --height=1280 --output=out/story-full.mp4 --report=out/story-full-report.json
```

Use the production launcher, including on Linux; never bypass its memory,
concurrency, software-renderer or workspace-temp safeguards. The fixture uses
installed Nirmala UI on Windows; Linux needs an available Devanagari font. It is
not bundled by this stage.
