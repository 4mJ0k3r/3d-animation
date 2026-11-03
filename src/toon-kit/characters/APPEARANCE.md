# Stage 2D-B — character appearance

Appearance is immutable construction data, separate from actor ID and complete
frame intentions. All presets use the existing universal rig and facial system.

```ts
const cast = createCast(engine, {
  doctor: {
    appearance: appearancePreset('doctor'),
    proportions: {headRadius: .46},
    stance: standAt(clinic.mark('doctor')),
  },
  patient: {
    appearance: appearancePreset('patient', {
      skin: '#c89068', hair: {style: 'tied-back', color: '#38271f'},
    }),
    stance: sitAt(clinic.seat('patient')),
  },
});
cast.evaluate({frame, fps, poses: {
  doctor: {
    expression: 'explaining', gaze: lookAt(cast.actors.patient.target('head')),
    gesture: pointAt(clinic.target('diagram')),
  },
  patient: {expression: 'worried', gaze: lookAt(cast.actors.doctor.target('head'))},
}});
```

No scene author positions hair, collars, sleeves, glasses or accessories.
`cast.actors[name].appearance` exposes the immutable resolved configuration.
`resolveAppearance(config)` validates/copies plain data without GPU allocation.
`appearancePreset(name, overrides?)` returns reusable resolved appearance data;
it does not create a special rig, identity or proportion preset.

## Configuration

```ts
appearance: {
  preset: 'office',                       // optional
  skin: '#f2c69d',
  hair: {style: 'swept', color: '#272332'},
  clothing: {
    style: 'jacket', color: '#344e80', accent: '#f8e9c9', sleeves: 'long',
  },
  trousers: {style: 'solid', color: '#323647'},
  shoes: {style: 'rounded', color: '#22202b'},
  accessories: ['glasses', 'badge'],
}
```

| Field | Supported values |
|---|---|
| Preset | `doctor`, `patient`, `office`, `casual`, `yellow-mellow` |
| Hair | `none`, `short`, `swept`, `tied-back`, `beanie` |
| Clothing | `shirt`, `hoodie`, `lab-coat`, `jacket` |
| Sleeves | `none`, `short`, `long` |
| Trousers | `solid`, `shorts` |
| Shoes | `rounded`, `sneakers` |
| Accessories | `glasses`, `badge`, `stethoscope` |

Colors must be `#rrggbb`. Unknown fields/styles, invalid colors and duplicate
accessories are rejected. Accessory order is canonical and cannot change output.
Supplying both `appearance` and legacy `colors` is an explicit error; choose one
palette source. Existing `colors`-only characters retain their prior behavior.
Raw factories support the same `appearance` option; pass `face:{}` to enable faces
there, as in Stage 2D-A. Casts enable faces by default.

Without `appearance`, characters retain the approved Stage 2D-A appearance.
An explicit empty `{}` enables a basic teal shirt, short sleeves, dark trousers,
rounded dark shoes, warm light skin and no hair/accessories. Bare style selection
chooses long sleeves for hoodie/coat/jacket and short for shirt. Preset fields
are merged with explicit nested overrides; colors not overridden retain the
preset's palette. To remove preset accessories, supply `accessories:[]`.
Actor proportions remain in the existing sibling `proportions` option and undergo
the unchanged mathematical validation. Appearance cannot change joint lengths.

Appearance is not a frame intention. Build it once during initScene, then animate
only through complete cast requests. Never change a shared material or geometry
through root handles; construction-time overrides are the supported interface.

## Geometry and layering

- Hair is a single shaped spherical cap, with an inset lip joining the actual
  faceted head and a smooth frontal hairline above the maximum eyebrow region.
  Short and swept caps differ in hairline/crown shape; swept adds a subtle painted
  part. Tied-back adds one tapered curved tail attached within the cap/head.
  No stack of overlapping hair spheres or full duplicate head is constructed.
- Cap UV-wrap positions and normals are joined, including the swept hairline;
  this prevents a frontal notch or shading seam. Hair and glasses inherit the
  existing `head` anchor, radius scaling and head rotation. They retain the
  character outline group and use `silhouette-only`, so no extra black forehead
  border is generated. Eyes/brows remain clear in frontal supported expressions.
