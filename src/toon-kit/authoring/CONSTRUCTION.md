# Custom scene construction (Phase 6B)

Use the existing StoryDocument/CLI with `preset:"custom"`. This selects the
assembler, not a setting: there is no school/garden preset or scene callback.
The normative schema is `Construction` plus `planConstruction()` validation in
[construction.ts](construction.ts). Existing office/clinic/street remain intact.

```json
"layouts": {
  "courtyard": {
    "preset": "custom",
    "composition": {
      "ground": {"width": 14, "depth": 12, "finish": "paving"},
      "items": {
        "facade": {
          "kind": "wall", "size": {"width": 9, "height": 3.8},
          "finish": "brick",
          "place": {"relation": "alongBoundary", "boundary": "back", "gap": 1}
        },
        "entrance": {
          "kind": "door",
          "place": {"relation": "attachedTo", "target": "facade", "face": "front", "vertical": "bottom"}
        },
        "notice": {
          "prefab": "sign", "text": "आज विज्ञान मेला",
          "place": {"relation": "near", "target": "finish", "side": "left", "gap": 0.5}
        }
      }
    }
  }
}
```

Each item declares exactly one `kind` or existing `prefab`. `STRUCTURES` exports
kinds, default dimensions and min/max dimensions. Kinds: floor, wall, panel,
window, door, platform, barrier, column, block, tree, trim. Partial `size` uses metres;
column/tree width and depth must match; trim provides architectural accents such as baseboards, chair-rails, and crown moldings (default `[4, 0.15, 0.04]`, min `[0.4, 0.04, 0.02]`, max `[12, 0.4, 0.1]`). Windows support panoramic/observation scaling up to width 4m and height 2.2m. Prefab sizes remain fixed. Choose
`facing: front|right|back|left`; arbitrary angles/XYZ are unsupported. Structural
finishes: cream, brick, slate, white, wood, charcoal, metal, navy, teal, mint, red, yellow (tree finish colors its trunk).
Existing prefab finishes/text rules apply. Ground is 10..20m per axis with finishes: sand, grass, paving, wood, slate, tile, carpet.
It is finite; the ground edge can enter a wide camera view.

## Relationships

| relation | Options / meaning |
| --- | --- |
| alongBoundary | boundary: back/front/left/right; align: center/start/end; gap |
| beside | target item; side: left/right; align; gap |
| behind / inFrontOf | target item; align; gap |
| near | target: entry/finish/right or item.front; side: left/right/front/behind; gap |
| attachedTo | target wall/panel; face: front; align; vertical: bottom/middle/top |
| onTopOf | target platform/block/table; centered, footprint must fit |

Beside/behind/front/boundary use scene axes: Y up, +Z front, +X right.
Start/end mean negative/positive tangent axis. Attached fronts inherit parent
orientation and use a 1cm surface separation and 15cm face margins. Supported
attached children: window/door/panel/sign/screen/trim. Trim attached to a wall or panel supports vertical alignment (`bottom` for baseboards/skirting, `middle` for chair/accent rails, `top` for frieze/crown moldings) and tangent alignment (`start`, `center`, `end`). Supported top children:
column/block/planter/sign/screen. Top children retain their selected facing.
Gap is 0..3m (default 0.3, or 0.5 near). Dependencies resolve in canonical ID
order, independent of declaration order. Cycles reject. Placements are static;
attachments are resolved construction constraints, not animated attachments.

## Interactions and camera

Select `scene.setting` normally and use existing cast/action/shot declarations.
Built-ins: entry/finish (left lane), right, ground, toMeeting (entry -> finish),
audience. Every item ID is a pointing/gaze target and objectFocus subject.
Chair/bench IDs are seats. Safe ground marks are derived as `item.front` and,
for seats, `item.approach`. Clear straight level paths are named
`to:item.front` / `to:item`, from entry for the left lane or right for the right
lane. `environmentCatalog(layout)` / `planConstruction(layout).catalog` list
actual available anchors: blocked/out-of-ground marks and paths are omitted,
not replaced with unsafe paths. Requesting an omitted name rejects with
UNKNOWN_SLOT and available alternatives. Use different left/right lanes for
the two active actors. Standing locations/paths reserve a conservative 0.65m
horizontal body clearance and 3.3m height; this is not gesture collision physics.

