# Stage 2E-B — expressive constrained acting

Use `createCast` and semantic descriptors. Construct them once in `initScene`;
evaluate from absolute frame/fps. No timers, mixer, previous poses or manual joints.

## Complete example

All helpers below are public exports. Call this factory during `ThreeCanvas`
initialization and its `onFrame` from the bridge callback; set the camera afterward.

```ts
import {createCast, createTargets, worldMark, standAt, appearancePreset,
  explain, surprise, turnTo, worldPoint, createStudioRoom,
  setupCartoonLighting} from './toon-kit';
import type {CartoonEngine} from './toon-kit';

export function createActingClinic(engine:CartoonEngine) {
  setupCartoonLighting(engine.scene);
  engine.scene.add(createStudioRoom({width:10, depth:10, height:6}));
  const clinic = createTargets({
    doctor:worldMark([-1.2,0,0]), patient:worldMark([1.2,0,0]),
  });
  const cast = createCast(engine, {
    doctor:{appearance:appearancePreset('doctor'),
      stance:standAt(clinic.mark('doctor'))},
    patient:{appearance:appearancePreset('patient'),
      stance:standAt(clinic.mark('patient'))},
  });
  const acting = {
    doctor:explain({startFrame:40, endFrame:200, intensity:.8}),
    patient:surprise({startFrame:80, endFrame:155}),
  };
  const attention = turnTo(worldPoint([0,2.5,5]), {
    startFrame:10, endFrame:35,
  });
  return {
    onFrame({frame,fps}:{frame:number;fps:number}) {
      return cast.evaluate({frame, fps, poses:{
        doctor:{gesture:acting.doctor, gaze:attention},
        patient:{gesture:acting.patient, gaze:attention},
      }});
    },
    dispose:cast.dispose,
  };
}
```

Omitted expression follows gesture emotion, faded from the configured default.
An explicit `expression:'explaining'` overrides this and stays active throughout
the request; it does not automatically fade with the body gesture.

## Gestures and defaults

| Helper | Behavior | Arms |
|---|---|---|
| `wave(options?)` | Raised-arm forearm greeting | One free arm |
| `explain(options?)` | Asymmetric conversational hands and mild body/head accents | Available arms |
| `shrug(options?)` | Raised arm line and puzzled head tilt | Available arms |
| `surprise(options?)` | Open reaction, backward lean and surprised face | Available arms |
| `excited(options?)` | Raised hands and restrained upper-body energy | Available arms |
| `nod(options?)` | Bounded rhythmic head nod | None |
| `shakeHead(options?)` | Bounded left/right head motion | None |
| `sad(options?)` | Forward posture and lowered head | None |
| `worried(options?)` | Small forward posture, head tilt and worried face | None |

Options: `startFrame`, `endFrame` **or** `duration` seconds, and `intensity` 0..1.
Defaults: start 0, duration 2.4 seconds, intensity .8. The interval must contain
at least four frames. Normal cartoon timing is roughly 1–4 seconds; very short
requests remain mathematically eased but may look abrupt. Long windows repeat
the profile. This is not a physical acceleration simulator.

Arm helpers also accept `hand:'auto'|'left'|'right'|'both'`. Auto wave prefers
right, then left; auto two-arm actions use all free arms. Explicit conflicts fail.
Head/posture helpers have no hand option in their public signatures. Intensity
zero restores the exact underlying pose and reserves no arms.

```ts
// Rest ↔ point; untimed pointAt retains its existing behavior.
const pointing = gestureDuring(pointAt(chartTarget, {hand:'right'}), {
  startFrame:40, endFrame:110,
});
// Explicit gaze endpoints; neutral forward when from is omitted.
const attention = turnTo(patient.target('head'), {
  from:chartTarget, startFrame:40, endFrame:65,
});
// Facial endpoints; target is held after completion.
const reaction = blendExpression('neutral', 'surprised', {
  startFrame:70, endFrame:82,
});
```

`gestureDuring` defaults to intensity **1**, reaching full alignment on its plateau.
Timed auto pointing keeps a stable right-first free hand instead of switching as
a moving target crosses sides. During fades it is transitioning, not perfectly
pointing: snapshot metadata reports actual hand/elbow/direction, weight and aligned.

`turnTo`/`blendExpression` smoothly hold from before start and to after end. They
do not accept intensity; set facial intensity on endpoints. Gaze references
resolve in the current frame, so they can track moving semantic targets. Zero
gaze vectors use forward; opposed directions use a fixed meridian. Avoid turns
through exact rear/overhead singularities when smooth apparent eye motion matters.
Head and eye bounds remain in force.

## Determinism and precedence

