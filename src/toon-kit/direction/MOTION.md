# Camera motion — Phase 3D

Use the existing `createDirector`, `StaticShot` and `composition:{captions}`
contracts. `StaticShot` retains its name for compatibility; `motion` is optional.
Omit it for a hard-cut, locked camera. No author-facing coordinates/quaternions.

```ts
const shots: StaticShot[] = [
  {id:'closer',type:'reaction',subject:'patient',startFrame:0,endFrame:30,
   motion:{type:'pushIn',amount:'subtle',easing:'easeInOut'}},
  {id:'conversation',type:'twoShot',subjects:['doctor','patient'],startFrame:30,endFrame:60,
   motion:{type:'pan',from:{subject:'doctor'},to:{subject:'patient'}}},
  {id:'reframe',type:'reaction',subject:'patient',startFrame:60,endFrame:90,
   motion:{type:'move',
     from:{type:'medium',subject:'patient',view:'front'},
     to:{type:'reaction',subject:'patient',view:'subjectFront'}}},
];
// Existing initScene / onFrame pattern, with the SAME measured caption layout:
const director = createDirector(engine, {
  stage, shots, durationInFrames:90, aspect:width/height, composition:{captions},
});
director.prepare({sample});
// onFrame: director.applyFrame({frame, snapshot:sample(frame)});
```

- `pushIn`: starts wider and moves to the existing validated closest framing.
  `subtle` removes 6% of initial optical-focus distance; `moderate` removes 12%.
  This is a dolly, not a zoom. Orientation and projection stay constant.
- `pan`: fixed position, changing focus/orientation between semantic regions.
  Actor region defaults to `face`; prop defaults to `full`. Both targets MUST
  already be sampled/protected by the outer shot (faces, protected hands, named
  prop regions). Unsupported references reject; they never silently become safe.
  Composition-relative focus offsets preserve the base vertical caption framing.
  Up to three bounded backoffs (1.18/1.30/1.42) are tested for a safe fixed pivot.
- `move`: independently validates two semantic shot plans, then linearly blends
  their positions and optical-focus points using the selected eased progress.
  Orientation is rebuilt upright from those points, not blended from old camera
  state. Endpoint `view` may select front, threeQuarter (+30 degrees), or
  subjectFront; omitted view uses the existing bounded candidate search.
- Default easing is quintic `easeInOut` (zero first/second endpoint derivatives);
  `linear` is also supported. Projection stays fixed (40-degree lens, no zoom/
  lens changes). Unsupported projection or focus/up singularities reject.

Progress is `(absoluteFrame-startFrame)/(endFrame-startFrame-1)`. First and last
RENDERED frames equal their prepared endpoints exactly; half-open intervals still
apply. Two or more frames are required. Adjacent shots remain hard cuts; automatic
cross-shot continuity/matching is not supplied. Use one `move` for a continuous
transition between its semantic plans. `describe(frame).motion` exposes immutable
endpoints/focus points/check counts; `evaluateCameraMotion(plan, frame)` is a pure
advanced diagnostic helper, accepting only a prepared plan and its frame range.

All rendered frames plus half-frames are checked against BOTH adjacent explicit
scene snapshots. Outer-shot crop, faces/eyes/active hands/props, size, captions,
room zone and conversation axis remain hard constraints. Endpoint views alone
are insufficient. Invalid paths throw `INVALID_MOTION_PATH` with failing sample,
scene frame and visibility details; no strength reduction, actor hiding or pose
changes. Pan reference positions are fixed at explicit shot start; move endpoint
plans use the whole prepared action envelope. This is not automatic target tracking.

Preparation remains <=600 frames/32 shots and restores frame zero in finally.
Base candidates <=6/shot; a move adds <=12 endpoint candidates. A path checks
`3*N-2` states; pan tests at most three paths. Certificates (including move endpoint
regions) remain capped at 16 MiB. Runtime computes interpolation plus the existing
certificate check; no visibility search. No meshes/passes/render targets/browsers
are added. Engine-owned disposal also releases prepared motion metadata.

Visibility is the existing sampled proxy estimate, not pixel-perfect collision
or a proof about arbitrary subframe actor animation. Tilt/shear/nonuniform parent
restrictions are unchanged. Invalid paths should be redesigned semantically,
not forced through by weakening thresholds. Production swangle/software-safe,
concurrency 1, memory admission/abort and workspace temp protections stay mandatory.

Verify: `npm run test:motion`, `npm run verify:motion`. The latter renders ONE
90-frame 720p demonstration and writes boundary stills; `-- stills` re-extracts
from an existing successful render without launching another browser.
