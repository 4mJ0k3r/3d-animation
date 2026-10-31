import * as T from 'three';
import type { CartoonEngine } from '../toon-kit/engine';
import { createPrimitiveFactory, setupCartoonLighting } from '../toon-kit/lib';
import { createTargets, sceneMark, scenePoint, sceneSeat, createPaths, pathFromMarks, levelFloor } from '../toon-kit/characters';
import { compileStory, createStory } from '../toon-kit/story';
import type { CompiledStory, StorySettingBinding } from '../toon-kit/story';
import type { CaptionLayout } from '../toon-kit/caption-layout';
import { TEN_SECOND_STORY } from './story-plan';
/** Only setting geometry/semantic bindings; story authors never manipulate this per frame. */
export function createStorySettings(engine: CartoonEngine): Record<string, StorySettingBinding> {
  const p = createPrimitiveFactory(engine);
  setupCartoonLighting(engine.scene);
  function room(name: string, x: number, color: string): StorySettingBinding {
    const root = new T.Group();
    root.name = name;
    root.position.x = x;
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
        color
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
      audience = new T.Group();
    entry.position.set(-1.1, 0, 0);
    finish.position.set(-1.1, 0, .6);
    audience.position.set(0, 2.7, 5);
    root.add(entry, finish, audience);
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
  return {
    office: room('StoryOffice', 0, '#e2e9e9'),
    meeting: room('StoryMeeting', 20, '#eadfcf')
  };
}
export function createStoryFixture(engine: CartoonEngine, captions: CaptionLayout, timeline: CompiledStory = compileStory(TEN_SECOND_STORY)) {
  const player = createStory(engine, {
    timeline,
    settings: createStorySettings(engine),
    captions
  });
  player.prepare();
  return player;
}
