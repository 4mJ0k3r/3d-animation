import { freezeData } from '../characters/pose';
import { storyFail } from '../story/types';
import { validateDisplayText } from './display-content';
import { planConstruction } from './construction';
import type { Construction } from './construction';
export type EnvironmentPreset = 'office' | 'clinic' | 'street' | 'custom';
export type PrefabName = 'chair' | 'bench' | 'table' | 'sign' | 'screen' | 'planter';
type Role = 'left' | 'right';
export interface EnvironmentLayout {
  readonly preset: EnvironmentPreset;
  readonly composition?: Construction;
  readonly displays?: Readonly<{
    board?: Readonly<{
      text: string;
    }>;
  }>;
  readonly options?: Readonly<{
    palette: 'classic' | 'cool';
  }>;
  readonly props?: Readonly<Record<string, Readonly<{
    prefab: PrefabName;
    slot?: string;
    attachTo?: Readonly<{
      prop: string;
      socket: string;
    }>;
    finish?: string;
    text?: string;
  }>>>;
}
interface Anchors {
  marks: readonly string[];
  seats: readonly string[];
  points: readonly string[];
  props: readonly string[];
  floors: readonly string[];
  paths: readonly string[];
}
interface EnvironmentSpec {
  anchors: Readonly<Anchors>;
  roles: Readonly<Record<string, Role>>;
  palettes: readonly string[];
  slots: Readonly<Record<string, readonly PrefabName[]>>;
}
interface PrefabSpec {
  seat: boolean;
  display: boolean;
  finishes: readonly string[];
  sockets: Readonly<Record<string, readonly PrefabName[]>>;
}
/** Metadata only: no GPU resources, mutable registration or executable JSON. */
export const PREFABS: Readonly<Record<PrefabName, Readonly<PrefabSpec>>> = freezeData({
  chair: {
    seat: true,
    display: false,
    finishes: ['wood', 'blue'],
    sockets: {}
  },
  bench: {
    seat: true,
    display: false,
    finishes: ['wood', 'blue'],
    sockets: {}
  },
  table: {
    seat: false,
    display: false,
    finishes: ['wood', 'blue'],
    sockets: {
      top: ['sign', 'planter']
    }
  },
  sign: {
    seat: false,
    display: true,
    finishes: ['teal', 'navy'],
    sockets: {}
  },
  screen: {
    seat: false,
    display: true,
    finishes: ['teal', 'navy'],
    sockets: {}
  },
  planter: {
    seat: false,
    display: false,
    finishes: ['terracotta', 'stone'],
    sockets: {}
  }
});
export const ENVIRONMENTS: Readonly<Record<EnvironmentPreset, Readonly<EnvironmentSpec>>> = freezeData({
  office: {
    anchors: {
      marks: ['entry', 'finish', 'right'],
      seats: ['chair'],
      points: ['board', 'audience'],
      props: ['board'],
      floors: ['ground'],
      paths: ['toDesk']
    },
    roles: {
      entry: 'left',
      finish: 'left',
      right: 'right',
      chair: 'right',
      toDesk: 'left'
    },
    palettes: ['classic', 'cool'],
    slots: {
      furniture: ['chair', 'bench', 'table'],
      display: ['sign', 'screen'],
      corner: ['planter']
    }
  },
  clinic: {
    anchors: {
      marks: ['doctor'],
      seats: ['examSeat'],
      points: ['diagram', 'diagramHead', 'audience'],
      props: ['chart', 'examTable'],
      floors: ['ground'],
      paths: []
    },
    roles: {
      doctor: 'left',
      examSeat: 'right'
    },
    palettes: ['classic'],
    slots: {
      corner: ['planter']
    }
  },
  custom: {
    anchors: {
      marks: [],
      seats: [],
      points: [],
      props: [],
      floors: [],
      paths: []
    },
    roles: {},
    palettes: ['classic', 'cool'],
    slots: {}
  },
  street: {
    anchors: {
      marks: ['entry', 'finish', 'right'],
      seats: [],
      points: ['audience', 'crossing'],
      props: [],
      floors: ['ground'],
      paths: ['toMeeting']
    },
    roles: {
      entry: 'left',
      finish: 'left',
      right: 'right',
      toMeeting: 'left'
    },
    palettes: ['classic', 'cool'],
    slots: {
      rest: ['chair', 'bench'],
      kiosk: ['table'],
      notice: ['sign', 'screen'],
      corner: ['planter']
    }
  }
});
/** Compatibility catalog: existing office/clinic anchor names are unchanged. */
export const LAYOUTS: Readonly<Record<EnvironmentPreset, Readonly<Anchors>>> = freezeData(Object.fromEntries(Object.entries(ENVIRONMENTS).map(([k, v]) => [k, v.anchors])) as Record<EnvironmentPreset, Anchors>);
const keys = (v: unknown, allowed: readonly string[]) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !allowed.includes(k))) storyFail('INVALID_DOCUMENT', 'Use only: ' + allowed.join(', '));
};
export function validateEnvironment(input: unknown): EnvironmentLayout {
  if (input && typeof input === 'object' && 'preset' in input && input.preset === 'custom') return planConstruction(input).layout;
  keys(input, ['preset', 'displays', 'options', 'props']);
  const layout = input as EnvironmentLayout;
  if (!Object.hasOwn(ENVIRONMENTS, layout.preset)) storyFail('UNSUPPORTED_LAYOUT', 'Choose '+Object.keys(ENVIRONMENTS).join(', '));
  const spec = ENVIRONMENTS[layout.preset];
  if (layout.options !== undefined) {
    keys(layout.options, ['palette']);
    if (!spec.palettes.includes(layout.options.palette)) storyFail('UNSUPPORTED_APPEARANCE', `Choose ${layout.preset} palette: ${spec.palettes.join(', ')}`);
  }
  if (layout.displays !== undefined) {
    keys(layout.displays, layout.preset === 'office' ? ['board'] : []);
    if (layout.displays.board !== undefined) {
      keys(layout.displays.board, ['text']);
      validateDisplayText(layout.displays.board.text);
    }
  }
  const props = layout.props === undefined ? {} : layout.props;
  if (!props || typeof props !== 'object' || Array.isArray(props) || Object.keys(props).length > 4) storyFail('PROP_BUDGET', 'Use at most four named props per layout, including attachments');
  const reserved = new Set(Object.values(spec.anchors).flat());
  const used = new Set<string>();
  for (const [id, p] of Object.entries(props)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) || reserved.has(id) || ['constructor', 'prototype', 'stage'].includes(id)) storyFail('PROP_ID_COLLISION', 'Use a safe unique prop ID distinct from built-in anchors: ' + id);
    keys(p, ['prefab', 'slot', 'attachTo', 'finish', 'text']);
    if (!Object.hasOwn(PREFABS, p.prefab)) storyFail('UNSUPPORTED_PREFAB', 'Unknown prefab ' + p.prefab + '; choose ' + Object.keys(PREFABS).join(', '));
    const prefab = PREFABS[p.prefab];
    if (p.finish !== undefined && !prefab.finishes.includes(p.finish)) storyFail('UNSUPPORTED_APPEARANCE', `${id}: choose finish ${prefab.finishes.join(', ')}`);
    if (p.text !== undefined) {
      if (!prefab.display) storyFail('INCOMPATIBLE_PROP_CONTENT', id + ' does not support text');
      validateDisplayText(p.text);
    }
    if (p.slot === undefined === (p.attachTo === undefined)) storyFail('INVALID_ATTACHMENT', id + ': choose exactly one slot or attachTo');
    if (p.slot !== undefined) {
      if (!Object.hasOwn(spec.slots, p.slot)) storyFail('UNSUPPORTED_SLOT', `${id}: choose ${layout.preset} slot ${Object.keys(spec.slots).join(', ')}`);
      if (!spec.slots[p.slot].includes(p.prefab)) storyFail('INCOMPATIBLE_PROP', `${p.prefab} cannot occupy ${p.slot}; choose ${spec.slots[p.slot].join(', ')}`);
      if (used.has(p.slot)) storyFail('PROP_SLOT_OCCUPIED', 'One prop per slot: ' + p.slot);
      used.add(p.slot);
    } else {
      keys(p.attachTo, ['prop', 'socket']);
      const parent = Object.hasOwn(props, p.attachTo!.prop) ? props[p.attachTo!.prop] : undefined;
      if (!parent) storyFail('MISSING_PROP', id + ': missing attachment parent ' + p.attachTo!.prop);
      if (parent === p || parent.attachTo !== undefined || !Object.hasOwn(PREFABS, parent.prefab)) storyFail('INVALID_ATTACHMENT', 'Attachments must be one level, on a freestanding parent');
      const sockets = PREFABS[parent.prefab].sockets;
      if (!Object.hasOwn(sockets, p.attachTo!.socket) || !sockets[p.attachTo!.socket].includes(p.prefab)) storyFail('INVALID_ATTACHMENT', `${id}: incompatible socket ${p.attachTo!.prop}.${p.attachTo!.socket}`);
      const key = p.attachTo!.prop + '.' + p.attachTo!.socket;
      if (used.has(key)) storyFail('PROP_SLOT_OCCUPIED', 'One attachment per socket: ' + key);
      used.add(key);
    }
  }
  return freezeData({
    preset: layout.preset,
    ...(layout.options === undefined ? {} : {
      options: {
        palette: layout.options.palette
      }
    }),
    ...(layout.displays === undefined ? {} : {
      displays: layout.displays.board ? {
        board: {
          text: layout.displays.board.text
        }
      } : {}
    }),
    ...(layout.props === undefined ? {} : {
      props: Object.fromEntries(Object.entries(props).sort(([a], [b]) => a.localeCompare(b)).map(([id, p]) => [id, {
        prefab: p.prefab,
        ...(p.slot === undefined ? {
          attachTo: {
            ...p.attachTo!
          }
        } : {
          slot: p.slot
        }),
        ...(p.finish === undefined ? {} : {
          finish: p.finish
        }),
        ...(p.text === undefined ? {} : {
          text: p.text
        })
      }]))
    })
  });
}
export function environmentCatalog(layout: EnvironmentLayout): Readonly<Anchors & {
  roles: Readonly<Record<string, Role>>;
}> {
  if (layout.preset === 'custom') return planConstruction(layout).catalog;
  const base = ENVIRONMENTS[layout.preset],
    a = base.anchors;
  const result = {
    marks: [...a.marks],
    seats: [...a.seats],
    points: [...a.points],
    props: [...a.props],
    floors: [...a.floors],
    paths: [...a.paths],
    roles: {
      ...base.roles
    }
  };
  for (const [id, p] of Object.entries(layout.props ?? {})) {
    result.props.push(id);
    result.points.push(id);
    if (PREFABS[p.prefab].seat) {
      result.seats.push(id);
      result.marks.push(id + '.approach');
      result.paths.push('to:' + id);
      result.roles[id] = result.roles[id + '.approach'] = result.roles['to:' + id] = 'right';
    }
  }
  return freezeData(result);
}