Every evaluation uses immutable construction data and complete current inputs.
Keep descriptors supplied through their fades. Omission restores defaults;
switching descriptors midway through an active window is an explicit discontinuity,
not an instruction to remember the previous pose. One intentional gesture occupies
the gesture field per actor; arbitrary gesture stacks/mixers are not provided.

Order: support contacts and fixed lengths/clearance → physical reaches → explicit
pointing/intentional gestures → free walking arms → secondary motion.

- Physical reaches keep exact targets. Auto gestures use only free arms; explicit
  hand conflicts reject with INTENT_CONFLICT.
- Secondary torso lean/anticipation yields entirely to supplied physical reaches,
  reporting ACTION_SECONDARY_YIELD. Head/free-arm acting remains available.
- Walking supplies the same frame's baseline. Gesture endpoints fade from/to that
  swing while unselected arms retain it. Root motion, foot plants and leg lengths
  are preserved.
- Supports are not interpolated. Walk endpoints already hold standing poses;
  a matched standing mark can hand off there. Arbitrary mismatched marks and
  walk-to-seat transitions are not solved or blended.
- Support head centers include current root/posture before target resolution.
  Rotated head-top or final gesturing wrist targets use the existing acyclic
  final target phase.
- Complete poses and facial rasters are validated/staged before publication.
  Never catch an evaluation failure and capture an old pose.

## Mathematics and resources

Quintic envelopes fade in over the first 23% and out over the final 28%, with exact
zero endpoints. Bounded absolute-time profiles add asymmetry, anticipation and
recovery. Torso pitch pivots about the pelvis X axis; seated lean compensates the
capsule support height. Hip sockets remain embedded. Shoulder sockets are not
translated off their anatomical surfaces; shrugging raises the arm line.

Shoulder-relative hand directions/radii and bend planes blend **before** the
existing Stage 2B analytic IK/clearance solve. Parallel transport and deterministic
roll prevent a collapsing elbow plane as hands rise past shoulder level. Finished
IK quaternions are never interpolated to fake contact. Invalid intermediate
states return diagnostics rather than stretching or moving requested contacts.

Head motion composes with body orientation/gaze before bounds are applied.
Facial transitions crossfade complete current-frame rasters with identical blink
and pupil state using premultiplied compositing. Distinct mouth/brow shapes can
briefly show overlapping lines: this is not geometric expression morphing/lip-sync.

No geometry, materials, render targets or canvases are created per frame. Each
enabled face owns one additional reusable CPU scratch canvas: approximately .25
MiB RGBA backing storage at default 256², or 1 MiB at 512², plus browser overhead.
Cleanup shrinks it with the other private canvases. No new GPU texture/pass is
required; shared rig/appearance ownership is unchanged. Acting snapshots are
immutable diagnostic metadata; internal motion values are not authoring controls.

## Diagnostics

| Code | Fix |
|---|---|
| ACTION_INVALID | Use exported helpers and valid timing/hand/intensity |
| INTENT_CONFLICT | Select a free hand, auto selection or a head-only gesture |
| ACTION_UNREACHABLE | Reduce intensity or change hand/proportions/staging; an intermediate clearance check failed |
| ACTION_SECONDARY_YIELD | Informational: lean yielded to physical reaches |
| CONTACT_FAILED / WALK_UNREACHABLE | Inspect underlying support/reach diagnostics |
| POINTING_UNREACHABLE | Choose a suitable target side/hand |
| GAZE_LIMITED | Combined requested head direction was bounded; eyes receive residual gaze |
| FACE_INVALID | Check facial endpoints/configuration or enable faces |

No obstacle/accessory collision engine, unrestricted shoulder translation,
jumping, arbitrary support blending or automatic camera behavior is introduced.

## Verification

Run serially through the unchanged safety launcher:

```sh
npm run typecheck
npm run test:characters
npm run test:memory
npm run audit:phase1
npm run verify:characters
npm run verify:contacts
npm run verify:cast
npm run verify:cast-portrait
node scripts/verify-faces.cjs expressions-only
node scripts/verify-appearance.cjs audit-only
node scripts/verify-walking.cjs views-only
npm run verify:acting
```

`verify:acting` outputs a 300-frame/30fps 1280×720 interaction, full-body
three-quarter/close-up/side PNGs, native 720×1280 portrait PNG and separate
diagnostic image. Optional views-only/demo-only/portrait-only arguments run
focused jobs. Generated media/reports stay in ignored out/phase2eb; tracked
fixtures preserve reproducibility. Review normal-speed playback too.

SwiftShader/software-safe, concurrency one, disabled parallel encoding, workspace
temp and Linux admission/abort safeguards remain mandatory. Windows evidence does
not certify Muse's VM. No Stage 2F, cinematic automation, lip-sync, general story
timelines, script-to-video orchestration or legacy migration is included.
