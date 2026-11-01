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
- Single-render budget stays **600 frames**, integer fps 1..60, up to four named layouts/scenes,
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
after SDK changes. Approved Phase 4C-B orchestration follows below; no Phase 5.

## Phase 4C-B: 30–60-second stories

The same JSON envelope/command now accepts up to **1800 frames at 30 fps**.
Start from `examples/long-story.json` (27 seconds, three scenes). All timings stay
**global**, including beats, shots, audio placement/trims and word alignments.
Muse does not compute offsets or invoke FFmpeg. No new JSON fields are required.

```sh
npm run story -- validate --plan=examples/long-story.json
npm run story -- render --plan=examples/long-story.json --output=out/long-story.mp4 --report=out/long-story-report.json
# Interrupted? Run the exact same command again.
```

The launcher renders **one complete scene per segment**, sequentially, each <=600
frames, one software WebGL browser/worker at a time. Put explicit hard scene cuts
within that budget. A single long scene or seamless cross-segment camera/acting
transition is rejected; no action/motion is sliced or baked. Existing certificate,
GPU, memory, concurrency and temp limits still apply (a complex 600-frame scene
can hit the unchanged 16 MiB certificate limit; shorten it at a meaningful cut).
Short <=600-frame stories retain their existing single-render/audio path.
Long orchestration has at most **8 logical scenes**; use six 300-frame scenes
for a minute. Each renderer still receives one scene within the original
4-scene/600-frame and 16 MiB certificate limits. The 4-layout/8-character/128-cue/
256-word bounds and the short compiler's 4-scene limit are unchanged.

Install **full FFmpeg and ffprobe on PATH** for segmented renders (the renderer
still uses its pinned bundled FFmpeg). The launcher verifies needed filters,
source audio metadata/duration and records the selected tool versions/hashes.
Video is concatenated using stream copy; audio is decoded/mixed on one 48 kHz
stereo sample clock and AAC-encoded **once**, preserving intentional silence,
trims, gain and overlaps. There is no independently encoded segment audio to
introduce boundary padding. Caption display retains global word intervals and
punch phase even across a cut; local safety certification clips only reservations.
Supplied word timestamps remain supplied; estimated captions remain estimates.

`out/long-story.mp4.segments/manifest.json` plus completed MP4s/reports are durable
workspace recovery artifacts, bounded to 512 MiB. Input plan bytes, source code,
lockfile, policy, tool versions/binaries, font and audio contents must match.
Never edit a manifest. Missing/tampered completed segments or changed inputs
require a **new output path**; completed work is preserved. The authoring lock
reserves the guarded pipeline between segments and through assembly. Linux
memory admission runs before each renderer/assembly process; existing low-memory
abort monitoring stays enabled. Temporary compiler/browser files stay under
`.remotion-tmp` and are cleaned by their owners. SIGKILL/stale locks still need
operator inspection; never automatically delete a live lock.

Only a completely validated final MP4 is atomically published to the output path.
Failures return nonzero; an older successful output can remain at that path.
Recovery segments are retained after success; remove their directory manually
only when no job is active and recovery is no longer needed. There is no remote
cache, parallel render, automatic TTS/ASR or Phase 5 orchestration.

The original “Quiet Radio” fixture is a fictional silent-caption story with an
original continuous **non-speech test signal**, not generated/recorded narration.
It deliberately spans both cuts to detect audio gaps. The text is authored or
explicitly estimated, with no claim of speech synchronization.

SDK integrations continue to call `runAuthoredStory()` from `scripts/story.cjs`.
`planStorySegments(compiled)` returns global half-open intervals;
`compileStorySegment(compiled,index)` delegates local visual evaluation to the
existing compiler/cast/director. These are orchestration helpers, not a second
animation clock. Never pass a long data-only compiled timeline to `createStory`.

Reproduce the original signal-boundary check after rendering the example:
`node scripts/verify-long-story.cjs out/long-story.mp4`. It verifies exact video/
audio stream duration and zero sample shift around 9s/18s. AAC can expose a codec
padding tail after decoding beyond the MP4 presentation duration; this is reported
separately, not counted as timeline content or an inter-segment gap.

## Phase 5B: whole-story preparation

`story render` now runs a guarded **whole-story preflight before any video is
encoded**, including resumed jobs. It reuses the same composition, caption/font
readiness and `createStory().prepare()` over every segment, sequentially in one
software browser. One diagnostic still completes readiness per segment; pages
close between segments. The preflight browser closes before video workers start.
Run only this phase with `npm run story -- prepare --plan=examples/name.story.json`
(or `runAuthoredStory({command:"prepare",plan:...})`), without video encoding.
Reports are saved to `<report>.preflight.json`; later errors preserve scene/shot,
nested director diagnostic and an actionable hint. Fix the plan, not renderer
thresholds; memory admission/abort protections still apply to every phase.

`story validate` returns `warnings` and `visibilityValidated:false`. In particular,
`TWO_SHOT_GAZE_RISK` flags off-axis gaze: a board/prop/actor look can make both
faces impossible to frame together. Aim actors toward `audience` for that shot,
or use `closeUp`/`medium`/`objectFocus` cuts. This is a conservative warning, not
proof a shot fails. Full camera/actor certification requires actual preparation.
The generic office chair now has four legs and a backrest; its `chair` seat
surface and existing contact API are unchanged.
