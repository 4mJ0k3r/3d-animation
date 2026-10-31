import * as T from 'three';
import type { CartoonEngine } from '../toon-kit/engine';
import { createPrimitiveFactory, setupCartoonLighting } from '../toon-kit/lib';
import { createCast, createTargets, sceneMark, standAt, appearancePreset } from '../toon-kit/characters';
import { createStage } from '../toon-kit/staging/stage';
import { createDirector } from '../toon-kit/direction';
import type { StaticShot } from '../toon-kit/direction';
import type { CaptionLayout } from '../toon-kit/caption-layout';
export const OFFICE_WORDS = [{
  text: 'TEAM',
  startFrame: 0,
  endFrame: 30
}, {
  text: 'IDEA',
  startFrame: 30,
  endFrame: 60
}, {
  text: 'PLAN',
  startFrame: 60,
  endFrame: 90
}];
export const OFFICE_SHOTS: readonly StaticShot[] = [{
  id: 'team',
  type: 'twoShot',
  subjects: ['designer', 'manager'],
  startFrame: 0,
  endFrame: 30
}, {
  id: 'idea',
  type: 'closeUp',
  subject: 'designer',
  startFrame: 30,
  endFrame: 60,
  motion: {
    type: 'pushIn',
    amount: 'subtle'
  }
}, {
  id: 'plan',
  type: 'objectFocus',
  subject: 'board',
  region: 'full',
  startFrame: 60,
  endFrame: 90
}];
/** Small primitive set, not an environment library. No clinic imports/camera math. */
export function createOfficeFixture(engine: CartoonEngine, captions?: CaptionLayout) {
  const p = createPrimitiveFactory(engine),
    room = new T.Group();
  room.name = 'OfficeValidation';
  engine.scene.add(room);
  const floor = p.box({
    width: 12,
    height: .1,
    depth: 24,
    position: [0, -.05, 3],
    color: '#c7d6d5',
    outlineMode: 'none'
  });
  const wall = p.box({
    width: 12,
    height: 5,
    depth: .12,
    position: [0, 2.5, -3.2],
    color: '#dbe5ed'
  });
  const board = p.plane({
    width: 2.4,
    height: 1.5,
    position: [0, 2.55, -2.9],
    color: '#236f83'
  });
  room.add(floor, wall, board, p.box({
    width: 1.7,
    height: .12,
    depth: 1,
    position: [3, 1, -1.2],
    color: '#bc8e61'
  }), p.box({
    width: .12,
    height: 1,
    depth: .8,
    position: [2.3, .5, -1.2],
    color: '#435c6b'
  }), p.box({
    width: .12,
    height: 1,
    depth: .8,
    position: [3.7, .5, -1.2],
    color: '#435c6b'
  }));
  // The board's actual geometry is its meaningful framing region.
  for (let i = 0; i < 3; i++) room.add(p.box({
    width: .32 + i * .3,
    height: .12,
    depth: .025,
    position: [-.55 + i * .55, 2.3 + i * .2, -2.87],
    color: ['#ffcf66', '#81d6be', '#f1f3ed'][i],
    outlineMode: 'none'
  }));
  const post = p.box({
    width: .12,
    height: 4.3,
    depth: .12,
    position: [-1.15, 2.15, 1.1],
    color: '#607f8e'
  });
  room.add(post);
  const left = new T.Group(),
    right = new T.Group();
  left.position.set(-1.15, 0, 0);
  right.position.set(1.15, 0, 0);
  room.add(left, right);
  engine.track(room);
  setupCartoonLighting(engine.scene);
  const stage = createStage(engine, {
    root: room,
    floor,
    axis: ['designer', 'manager']
  });
  stage.registerProp('board', board);
  const targets = createTargets({
      left: sceneMark(left),
      right: sceneMark(right)
    }),
    cast = createCast(engine, {
      designer: {
        appearance: appearancePreset('casual'),
        stance: standAt(targets.mark('left')),
        proportions: {
          headRadius: .46
        }
      },
      manager: {
        appearance: appearancePreset('office'),
        stance: standAt(targets.mark('right')),
        proportions: {
          headRadius: .54,
          torsoRadius: .25
        }
      }
    });
  stage.bind(cast);
  const sample = (frame: number) => stage.snapshot(cast.evaluate({
    frame,
    fps: 30,
    poses: {
      designer: {
        expression: 'happy'
      },
      manager: {
        expression: 'worried'
      }
    }
  }));
  const director = createDirector(engine, {
    stage,
    shots: OFFICE_SHOTS,
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
    room,
    floor,
    board,
    post,
    cast,
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
      cast.dispose();
    }
  };
}
