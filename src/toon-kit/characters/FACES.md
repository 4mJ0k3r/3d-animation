# Stage 2D-A facial expressions

New declarative casts enable a face by default. Construct once, then give complete
intentions at the requested frame. No canvas, UV, coordinate or joint editing:

```ts
const cast = createCast(engine, {
  doctor: {stance: standAt(clinic.mark('doctor'))},
  patient: {
    stance: sitAt(clinic.seat('patient')),
    face: {blink: {period: 3.8, duration: .18, phase: .7}},
  },
});
cast.evaluate({frame, fps, poses: {
  doctor: {
    expression: 'explaining',
    gaze: lookAt(cast.actors.patient.target('head')),
    gesture: pointAt(clinic.target('diagram')),
  },
  patient: {
    expression: {name: 'worried', mouth: 'frown', blush: .25},
    gaze: lookAt(cast.actors.doctor.target('head')),
  },
}});
```

## Inputs and deterministic defaults

`expression` accepts `neutral`, `happy`, `worried`, `surprised`, `angry`, `sad`,
`explaining`, or `{name, intensity?, mouth?, blush?}`. Intensity 0..1 controls the
eye/brow exaggeration (0 gives neutral features); named mouth overrides remain
discrete, suitable for later lip-sync integration. `mouth` accepts `auto`,
`closed`, `smile`, `frown`, `open`, `o`. `blush` is 0..1, default 0.
There is no audio analysis or automatic speech system.

Actor construction `face` accepts:

```ts
face: {
  textureSize: 256,            // 256 default; 512 optional close-up texture
  defaultExpression: 'neutral',
  blink: {period: 4, duration: .18, phase: .7, enabled: true},
}
```

Period/duration/phase are seconds. Default phase is a stable hash of actor ID,
not random state. Each period starts with one bounded half-cosine closure/opening
window of `duration` seconds. Period 0.5..120, duration 0.06..0.5 and strictly less
than period, phase 0..120. `enabled:false` holds eyes open. A frame intention
`blink:0..1` overrides closure without losing the expression; 0=open, 1=closed.

Omitting expression returns to the configured default (normally neutral), mouth
auto, intensity 1 and blush 0. Omitting blink restores the absolute-time schedule,
not necessarily open eyes. No previous-frame state survives. For a static open-eye
portrait, use `blink:0` or disable automatic blinking at construction.

Stage 2C `gaze` retains its existing head bounds/pose. Pupils follow its head-local
residual direction, capped at ±25° yaw / ±18° pitch. With an in-range head target,
the head already aims at the target, so pupils are centered naturally. Optional
`eyeGaze:lookAt(target)` requests an eyes-only glance without changing the head;
it resolves semantic targets through the same current-frame target graph.
Far/behind targets saturate at the eye bound; they cannot make the head turn.
Pupils are clipped inside each expression's sclera throughout blinking.

`snapshot.faces[name]` contains immutable expression/intensity/mouth/blush,
closure, and normalized bounded `[horizontal, vertical]` pupil position.
Positive horizontal is head-local +X; positive vertical is up. Closure/pupils
are quantized to 1/256, below a default texture pixel's feature movement, to avoid
uploads caused by floating-point residue. The result depends only on current
inputs, configuration and absolute frame/fps, never cache history.

`face:false` opts out; facial intentions then fail clearly. Raw
`createCharacterFactory().create()` remains faceless by default for Stage 2A/2B
compatibility; pass `face:{}` when explicitly enabling its render view. Prefer
`createCast()` for automatic expression/gaze/time evaluation. Pure Node casts
evaluate the identical math without allocating browser Canvas2D/WebGL objects.

## Geometry, rendering and ownership

One shared unit spherical UV patch per character factory, attached to the existing
`head` joint, scaled by head radius. Grid 24×16 adds 768 triangles and one mesh:
ordinary faced character **20 meshes / 3,552 triangles**. Head/body proportions,
joint origins, IK, physical contacts and head gaze are unchanged. No second head
hierarchy, billboard, rectangular quad or per-frame geometry is created.

