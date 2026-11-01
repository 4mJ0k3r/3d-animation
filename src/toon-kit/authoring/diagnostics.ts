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
  for (let i=1;i<timeline.plan.scenes.length;i++) {
    const previous = timeline.plan.scenes[i-1], next = timeline.plan.scenes[i];
    const before = timeline.sample(previous.endFrame-1), after = timeline.sample(next.startFrame);
    for (const actor of Object.keys(next.characters).sort()) {
      if (!Object.hasOwn(previous.characters,actor)) continue;
      const a=before.poses[actor].stance,b=after.poses[actor].stance;
      const from='action' in a?a.action:a,to='action' in b?b.action:b;
      if ((from.type==='sit') === (to.type==='sit')) continue;
      warnings.push({code:'POSTURE_CUT',severity:'warning',scene:next.id,shot:after.shot.id,actor,frame:next.startFrame,
        target:{previousScene:previous.id,from:from.type==='sit'?'seated':'standing',to:to.type==='sit'?'seated':'standing'},
        message:`${actor} changes from ${from.type==='sit'?'seated':'standing'} to ${to.type==='sit'?'seated':'standing'} at the cut from ${previous.id} to ${next.id}. Keep the same posture across the cut, or author an explicit stand/sit contact cut at a suitable earlier shot boundary. Stand/sit commands are instant contact changes, not animated stand-up/sit-down transitions. If this is an intentional time jump, review and accept this warning.`});
    }
  }
  return freezeData(warnings);
}
