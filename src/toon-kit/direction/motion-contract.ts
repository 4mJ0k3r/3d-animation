import type { CameraMotion, SemanticCameraPlan } from './types';
import { directionFail } from './types';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Strict immutable authoring contract; coordinates and nested motions are rejected. */
export function normalizeMotion(value: unknown, validatePlan: (p: SemanticCameraPlan) => void): CameraMotion {
  const fail = () => directionFail('INVALID_MOTION', 'Use pushIn/pan/move, named strengths, semantic plans/targets and linear/easeInOut easing');
  if (!object(value) || !['pushIn', 'pan', 'move'].includes(value.type as string)) return fail();
  const keys = value.type === 'pushIn' ? ['type', 'amount', 'easing'] : ['type', 'from', 'to', 'easing'];
  if (Object.keys(value).some(k => !keys.includes(k)) || value.easing !== undefined && !['linear', 'easeInOut'].includes(value.easing as string)) return fail();
  const easing = (value.easing ?? 'easeInOut') as 'linear' | 'easeInOut';
  if (value.type === 'pushIn') {
    if (value.amount !== undefined && !['subtle', 'moderate'].includes(value.amount as string)) return fail();
    return {
      type: 'pushIn',
      amount: (value.amount ?? 'subtle') as 'subtle' | 'moderate',
      easing
    };
  }
  if (value.type === 'pan') {
    const target = (v: unknown) => {
      if (!object(v) || Object.keys(v).some(k => !['subject', 'region'].includes(k)) || typeof v.subject !== 'string' || !v.subject.trim() || v.region !== undefined && (typeof v.region !== 'string' || !v.region.trim())) return fail();
      return {
        subject: v.subject,
        ...(v.region === undefined ? {} : {
          region: v.region as string
        })
      };
    };
    return {
      type: 'pan',
      from: target(value.from),
      to: target(value.to),
      easing
    };
  }
  const plan = (v: unknown): SemanticCameraPlan => {
    if (!object(v) || Object.keys(v).some(k => !['type', 'subject', 'subjects', 'region', 'view'].includes(k))) return fail();
    validatePlan(v as unknown as SemanticCameraPlan);
    return {
      ...v,
      ...(Array.isArray(v.subjects) ? {
        subjects: [...v.subjects]
      } : {})
    } as unknown as SemanticCameraPlan;
  };
  return {
    type: 'move',
    from: plan(value.from),
    to: plan(value.to),
    easing
  };
}
