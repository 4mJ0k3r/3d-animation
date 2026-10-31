# Stage 2B — analytic IK and supported contacts

For ordinary scene authoring, use [createCast](CAST.md) with `standAt`, `sitAt`,
`reachFor` and [walkAlong](WALKING.md). The pure functions below are the advanced
foundation, not a requirement to calculate joints or contacts by hand. Walking
uses this same solver via an internally resolved `WalkingContact`; authors must
not manufacture foot targets each frame.

Pure data in, immutable complete pose out. Solvers do not import Three.js, read
scene objects or previous poses, create geometry, start clocks or retain state.
Apply the returned pose with the existing rig API. A rejected result has
`ok:false`, `pose:null` and structured diagnostics. Do not skip a failed update
and render an old pose: stop capture or surface the error explicitly.

```ts
const floor = levelFloor(0);
const seat = seatTarget({
  center: [1.5, .45, 0], // World top-surface center.
  width: 1, depth: .9, thickness: .1, yaw: Math.PI / 12,
});

const result = solveContactPose(character.definition, {
  support: sitOn(seat, {floor, feet: 'auto'}),
  scale: 1,
});
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
character.applyPose(result.pose);
```

Standing and reaching:

```ts
const result = solveContactPose(character.definition, {
  support: standOn(floor, {at: [0, 0], yaw: 0, crouch: .5}),
  reaches: [reachTo('left', worldPoint([.55, 1.68, .3]))],
});
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
character.applyPose(result.pose);
```

The reach point denotes the desired **hand center**, not a surface automatically
offset from an arbitrary prop. Feasibility depends on the chosen proportions;
the solver never silently moves a requested reach target into range.

## Coordinate spaces and scaling

- Floor height, standing X/Z, seat center/yaw and reach points are in world space.
- Seat dimensions and thickness are world lengths. Front is the seat's yaw-rotated
  +Z direction; the front edge is local `Z=depth/2`. The slab extends down from
  the top center by `thickness`. Width/depth define the usable rectangular top.
- Root stays on the selected floor plane. Sitting moves the pelvis relative to
  this ground-based root and aligns the body heading to the seat.
- `scale` is root scale relative to its parent, exactly as in Stage 2A.
- Optional `parent:levelFrame({position, yaw, scale})` describes the **current
  composite world transform of root.parent**, not a joint and not merely an
  ancestor's local transform. It must match the actual parent used for rendering.
  Default is the scene's identity frame. The solver converts all world targets
  through the composed parent/root yaw, translation and uniform scale.
- Contact frames permit yaw only and positive uniform scale `0.05..20` for both
  parent and root. Translation, raised floors and yaw rotations within the
  numeric domain (angles bounded to ±1e6 radians) are supported.
  Tilted floors/seats, pitch/roll, reflections, shear and nonuniform scaling are
  rejected or outside the declared descriptor contract. Stage 2A raw applyPose
  behavior is unchanged.
- Pose joint positions/rotations remain parent-local. Mesh scales/rest dimensions
  are unchanged. In particular, shoes counter-rotate the solved shins so their
  soles remain level; arm/leg lengths never change.

## Analytic IK

`solveTwoBoneIK({origin,target,upperLength,lowerLength,pole,fallbackDirection?,
fallbackPole?})` accepts all vectors in one common space. Pole vectors are bend
**directions**, not target positions. Results contain the bend joint, achieved
endpoint and absolute upper/lower orientations in that same space.

For lengths L1, L2 and clamped target distance d:

```text
reach interval = [abs(L1-L2), L1+L2]
a = (d + (L1-L2)*(L1+L2)/d) / 2
h = sqrt(max(0, (L1-a)*(L1+a)))
joint = origin + direction*a + projectedPole*h
```

Zero distance with equal lengths uses an explicit full fold; unequal lengths
limit to the minimum reachable distance. Exact extension is preserved—there is
no epsilon shortening that lifts feet. Degenerate poles use the anatomical
fallback, then a least-aligned canonical axis with fixed tie order. Subnormal
direction hints are scale-normalized before use. No previous-frame bend plane.