Raised surfaces are decorative supports, not automatically traversable floors.
Window/door are facade inserts, not holes or walk-through portals. Floor regions
share ground height zero; polygon offset avoids coplanar color flicker. No
multi-level navigation, stairs, custom proportions, arbitrary assets or callbacks.
Object-focus of an obstructed surface may reject: attached decorations can
occlude its face. Focus the desired sign/window/door or adjust the JSON shot.
Full visibility certification requires guarded preparation, as before.

One minimal generic staging correction separates exterior camera space from
physical floor footprint. Only custom bindings supply a fixed bounded exterior
camera volume through existing createStage; no author camera coordinates,
new camera system or extra rendering pass. Indoor/default stage zones are
unchanged. Compact scenes can now use wider actor shots without CAMERA_ZONE.

## Budgets and ownership

Per custom layout: 24 total items, at most 18 structures and 6 prefabs;
40 meshes including ground, 12,000 triangles, 24 scene materials, 6 referenced
textures (including gradients), at most 4 text textures, attachment depth 2,
maximum constructed height 6m. Geometry budgets are checked on construction;
piece, text and mesh estimates also reject during pure validation. The mesh
budget leaves room for two actors under the existing 64 visibility-proxy cap.
At most four layouts and two active actors remain supported.

All geometry is created once through the owner-local primitive factory. Toon
materials reuse one compatible immutable ramp within the engine; original
tracked pool resources still dispose with their owner. No cross-engine GPU
cache. New per-frame mesh/material/texture allocations: zero; existing bounded
pose/director evaluation is unchanged. Overlap checks use conservative
quarter-turn AABBs, with touching contact allowed; rejection can be conservative
for rounded shapes. No general collision/navigation/procedural-mesh engine.

## Examples and verification

Complete JSON-only stories: [school courtyard](../../../examples/custom-school.story.json)
and [garden plaza](../../../examples/custom-garden.story.json).

```sh
npm run story -- validate --plan=examples/custom-school.story.json
npm run story -- prepare --plan=examples/custom-school.story.json
npm run story -- render --plan=examples/custom-school.story.json --output=out/phase6b/school.mp4 --report=out/phase6b/school-report.json --verify=true
node scripts/verify-construction.cjs garden
```

The last command captures only three garden video frames as a screenshot
container, but runs browser determinism/preparation checks against the full
90-frame garden plan. It extracts school frames 0/45/75 and garden frame 0.
Use `node scripts/verify-construction.cjs` to reproduce both from scratch;
`stills` only re-extracts existing outputs. FFmpeg/ffprobe must be available.
Every render uses the guarded launcher sequentially; do not bypass production
memory admission, swangle, concurrency 1, preflight or workspace temp isolation.


## Phase 6C-A: opt-in third actor

Custom layouts may add `composition.thirdActor:{"at":"guestSeat.approach"}`
(or a clear `item.front`). This reserves a third contact role and exposes the
standing alias `third`; a selected seat.approach also assigns its seat to that
role. Use existing stand/sit, expression, gesture, look and point actions for any
actor. Roles are not tied to actor IDs. Overlapping marks/seats/paths are removed;
invalid reservations reject with THIRD_ACTOR_PLACEMENT. Name `third` is reserved
only in this mode. Existing layouts and default custom layouts remain two-actor.

Three-actor mode caps environment geometry at 28 meshes (default remains 40),
leaving 36 actor proxies inside the unchanged 64-proxy limit. TwoShot takes
exactly two subjects; `groupShot` (Phase 6C-B) takes exactly the three actors and
requires every face/eye region visible; single-subject shots may target any actor. No third-lane
walking, new transitions or camera types are introduced. Existing visibility
limits still apply, including region limits for establishing shots with gestures.
See [custom-three-actors.story.json](../../../examples/custom-three-actors.story.json).


