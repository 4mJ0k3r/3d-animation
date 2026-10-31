import type { Bounds, CompositionSnapshot, StaticShot } from './types';
import { directionFail } from './types';
import { unionBounds } from './bounds';
export function shotBounds(shot: StaticShot, snapshot: CompositionSnapshot): Bounds {
  const ids = shot.subjects ?? [shot.subject!],
    boxes: Bounds[] = [];
  for (const id of ids) {
    const actor = Object.hasOwn(snapshot.actors, id) ? snapshot.actors[id] : undefined,
      prop = Object.hasOwn(snapshot.props, id) ? snapshot.props[id] : undefined;
    if (shot.type === 'objectFocus' || shot.type === 'establishing' && prop) {
      if (!prop) directionFail('UNKNOWN_PROP', `Unknown prop ${id}`, {
        shotId: shot.id,
        subject: id
      });
      const region = shot.region ?? 'full',
        box = prop.regions[region];
      if (!box) directionFail('UNKNOWN_REGION', `Unknown prop region ${region}`, {
        shotId: shot.id,
        subject: id
      });
      if (!prop.visible) directionFail('HIDDEN_SUBJECT', 'Required prop is hidden', {
        shotId: shot.id,
        subject: id
      });
      boxes.push(box);
      continue;
    }
    if (!actor) directionFail('UNKNOWN_ACTOR', `Unknown actor ${id}`, {
      shotId: shot.id,
      subject: id
    });
    if (!actor.visible) directionFail('HIDDEN_SUBJECT', 'Required actor is hidden', {
      shotId: shot.id,
      subject: id
    });
    if (shot.region !== undefined) directionFail('UNKNOWN_REGION', 'Actor regions are selected by the shot preset', {
      shotId: shot.id
    });
    const r = actor.regions;
    boxes.push(...(shot.type === 'fullBody' || shot.type === 'establishing' ? [r.fullBody] : shot.type === 'closeUp' ? [r.head, r.face] : shot.type === 'reaction' ? [r.head, r.face, r.gesture] : [r.head, r.face, r.torso, r.leftHand, r.rightHand]));
  }
  return unionBounds(boxes);
}
export const croppingForShot = (s: StaticShot) => ['establishing', 'fullBody', 'objectFocus'].includes(s.type) ? 'protect-entire-region' : 'lower-body-cropping-allowed';
