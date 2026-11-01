import type { ExpressionName } from '../characters/face';
import { EXPRESSIONS } from '../characters/face';
import { GESTURES } from '../characters/acting';
import { resolveProportions } from '../characters/proportions';
import { freezeData } from '../characters/pose';
import { compileShotTimeline } from '../direction/timeline';
import { compileStoryAudio } from './audio-compiler';
import { validatePropAnimations } from './prop-animation';
import { storyFail, StoryError } from './types';
import type { StoryPlan, StoryScene, StoryAction, StoryClip, StoryFrame, StoryTarget, StorySupport, StoryIntent, StoryBeat } from './types';
export const STORY_LIMITS = freezeData({
  frames: 600,
  scenes: 4,
  characters: 8,
  beats: 128,
  actions: 512,
  cues: 128,
  words: 256,
  jsonNodes: 20000
});
const obj = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (o: unknown, allowed: readonly string[]) => {
  if (!obj(o) || Object.keys(o as object).some(k => !allowed.includes(k))) storyFail('INVALID_SCHEMA', 'Unknown/missing structured object fields');
};
const name = (v: unknown) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 128 || ['__proto__', 'constructor', 'prototype', 'stage'].includes(v)) storyFail('INVALID_NAME', 'Use nonempty safe names, excluding reserved stage');
};
const expression = (v: unknown) => {
  if (!EXPRESSIONS.includes(v as never)) storyFail('INVALID_EXPRESSION', 'Unknown expression preset');
};
function jsonCopy(value: unknown): StoryPlan {
  let count = 0;
  const seen = new Set<object>();
  const visit = (v: unknown) => {
    if (++count > STORY_LIMITS.jsonNodes) storyFail('STORY_BUDGET', 'JSON plan too large');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v === 'string' && v.length <= 16384) return;
    if (typeof v !== 'object' || !v || seen.has(v) || !Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) storyFail('INVALID_SCHEMA', 'Plan must contain finite JSON data, not functions, scene objects or cycles');
    seen.add(v);
    if (Array.isArray(v)) v.forEach(visit);else for (const [k, x] of Object.entries(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) storyFail('INVALID_SCHEMA', 'Unsafe key');
      visit(x);
    }
    seen.delete(v);
  };
  visit(value);
  return JSON.parse(JSON.stringify(value));
}
function support(v: unknown) {
  keys(v, ['type', 'at', 'seat', 'floor', 'feet']);
  const p = v as StorySupport;
  if (p.type === 'stand') {
    keys(p, ['type', 'at']);
    name(p.at);
  } else if (p.type === 'sit') {
    keys(p, ['type', 'seat', 'floor', 'feet']);
    name(p.seat);
    name(p.floor);
    if (p.feet !== undefined && !['auto', 'floor', 'dangle'].includes(p.feet)) storyFail('INVALID_SUPPORT', 'Unknown foot contact policy');
  } else storyFail('INVALID_SUPPORT', 'Use standing/sitting semantic defaults');
}
const range = (a: number, b: number, start: number, end: number) => {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < start || b <= a || b > end) storyFail('INVALID_RANGE', 'Use finite integer half-open intervals inside the allowed timeline range');
};
function target(t: unknown, scene: StoryScene) {
  if (typeof t === 'string') {
    name(t);
    return;
  }
  keys(t, ['actor', 'anchor']);
  const p = t as Exclude<StoryTarget, string>;
  name(p.actor);
  if (!Object.hasOwn(scene.characters, p.actor) || p.anchor !== undefined && !['head', 'pelvis', 'leftWrist', 'rightWrist'].includes(p.anchor)) storyFail('INVALID_TARGET', 'Actor targets must name an active actor and supported semantic anchor');
}
const channels = (a: StoryAction) => ['stand', 'sit', 'walk'].includes(a.type) ? ['stance'] : a.type === 'look' ? ['gaze'] : a.type === 'expression' ? ['expression'] : a.type === 'react' ? ['gesture', 'expression'] : ['gesture'];
function compile(input: StoryPlan, frameBudget: number = STORY_LIMITS.frames, sceneBudget: number = STORY_LIMITS.scenes) {
  const plan = jsonCopy(input);
  keys(plan, ['version', 'fps', 'durationInFrames', 'characters', 'scenes', 'audio']);
  if (plan.version !== 1 || !Number.isInteger(plan.fps) || plan.fps < 1 || plan.fps > 60 || !Number.isInteger(plan.durationInFrames) || plan.durationInFrames < 1 || plan.durationInFrames > frameBudget) storyFail('INVALID_TIMEBASE', 'Invalid absolute frame timebase or bounded story duration');
  if (!obj(plan.characters) || Object.keys(plan.characters).length < 1 || Object.keys(plan.characters).length > STORY_LIMITS.characters || !Array.isArray(plan.scenes) || !plan.scenes.length || plan.scenes.length > sceneBudget) storyFail('STORY_BUDGET', `Use 1..8 characters and 1..${sceneBudget} scenes`);
  for (const [id, c] of Object.entries(plan.characters)) {
    name(id);
    keys(c, ['appearance', 'proportions', 'expression', 'scale']);
    if (c.appearance !== undefined && !['doctor', 'patient', 'office', 'casual'].includes(c.appearance)) storyFail('INVALID_CHARACTER', 'Unknown appearance');
    if (c.expression !== undefined) expression(c.expression);
    if (c.scale !== undefined && (!Number.isFinite(c.scale) || c.scale < .05 || c.scale > 20)) storyFail('INVALID_CHARACTER', 'Invalid scale');
    try {
      resolveProportions(c.proportions);
    } catch (e) {
      storyFail('INVALID_CHARACTER', 'Invalid proportions', {
        actor: id,
        details: String(e)
      });
    }
  }
  const scenes: StoryScene[] = [...plan.scenes].sort((a, b) => a.startFrame - b.startFrame),
    clips: StoryClip[] = [],
    cues: NonNullable<StoryScene['cues']>[number][] = [],
    ids = new Set<string>();
  let end = 0,
    beats = 0,
    actions = 0;
  for (const scene of scenes) {
    keys(scene, ['id', 'setting', 'startFrame', 'endFrame', 'characters', 'axis', 'beats', 'cues', 'shots', 'propAnimations']);
    name(scene.id);
    name(scene.setting);
    if (ids.has(scene.id)) storyFail('DUPLICATE_ID', 'Duplicate scene');
    ids.add(scene.id);
    range(scene.startFrame, scene.endFrame, 0, plan.durationInFrames);
    if (scene.propAnimations !== undefined) (scene as {
      propAnimations?: unknown;
    }).propAnimations = validatePropAnimations(scene.propAnimations, scene);
    if (scene.startFrame !== end) storyFail('SCENE_COVERAGE', 'Scenes must cover the whole story without gaps/overlap', {
      scene: scene.id
    });
    end = scene.endFrame;
    if (!obj(scene.characters) || !Object.keys(scene.characters).length) storyFail('INVALID_SCENE', 'Declare scene characters');
    for (const [id, d] of Object.entries(scene.characters)) {
      if (!Object.hasOwn(plan.characters, id)) storyFail('UNKNOWN_ACTOR', 'Undeclared character', {
        actor: id
      });
      keys(d, ['stance', 'expression', 'lookAt']);
      support(d.stance);
      if (d.expression !== undefined) expression(d.expression);
      if (d.lookAt !== undefined) target(d.lookAt, scene);
    }
    if (!Array.isArray(scene.axis) || scene.axis.length !== 2 || scene.axis[0] === scene.axis[1] || scene.axis.some((x: string) => typeof x !== 'string' || !Object.hasOwn(scene.characters, x))) storyFail('INVALID_AXIS', 'Scene needs two distinct active actors for its conversation axis', {
      scene: scene.id
    });
    try {
      compileShotTimeline(scene.shots.map(s => ({
        ...s,
        startFrame: s.startFrame - scene.startFrame,
        endFrame: s.endFrame - scene.startFrame
      })), scene.endFrame - scene.startFrame);
    } catch (e) {
      storyFail('INVALID_SHOTS', 'Camera timeline failed validation', {
        scene: scene.id,
        details: (e as {
          diagnostic?: unknown;
        }).diagnostic ?? String(e)
      });
    }
    for (const s of scene.shots) {
      for (const id of s.subjects ?? [s.subject!]) if (Object.hasOwn(plan.characters, id) && !Object.hasOwn(scene.characters, id)) storyFail('UNKNOWN_ACTOR', 'Shot refers to an inactive actor', {
        scene: scene.id,
        actor: id
      });
    }
    if (!Array.isArray(scene.beats)) storyFail('INVALID_SCENE', 'beats must be an array');
    const beatIds = new Set<string>();
    for (const beat of scene.beats as readonly StoryBeat[]) {
      if (++beats > STORY_LIMITS.beats) storyFail('STORY_BUDGET', 'Too many beats');
      keys(beat, ['id', 'startFrame', 'endFrame', 'actions']);
      name(beat.id);
      if (beatIds.has(beat.id)) storyFail('DUPLICATE_ID', 'Duplicate beat', {
        scene: scene.id,
        beat: beat.id
      });
      beatIds.add(beat.id);
      range(beat.startFrame, beat.endFrame, scene.startFrame, scene.endFrame);
      if (!Array.isArray(beat.actions) || !beat.actions.length) storyFail('INVALID_BEAT', 'A beat needs actions');
      for (const action of beat.actions) {
        if (++actions > STORY_LIMITS.actions) storyFail('STORY_BUDGET', 'Too many actions');
        if (!obj(action) || typeof action.actor !== 'string' || !Object.hasOwn(scene.characters, action.actor)) storyFail('UNKNOWN_ACTOR', 'Action actor is not active', {
          scene: scene.id,
          beat: beat.id
        });
        const common = ['type', 'actor'];
        const n = beat.endFrame - beat.startFrame;
        switch (action.type) {
          case 'stand':
            keys(action, [...common, 'at']);
            name(action.at);
            break;
          case 'sit':
            keys(action, [...common, 'seat', 'floor', 'feet']);
            support({
              type: action.type,
              seat: action.seat,
              floor: action.floor,
              ...(action.feet ? {
                feet: action.feet
              } : {})
            });
            break;
          case 'walk':
            keys(action, [...common, 'path', 'strideScale']);
            name(action.path);
            if (n < 5 || action.strideScale !== undefined && (!Number.isFinite(action.strideScale) || action.strideScale < .2 || action.strideScale > 4)) storyFail('INVALID_ACTION', 'Walking needs >=5 frames and valid stride scale');
            break;
          case 'look':
          case 'expression':
            {
              keys(action, [...common, ...(action.type === 'look' ? ['target'] : ['name']), 'transitionFrames']);
              if (action.type === 'look') target(action.target, scene);else expression(action.name);
              const t = action.transitionFrames ?? (n >= 5 ? Math.min(8, n - 1) : 0);
              if (!Number.isInteger(t) || t !== 0 && t < 4 || t >= n) storyFail('INVALID_TRANSITION', 'Transitions use 0 or 4..duration-1 frames');
              (action as {
                transitionFrames?: number;
              }).transitionFrames = t;
              break;
            }
          case 'point':
            keys(action, [...common, 'target', 'hand', 'intensity']);
            target(action.target, scene);
            if (action.hand !== undefined && !['auto', 'left', 'right'].includes(action.hand)) storyFail('INVALID_ACTION', 'Unknown pointing hand');
            if (n < 5) storyFail('INVALID_ACTION', 'Pointing needs >=5 frames');
            break;
          case 'gesture':
            keys(action, [...common, 'name', 'hand', 'intensity']);
            if (!GESTURES.includes(action.name) || action.hand !== undefined && !['auto', 'left', 'right', 'both'].includes(action.hand) || n < 5) storyFail('INVALID_ACTION', 'Unknown/too-short gesture');
            if (['nod', 'shake-head', 'sad', 'worried'].includes(action.name) && action.hand !== undefined) storyFail('INVALID_ACTION', 'Head/posture gestures do not accept a hand');
            break;
          case 'react':
            keys(action, [...common, 'name', 'intensity']);
            if (!['surprised', 'worried', 'sad', 'excited'].includes(action.name) || n < 11) storyFail('INVALID_ACTION', 'Reactions need a named emotion and >=11 frames');
            break;
          default:
            storyFail('INVALID_ACTION', 'Unknown semantic action');
        }
        if ('intensity' in action && action.intensity !== undefined && (!Number.isFinite(action.intensity) || action.intensity < 0 || action.intensity > 1)) storyFail('INVALID_ACTION', 'Intensity is 0..1');
        clips.push({
          scene: scene.id,
          beat: beat.id,
          startFrame: beat.startFrame,
          endFrame: beat.endFrame,
          action
        });
      }
    }
    if (scene.cues !== undefined && !Array.isArray(scene.cues)) storyFail('INVALID_CUE', 'cues must be an array');
    const cueIds = new Set<string>();
    for (const cue of scene.cues ?? []) {
      keys(cue, ['id', 'kind', 'text', 'speaker', 'language', 'startFrame', 'endFrame', 'mode', 'alignmentId', 'timing']);
      if (cue.timing !== undefined && !['supplied', 'estimated'].includes(cue.timing) || cue.timing !== undefined && cue.mode !== 'words') storyFail('INVALID_CUE', 'Word timing policy requires word captions');
      name(cue.id);
      if (cueIds.has(cue.id)) storyFail('DUPLICATE_ID', 'Duplicate cue');
      cueIds.add(cue.id);
      range(cue.startFrame, cue.endFrame, scene.startFrame, plan.durationInFrames);
      if (cue.startFrame >= scene.endFrame) storyFail('INVALID_RANGE', 'Attach a cue to the scene containing its start');
      const narrationSpeaker = cue.kind === 'caption' && Array.isArray(plan.audio?.clips) && plan.audio.clips.some(c => c?.kind === 'narration' && c.speaker === cue.speaker);
      if (!['dialogue', 'caption'].includes(cue.kind) || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 2048 || cue.kind === 'dialogue' && (!cue.speaker || !Object.hasOwn(scene.characters, cue.speaker)) || cue.speaker !== undefined && !Object.hasOwn(scene.characters, cue.speaker) && !narrationSpeaker || cue.language !== undefined && !['hi', 'en'].includes(cue.language) || cue.mode !== undefined && !['line', 'words'].includes(cue.mode)) storyFail('INVALID_CUE', 'Invalid caption/dialogue cue');
      if (cue.speaker !== undefined) name(cue.speaker);
      if (cue.alignmentId !== undefined) name(cue.alignmentId);
      if (cue.mode === 'words' && cue.text.trim().split(/\s+/u).length > cue.endFrame - cue.startFrame) storyFail('INVALID_CUE', 'Word timing needs at least one frame per word');
      cues.push(cue);
    }
  }
  if (end !== plan.durationInFrames) storyFail('SCENE_COVERAGE', 'Scenes must cover the ending');
  if (cues.length > STORY_LIMITS.cues) storyFail('STORY_BUDGET', 'Too many cues');
  cues.sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  for (let i = 1; i < cues.length; i++) if (cues[i].startFrame < cues[i - 1].endFrame) storyFail('CUE_CONFLICT', 'Caption/dialogue cues may not overlap');
  const alignIds = cues.map(c => c.alignmentId).filter(Boolean);
  if (new Set(alignIds).size !== alignIds.length) storyFail('DUPLICATE_ID', 'Audio alignment IDs must be unique');
  clips.sort((a, b) => a.startFrame - b.startFrame || a.action.actor.localeCompare(b.action.actor) || a.action.type.localeCompare(b.action.type));
  for (const scene of scenes) for (const actor of Object.keys(scene.characters)) for (const channel of ['stance', 'gaze', 'gesture', 'expression']) {
    const list = clips.filter(c => c.scene === scene.id && c.action.actor === actor && channels(c.action).includes(channel));
    for (let i = 1; i < list.length; i++) if (list[i].startFrame < list[i - 1].endFrame) storyFail('ACTION_CONFLICT', `Overlapping ${channel} actions`, {
      scene: scene.id,
      beat: list[i].beat,
      actor,
      frame: list[i].startFrame
    });
  }
  for (const c of clips) if (c.action.type === 'look' || c.action.type === 'expression') {
    const scene = scenes.find(s => s.id === c.scene)!,
      previous = clips.filter(p => p.scene === c.scene && p.action.actor === c.action.actor && p.action.type === c.action.type && p.startFrame < c.startFrame).at(-1);
    (c as {
      from?: StoryTarget | ExpressionName | null;
    }).from = c.action.type === 'look' ? previous?.action.type === 'look' ? previous.action.target : scene.characters[c.action.actor].lookAt ?? null : previous?.action.type === 'expression' ? previous.action.name : scene.characters[c.action.actor].expression ?? plan.characters[c.action.actor].expression ?? 'neutral';
  }
  const cueIds = cues.map(c => c.alignmentId ?? scenes.find(s => c.startFrame >= s.startFrame && c.startFrame < s.endFrame)!.id + '/' + c.id);
  const audio = compileStoryAudio(plan, cues, cueIds),
    captionWords = audio.captionWords;
  if (captionWords.length > STORY_LIMITS.words) storyFail('STORY_BUDGET', 'At most 256 caption words');
  for (const actor of Object.keys(plan.characters)) if (!scenes.some(s => Object.hasOwn(s.characters, actor))) storyFail('UNUSED_CHARACTER', 'Every character needs at least one scene', {
    actor
  });
  const frozen = freezeData({
      ...plan,
      characters: Object.fromEntries(Object.entries(plan.characters).sort(([a], [b]) => a.localeCompare(b))),
      scenes
    }),
    frozenClips = freezeData(clips),
    words = freezeData(captionWords),
    alignment = freezeData(cues.map((c, i) => ({
      id: c.alignmentId ?? scenes.find(s => c.startFrame >= s.startFrame && c.startFrame < s.endFrame)!.id + '/' + c.id,
      kind: c.kind,
      text: c.text,
      language: c.language,
      speaker: c.speaker,
      startFrame: c.startFrame,
      endFrame: c.endFrame,
      fps: plan.fps,
      timing: audio.captionTiming[i].source
    })));
  if (new Set(alignment.map(c => c.id)).size !== alignment.length) storyFail('DUPLICATE_ID', 'Resolved alignment IDs must be unique');
  return Object.freeze({
    plan: frozen,
    clips: frozenClips,
    captionWords: words,
    audio,
    captionTiming: audio.captionTiming,
    alignment,
    sample(frame: number): StoryFrame {
      if (!Number.isInteger(frame) || frame < 0 || frame >= plan.durationInFrames) storyFail('INVALID_FRAME', 'Frame outside story', {
        frame
      });
      const scene = frozen.scenes.find(s => frame >= s.startFrame && frame < s.endFrame)!,
        poses: Record<string, StoryIntent> = {};
      for (const actor of Object.keys(frozen.characters).sort()) {
        const visible = Object.hasOwn(scene.characters, actor),
          home = visible ? scene : frozen.scenes.find(s => Object.hasOwn(s.characters, actor))!,
          defaults = home.characters[actor],
          list = visible ? frozenClips.filter(c => c.scene === scene.id && c.action.actor === actor && c.startFrame <= frame) : [],
          stance = list.filter(c => ['stand', 'sit', 'walk'].includes(c.action.type)).at(-1),
          gaze = list.filter(c => c.action.type === 'look').at(-1),
          face = list.filter(c => c.action.type === 'expression').at(-1),
          gesture = list.find(c => ['point', 'gesture', 'react'].includes(c.action.type) && frame < c.endFrame);
        poses[actor] = {
          visible,
          scene: home.id,
          stance: stance ?? defaults.stance,
          gaze: gaze ?? defaults.lookAt ?? null,
          expression: face ?? defaults.expression ?? frozen.characters[actor].expression ?? 'neutral',
          gesture: gesture ?? null
        };
      }
      const shot = scene.shots.find(s => frame >= s.startFrame && frame < s.endFrame)!;
      return freezeData({
        frame,
        scene,
        localFrame: frame - scene.startFrame,
        poses,
        shot,
        cue: cues.find(c => frame >= c.startFrame && frame < c.endFrame) ?? null,
        audio: audio.byFrame[frame]
      });
    }
  });
}
export function compileStory(input: StoryPlan) {
  try {
    return compile(input);
  } catch (e) {
    if (e instanceof StoryError) throw e;
    storyFail('INVALID_SCHEMA', 'Malformed structured story plan', {
      details: String(e)
    });
  }
}
export type CompiledStory = ReturnType<typeof compileStory>;
/** Data-only orchestration validation. Never pass this long timeline to a renderer. */
export function compileOrchestrationStory(input: StoryPlan): CompiledStory {
  if (input?.fps !== 30) storyFail('INVALID_TIMEBASE', 'Segmented stories require 30 fps');
  try { return compile(input, 1800, 8); }
  catch (e) {
    if (e instanceof StoryError) throw e;
    storyFail('INVALID_SCHEMA', 'Malformed structured story plan', {details:String(e)});
  }
}
