import type { CartoonEngine } from './toon-kit/engine';
import { createUniversalClinic } from './clinic-universal';
import { createClinicStage } from './toon-kit/staging';
import { createDirector } from './toon-kit/direction';
import type { StaticShot } from './toon-kit/direction';
export const CLINIC_STATIC_SHOTS: readonly StaticShot[] = Object.freeze([{
  id: 'conversation',
  type: 'twoShot',
  subjects: Object.freeze(['doctor', 'patient']),
  startFrame: 0,
  endFrame: 43
}, {
  id: 'chart',
  type: 'objectFocus',
  subject: 'medicalChart',
  region: 'diagram',
  startFrame: 43,
  endFrame: 75
}, {
  id: 'doctor',
  type: 'medium',
  subject: 'doctor',
  startFrame: 75,
  endFrame: 114,
  view: 'subjectFront'
}, {
  id: 'reaction',
  type: 'reaction',
  subject: 'patient',
  startFrame: 114,
  endFrame: 150,
  view: 'subjectFront'
}].map(s => Object.freeze(s as StaticShot)));
export function createCinematicClinic(engine: CartoonEngine, aspect = engine.camera.aspect, shots = CLINIC_STATIC_SHOTS) {
  const clinic = createUniversalClinic(engine),
    stage = createClinicStage(engine, {
      environment: clinic.environment,
      targets: clinic.targets
    });
  stage.bind(clinic.cast);
  const director = createDirector(engine, {
    stage,
    shots,
    durationInFrames: 150,
    aspect
  });
  const sample = (frame: number) => stage.snapshot(clinic.evaluate(frame));
  director.prepare({
    sample
  });
  return {
    clinic,
    stage,
    director,
    sample,
    evaluate(frame: number) {
      const snapshot = sample(frame),
        camera = director.applyFrame({
          frame,
          snapshot
        });
      return {
        snapshot,
        camera
      };
    },
    dispose() {
      director.dispose();
      stage.dispose();
      clinic.dispose();
    }
  };
}
