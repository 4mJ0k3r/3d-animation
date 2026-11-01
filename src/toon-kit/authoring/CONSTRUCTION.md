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
window, door, platform, barrier, column, block, tree. Partial `size` uses metres;
column/tree width and depth must match. Prefab sizes remain fixed. Choose
`facing: front|right|back|left`; arbitrary angles/XYZ are unsupported. Structural
finishes: cream, brick, slate, white, wood (tree finish colors its trunk).
Existing prefab finishes/text rules apply. Ground is 10..20m per axis with sand,
grass or paving. It is finite; the ground edge can enter a wide camera view.

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
attached children: window/door/panel/sign/screen. Supported top children:
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
