# Recorded audio and word alignment

Phase 4B uses installed Remotion 4.0.539 [Html5Audio](https://www.remotion.dev/docs/html5-audio)
and `Sequence`, verified against the installed typings. No TTS,
ASR, forced alignment, lip-sync or independent animation clock is implemented.

## Public contract

`StoryPlan.audio` contains `assets`, `clips`, and optional `alignments`:

```ts
audio: {
  assets: {voice: externalRecording.asset}, // {src, durationInSeconds}
  clips: [{id:'narrator', kind:'narration', asset:'voice', speaker:'narrator',
    startFrame:0, endFrame:240, trimBeforeFrames:0, volume:0.9}],
  alignments: [{alignmentId:'opening', clip:'narrator',
    text:externalRecording.text, language:externalRecording.language,
    speaker:'narrator', words:externalRecording.words}],
}
// Matching cue (attach to the scene containing its start):
{id:'opening', alignmentId:'opening', kind:'caption', speaker:'narrator',
 text:externalRecording.text, language:externalRecording.language,
 startFrame:0, endFrame:240, mode:'words', timing:'supplied'}
```

`SpeechRecording` is the provider-neutral future contract: `{asset,text,language,
speaker?,words}`. Each `SpeechWord` is `{text,startSeconds,endSeconds}`. Examples
above are contract shapes, not claimed timings for the demo recording.

- All frames are absolute, intervals half-open. A clip selects source frames
  starting at `trimBeforeFrames`, lasting `endFrame-startFrame`, and is placed at
  `startFrame`. No speed changes. Dialogue needs a declared character speaker ID;
  narration may use an offscreen speaker. Nonoverlapping clips form the narration
  lane; multiple dialogue speakers/assets are supported. Empty intervals are silence.
- Word seconds refer to the **untrimmed source file**. Both boundaries use
  `speechSecondsToFrame(s,fps)=round(s*fps)`; global frame = clip start + rounded
  source frame − trim frames. Maximum quantization error: half a frame. Zero-frame,
  overlapping, reordered or out-of-range words reject rather than stretch.
- Text tokens must match exactly in order, punctuation and case. Hindi is retained.
  Cue, clip and alignment language/speaker/window must agree. Gaps preserve pauses.
  Same-speaker/narration overlaps reject. Gains are 0..1, concurrent total <=1;
  set lower gains explicitly when mixing. No automatic ducking or crossfades.
- Cues, words and audio can continue across scene cuts. Only director-local safety
  windows are clipped. The displayed word keeps its global start/punch age and
  uses the existing measured layout, styling and `ToonCaptions` implementation.
- `timing:'supplied'` means caller-supplied timestamps, not machine verification
  of spoken content. `captionTiming` and `alignment[].timing` retain provenance.
  **4A migration:** equal-spacing word cues now require `timing:'estimated'`.
  Missing supplied data, unused/duplicate IDs and contradictory timing reject with
  `StoryError.diagnostic`. Plain line captions remain authored intervals.

## Integration and lifecycle

```ts
const timeline = compileStory(plan);
const audio = await prepareStoryAudio(engine, timeline);
const captions = await engine.wait(createCaptionLayout({
  width, height, words: timeline.captionWords,
}, engine.signal));
// Commit <StoryAudio prepared={audio}/> and <ToonCaptions layout={captions}/>
// using the same React-layout acknowledgement as the executable fixture.
const story = createStory(engine, {timeline, settings, captions, audio});
story.prepare();
// ThreeCanvas autoFrame={false}; onFrame: story.applyFrame(frame).
```

Executable example: [story-audio.tsx](../../toon-kit-tests/story-audio.tsx), with
the full [data plan](../../toon-kit-tests/story-audio-plan.ts). Audio stories
reject missing preparation or cross-story/cross-engine session reuse. Composition
fps/duration must match the full plan; ordinary render frame ranges still work.

Before CLI or programmatic production rendering, call
`validateStoryAudioFiles(plan.audio, absolutePublicDir)` from
`scripts/story-audio-assets.cjs`, then the unchanged production launcher. It
checks canonical workspace files and rejects missing files, escapes, symlinks,
junctions and byte budgets. Never import this Node-only helper into browser scenes.
`verify:story-audio` demonstrates this preflight plus the normal safe launcher.

Use immutable single-audio-stream files in `public/audio`. WAV, MP3, M4A and Ogg
must pass actual Chromium decode/metadata readiness. The browser sequentially
fetches each distinct source once, checks duration against metadata within one
frame, and requires every selected source range to fit the measured duration.
Limits: 16 assets, 64 clips, 120 seconds/source, 16 MiB/file and 32 MiB total.
Metadata elements, listeners and blob URLs are released before readiness completes.
There is no persistent AudioContext or per-frame media decoding. Active lists
and JSX clips are cached. Remotion owns playback/export and render-asset cleanup.

Preparation registers with the existing engine barrier. Engine disposal aborts
pending work synchronously; `audio.dispose()` is also idempotent. Disposed sessions
cannot be reused. All original memory, concurrency, encoding, software-rendering
and workspace-temp safeguards remain mandatory.

## Verification and fixture limits

`npm run test:story-audio` runs focused audio + 4A tests.
`npm run verify:story-audio` renders one 288-frame 720p MP4, checks browser assertions,
H.264/AAC streams and source/export waveform correlation at start/middle/end.
`npm run verify:story-audio -- analyze` rechecks the existing MP4 without rendering.
Analysis uses the pinned renderer's bundled FFmpeg, WAV/PCM16 and matching stereo
conversion. Outputs are ignored under `out/phase4b`.

The included user recording has **sentence timestamps only**. Its within-sentence
words are explicitly estimated, not verified speech synchronization. Supplied-word
math is separately tested with synthetic Hindi/English inputs. Real word timestamps
are still needed to certify this recording's word accuracy. Linux VM certification
and portable Devanagari font packaging remain outside this local validation.
