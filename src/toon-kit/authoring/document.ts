import { compileStory, compileOrchestrationStory } from '../story/compiler';
import type { StoryPlan, StoryTarget, StorySupport } from '../story/types';
import { storyFail } from '../story/types';
import { freezeData } from '../characters/pose';
import type { SemanticCameraPlan } from '../direction/types';
/** One clock/schema: story is the existing StoryPlan, not a second timeline. */
export interface StoryDocument {
  readonly version: 1;
  readonly video: {
    readonly width: number;
    readonly height: number;
  };
  readonly font: 'noto-sans-devanagari';
  readonly layouts: Readonly<Record<string, {
    readonly preset: 'office' | 'clinic';
  }>>;
  readonly story: StoryPlan;
}
export const LAYOUTS = freezeData({
  office: {
    marks: ['entry', 'finish', 'right'],
    seats: ['chair'],
    points: ['board', 'audience'],
    props: ['board'],
    floors: ['ground'],
    paths: ['toDesk']
  },
  clinic: {
    marks: ['doctor'],
    seats: ['examSeat'],
    points: ['diagram', 'diagramHead', 'audience'],
    props: ['chart', 'examTable'],
    floors: ['ground'],
    paths: []
  }
});
const keys = (v: unknown, allowed: readonly string[]) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !allowed.includes(k))) storyFail('INVALID_DOCUMENT', 'Expected an object with only: ' + allowed.join(', '));
};
export function compileStoryDocument(input: unknown) {
  keys(input, ['version', 'video', 'font', 'layouts', 'story']);
  const d = input as StoryDocument;
  if (d.version !== 1) storyFail('INVALID_DOCUMENT', 'Use document version:1');
  keys(d.video, ['width', 'height']);
  if (![[720, 1280], [1280, 720], [1080, 1920], [1920, 1080]].some(([w, h]) => d.video.width === w && d.video.height === h)) storyFail('INVALID_VIEWPORT', 'Choose 720x1280,1280x720,1080x1920 or1920x1080; keep software-safe');
  if (d.font !== 'noto-sans-devanagari') storyFail('FONT_UNAVAILABLE', 'Select font:"noto-sans-devanagari" (bundled OFL font)');
  if (!d.layouts || typeof d.layouts !== 'object' || Array.isArray(d.layouts) || !Object.keys(d.layouts).length || Object.keys(d.layouts).length > 4) storyFail('UNSUPPORTED_LAYOUT', 'Declare 1..4 named layouts using office or clinic');
  for (const [name, layout] of Object.entries(d.layouts)) {
    if (!name.trim() || name.length > 128 || ['__proto__', 'prototype', 'constructor', 'stage'].includes(name)) storyFail('INVALID_DOCUMENT', 'Invalid layout name');
    keys(layout, ['preset']);
    if (!Object.hasOwn(LAYOUTS, layout.preset)) storyFail('UNSUPPORTED_LAYOUT', `Unknown layout ${layout.preset}; choose office or clinic`);
  }
  if (Array.isArray(d.story?.scenes)) for (const scene of d.story.scenes) if (scene?.endFrame - scene?.startFrame > 600) storyFail('SEGMENT_BOUNDARY', 'Add an explicit scene cut within 600 frames; seamless cross-segment transitions are unsupported');
  const timeline = d.story?.durationInFrames > 600 ? compileOrchestrationStory(d.story) : compileStory(d.story);
  for (const scene of timeline.plan.scenes) if (scene.endFrame - scene.startFrame > 600) storyFail('SEGMENT_BOUNDARY', 'Each scene must fit 600 frames; add an explicit scene cut. Seamless cross-segment moves are unsupported', {scene:scene.id});
  for (const [actor, c] of Object.entries(timeline.plan.characters)) if (c.proportions !== undefined || c.scale !== undefined && c.scale !== 1) storyFail('UNSUPPORTED_BODY', 'Curated starters use default body proportions/scale; omit proportions and scale', {
    actor
  });
  for (const key of Object.keys(d.layouts)) if (!timeline.plan.scenes.some(s => s.setting === key)) storyFail('UNUSED_LAYOUT', 'Remove unused layout ' + key);
  for (const scene of timeline.plan.scenes) {
    if (!Object.hasOwn(d.layouts, scene.setting)) storyFail('UNSUPPORTED_LAYOUT', 'Declare layouts.' + scene.setting, {
      scene: scene.id
    });
    const slots = LAYOUTS[d.layouts[scene.setting].preset];
    if (Object.keys(scene.characters).length !== 2) storyFail('LAYOUT_CAPACITY', 'Curated layouts support two active actors per scene', {
      scene: scene.id
    });
    const requireName = (name: unknown, allowed: readonly string[], kind: string) => {
      if (typeof name !== 'string' || !allowed.includes(name)) storyFail('UNKNOWN_SLOT', `${kind} '${name}' is unavailable in ${scene.setting}; choose ${allowed.join(', ') || '(none)'}`, {
        scene: scene.id,
        details: {
          kind,
          name,
          allowed
        }
      });
    };
    const support = (s: StorySupport) => s.type === 'stand' ? requireName(s.at, slots.marks, 'standing mark') : (requireName(s.seat, slots.seats, 'seat'), requireName(s.floor, slots.floors, 'floor'));
    const target = (t: StoryTarget) => {
      if (typeof t === 'string') requireName(t, [...slots.marks, ...slots.seats, ...slots.points], 'target');
    };
    for (const value of Object.values(scene.characters)) {
      support(value.stance);
      if (value.lookAt) target(value.lookAt);
    }
    for (const beat of scene.beats) for (const a of beat.actions) {
      if (a.type === 'stand' || a.type === 'sit') support(a);else if (a.type === 'walk') requireName(a.path, slots.paths, 'walking path');else if (a.type === 'look' || a.type === 'point') target(a.target);
    }
    const camera = (shot: SemanticCameraPlan) => {
      if (shot.type === 'objectFocus') {
        requireName(shot.subject, slots.props, 'camera prop');
        if (shot.region !== undefined && shot.region !== 'full') storyFail('UNKNOWN_SLOT', 'Curated starters expose objectFocus region:"full"', {
          scene: scene.id
        });
      } else {
        if (shot.region !== undefined) storyFail('UNKNOWN_SLOT', 'Actor regions are chosen by the shot preset; remove region', {
          scene: scene.id
        });
        if ('subject' in shot) requireName(shot.subject, Object.keys(scene.characters), 'camera actor');
      }
      if (shot.subjects) for (const actor of shot.subjects) requireName(actor, Object.keys(scene.characters), 'camera actor');
    };
    for (const shot of scene.shots) {
      camera(shot);
      if (shot.motion?.type === 'move') {
        camera(shot.motion.from);
        camera(shot.motion.to);
      } else if (shot.motion?.type === 'pan') for (const t of [shot.motion.from, shot.motion.to]) requireName(t.subject, [...Object.keys(scene.characters), ...slots.props], 'pan target');
    }
    for (const actor of Object.keys(timeline.plan.characters)) if ((slots.props as readonly string[]).includes(actor)) storyFail('INVALID_NAME', 'Actor names must differ from layout prop names: ' + actor);
    // Semantic occupancy, not physics: entry/finish/path share the left lane;
    // right mark and chair share the right role. Changes are checked at boundaries.
    const boundaries = new Set([scene.startFrame, ...scene.beats.map(b => b.startFrame)]);
    for (const frame of boundaries) {
      const used = new Set<string>(),
        state = timeline.sample(frame);
      for (const actor of Object.keys(scene.characters)) {
        const s = state.poses[actor].stance,
          a = 'action' in s ? s.action : s,
          role = a.type === 'sit' || a.type === 'stand' && a.at === 'right' ? 'right' : 'left';
        if (used.has(role)) storyFail('SLOT_OCCUPIED', 'Use one actor in the standing/walking lane and one at the right mark or seat; swap roles only at a cut', {
          scene: scene.id,
          actor,
          frame
        });
        used.add(role);
      }
    }
  }
  return Object.freeze({
    document: freezeData({
      version: 1 as const,
      video: {
        ...d.video
      },
      font: d.font,
      layouts: Object.fromEntries(Object.entries(d.layouts).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, {
        preset: v.preset
      }])),
      story: timeline.plan
    }),
    timeline
  });
}
export type CompiledStoryDocument = ReturnType<typeof compileStoryDocument>;
