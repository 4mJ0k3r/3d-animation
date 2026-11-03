import * as T from 'three';
import type { CartoonEngine } from '../engine';
import type { CaptionLayout } from '../caption-layout';
import type { TargetLibrary, ActorIntent, TargetReference } from '../characters/cast-types';
import type { FloorTarget } from '../characters/constraint-types';
import type { WalkingPaths } from '../characters/walk-path';
import { createCast } from '../characters/cast';
import { appearancePreset } from '../characters/appearance';
import { standAt, sitAt, lookAt, pointAt } from '../characters/semantic-targets';
import { walkAlong } from '../characters/walking';
import { wave, nod, shakeHead, shrug, explain, surprise, sad, worried, excited, gestureDuring, turnTo, blendExpression } from '../characters/acting';
import { createStage } from '../staging/stage';
import { createDirector } from '../direction/director';
import { createPropAnimator } from './prop-animation';
import type { PropAnimator } from './prop-animation';
import { createEffectPlayer } from './effects';
import type { EffectPlayer } from './effects';
import { StoryError, storyFail } from './types';
import type { StoryClip, StoryIntent, StoryTarget, StorySupport } from './types';
import type { CompiledStory } from './compiler';
import type { PreparedStoryAudio } from './audio-assets';
export interface StorySettingBinding {
  readonly root: T.Group;
  readonly floor: T.Mesh;
  readonly cameraSpace?: Readonly<{width:number;depth:number;height:number}>;
  readonly targets: TargetLibrary;
  /** Root-local ground locations that propAnimations "slide" may name. */
  readonly anchors?: Readonly<Record<string, readonly number[]>>;
  readonly props?: Readonly<Record<string, T.Object3D>>;
  readonly paths?: WalkingPaths;
  readonly floors?: Readonly<Record<string, FloorTarget>>;
}
const gestures = {
  wave,
  nod,
  'shake-head': shakeHead,
  shrug,
  explain,
  surprise,
  sad,
  worried,
  excited
};
const clip = (v: unknown): v is StoryClip => !!v && typeof v === 'object' && 'action' in v;
/** Orchestration only. Existing cast, contact/gait/acting helpers and director do all math. */
export function createStory(engine: CartoonEngine, options: {
  timeline: CompiledStory;
  settings: Readonly<Record<string, StorySettingBinding>>;
  captions?: CaptionLayout;
  audio?: PreparedStoryAudio;
  /** Internal orchestration offset; timeline and camera remain segment-local. */
  globalFrameOffset?: number;
}) {
  options = {
    ...options,
    settings: Object.fromEntries(Object.entries(options.settings).map(([id, b]) => [id, {
      ...b,
      props: {
        ...b.props
      },
      floors: {
        ...b.floors
      }
    }]))
  };
  const timeline = options.timeline;
  const offset = options.globalFrameOffset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 1800) storyFail('INVALID_FRAME_OFFSET', 'Use a bounded nonnegative integer global offset');
  if (timeline.plan.durationInFrames > 600) storyFail('STORY_BUDGET', 'Render a compiled story segment, never a long orchestration timeline');
  if (timeline.audio.clips.length && !options.audio) storyFail('AUDIO_NOT_PREPARED', 'Audio stories require prepareStoryAudio(engine,timeline) before createStory');
  options.audio?.assertReady(timeline, engine);
  const stages = new Map<string, ReturnType<typeof createStage>>(),
    directors = new Map<string, ReturnType<typeof createDirector>>(),
    animators = new Map<string, PropAnimator>(),
    roots = new Map<T.Group, boolean>();
  const targetCache = new Map<string, TargetReference>(),
    supportCache = new Map<object, NonNullable<ActorIntent['stance']>>(),
    gazeCache = new Map<object, NonNullable<ActorIntent['gaze']>>(),
    faceCache = new Map<StoryClip, NonNullable<ActorIntent['expression']>>(),
    gestureCache = new Map<StoryClip, NonNullable<ActorIntent['gesture']>>(),
    reactCache = new Map<StoryClip, {
      incoming: NonNullable<ActorIntent['expression']>;
      outgoing: NonNullable<ActorIntent['expression']>;
      face: NonNullable<ActorIntent['expression']>;
      fromEnd: number;
      toStart: number;
    }>();
  let effects: EffectPlayer | undefined;
  let cast: ReturnType<typeof createCast> | undefined,
    ready = false,
    busy = false,
    dead = false,
    failed = false;
  const live = () => {
    if (dead || engine.signal.aborted) storyFail('STORY_DISPOSED', 'Story owner disposed');
    options.audio?.assertReady(timeline, engine);
  };
  const binding = (sceneId: string) => {
    const scene = timeline.plan.scenes.find(s => s.id === sceneId)!;
    return options.settings[scene.setting];
  };
  const dispose = () => {
    if (dead) return;
    dead = true;
    ready = false;
    directors.forEach(d => d.dispose());
    stages.forEach(s => s.dispose());
    cast?.dispose();
    animators.forEach(a => a.reset());
    animators.clear();
    effects?.dispose();
    roots.forEach((v, r) => {
      r.visible = v;
    });
    directors.clear();
    stages.clear();
    targetCache.clear();
    supportCache.clear();
    gazeCache.clear();
    faceCache.clear();
    gestureCache.clear();
    reactCache.clear();
  };
  engine.registerCleanup(dispose);
  const wrap = <R,>(fn: () => R, context: {
    scene?: string;
    frame?: number;
    actor?: string;
  } = {}): R => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof StoryError) throw e;
      storyFail('STORY_EVALUATION_FAILED', 'Existing cast/director rejected the story request', {
        ...context,
        details: (e as {
          diagnostic?: unknown;
          diagnostics?: unknown;
        }).diagnostic ?? (e as {
          diagnostics?: unknown;
        }).diagnostics ?? String(e)
      });
    }
  };
  const target = (scene: string, t: StoryTarget): TargetReference => {
    const key = scene + '\0' + JSON.stringify(t);
    if (targetCache.has(key)) return targetCache.get(key)!;
    let r: TargetReference;
    if (typeof t === 'string') {
      const b = binding(scene);
      if (!Object.hasOwn(b.targets.entries, t)) storyFail('UNKNOWN_BINDING', 'Missing named target', {
        scene,
        details: t
      });
      r = b.targets.target(t);
    } else {
      if (!Object.hasOwn(cast!.actors, t.actor)) storyFail('UNKNOWN_ACTOR', 'Missing actor target', {
        actor: t.actor
      });
      r = cast!.actors[t.actor].target(t.anchor ?? 'head');
    }
    targetCache.set(key, r);
    return r;
  };
  const support = (scene: string, v: StorySupport | StoryClip): NonNullable<ActorIntent['stance']> => {
    if (supportCache.has(v)) return supportCache.get(v)!;
    const a = clip(v) ? v.action : v;
    let r: NonNullable<ActorIntent['stance']>;
    if (a.type === 'stand') r = standAt(target(scene, a.at));else if (a.type === 'sit') {
      const floors = binding(scene).floors;
      if (!floors || !Object.hasOwn(floors, a.floor)) storyFail('UNKNOWN_BINDING', 'Missing floor target', {
        scene,
        details: a.floor
      });
      r = sitAt(target(scene, a.seat), {
        floor: floors[a.floor],
        feet: a.feet ?? 'auto'
      });
    } else if (a.type === 'walk' && clip(v)) {
      const paths = binding(scene).paths;
      if (!paths || !Object.hasOwn(paths.entries, a.path)) storyFail('UNKNOWN_BINDING', 'Missing walking path', {
        scene,
        details: a.path
      });
      r = walkAlong(paths.path(a.path), {
        startFrame: v.startFrame + offset,
        endFrame: v.endFrame - 1 + offset,
        ...(a.strideScale === undefined ? {} : {
          strideScale: a.strideScale
        })
      });
    } else storyFail('INVALID_ACTION', 'Invalid support descriptor');
    supportCache.set(v, r);
    return r;
  };
  const gaze = (scene: string, v: StoryIntent['gaze']): ActorIntent['gaze'] => {
    if (v === null) return undefined;
    if (typeof v === 'object' && gazeCache.has(v)) return gazeCache.get(v);
    let r: NonNullable<ActorIntent['gaze']>;
    if (clip(v) && v.action.type === 'look') {
      const n = v.action.transitionFrames!;
      r = n ? turnTo(target(scene, v.action.target), {
        ...(v.from ? {
          from: target(scene, v.from)
        } : {}),
        startFrame: v.startFrame + offset,
        endFrame: v.startFrame + n + offset
      }) : lookAt(target(scene, v.action.target));
    } else r = lookAt(target(scene, v as StoryTarget));
    if (typeof v === 'object') gazeCache.set(v, r);
    return r;
  };
  const expression = (v: StoryIntent['expression']): NonNullable<ActorIntent['expression']> => {
    if (!clip(v)) return v;
    if (faceCache.has(v)) return faceCache.get(v)!;
    if (v.action.type !== 'expression') storyFail('INVALID_ACTION', 'Invalid expression clip');
    const n = v.action.transitionFrames!,
      r = n ? blendExpression(v.from as import('../characters/face').ExpressionName, v.action.name, {
        startFrame: v.startFrame + offset,
        endFrame: v.startFrame + n + offset
      }) : v.action.name;
    faceCache.set(v, r);
    return r;
  };
  const gesture = (c: StoryClip): NonNullable<ActorIntent['gesture']> => {
    if (gestureCache.has(c)) return gestureCache.get(c)!;
    const a = c.action,
      o = {
        startFrame: c.startFrame + offset,
        endFrame: c.endFrame - 1 + offset,
        ...('intensity' in a && a.intensity !== undefined ? {
          intensity: a.intensity
        } : {}),
        ...('hand' in a && a.hand !== undefined ? {
          hand: a.hand
        } : {})
      };
    let r: NonNullable<ActorIntent['gesture']>;
    if (a.type === 'point') {
      const {
        hand,
        ...timing
      } = o;
      r = gestureDuring(pointAt(target(c.scene, a.target), {
        hand: a.hand ?? 'auto'
      }), timing);
    } else if (a.type === 'gesture') r = gestures[a.name](o);else if (a.type === 'react') r = gestures[a.name === 'surprised' ? 'surprise' : a.name](o);else storyFail('INVALID_ACTION', 'Invalid gesture clip');
    gestureCache.set(c, r);
    return r;
  };
  const react = (c: StoryClip, frame: number): NonNullable<ActorIntent['expression']> => {
    if (c.action.type === 'react' && c.action.intensity === 0) return expression(timeline.sample(frame).poses[c.action.actor].expression);
    if (!reactCache.has(c)) {
      if (c.action.type !== 'react') storyFail('INVALID_ACTION', 'Invalid reaction');
      const base = timeline.sample(c.startFrame).poses[c.action.actor].expression,
        from = clip(base) && base.action.type === 'expression' ? base.action.name : base as import('../characters/face').ExpressionName,
        face = {
          name: c.action.name === 'excited' ? 'happy' as const : c.action.name,
          intensity: c.action.intensity ?? .8
        },
        fade = Math.min(8, Math.floor((c.endFrame - c.startFrame - 2) / 2));
      reactCache.set(c, {
        incoming: blendExpression(from, face, {
          startFrame: c.startFrame + offset,
          endFrame: c.startFrame + fade + offset
        }),
        outgoing: blendExpression(face, from, {
          startFrame: c.endFrame - 1 - fade + offset,
          endFrame: c.endFrame - 1 + offset
        }),
        face,
        fromEnd: c.startFrame + fade,
        toStart: c.endFrame - 1 - fade
      });
    }
    const r = reactCache.get(c)!;
    return frame <= r.fromEnd ? r.incoming : frame >= r.toStart ? r.outgoing : r.face;
  };
  const intents = (frame: number) => {
    const f = timeline.sample(frame),
      poses: Record<string, ActorIntent> = {};
    for (const [id, p] of Object.entries(f.poses)) {
      poses[id] = {
        visible: p.visible,
        stance: support(p.scene, p.stance),
        expression: p.gesture?.action.type === 'react' ? react(p.gesture, frame) : expression(p.expression),
        gaze: gaze(p.scene, p.gaze),
        gesture: p.gesture ? gesture(p.gesture) : undefined
      };
    }
    return {
      frame: f,
      poses
    };
  };
  const sample = (globalFrame: number) => wrap(() => {
    live();
    const input = intents(globalFrame),
      scene = input.frame.scene,
      b = binding(scene.id);
    roots.forEach((_, r) => {
      r.visible = r === b.root;
    });
    // Absolute-frame prop state is assigned BEFORE cast targets and stage snapshots read it.
    animators.get(scene.setting)?.apply(scene.id, globalFrame);
    effects?.apply(scene.id, globalFrame);
    const state = cast!.evaluate({
      frame: globalFrame + offset,
      fps: timeline.plan.fps,
      poses: input.poses
    });
    const composition = stages.get(scene.id)!.snapshot({
      ...state,
      frame: input.frame.localFrame,
      time: input.frame.localFrame / timeline.plan.fps
    });
    return {
      frame: input.frame,
      cast: state,
      composition
    };
  }, {
    frame: globalFrame
  });
  try {
    live();
    if (timeline.captionWords.length && !options.captions) storyFail('CAPTION_LAYOUT_REQUIRED', 'Measure timeline.captionWords before preparing the story');
    if (options.captions && JSON.stringify(options.captions.words.map(({
      text,
      startFrame,
      endFrame
    }) => ({
      text,
      startFrame,
      endFrame
    }))) !== JSON.stringify(timeline.captionWords)) storyFail('CAPTION_MISMATCH', 'Use the measured layout of timeline.captionWords');
    for (const key of Object.keys(options.settings)) if (!timeline.plan.scenes.some(s => s.setting === key)) storyFail('UNKNOWN_BINDING', 'Do not attach unused setting roots');
    for (const scene of timeline.plan.scenes) {
      if (!Object.hasOwn(options.settings, scene.setting)) storyFail('UNKNOWN_BINDING', 'Missing setting', {
        scene: scene.id,
        details: scene.setting
      });
      const b = binding(scene.id);
      let p: T.Object3D | null = b.root;
      while (p && p !== engine.scene) p = p.parent;
      if (p !== engine.scene) storyFail('INVALID_BINDING', 'Setting root belongs to another engine', {
        scene: scene.id
      });
      roots.set(b.root, b.root.visible);
    }
    for (const root of roots.keys()) for (let p = root.parent; p; p = p.parent) if (roots.has(p as T.Group)) storyFail('INVALID_BINDING', 'Setting roots may not nest');
    for (const scene of timeline.plan.scenes) {
      const b = binding(scene.id),
        stage = createStage(engine, {
          root: b.root,
          floor: b.floor,
          axis: scene.axis,
          cameraSpace: b.cameraSpace
        });
      for (const [id, mesh] of Object.entries(b.props ?? {})) stage.registerProp(id, mesh);
      stages.set(scene.id, stage);
    }
    // After registration, so stage bounds capture rest geometry; rest transforms are
    // recorded once per setting and restored before every absolute-frame assignment.
    for (const setting of new Set(timeline.plan.scenes.map(s => s.setting))) {
      const scenes = timeline.plan.scenes.filter(s => s.setting === setting);
      if (!scenes.some(s => s.propAnimations?.length)) continue;
      const b = options.settings[setting];
      animators.set(setting, createPropAnimator(b.props ?? {}, b.anchors, scenes));
    }
    if (timeline.plan.scenes.some(s => s.effects?.length)) {
      const box = new T.Box3(), size = new T.Vector3();
      // Resolved after prop animation each frame, so effects follow moved props.
      effects = createEffectPlayer(engine, timeline.plan.scenes, sceneId => {
        const b = binding(sceneId);
        return name => {
          b.root.updateWorldMatrix(true, true);
          const front = new T.Vector3(0, 0, 1).transformDirection(b.root.matrixWorld);
          if (b.props && Object.hasOwn(b.props, name)) {
            box.setFromObject(b.props[name]);
            box.getSize(size);
            const center = box.getCenter(new T.Vector3());
            return {
              center,
              base: new T.Vector3(center.x, box.min.y, center.z),
              size: Math.min(2, Math.max(.3, size.x, size.z)),
              front
            };
          }
          const entry = Object.hasOwn(b.targets.entries, name) ? b.targets.entries[name] : undefined;
          if (!entry || !('object' in entry)) storyFail('EFFECT_TARGET_UNSUPPORTED', 'Effect target must be a bound prop or scene mark', {
            scene: sceneId,
            details: name
          });
          const base = entry.object.getWorldPosition(new T.Vector3());
          return {
            center: base.clone().add(new T.Vector3(0, .5, 0)),
            base,
            size: .6,
            front
          };
        };
      });
      // Validate every declared target once, before any capture.
      for (const s of timeline.plan.scenes) for (const e of s.effects ?? []) effects.apply(s.id, e.startFrame);
      effects.apply('', 0);
    }
    cast = createCast(engine, Object.fromEntries(Object.entries(timeline.plan.characters).map(([id, c]) => [id, {
      ...(c.appearance ? {
        appearance: appearancePreset(c.appearance)
      } : {}),
      ...(c.proportions ? {
        proportions: c.proportions
      } : {}),
      ...(c.scale === undefined ? {} : {
        scale: c.scale
      }),
      face: {
        defaultExpression: c.expression ?? 'neutral',
        ...(c.appearance === 'yellow-mellow' ? { style: 'highlight' as const } : {})
      }
    }])));
    stages.forEach(s => s.bind(cast!));
    // Resolve all declared references now, including actions not active at frame 0.
    for (const scene of timeline.plan.scenes) for (const [id, d] of Object.entries(scene.characters)) {
      support(scene.id, d.stance);
      if (d.lookAt) target(scene.id, d.lookAt);
    }
    for (const c of timeline.clips) {
      const a = c.action;
      if (['stand', 'sit', 'walk'].includes(a.type)) support(c.scene, c);else if (a.type === 'look') gaze(c.scene, c);else if (a.type === 'expression') expression(c);else gesture(c);
    }
  } catch (e) {
    dispose();
    return wrap(() => {
      throw e;
    });
  }
  return Object.freeze({
    timeline,
    cast: cast!,
    prepare() {
      live();
      if (ready || busy || failed) storyFail('PREPARATION_STATE', 'Prepare once');
      busy = true;
      try {
        // Boundary checks compare both requests at the SAME absolute clock, never
        // the preceding rendered pose. Shot/scene cuts permit explicit contact cuts.
        for (const c of timeline.clips) if (['stand', 'sit', 'walk'].includes(c.action.type)) {
          const scene = timeline.plan.scenes.find(s => s.id === c.scene)!;
          if (c.startFrame === scene.startFrame || scene.shots.some(s => s.startFrame === c.startFrame)) continue;
          const before = intents(c.startFrame - 1),
            now = intents(c.startFrame),
            id = c.action.actor,
            previous = before.frame.poses[id].stance,
            oldType = clip(previous) ? previous.action.type : previous.type;
          if (oldType === 'sit' !== (c.action.type === 'sit')) storyFail('UNSUPPORTED_TRANSITION', 'Standing/seating contact changes require a shot/scene cut', {
            scene: scene.id,
            actor: id,
            frame: c.startFrame
          });
          const a = cast!.evaluate({
              frame: c.startFrame + offset,
              fps: timeline.plan.fps,
              poses: {
                ...now.poses,
                [id]: {
                  ...now.poses[id],
                  stance: before.poses[id].stance
                }
              }
            }).poses[id].root,
            b = cast!.evaluate({
              frame: c.startFrame + offset,
              fps: timeline.plan.fps,
              poses: now.poses
            }).poses[id].root;
          if (Math.hypot(...a.position.map((v, i) => v - b.position[i])) > 1e-5 || 1 - Math.abs(a.quaternion.reduce((n, v, i) => n + v * b.quaternion[i], 0)) > 1e-6) storyFail('SUPPORT_DISCONTINUITY', 'Support endpoints/headings must match, or use an explicit shot cut', {
            scene: scene.id,
            actor: id,
            frame: c.startFrame
          });
        }
        for (const scene of timeline.plan.scenes) {
          const captions = options.captions ? {
            ...options.captions,
            words: options.captions.words.filter(w => w.startFrame < scene.endFrame && w.endFrame > scene.startFrame).map(w => ({
              ...w,
              startFrame: Math.max(w.startFrame, scene.startFrame) - scene.startFrame,
              endFrame: Math.min(w.endFrame, scene.endFrame) - scene.startFrame
            }))
          } : undefined;
          const director = createDirector(engine, {
            stage: stages.get(scene.id)!,
            durationInFrames: scene.endFrame - scene.startFrame,
            aspect: engine.camera.aspect,
            composition: {
              captions
            },
            shots: scene.shots.map(s => ({
              ...s,
              id: scene.id + '/' + s.id,
              startFrame: s.startFrame - scene.startFrame,
              endFrame: s.endFrame - scene.startFrame
            }))
          });
          directors.set(scene.id, director);
          director.prepare({
            sample: local => sample(scene.startFrame + local).composition
          });
          if ([...directors.values()].reduce((n, d) => n + d.preparationStats().signatureBytes, 0) > 16 * 1024 * 1024) storyFail('STORY_BUDGET', 'Combined scene certificates exceed the existing 16 MiB budget');
        }
        ready = true;
      } catch (e) {
        failed = true;
        directors.forEach(d => d.dispose());
        directors.clear();
        return wrap(() => {
          throw e;
        });
      } finally {
        busy = false;
        if (!dead && !engine.signal.aborted) sample(0);
      }
    },
    applyFrame(frame: number) {
      live();
      if (!ready) storyFail('NOT_PREPARED', 'Prepare story and captions before capture');
      return wrap(() => {
        const s = sample(frame),
          camera = directors.get(s.frame.scene.id)!.applyFrame({
            frame: s.frame.localFrame,
            snapshot: s.composition
          });
        return {
          frame,
          scene: s.frame.scene.id,
          cast: s.cast,
          camera,
          cue: s.frame.cue
        };
      }, {
        frame
      });
    },
    describe(frame: number) {
      live();
      if (!ready) storyFail('NOT_PREPARED', 'Prepare first');
      const s = timeline.sample(frame);
      return {
        frame,
        scene: s.scene.id,
        shot: s.shot,
        direction: directors.get(s.scene.id)!.describe(s.localFrame)
      };
    },
    preparationStats() {
      live();
      return [...directors].map(([scene, d]) => ({
        scene,
        ...d.preparationStats()
      }));
    },
    dispose
  });
}
export type StoryPlayer = ReturnType<typeof createStory>;