The numerical domain is finite coordinates within ±1e6, lengths `1e-6..1e6`.
Invalid input returns `ok:false`. Valid but unreachable input returns `ok:true`,
`reachable:false` and limiting diagnostics with a fixed-length solution. The
semantic contact solver rejects such a solution rather than applying it.

Knees bend toward character +Z. Arm poles are mirrored outward/down/back in
character space. Semantic reaches require outward shoulder exit, elbow flexion
no greater than 150 degrees, and torso/head/limb clearance. Direct low-level IK
does not impose these body constraints. Exact singularities have deterministic
fallbacks; continuity through every possible pole singularity is not promised.

## Standing and seating policy

- Standing preserves ankle positions and sole contact. Crouch `0..1` lowers the
  pelvis by up to 35% of combined leg length and analytically solves both knees.
  Incompatible proportions or clearance return diagnostics, not stretching.
- Sitting aligns the torso capsule's bottom contact to the seat surface. A
  proportion-relative contact patch must fit the top. Hip positions remain
  derived from the body. Knees are automatically placed beyond the front edge
  by the leg radius plus a small clearance.
- Seated thighs are level. If the floor is within shin reach, shins slope forward
  as needed and shoes meet it. If the seat is higher, `auto` produces straight
  dangling shins. `floor` rejects an excessive seat height; `dangle` rejects
  floor penetration. The result reports each foot as floor-supported/dangling.
- This policy does **not** search alternative perching, leaning or sloping-thigh
  poses that might make a different seat/floor combination feasible.
- Bounded geometric checks cover the body, limbs, level floor and declared slab.
  Expanded segment/slab and shoe AABB tests are intentionally conservative near
  rounded corners; a safe-looking near-contact pose can be rejected.
- Seats are open-front slabs. Backs, arms, legs, aprons and unrelated scene props
  are not inferred. Their geometry must leave the declared contact space clear.
  This is not a scene collision/physics engine or a load/stability simulation.

## Diagnostics and lifecycle

Diagnostics contain `code`, `severity`, `message` and optional limb. Low-level
IK diagnostic vectors use its input coordinate space. `FEET_DANGLING`,
`IK_ZERO_DISTANCE` and `IK_BEND_PLANE_FALLBACK` are informational when feasible.
Errors include `REACH_UNREACHABLE`, `FLOOR_UNREACHABLE`, `STANCE_UNREACHABLE`,
`JOINT_LIMIT`, `BODY_CLEARANCE`, `LIMB_CLEARANCE`, `SEAT_CLEARANCE`,
`FLOOR_CLEARANCE`, `SEAT_TOO_NARROW`, `SEAT_TOO_SHALLOW`, `SEAT_TOO_LOW`,
`INVALID_TARGET`, `INVALID_FRAME`, `INVALID_REQUEST`, `DUPLICATE_REACH` and
`PLACEMENT_OUT_OF_RANGE`.

No new GPU resources belong to the solvers. Engine-owned resource and disposal
rules remain Stage 2A's. IDs are now reserved on the engine owner via an opaque
symbol-keyed Set, never a global GPU cache or cross-engine mutable registry.
All factories with that owner share reservations until engine disposal.

## Reproduction

Run serially from project root; never remove a live production lock:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
```

The contact command uses the unchanged guarded production launcher, one worker,
software-safe/swangle, memory admission and workspace scratch. It renders 90
frames at 1600x900 and writes `out/phase2b/views.mp4`, three views, hashes and
reports. Each view contains compact/tall pairs: standing, crouched/reaching and
seated. Seated targets are yawed by 15 degrees. No animation blending is added.
The bundled compositor FFmpeg has no select filter, so screenshots use verified
accurate seeks at 0/1/2 seconds; determinism tests hash direct PNG bytes before
video encoding. Large outputs are gitignored.
