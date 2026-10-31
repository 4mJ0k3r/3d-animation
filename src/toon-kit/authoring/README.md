# Muse: one-shot structured story authoring

Write a UTF-8 JSON file and supply local assets. Do **not** create Three.js
scenes, Remotion compositions, camera vectors, joint transforms or an onFrame
callback. The generic `AuthoredStory` composition is already registered.

## Canonical schema

The normative runtime schema is `compileStoryDocument()` in [document.ts](document.ts).
Its `story` field is the existing [StoryPlan](../story/types.ts), validated by
`compileStory()`; this envelope does not define another timeline.

```json
{
  "version": 1,
  "video": {"width": 720, "height": 1280},
  "font": "noto-sans-devanagari",
  "layouts": {"workspace": {"preset": "office"}},
  "story": {
    "version": 1,
    "fps": 30,
    "durationInFrames": 240,
    "characters": {},
    "scenes": []
  }
}
```

The skeleton needs characters/scenes before it is valid. Copy the complete
[eight-second example](../../../examples/office-idea.story.json).
Top-level keys are exactly those above. A scene's `setting` selects a key in
`layouts`. `story` declares characters, scene defaults, timed beats/actions,
dialogue/caption cues, shots, and optional Phase 4B audio assets/clips/alignments.

- Choose appearance `casual`, `office`, `doctor` or `patient`. Curated starters use
  the existing default body proportions and scale 1; omit raw body dimensions.
- Actions: `stand`, `sit`, `walk`, `look`, `point`, `gesture`, `expression`, `react`.
  Use named slots below or `{actor:"kabir",anchor:"head"}`. Camera choices and
  `pushIn`/`pan`/`move` use existing semantic shot definitions, never coordinates.
  Object-focus shots select a named prop and optional `region:"full"`.
- Shots: `establishing`, `twoShot`, `medium`, `fullBody`, `closeUp`, `reaction`,
  `objectFocus`. Gestures: `wave`, `nod`, `shake-head`, `shrug`, `explain`,
  `surprise`, `sad`, `worried`, `excited`.
- All intervals are absolute integer frames, `[startFrame,endFrame)`. Scenes and
  shots cover the duration; independent character channels may overlap, conflicting
  gestures may not. Support changes obey existing cut/continuity constraints.
- Budget stays **600 frames**, integer fps 1..60, up to four named layouts/scenes,
  eight global characters and 256 caption words. Curated scenes have **two active
  actors**, occupying distinct roles. Other SDK users retain the general rig APIs.
- Viewports: 720×1280, 1280×720, 1080×1920, 1920×1080. Prefer 720p on Muse.
  Production rendering always uses software-safe; no quality/concurrency overrides.

## Curated environments and interaction slots

| Layout | Left standing/walking role | Right standing/seated role | Look/point targets | Camera props |
|---|---|---|---|---|
| office | stand `entry` or `finish`; walk path `toDesk` (entry→finish) | stand `right` **or** sit `chair` | `board`, `audience`, marks/seats, actor anchors | `board` |
| clinic | stand `doctor` | sit `examSeat` | `diagram`, `diagramHead`, `audience`, actor anchors | `chart`, `examTable` |

Use `floor:"ground"` for seats. The office entry/finish/path share one role;
right/chair share another. Occupancy checks reject overlaps at support boundaries.
Swap roles through scene/shot cuts, not teleports. `LAYOUTS` exports the immutable
catalog. `createStoryEnvironments(engine,compiled)` constructs only selected
layouts with engine-owned primitives/resources. Clinic reuses ClinicEnvironment's
actual seat and chart anchors; office reuses the approved primitive layout.
There is no procedural environment generator, arbitrary prop insertion or physics.

## Script → JSON → validation → assets → MP4

Muse translates the human script into this JSON **outside** Toon-Kit. Copy the
example, change character IDs/appearance, captions, actions and shots, and keep
within the supported slots. Unsupported intentions must be reported, not patched
with raw geometry or a second animation loop.

From the project checkout:

```sh
npm run story -- validate --plan=examples/office-idea.story.json
npm run story -- render --plan=examples/office-idea.story.json --output=out/office-idea.mp4 --report=out/office-idea-report.json --verify=true
```

For a new story, replace only `--plan` and output filenames. `validate` runs schema,
semantic slot and canonical-file/font checks without a browser. Actual media
decoding and every-frame camera/contact/caption certification happen during render
preparation, before capture. `--verify=true` additionally runs bounded determinism,
resource, landscape and clinic checks **inside the same browser**. Omit it for
ordinary production once the SDK is certified; per-story preparation still runs.

Programmatic callers use `runAuthoredStory({command:'render',plan:'examples/name.story.json',
output:'out/name.mp4',report:'out/name.json'})` from `scripts/story.cjs`. Both paths
bootstrap a workspace-temp child before loading TypeScript/Remotion and invoke the
unchanged guarded `runProductionRender`. No separate browser/render implementation.
Input files must be canonical workspace JSON <=256 KiB; outputs/reports stay under
`out/`. Owned bootstrap/temp folders are cleaned on normal failure/cancellation.
Never delete another job's locks; SIGKILL leftovers need operator inspection.

Errors retain structured codes, scene/actor/frame context and allowed slot names.
Fix `UNKNOWN_SLOT`, `UNSUPPORTED_LAYOUT`, `SLOT_OCCUPIED`, `LAYOUT_CAPACITY`, timing
and gesture conflicts in JSON. Restore missing audio/font assets; never substitute
an empty sound or system font. Render framing errors preserve director diagnostics
(including caption safety); choose a wider preset or shorter captions. Do not lower
memory guards, change renderer internals or capture an old pose after an error.

## Hindi, narration and captions

The bundled unmodified Noto Sans Devanagari variable font includes its OFL 1.1
license and pinned SHA-256. Both CLI and browser verify it; FontFace readiness
precedes the existing `createCaptionLayout` measurement. There is no runtime CDN
or Windows font dependency. See the [font provenance](../../../public/fonts/noto-devanagari/README.md)
in the repository. Global measured captions feed `ToonCaptions` and camera safety.

Recorded narration/dialogue uses [the existing audio contract](../story/AUDIO.md):
put immutable audio under `public/audio`, declare `story.audio.assets/clips`, and
associate source-file word timestamps through `alignmentId` and
`timing:"supplied"`. The generic composition prepares and mounts StoryAudio for
you. Dialogue cues alone produce captions, not synthesized speech. Equal-spacing
words require `timing:"estimated"`; estimates are never certified speech sync.
The included original story is a **silent, captioned** office story, with explicit
estimated captions. No TTS provider, speech recognition or NLP runs in Toon-Kit.

Run `npm run typecheck`, `npm run test:authoring`, `npm run test:memory` serially
after SDK changes. No Phase 4C-B/5, long-video orchestration or budget extension.