## Phase 6D-A: deterministic prop animation

Custom-layout scenes may add `propAnimations`. Each entry moves an existing item's
transform; meshes, materials and textures are reused, never rebuilt.

```json
"propAnimations": [
  {"prop":"crate","type":"slide","to":"backdrop.front","startFrame":0,"endFrame":12,"easing":"easeInOut"},
  {"prop":"crate","type":"lift","height":0.4,"startFrame":12,"endFrame":18},
  {"prop":"crate","type":"lift","height":0,"startFrame":18,"endFrame":24},
  {"prop":"notice","type":"rotate","axis":"y","degrees":40,"startFrame":4,"endFrame":20}
]
```

- Frames are absolute story frames, half-open, inside the scene. `easing` is
  `linear` (default) or `easeInOut`. Each track (slide, lift, rotate per axis)
  goes to its value and holds it; the next entry on that track starts from there.
  Before the first entry the prop is at rest. Same-track entries may not overlap.
- `slide.to` names a catalog ground mark (`entry`, `finish`, `right`, `item.front`,
  `seat.approach`). `lift.height` is 0..1.5m above rest. `rotate` uses `y` up to
  ±360° or `x`/`z` up to ±15°. No XYZ coordinates or keyframes.
- At most 8 entries and 3 animated props per scene, each at least 2 frames.
- Eligible: independent `block` items and prefabs. Rejected: walls, floors,
  panels, windows, doors, platforms, barriers, columns, trees, attached/stacked
  items and their parents (`PROP_NOT_ANIMATABLE`); curated layouts
  (`PROP_ANIMATION_UNSUPPORTED`).
- Generated `X.front`, `X.approach`, `to:X…` anchors and seat `X` are rest-position
  snapshots; using them for an animated `X` rejects with `PROP_ANIMATION_STALE_TARGET`.
  Point/look/objectFocus at `X` itself; those follow the current-frame transform.
- A conservative swept envelope must stay inside the ground and clear of scenery
  and the scene's declared standing, seat and walking space, else
  `PROP_ANIMATION_BLOCKED`. There is no physics or collision simulation.

Example: [custom-prop-animation.story.json](../../../examples/custom-prop-animation.story.json).


## Phase 6E-A: composite objects

A custom-layout item may declare `object` instead of `kind` or `prefab`. It is a
normal construction item: placed with the same relations, one stable item ID for
pointing, gaze, effects and `objectFocus`, overlap/path checks and budgets.

```json
"lamp": {
  "object": {
    "focus": "lantern",
    "parts": {
      "base":    {"shape": "cylinder", "size": {"width": 0.5, "height": 0.2}, "finish": "charcoal"},
      "pole":    {"shape": "cylinder", "size": {"width": 0.12, "height": 2.6}, "finish": "charcoal", "place": {"on": "base"}},
      "lantern": {"shape": "sphere", "size": {"width": 0.55, "height": 0.6}, "finish": "glow", "place": {"on": "pole"}},
      "hat":     {"shape": "cylinder", "size": {"width": 0.75, "height": 0.25}, "taper": 0.3, "finish": "charcoal", "place": {"on": "lantern"}}
    }
  },
  "place": {"relation": "near", "target": "entry", "side": "left", "gap": 0.8}
}
```

- Shapes: `box`, `roundedBox`, `sphere` (ellipsoid when width/height/depth differ),
  `cylinder` (optional `taper` 0.1..2 = top/base diameter), `capsule`.
- `size`: `width` and `height` 0.04..3 m; `depth` defaults to `width`.
- Exactly one part omits `place`; it stands on the ground at the object origin.
  Other parts use `{"on": part}` (centered on its top), `{"centeredOn": part}`
  (same center), or `{"beside": part, "side": "left|right|front|back",
  "align": "bottom|middle|top", "gap": 0..0.5}` (touching that face).
