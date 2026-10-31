import { freezeData } from '../characters/pose';
import { directionFail } from './types';
import type { StaticShot } from './types';
import { normalizeMotion } from './motion-contract';
export function compileShotTimeline(shots: readonly StaticShot[], durationInFrames: number) {
  if (!Number.isInteger(durationInFrames) || durationInFrames < 1 || durationInFrames > 600 || !Array.isArray(shots) || shots.length < 1 || shots.length > 32) directionFail('INVALID_TIMELINE', 'Use 1..32 shots covering 1..600 frames');
  const ids = new Set<string>(),
    sorted = shots.map(s => {
      if (!s || typeof s.id !== 'string' || !s.id.trim() || ids.has(s.id)) directionFail('INVALID_SHOT_ID', 'Shot IDs must be nonempty and unique');
      ids.add(s.id);
      if (s.allowAxisCrossing!==undefined&&typeof s.allowAxisCrossing!=='boolean')directionFail('UNSUPPORTED_SHOT','allowAxisCrossing must be boolean');
      if (Object.keys(s).some(k => !['id', 'type', 'startFrame', 'endFrame', 'subject', 'subjects', 'region', 'view','allowAxisCrossing','motion'].includes(k))) directionFail('UNSUPPORTED_SHOT', 'Unknown shot option', {
        shotId: s.id
      });
      if (!['establishing', 'twoShot', 'medium', 'fullBody', 'closeUp', 'reaction', 'objectFocus'].includes(s.type) || s.view !== undefined && !['front', 'threeQuarter', 'subjectFront'].includes(s.view)) directionFail('UNSUPPORTED_SHOT', 'Unsupported shot type/view', {
        shotId: s.id
      });
      if (!Number.isInteger(s.startFrame) || !Number.isInteger(s.endFrame) || s.startFrame < 0 || s.endFrame <= s.startFrame || s.endFrame > durationInFrames) directionFail('INVALID_RANGE', 'Invalid half-open frame interval', {
        shotId: s.id
      });
      const multi = s.type === 'twoShot' || s.type === 'establishing';
      if (multi ? !!s.subject || !Array.isArray(s.subjects) || s.subjects.length < (s.type === 'twoShot' ? 2 : 1) || new Set(s.subjects).size !== s.subjects.length : typeof s.subject !== 'string' || !s.subject.trim() || s.subjects !== undefined) directionFail('INVALID_SUBJECT', 'Use subjects for group shots, subject for single shots', {
        shotId: s.id
      });
      if (s.subjects?.some((x: unknown) => typeof x !== 'string' || !x.trim()) || s.region !== undefined && typeof s.region !== 'string') directionFail('INVALID_SUBJECT', 'Invalid semantic reference', {
        shotId: s.id
      });
      return {
        ...s,
        ...(s.motion === undefined ? {} : {motion: normalizeMotion(s.motion, p => {compileShotTimeline([{...p,id:s.id,startFrame:0,endFrame:2}],2);})}),
        subjects: s.subjects ? [...s.subjects] : undefined
      };
    }).sort((a, b) => a.startFrame - b.startFrame);
  let end = 0;
  for (const s of sorted) {
    if (s.startFrame !== end) directionFail(s.startFrame < end ? 'SHOT_OVERLAP' : 'SHOT_GAP', 'Every frame must have exactly one shot', {
      shotId: s.id
    });
    end = s.endFrame;
  }
  if (end !== durationInFrames) directionFail('SHOT_GAP', 'Timeline must cover the clip ending');
  const plans = freezeData(sorted);
  return Object.freeze({
    shots: plans,
    select(frame: number) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= durationInFrames) directionFail('INVALID_FRAME', 'Requested frame outside timeline', {
        frame
      });
      return plans.find(s => frame >= s.startFrame && frame < s.endFrame)!;
    }
  });
}
