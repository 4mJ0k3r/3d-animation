# Phase 5F — real Hindi dialogue

Baseline engine commit: `5a895c0`. Final plan: `examples/phase5e-nikalna-v3.story.json`.
Output: `out/phase5e-nikalna-v3-narrated.mp4`.
Production report: `out/phase5e-nikalna-v3-narrated-report.json`.

The five original mono MP3s from `assests/audio/` are copied byte-for-byte to
`public/audio/phase5e/`, the location required by the existing Phase 4B contract.
No engine, shot, beat, layout, character, or scene-boundary changes. Board text
`कल ऑफिस पिकनिक!` and seated Arjun persist in all three scenes. Total: 840 frames,
30 fps, 720×1280, 28 seconds. The silent reference MP4 is preserved.

| Clip / speaker | Source seconds | Global frames [start, end) | Playback seconds |
| --- | ---: | --- | --- |
| naina_01 / naina | 3.631000 | 12–120 | 0.400–4.000 |
| naina_02 / naina | 2.115875 | 125–188 | 4.167–6.267 |
| arjun_01 / arjun | 2.429375 | 295–367 | 9.833–12.233 |
| naina_03 / naina | 2.429375 | 405–477 | 13.500–15.900 |
| arjun_02 / arjun | 2.690563 | 570–650 | 19.000–21.667 |

Naina's first recording outlasts its former 68-frame caption window. Its start
remains frame 12; the second line moves from frame 95 to 125 to avoid overlap,
leaving five frames between clips. Other line starts are unchanged. Dialogue cue
ends now match clip ends; the final unspoken caption remains at frames 690–830.
Visual gestures retain their original timing, so they are not phoneme-matched.

Each playback duration is floor(source seconds × 30) frames, trim offset zero,
volume 1, no speed changes. At most 31 ms is omitted from the silent tail of each
file; FFmpeg silence detection found at least 275 ms of trailing silence. No words
are deliberately trimmed. All five clips fit within their existing scenes.

The JSON contains explicit per-word source timestamps. These are manual estimates
bounded by actual clip duration and guided by `silencedetect=noise=-35dB:d=0.08`
pauses and approximate within-phrase subdivisions. Silence detection does not
identify words. No forced alignment or exact word/lip synchronization is claimed.
The current schema requires `timing:"supplied"` for explicit timestamps: this means
caller-supplied, not verified. IDs end in `-estimated-words` to retain that provenance.
The final non-spoken caption retains `timing:"estimated"`.

Validation: requested CLI validation passes with five audio assets. All 72 existing
authoring/audio/story/segmentation tests pass. Four pre-existing static two-shot
gaze warnings remain; all three guarded scene preflights pass.

Integration verification (after `npm run test:authoring`):

```powershell
node scripts/verify-phase5f.cjs --plan-only
node scripts/verify-phase5f.cjs
```

The verifier checks the silent-v3 visual structure fingerprint, speaker mappings,
original asset bytes, bounded clip durations, explicit estimated alignments,
H.264/AAC streams, 840 decoded frames, full decode, and source/export waveform
correlation for every placed clip. Evidence: `out/phase5f/verification.json`.

Final export verification passed: H.264 video, 48 kHz AAC audio, 840 frames,
28 seconds, full decode without errors. All five waveform comparisons found
zero sample lag at 16 kHz; correlations were 0.978–1.000, gain 0.994–0.998.
Decoded frame inspection confirmed readable Hindi board/captions, seated Arjun,
gestures, and valid picture on both sides of both scene joins. Contact sheets:
`out/phase5f/final-review.jpg` and `out/phase5f/final-joins.jpg`. Inspection was
frame-based, not a claim of exact word-by-word listening/alignment certification.

An initial attempt stopped before publication because the integration verifier
was edited while rendering (the source-integrity guard correctly rejected it).
Its artifacts are preserved under `out/phase5f/interrupted-segments`. A fresh
guarded render with frozen source completed successfully and published one final
narrated MP4; no renderer safeguards were changed or bypassed.

Changed files: this report, the final story JSON, five files under
`public/audio/phase5e/`, and `scripts/verify-phase5f.cjs`. Rendered media and machine
reports stay under ignored `out/`; unrelated input files remain untouched.
