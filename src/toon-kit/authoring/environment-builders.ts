import * as T from 'three';
import type { CartoonEngine } from '../engine';
import { createPrimitiveFactory } from '../lib';
import { createTargets, sceneMark, scenePoint, sceneSeat, createPaths, pathFromMarks, levelFloor } from '../characters';
import type { StorySettingBinding } from '../story/player';
import { ClinicEnvironment } from '../../ClinicEnvironment';
import type { EnvironmentLayout } from './environment-registry';
import { createDisplayMaterial } from './display';
type Factory = ReturnType<typeof createPrimitiveFactory>;
export type EnvironmentBuilder = (engine: CartoonEngine, p: Factory, name: string, layoutIndex: number, layout: EnvironmentLayout) => StorySettingBinding;
export const buildClinic: EnvironmentBuilder = (engine, p, name, layoutIndex, layout) => {
  const room = new ClinicEnvironment();
  room.stageUniversalPortrait();
  room.group.position.x = layoutIndex * 20;
  engine.scene.add(room.group);
  room.group.updateWorldMatrix(true, true);
  engine.track(room.group);
  const audience = new T.Object3D();
  audience.position.set(0, 2.7, 5);
  room.group.add(audience);
  return {
    root: room.group,
    floor: room.floorSurface,
    targets: createTargets({
      ...room.semanticTargets().entries,
      audience: scenePoint(audience)
    }),
    props: {
      chart: room.medicalChart,
      examTable: room.examinationCushion
    },
    floors: {
      ground: room.floorTarget()
    }
  };
};
export const buildOffice: EnvironmentBuilder = (engine, p, name, layoutIndex, layout) => {
  const {
    displays
  } = layout;
  const root = new T.Group();
  root.name = 'Office:' + name;
  root.position.x = layoutIndex * 20;
  engine.scene.add(root);
  const floor = p.box({
      width: 14,
      height: .1,
      depth: 24,
      position: [0, -.05, 3],
      color: layout.options?.palette === 'cool' ? '#d1dde2' : '#d9d8c9',
      outlineMode: 'none'
    }),
    wall = p.box({
      width: 14,
      height: 5.5,
      depth: .12,
      position: [0, 2.75, -3.2],
      color: layout.options?.palette === 'cool' ? '#dbe7f3' : '#e2e9e9'
    }),
    board = p.plane({
      width: 1.6,
      height: 1.1,
      position: [-3, 2.7, .8],
      color: '#206d80',
      ...(displays?.board ? {
        material: createDisplayMaterial(displays.board.text)
      } : {})
    }),
    chair = p.box({
      width: 1.1,
      height: .15,
      depth: .95,
      position: [1, 1.025, -.5],
      color: '#6b8e9c'
    });
  chair.name = 'OfficeChairSeat';
  root.add(floor, wall, board, chair);
  // Keep the exact semantic seat surface; replace the solid pedestal with
  // four floor-to-seat legs and an attached backrest behind the sitter.
  for (const x of [-.45, .45]) for (const z of [-.37, .37]) {
    const leg = p.box({
      width: .08,
      height: .95,
      depth: .08,
      position: [1 + x, .475, -.5 + z],
      color: '#415c65'
    });
    leg.name = 'OfficeChairLeg';
    root.add(leg);
  }
  const back = p.box({
    width: 1.1,
    height: .9,
    depth: .12,
    position: [1, 1.55, -.94],
    color: '#6b8e9c'
  });
  back.name = 'OfficeChairBack';
  root.add(back);
  if (!displays?.board) for (let i = 0; i < 3; i++) root.add(p.box({
    width: .25 + i * .2,
    height: .09,
    depth: .02,
    position: [-3.45 + i * .4, 2.45 + i * .15, .825],
    color: ['#ffd067', '#8dd9b6', '#f5eee3'][i],
    outlineMode: 'none'
  }));
  const entry = new T.Group(),
    finish = new T.Group(),
    right = new T.Group(),
    audience = new T.Group();
  entry.position.set(-1.1, 0, 0);
  finish.position.set(-1.1, 0, .6);
  right.position.set(1.15, 0, 0);
  audience.position.set(0, 2.7, 5);
  root.add(entry, finish, right, audience);
  root.updateWorldMatrix(true, true);
  engine.track(root);
  return {
    root,
    floor,
    props: {
      board
    },
    targets: createTargets({
      entry: sceneMark(entry),
      finish: sceneMark(finish),
      right: sceneMark(right),
      chair: sceneSeat(chair),
      board: scenePoint(board),
      audience: scenePoint(audience)
    }),
    paths: createPaths({
      toDesk: pathFromMarks([entry, finish])
    }),
    floors: {
      ground: levelFloor(0)
    }
  };
};