- Finishes: cream, white, wood, brick, slate, charcoal, metal, navy, teal, mint,
  red, yellow, glow. `focus` names the pointing/gaze part (default: the root).
- Limits: 4 objects per layout, 8 parts per object, part chains up to 4 levels
  from the root, overall 3 x 4.5 x 3 m, an estimated 2500 triangles per object.
  Each part is one mesh counted in the layout's 40 (or 28) mesh budget, so actor
  visibility budgets are unchanged. Errors: `INVALID_OBJECT`, `OBJECT_PLACEMENT`,
  `OBJECT_BUDGET`, plus the existing construction codes.
- Objects can sit `onTopOf` a platform/block/table, not `attachedTo` a wall.
  Effects may target them.
- Phase 6E-B: a freestanding object animates as one unit with the existing
  `propAnimations` (`slide`, `lift`, `rotate`); all parts keep their relative
  layout. Gaze, pointing (at the focus part), `objectFocus` regions and effects
  follow the current transform. Objects stacked `onTopOf` a support, and that
  support, stay static (`PROP_NOT_ANIMATABLE`). The object's generated `.front`
  mark and paths are rest snapshots (`PROP_ANIMATION_STALE_TARGET`). There is no
  per-part animation.
- Parts reuse the pooled primitive factory and toon materials (one material per
  finish, one geometry per unit shape) and inherit the existing outline policy.

Example: [custom-objects.story.json](../../../examples/custom-objects.story.json)
(a street lamp and a sci-fi beacon from the same API).

## Phase 8B: Reusable Environment Art Direction & 3-Layer Depth Recipes

Phase 8B enriches Toon-Kit's declarative environments without increasing GPU/CPU budgets, adding shaders, or breaking deterministic software-safe rendering:

1. **`trim` Structure Kind:**
   - Provides architectural detail lines (skirting/baseboards, chair-rails, wainscot dividers, friezes).
   - Default dimensions: `[4, 0.15, 0.04]` (min `[0.4, 0.04, 0.02]`, max `[12, 0.4, 0.1]`).
   - Attached to `wall` or `panel` via `{"relation": "attachedTo", "target": "wallId", "vertical": "bottom" | "middle" | "top", "align": "start" | "center" | "end"}`.
   - Contributes exactly 1 box mesh to the layout budget.

2. **Panoramic / Observation Windows:**
   - Window structure max size extended to `[4, 2.2, 0.15]`.
   - Allows expansive observatory or scenic exhibition windows.

3. **Unified 12-Finish Palette:**
   - All structures and composite object parts share 12 cohesive finishes:
     `cream`, `brick`, `slate`, `white`, `wood`, `charcoal`, `metal`, `navy`, `teal`, `mint`, `red`, `yellow`.
   - Materials are pooled and shared across the scene with zero per-frame allocation.

4. **Indoor & Outdoor Ground Finishes:**
   - `ground.finish` supports 7 finishes: `sand`, `grass`, `paving`, `wood`, `slate`, `tile`, `carpet`.

### 3-Layer Environmental Staging Guidelines

To make scenes feel grounded and cinematic instead of flat or empty, compose custom layouts across three distinct spatial planes:

- **Background Layer (Depth & Context):**
  - Anchor the back boundary with a main wall (`alongBoundary: "back"`).
  - Add architectural rhythm using `column` pilasters or corner pillars.
  - Break up monotonic wall planes with `trim` (`vertical: "bottom"` for skirting, `vertical: "middle"` for wainscot rails) and large panoramic `window` or framed `sign` inserts.
- **Midground Layer (Action & Interaction):**
  - Place primary interaction surfaces: workbenches, lab consoles, science fair tables, or seating.
  - Contrast the floor plane using an accent `floor` structure or runner (e.g. `finish: "navy"` or `finish: "wood"` over `tile` ground).
  - Place hero composite objects or props (`object` or prefabs) where characters congregate.