- Clothing uses the **existing torso and limb solids**, with static toon materials
  and surface textures. Collars, lapels, pockets, buttons, drawstrings, badge and
  stethoscope are painted on the curved torso; there are no floating fabric planes
  or duplicate geometric versions of those details. Sleeves recolor the actual
  arm segments/joints and trousers the actual leg segments/joints. Sleeve tint is
  slightly darker than the torso so an arm stays readable over the same fabric.
- Hoodie adds one folded hood tube, embedded in the upper capsule surface. Its
  inner opening exceeds the maximum supported neck radius. It stays attached to
  `torso`; it is not a hood raised over the head. Torso/hood layering uses the
  existing outline policy to suppress false intersection seams.
- Shoes retain the approved rounded geometry and exact floor contact. Sneakers
  add texture-painted laces and soles rather than new collision volumes.
- Glasses are one merged, curved wire-frame mesh, with no opaque lens obscuring
  the eyes. Their bridge/rings follow the existing face layout and head radius;
  temples can tuck under hair. Glasses do not cast an additional face shadow.
  Badge is attached through torso UVs and stethoscope through the neckline/torso
  map. `APPEARANCE_ATTACHMENTS` names `head`, `torso` and `neckBase` attachment
  contracts; no manual accessory coordinates are exposed to scene authors.

No face renderer, IK/contact solver, head-gaze solver, camera architecture or
postprocessing module is modified. Clothing solids keep their previous physical
dimensions, so standing, sitting, crouching and reaches retain their constraints.
Complete pose application also resets accessory/hair transforms and visibility.

## Resources and production

Geometry, materials and static textures are pooled inside a character factory
owned by one engine. Hair geometry is shared across colors/head sizes; the rig
scales it to head radius. The folded hood is shared by matching torso dimensions.
Solid-color materials share by color; fabric maps share by their actual recipe,
so changing skin or hair does not duplicate an otherwise identical garment map.
No cache crosses live engine owners. Facial textures remain independently mutable
per character, as in Stage 2D-A.

Torso maps use 512×512 because the visible front occupies only a quarter of the
capsule UV width; smaller sleeve, shoe and hair maps use 256×256. All are sRGB,
static, without mipmap generation, fonts or asynchronous assets. No per-frame
geometry/material/texture creation or appearance texture upload is required.
Only normal facial redraws continue during expressions/blinking.

Engine ownership tracks resources before attachment, including materials created
before a later construction failure. Cast/factory disposal detaches rigs;
engine disposal releases GPU resources exactly once, clears pools and shrinks
static canvas backing stores. Never dispose shared materials from an individual
character. Software-safe, concurrency 1, memory admission/abort guards and
workspace temp isolation remain unchanged.

## Verification and stage boundary

Run serially:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:faces -- expressions-only
npm run verify:appearance
```

Appearance artifacts are in `out/phase2db/`: `front.png`, `three-quarter.png`,
`side.png`, `heads.png`, native `portrait.png` and `portrait-casual.png`,
`interaction.mp4`/`interaction.png`, `validation-results.json`, and per-job
production reports. Contact sheets are actual lossless software WebGL captures
composed on a 2D canvas; video/portrait extracted PNGs pass through H.264.
All generated artifacts are gitignored. The tracked fixtures preserve the tests.
Optional focused commands: `node scripts/verify-appearance.cjs audit-only`,
`video-only`, or `portrait-only`. They use the same mandatory safety launcher.

These are fitted cartoon garments on slim limbs, not simulated fabric or wide
trousers. Coats have painted lapels and a fitted hem, without hanging coat tails.
Accessories are a deliberately small library: no hats, arbitrary attach points,
cloth/hair physics, hair editing, runtime wardrobe swaps or appearance blending.
Decorative hair/glasses are not new general collision volumes; arbitrary contact
with them is outside Stage 2B's body-only collision model. True side views naturally
foreshorten the face. Local Windows SwiftShader results do not certify the
ballooned Muse Linux VM. Appearance is preserved during the approved
[Stage 2E-A walking](WALKING.md) and [Stage 2E-B acting](ACTING.md). Stage 2F and
legacy migration remain out of scope.
