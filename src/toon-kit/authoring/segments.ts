import { compileStoryDocument } from './document';
import type { CompiledStoryDocument } from './document';
import { freezeData } from '../characters/pose';
import { storyFail } from '../story/types';

/** Half-open GLOBAL intervals, cut only between complete scenes. No pose baking. */
export function planStorySegments(source: CompiledStoryDocument) {
  const segments: {
    index: number;
    startFrame: number;
    endFrame: number;
  }[] = [];
  for (const scene of source.timeline.plan.scenes) {
    if (scene.endFrame - scene.startFrame > 600) storyFail('SEGMENT_BOUNDARY', 'Add a scene cut within 600 frames');
    // One complete scene per segment also bounds accumulated director certificates.
    segments.push({
      index: segments.length,
      startFrame: scene.startFrame,
      endFrame: scene.endFrame
    });
  }
  return freezeData(segments);
}
/** Existing compiler/evaluator, evaluated on a translated clock. Every action is intact. */
export function compileStorySegment(source: CompiledStoryDocument, index: number): CompiledStoryDocument {
  const segment = planStorySegments(source)[index];
  if (!segment || !Number.isInteger(index)) storyFail('INVALID_SEGMENT', 'Unknown segment index');
  const {
    startFrame: start,
    endFrame: end
  } = segment;
  const scenes = source.document.story.scenes.filter(s => s.startFrame >= start && s.endFrame <= end).map(s => ({
    ...s,
    startFrame: s.startFrame - start,
    endFrame: s.endFrame - start,
    beats: s.beats.map(b => ({
      ...b,
      startFrame: b.startFrame - start,
      endFrame: b.endFrame - start
    })),
    shots: s.shots.map(sh => ({
      ...sh,
      startFrame: sh.startFrame - start,
      endFrame: sh.endFrame - start
    })),
    ...(s.propAnimations ? {
      propAnimations: s.propAnimations.map(a => ({
        ...a,
        startFrame: a.startFrame - start,
        endFrame: a.endFrame - start
      }))
    } : {}),
    cues: []
  }));
  const settings = new Set(scenes.map(s => s.setting));
  const actors = new Set(scenes.flatMap(s => Object.keys(s.characters)));
  const {
    audio: _audio,
    ...visualStory
  } = source.document.story;
  const local = compileStoryDocument({
    ...source.document,
    layouts: Object.fromEntries(Object.entries(source.document.layouts).filter(([k]) => settings.has(k))),
    story: {
      ...visualStory,
      durationInFrames: end - start,
      scenes,
      characters: Object.fromEntries(Object.entries(source.document.story.characters).filter(([k]) => actors.has(k)))
    }
  });
  // Keep the exact globally compiled word intervals; clipping is only for safety
  // certification. Display uses the original global intervals (no punch restart).
  const words = source.timeline.captionWords.filter(w => w.startFrame < end && w.endFrame > start).map(w => ({
    ...w,
    startFrame: Math.max(start, w.startFrame) - start,
    endFrame: Math.min(end, w.endFrame) - start
  }));
  return Object.freeze({
    ...local,
    timeline: Object.freeze({
      ...local.timeline,
      captionWords: freezeData(words)
    })
  });
}
