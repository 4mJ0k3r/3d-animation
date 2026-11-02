import type { CompiledStory } from '../story/compiler';
import { freezeData } from '../characters/pose';
export const FRAMING_HINT = 'A twoShot (or groupShot, which needs all three faces) needs its faces visible: off-axis gaze toward a board, prop or another actor can make it impossible to frame. Aim actors toward audience during the twoShot, or cut to a closeUp/medium of the looking actor or an objectFocus shot of the target. Try a wider preset or shorter captions; never patch camera coordinates.';

/** Static risk detection only; camera/constraint certification requires prepare(). */
export function authoringWarnings(timeline: CompiledStory) {
  const warnings: {
    code: string;
    severity: 'warning';
    scene: string;
    shot: string;
    actor?: string;
    frame: number;
    target?: unknown;
    message: string;
  }[] = [];
  for (const scene of timeline.plan.scenes) for (const shot of scene.shots) {
    if (shot.type !== 'twoShot' && shot.type !== 'groupShot') continue;
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
        code: shot.type === 'groupShot' ? 'GROUP_SHOT_GAZE_RISK' : 'TWO_SHOT_GAZE_RISK',
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
  for (const scene of timeline.plan.scenes) {
    for (const effect of scene.effects ?? []) {
      const eStart = effect.startFrame;
      const target = effect.target;
      const activeShot = scene.shots.find(s => s.startFrame <= eStart && s.endFrame > eStart);
      if (!activeShot) continue;

      const isFocused = activeShot.type === 'objectFocus' && activeShot.subject === target;
      if (!isFocused) {
        const prevShot = scene.shots.slice().reverse().find(s => s.type === 'objectFocus' && s.subject === target && s.endFrame <= eStart);
        const fix = prevShot
          ? `Extend shot '${prevShot.id}' (objectFocus on '${target}') to cover frame ${eStart}, or cut to an objectFocus shot of '${target}' during the effect, or align effect startFrame with the focused shot.`
          : `Cut to an 'objectFocus' shot targeting '${target}' during the effect around frame ${eStart}, or widen framing so '${target}' is visibly centered.`;
        warnings.push({
          code: 'EFFECT_NOT_FOCUSED',
          severity: 'warning',
          scene: scene.id,
          shot: activeShot.id,
          frame: eStart,
          target: { effect: effect.type, target, activeShot: activeShot.id, activeShotType: activeShot.type },
          message: `Effect '${effect.type}' at frame ${eStart} targets '${target}', but active shot '${activeShot.id}' (${activeShot.type}) is not focused on '${target}'. Suggested fix: ${fix} If this is an intentional background/off-camera effect or reaction shot, review and accept this advisory warning.`
        });
      }
    }

    for (const cue of scene.cues ?? []) {
      if (cue.kind === 'caption' || (cue as any).mode === 'voiceover' || (cue as any).voiceover === true || cue.speaker === 'narrator' || !cue.speaker) {
        continue;
      }
      const speaker = cue.speaker;
      const cStart = cue.startFrame;
      const cEnd = cue.endFrame;
      const cDuration = cEnd - cStart;
      if (cDuration <= 0) continue;

      for (const shot of scene.shots) {
        const overlap = Math.max(0, Math.min(cEnd, shot.endFrame) - Math.max(cStart, shot.startFrame));
        if (overlap <= 0 || (overlap / cDuration) <= 0.5) continue;

        if (shot.type === 'reaction' || /\breact(ion)?\b/i.test(shot.id)) {
          continue;
        }

        // Single-subject actor shots: medium, closeUp, fullBody, cowboy
        const isSingleActorShot = ['medium', 'closeUp', 'fullBody', 'cowboy'].includes(shot.type);
        if (isSingleActorShot && shot.subject && shot.subject !== speaker) {
          const fix = `Cut to a shot of '${speaker}', switch to a twoShot including '${speaker}', or if this is an intentional reaction shot or voiceover, use shot type 'reaction' or mark the cue as voiceover.`;
          warnings.push({
            code: 'SPEAKER_NOT_IN_SHOT',
            severity: 'warning',
            scene: scene.id,
            shot: shot.id,
            actor: speaker,
            frame: cStart,
            target: { speaker, shotSubject: shot.subject, shotId: shot.id, shotType: shot.type, overlapFraction: Math.round((overlap / cDuration) * 100) / 100 },
            message: `Dialogue cue '${cue.id || 'unnamed'}' in ${scene.id} [${cStart}, ${cEnd}] is spoken by '${speaker}', but active shot '${shot.id}' (${shot.type}) focuses on '${shot.subject}' for ${Math.round((overlap / cDuration) * 100)}% of the line. Suggested fix: ${fix}`
          });
        }
      }
    }
  }
  return freezeData(warnings);
}
