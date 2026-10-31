import type { CartoonEngine } from '../toon-kit/engine';
import { createUniversalClinic } from '../clinic-universal';
import { createClinicStage } from '../toon-kit/staging';
import { createDirector } from '../toon-kit/direction';
import type { StaticShot, CaptionLayout } from '../toon-kit';
export const MOTION_SHOTS: readonly StaticShot[] = [{
  id: 'push',
  type: 'reaction',
  subject: 'patient',
  startFrame: 0,
  endFrame: 30,
  motion: {
    type: 'pushIn',
    amount: 'subtle',
    easing: 'easeInOut'
  }
}, {
  id: 'pan',
  type: 'twoShot',
  subjects: ['doctor', 'patient'],
  startFrame: 30,
  endFrame: 60,
  motion: {
    type: 'pan',
    from: {
      subject: 'doctor'
    },
    to: {
      subject: 'patient'
    },
    easing: 'easeInOut'
  }
}, {
  id: 'move',
  type: 'reaction',
  subject: 'patient',
  startFrame: 60,
  endFrame: 90,
  motion: {
    type: 'move',
    from: {
      type: 'medium',
      subject: 'patient',
      view: 'front'
    },
    to: {
      type: 'reaction',
      subject: 'patient',
      view: 'subjectFront'
    },
    easing: 'easeInOut'
  }
}];
/** Existing room, cast and appearances; neutral poses isolate camera behavior. */
export function createMotionFixture(engine: CartoonEngine, captions?: CaptionLayout) {
  const clinic = createUniversalClinic(engine),
    stage = createClinicStage(engine, {
      environment: clinic.environment,
      targets: clinic.targets
    });
  stage.bind(clinic.cast);
  const sample = (frame: number) => stage.snapshot(clinic.cast.evaluate({
    frame,
    fps: 30
  }));
  const director = createDirector(engine, {
    stage,
    shots: MOTION_SHOTS,
    durationInFrames: 90,
    aspect: engine.camera.aspect,
    composition: {
      captions
    }
  });
  director.prepare({
    sample
  });
  return {
    clinic,
    stage,
    director,
    sample,
    evaluate(frame: number) {
      return director.applyFrame({
        frame,
        snapshot: sample(frame)
      });
    },
    dispose() {
      director.dispose();
      stage.dispose();
      clinic.dispose();
    }
  };
}

export const MOTION_WORDS = [{
  text: 'PUSH IN',
  startFrame: 0,
  endFrame: 30
}, {
  text: 'PAN',
  startFrame: 30,
  endFrame: 60
}, {
  text: 'MOVE',
  startFrame: 60,
  endFrame: 90
}];
