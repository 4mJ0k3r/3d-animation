import * as T from 'three';
import { createPrimitiveFactory } from '../lib';
import { createTargets, createPaths, scenePoint, sceneSeat, sceneMark, pathFromMarks } from '../characters';
import type { StorySettingBinding } from '../story/player';
import type { EnvironmentLayout, PrefabName } from './environment-registry';
import { createDisplayMaterial } from './display';
import { freezeData } from '../characters/pose';
type Factory = ReturnType<typeof createPrimitiveFactory>;
interface Built {
  root: T.Group;
  point: T.Object3D;
  seat?: T.Mesh;
  approach?: T.Group;
  sockets: Record<string, T.Group>;
}
type Builder = (p: Factory, finish: string | undefined, text: string | undefined, mounted: boolean) => Built;
const furniture = (kind: 'chair' | 'bench' | 'table'): Builder => (p, finish) => {
  const root = new T.Group(),
    width = kind === 'bench' ? 1.5 : kind === 'table' ? 1.4 : 1.1;
  const y = kind === 'table' ? .84 : kind === 'bench' ? .365 : 1.025,
    thickness = kind === 'table' ? .12 : .15,
    depth = kind === 'table' ? .85 : .95;
  const color = finish === 'blue' ? '#6b8e9c' : '#b98c5c';
  const top = p.box({
    width,
    height: thickness,
    depth,
    position: [0, y, 0],
    color
  });
  root.add(top);
  const legHeight = y - thickness / 2;
  for (const x of [-width / 2 + .1, width / 2 - .1]) for (const z of [-depth / 2 + .1, depth / 2 - .1]) root.add(p.box({
    width: .08,
    height: legHeight,
    depth: .08,
    position: [x, legHeight / 2, z],
    color: '#415c65'
  }));
  const sockets: Record<string, T.Group> = {};
  if (kind === 'table') {
    const socket = new T.Group();
    socket.position.y = .9;
    root.add(socket);
    sockets.top = socket;
  } else root.add(p.box({
    width,
    height: .8,
    depth: .12,
    position: [0, y + thickness / 2 + .4, -depth / 2 + .035],
    color
  }));
  const approach = new T.Group();
  approach.position.set(0, 0, depth / 2 + .5);
  root.add(approach);
  return {
    root,
    point: top,
    ...(kind === 'table' ? {} : {
      seat: top,
      approach
    }),
    sockets
  };
};
const display = (screen: boolean): Builder => (p, finish, text, mounted) => {
  const root = new T.Group(),
    color = finish === 'navy' ? '#284963' : '#206d80';
  const width = mounted ? 1 : 1.6,
    height = width * 1.1 / 1.6,
    y = mounted ? .55 : 2.45;
  const panel = p.plane({
    width,
    height,
    position: [0, y, .025],
    color,
    ...(text === undefined ? {} : {
      material: createDisplayMaterial(text, color)
    })
  });
  root.add(panel, p.box({
    width: width + .12,
    height: height + .12,
    depth: .08,
    position: [0, y, -.035],
    color: screen ? '#293841' : '#b98c5c'
  }));
  root.add(p.box({
    width: .1,
    height: y - height / 2,
    depth: .1,
    position: [0, (y - height / 2) / 2, -.04],
    color: '#415c65'
  }));
  const panelBounds = {
    min: [-width / 2, y - height / 2, -0.05],
    max: [width / 2, y + height / 2, 0.05]
  };
  root.userData.regions = {
    display: panelBounds,
    screen: panelBounds,
    label: panelBounds,
    detail: panelBounds,
    panel: panelBounds
  };
  return {
    root,
    point: panel,
    sockets: {}
  };
};
const planter: Builder = (p, finish) => {
  const root = new T.Group(),
    pot = p.cylinder({
      radiusTop: .23,
      radiusBottom: .17,
      height: .42,
      position: [0, .21, 0],
      color: finish === 'stone' ? '#b6bdb9' : '#c97b58'
    }),
    leaves = p.sphere({
      radius: .28,
      position: [0, .58, 0],
      color: '#6a9c66'
    });
  root.add(pot, leaves);
  return {
    root,
    point: leaves,
    sockets: {}
  };
};
const BUILDERS: Readonly<Record<PrefabName, Builder>> = Object.freeze({
  chair: furniture('chair'),
  bench: furniture('bench'),
  table: furniture('table'),
  sign: display(false),
  screen: display(true),
  planter
});
/** Private numeric placement contracts; JSON can name slots, never alter transforms. */
const SLOTS = freezeData({
  office: {
    furniture: [3.5, 0, .2],
    display: [3.8, 0, -2.4],
    corner: [-4.8, 0, -2.2]
  },
  clinic: {
    corner: [-3.5, 0, -2]
  },
  street: {
    rest: [1.15, 0, -.5],
    kiosk: [3.8, 0, -.8],
    notice: [-3, 0, .8],
    corner: [4.8, 0, -1.8]
  }
} as const);
export function placeProps(p: Factory, binding: StorySettingBinding, layout: EnvironmentLayout): StorySettingBinding {
  if (layout.preset === 'custom' || !Object.keys(layout.props ?? {}).length) return binding;
  const built = new Map<string, Built>(),
    props = {
      ...binding.props
    },
    entries = {
      ...binding.targets.entries
    },
    paths = {
      ...binding.paths?.entries
    };
  const placements = Object.entries(layout.props ?? {});
  // Validated one-level graph: construct freestanding parents before attachments,
  // regardless of the author's JSON declaration order.
  for (const attached of [false, true]) for (const [id, config] of placements) {
    if (!!config.attachTo !== attached) continue;
    const item = BUILDERS[config.prefab](p, config.finish, config.text, attached);
    item.root.name = 'Prefab:' + id;
    if (config.attachTo) built.get(config.attachTo.prop)!.sockets[config.attachTo.socket].add(item.root);else {
      const slots: Readonly<Record<string, readonly [number, number, number]>> = SLOTS[layout.preset];
      item.root.position.fromArray(slots[config.slot!]);
      binding.root.add(item.root);
    }
    built.set(id, item);
    props[id] = item.root;
    entries[id] = item.seat ? sceneSeat(item.seat) : scenePoint(item.point);
    if (item.approach) {
      entries[id + '.approach'] = sceneMark(item.approach);
      // All seating slots serve the right interaction lane, on a level floor.
      binding.root.updateWorldMatrix(true, true);
      const mark = binding.targets.entries.right;
      if (mark && 'kind' in mark && mark.kind === 'scene-mark') paths['to:' + id] = pathFromMarks([mark.object, item.approach]);
    }
  }
  binding.root.updateWorldMatrix(true, true);
  return {
    ...binding,
    props,
    targets: createTargets(entries),
    ...(Object.keys(paths).length ? {paths: createPaths(paths)} : {})
  };
}

/** Shared owner-local prefab construction for curated and composed layouts. */
export function buildPrefab(p: Factory, name: PrefabName, finish?: string, text?: string, mounted=false) { return BUILDERS[name](p,finish,text,mounted); }