- **Foreground Layer (Scale & Framing Parallax):**
  - Frame the shot with subtle foreground boundaries (`alongBoundary: "front"` or `near: "entry"` / `"right"`).
  - Use low `barrier` partitions, decorative `planter` boxes, or flanking edge `column`s to provide parallax cues as cameras shift between angles.

#### Recipe: School Science Fair
```json
{
  "ground": {"width": 14, "depth": 12, "finish": "wood"},
  "items": {
    "backWall": {
      "kind": "wall", "size": {"width": 10, "height": 3.8}, "finish": "slate",
      "place": {"relation": "alongBoundary", "boundary": "back", "gap": 0.8}
    },
    "skirting": {
      "kind": "trim", "size": {"width": 9.6, "height": 0.15}, "finish": "charcoal",
      "place": {"relation": "attachedTo", "target": "backWall", "face": "front", "vertical": "bottom"}
    },
    "chairRail": {
      "kind": "trim", "size": {"width": 9.6, "height": 0.1}, "finish": "navy",
      "place": {"relation": "attachedTo", "target": "backWall", "face": "front", "vertical": "middle"}
    },
    "schoolBanner": {
      "prefab": "sign", "text": "विज्ञान प्रदर्शनी", "finish": "teal",
      "place": {"relation": "attachedTo", "target": "backWall", "face": "front", "vertical": "top"}
    },
    "pillarLeft": {
      "kind": "column", "size": {"width": 0.5, "height": 3.8, "depth": 0.5}, "finish": "cream",
      "place": {"relation": "beside", "target": "backWall", "side": "left", "gap": 0}
    },
    "carpetRunner": {
      "kind": "floor", "size": {"width": 4.5, "height": 0.04, "depth": 4}, "finish": "navy",
      "place": {"relation": "inFrontOf", "target": "backWall", "gap": 1.2}
    },
    "exhibitTable": {
      "kind": "block", "size": {"width": 2.6, "height": 0.85, "depth": 0.8}, "finish": "wood",
      "place": {"relation": "inFrontOf", "target": "backWall", "gap": 2.2}
    }
  }
}
```

#### Recipe: Sci-Fi Research Outpost
```json
{
  "ground": {"width": 16, "depth": 14, "finish": "slate"},
  "items": {
    "outpostWall": {
      "kind": "wall", "size": {"width": 12, "height": 4.2}, "finish": "charcoal",
      "place": {"relation": "alongBoundary", "boundary": "back", "gap": 0.5}
    },
    "lowerTrim": {
      "kind": "trim", "size": {"width": 11.6, "height": 0.2}, "finish": "metal",
      "place": {"relation": "attachedTo", "target": "outpostWall", "face": "front", "vertical": "bottom"}
    },
    "accentStrip": {
      "kind": "trim", "size": {"width": 11.6, "height": 0.12}, "finish": "teal",
      "place": {"relation": "attachedTo", "target": "outpostWall", "face": "front", "vertical": "top"}
    },
    "observationPort": {
      "kind": "window", "size": {"width": 3.8, "height": 2.0}, "finish": "metal",
      "place": {"relation": "attachedTo", "target": "outpostWall", "face": "front", "vertical": "middle"}
    },
    "stationPillar": {
      "kind": "column", "size": {"width": 0.6, "height": 4.2, "depth": 0.6}, "finish": "metal",
      "place": {"relation": "beside", "target": "outpostWall", "side": "right", "gap": 0}
    },
    "techConsole": {
      "kind": "block", "size": {"width": 2.2, "height": 0.9, "depth": 0.8}, "finish": "teal",
      "place": {"relation": "inFrontOf", "target": "outpostWall", "gap": 2.0}
    },
    "deckTile": {
      "kind": "floor", "size": {"width": 6, "height": 0.04, "depth": 4}, "finish": "metal",
      "place": {"relation": "inFrontOf", "target": "outpostWall", "gap": 1.0}
    }
  }
}
```
