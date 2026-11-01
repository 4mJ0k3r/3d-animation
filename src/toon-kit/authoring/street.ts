import * as T from 'three';
import type { EnvironmentBuilder } from './environment-builders';
import { createTargets, sceneMark, scenePoint, createPaths, pathFromMarks, levelFloor } from '../characters';

/** Fixed level sidewalk and low-rise backdrop, not a procedural city. */
export const buildStreet: EnvironmentBuilder = (engine, p, name, layoutIndex, layout) => {
  const root = new T.Group();
  root.name = 'Street:' + name;
  root.position.x = layoutIndex * 20;
  engine.scene.add(root);
  const cool = layout.options?.palette === 'cool';
  const floor = p.box({
    width: 14,
    height: .1,
    depth: 24,
    position: [0, -.05, 3],
    color: cool ? '#d4dfe3' : '#e0d4bb',
    outlineMode: 'none'
  });
  root.add(floor, p.box({
    width: 14,
    height: 6,
    depth: .1,
    position: [0, 3, -7.8],
    color: cool ? '#c6dfef' : '#d2e9ee',
    outlineMode: 'none'
  }), p.box({
    width: 14,
    height: .02,
    depth: 3,
    position: [0, .01, -4],
    color: '#69777e',
    outlineMode: 'none'
  }), p.box({
    width: 14,
    height: .15,
    depth: .22,
    position: [0, .075, -2.4],
    color: '#adb9b8'
  }));
  for (const [x, h, c] of [[-4.5, 4.5, '#d6c8ae'], [0, 3.5, '#b9d0cc'], [4.5, 5.5, '#c2d0dd']] as const) {
    root.add(p.box({
      width: 3.8,
      height: h,
      depth: .6,
      position: [x, h / 2, -7.3],
      color: c
    }));
    for (const y of [1.1, 2.3]) root.add(p.box({
      width: 1.5,
      height: .65,
      depth: .03,
      position: [x, y, -6.98],
      color: '#7dabb8',
      outlineMode: 'none'
    }));
  }
  for (const x of [-4, 0, 4]) root.add(p.box({
    width: 1.5,
    height: .01,
    depth: .1,
    position: [x, .025, -4],
    color: '#f4e8bf',
    outlineMode: 'none'
  }));
  const entry = new T.Group(),
    finish = new T.Group(),
    right = new T.Group(),
    audience = new T.Group(),
    crossing = new T.Group();
  entry.position.set(-1.1, 0, -.1);
  finish.position.set(-1.1, 0, .6);
  right.position.set(1.15, 0, .35);
  audience.position.set(0, 2.7, 5);
  crossing.position.set(-3, 1.8, -3);
  root.add(entry, finish, right, audience, crossing);
  root.updateWorldMatrix(true, true);
  engine.track(root);
  return {
    root,
    floor,
    targets: createTargets({
      entry: sceneMark(entry),
      finish: sceneMark(finish),
      right: sceneMark(right),
      audience: scenePoint(audience),
      crossing: scenePoint(crossing)
    }),
    paths: createPaths({
      toMeeting: pathFromMarks([entry, finish])
    }),
    floors: {
      ground: levelFloor(0)
    }
  };
};
