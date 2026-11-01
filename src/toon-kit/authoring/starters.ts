import * as T from 'three';
import type { CartoonEngine } from '../engine';
import { createPrimitiveFactory, setupCartoonLighting } from '../lib';
import { createTargets, sceneMark, scenePoint, sceneSeat, createPaths, pathFromMarks, levelFloor } from '../characters';
import type { StorySettingBinding } from '../story/player';
import { ClinicEnvironment } from '../../ClinicEnvironment';
import type { CompiledStoryDocument } from './document';
/** Curated geometry/slots from the approved clinic and office fixtures. No procedural generator. */
export function createStoryEnvironments(engine: CartoonEngine, compiled: CompiledStoryDocument, layoutOrder: readonly string[] = Object.keys(compiled.document.layouts)) {
  setupCartoonLighting(engine.scene);
  const p = createPrimitiveFactory(engine),
    settings: Record<string, StorySettingBinding> = {};
  for (const [name, {
    preset
  }] of Object.entries(compiled.document.layouts)) {
    const layoutIndex = layoutOrder.indexOf(name);
    if (layoutIndex < 0) throw new Error("Missing canonical layout order");
    if (preset === 'clinic') {
      const room = new ClinicEnvironment();
      room.stageUniversalPortrait();
      room.group.position.x = layoutIndex * 20;
      engine.scene.add(room.group);
      room.group.updateWorldMatrix(true, true);
      engine.track(room.group);
      const audience = new T.Object3D();
      audience.position.set(0, 2.7, 5);
      room.group.add(audience);
      settings[name] = {
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
      continue;
    }
    const root = new T.Group();
    root.name = 'Office:' + name;
    root.position.x = layoutIndex * 20;
    engine.scene.add(root);
    const floor = p.box({
        width: 14,
        height: .1,
        depth: 24,
        position: [0, -.05, 3],
        color: '#d9d8c9',
        outlineMode: 'none'
      }),
      wall = p.box({
        width: 14,
        height: 5.5,
        depth: .12,
        position: [0, 2.75, -3.2],
        color: '#e2e9e9'
      }),
      board = p.plane({
        width: 1.6,
        height: 1.1,
        position: [-3, 2.7, .8],
        color: '#206d80'
      }),
      chair = p.box({
        width: 1.1,
        height: .15,
        depth: .95,
        position: [1, 1.025, -.5],
        color: '#6b8e9c'
      });
    root.add(floor, wall, board, chair, p.box({
      width: .8,
      height: .95,
      depth: .65,
      position: [1, .475, -.5],
      color: '#415c65'
    }));
    for (let i = 0; i < 3; i++) root.add(p.box({
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
    settings[name] = {
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
  }
  return settings;
}