The patch is 1.2% outside the spherical head to clear the existing faceted sphere.
Its boundary is fully transparent. Facial strokes/whites/mouth are drawn together
in private 256×256 CanvasTexture data, with 512×512 opt-in. No fonts or asynchronous
images are needed. Texture sRGB metadata preserves color conversion through the
existing pipeline. Basic material uses alpha blending and a small alpha test,
depth testing with no depth writes (the opaque head supplies depth), no shadow
casting and outline mode `none`. The existing alpha-aware normal/depth/policy
passes preserve cutouts. Blush blends softly with the underlying skin.
Black facial ink comes from the drawing, not postprocessing mesh borders.
Faced spherical heads use the existing `silhouette-only` policy to suppress
grazing faceted-sphere crease specks; their outer ink contour remains.

Each character owns a mutable texture, material and two bounded staging canvases.
Pure facial validation completes for all actors; then all rasters are prepared
privately before body or texture publication. Invalid actor inputs publish
nothing. Unchanged resolved faces reuse the texture without redraw/upload.
Changed faces clear and paint a full staging image; swapping only occurs after
the whole cast passes preflight. No per-frame materials/geometries or new passes.
Expected validation errors are `CastEvaluationError` with `FACE_INVALID`.

The existing engine tracks geometry/material/texture ownership, including detached
rigs. Cast disposal detaches/invalidate rigs; engine disposal releases shared GPU
resources exactly once and shrinks both backing canvases. No cross-engine caches.
Do not use `rig.prepareFace` directly in scene code; it is the cast's internal
transactional render bridge. Never catch an evaluation error and capture an old
face or pose.

## Verification

Run serially, including memory tests (they themselves launch simulated jobs):

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:faces
```

`verify:faces` uses the unchanged production launcher, software-safe SwiftShader,
one worker and workspace temp/cleanup. It produces under `out/phase2da/`:

- `contact-sheet.png`: all seven expressions, two head proportions/skin colors,
  front and oblique views. Labels are outside the facial render.
- `gaze-blink-sheet.png`: forward/left/right/up/down, front/oblique/side and open/
  half/closed blinking. Left actor uses eyes-only gaze, right uses head plus eyes;
  the side panel isolates one actor to avoid occlusion.
- `demo.mp4`: six seconds, discrete expressions, absolute-time independent blinks
  and explicit camera cuts. No timeline interpolation or camera automation.
- `interaction.mp4`: two seconds of explaining/pointing and worried listening.
- `closeup-512.mp4` and extracted PNG: optional higher texture resolution.
- `portrait.mp4`: native 720×1280, large single-character face with all seven
  expressions and a fixed head-gaze target, using the optional 512 texture.
- `validation-results.json`, per-job production telemetry and extracted frames.

Contact sheets are lossless captures from actual 720×480 software WebGL renders,
composed on a 2D canvas; their larger sheet dimensions do not allocate oversized
WebGL targets. The demonstration videos are actual guarded 1080×720 H.264 renders.
Beauty previews have no gaze arrows. Existing Stage 2C diagnostic captures keep
their arrows. Generated assets/telemetry remain gitignored; test sources are tracked.

## Limits and stage boundary

At a true side angle features foreshorten and the far eye is occluded by the head;
faces do not turn toward the camera independently. Frontal/oblique shots are the
readability reference. The fixed head tessellation still has a mild polygonal
outer contour at large magnification. Eye gaze cannot exceed anatomical limits;
mouth shapes and expression changes are discrete. No nose, facial animation
blending or audio lip-sync is implemented here. Hair, clothing and appearance
presets are now provided through [APPEARANCE.md](APPEARANCE.md); walking and legacy
clinic migration remain out of scope. Camera architecture and production memory limits
are unchanged. Local measurements do not certify the ballooned Linux VM.
