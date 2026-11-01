import type { CompiledStory } from '../story/compiler';
import { freezeData } from '../characters/pose';
export const FRAMING_HINT = 'A twoShot needs both faces visible: off-axis gaze toward a board, prop or another actor can make it impossible to frame. Aim actors toward audience during the twoShot, or cut to a closeUp/medium of the looking actor or an objectFocus shot of the target. Try a wider preset or shorter captions; never patch camera coordinates.';

/** Static risk detection only; camera/constraint certification requires prepare(). */
export function authoringWarnings(timeline: CompiledStory) {
  const warnings: {
    code: string;
    severity: 'warning';
    scene: string;
    shot: string;
    actor: string;
    frame: number;
    target: unknown;
    message: string;
  }[] = [];
  for (const scene of timeline.plan.scenes) for (const shot of scene.shots) {
    if (shot.type !== 'twoShot') continue;
    const seen = new Set<string>();
    const frames = [shot.startFrame, ...scene.beats.flatMap(b => [b.startFrame, b.endFrame])].filter(f => f >= shot.startFrame && f < shot.endFrame).sort((a, b) => a - b);
    for (const frame of frames) for (const actor of shot.subjects ?? Object.keys(scene.characters)) {
      const gaze = timeline.sample(frame).poses[actor]?.gaze;
      const target = gaze && typeof gaze === 'object' && 'action' in gaze && gaze.action.type === 'look' ? gaze.action.target : gaze;
      if (!target || target === 'audience') continue;
      const key = actor + '\0' + JSON.stringify(target);
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        code: 'TWO_SHOT_GAZE_RISK',
        severity: 'warning',
        scene: scene.id,
        shot: shot.id,
        actor,
        frame,
        target,
        message: FRAMING_HINT
      });
    }
  }
  return freezeData(warnings);
}
