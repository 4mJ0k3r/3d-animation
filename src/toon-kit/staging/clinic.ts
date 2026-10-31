import * as T from 'three';
import type { CartoonEngine } from '../engine';
import { ClinicEnvironment } from '../../ClinicEnvironment';
import { MEDICAL_CHART_POINTS, MEDICAL_CHART_ART as art } from '../../clinicTextures';
import type { CastActor, CastSnapshot, TargetLibrary } from '../characters/cast-types';
import { readLevelFrame } from '../characters/target-resolver';
import { freezeData } from '../characters/pose';
import { bindActor } from '../direction/bindings';
import { geometryBounds, transformBounds } from '../direction/bounds';
import { directionFail } from '../direction/types';
import type { Bounds, CompositionSnapshot, Vec3 } from '../direction/types';
export function createClinicStage(engine: CartoonEngine, options: {
  environment?: ClinicEnvironment;
  targets?: TargetLibrary;
} = {}) {
  const environment = options.environment ?? new ClinicEnvironment();
  if (!options.environment) {
    environment.stageUniversalPortrait();
    engine.scene.add(environment.group);
    engine.track(environment.group);
  }
  const targets = options.targets ?? environment.semanticTargets(),
    chart = environment.medicalChart,
    local = geometryBounds(chart.geometry);
  for (const [name, object] of [['doctor', environment.doctorMark], ['examSeat', environment.examinationCushion], ['diagram', chart]] as const) {
    const entry = targets.entries[name];
    if (!entry || !('object' in entry) || entry.object !== object) directionFail('INCOMPATIBLE_TARGETS', 'Stage contacts and framing must reference this room geometry', {
      subject: name
    });
  }
  const texture = chart.material as T.MeshBasicMaterial,
    image = texture.map?.image as {
      width?: number;
      height?: number;
    } | undefined;
  const w = image?.width ?? 1024,
    h = image?.height ?? 640,
    head = MEDICAL_CHART_POINTS.head,
    node = MEDICAL_CHART_POINTS.node;
  // The artwork's actual circle/glow/stroke extents and spine endpoint. Geometry
  // and pixel dimensions are read here, not duplicated world-space placement.
  const diagramUV = {
    min: [Math.min(node[0] - art.glowRadius / w, head[0] - (art.armLeft + art.lineWidth / 2) / w), Math.min(head[1] - (art.headRadius + art.lineWidth / 2) / h, node[1] - art.glowRadius / h)],
    max: [Math.max(head[0] + (Math.max(art.headRadius, art.armRight) + art.lineWidth / 2) / w, node[0] + art.glowRadius / w), Math.max(art.spineBottom + art.lineWidth / 2 / h, node[1] + art.glowRadius / h)]
  };
  const uv = (u: number, v: number): Vec3 => [local.min[0] + (local.max[0] - local.min[0]) * u, local.max[1] - (local.max[1] - local.min[1]) * v, local.max[2]];
  const diagram: Bounds = {
    min: uv(diagramUV.min[0], diagramUV.max[1]),
    max: uv(diagramUV.max[0], diagramUV.min[1])
  };
  const nodeBox: Bounds = {
    min: uv(node[0] - art.glowRadius / w, node[1] + art.glowRadius / h),
    max: uv(node[0] + art.glowRadius / w, node[1] - art.glowRadius / h)
  };
  let bindings: Record<string, ReturnType<typeof bindActor>> | null = null,
    closed = false;
  const issued = new WeakSet<CompositionSnapshot>();
  const live = () => {
    if (closed || engine.signal.aborted) directionFail('STAGE_DISPOSED', 'Stage is disposed');
  };
  const dispose = () => {
    closed = true;
    bindings = null;
  };
  engine.registerCleanup(dispose);
  const parented = () => {
    let p: T.Object3D | null = environment.group;
    while (p && p !== engine.scene) p = p.parent;
    if (p !== engine.scene) directionFail('INVALID_OWNER', 'Room must belong to this engine');
    readLevelFrame(environment.group);
  };
  const stage = {
    environment,
    targets,
    cameraViews: Object.freeze(['front', 'threeQuarter', 'subjectFront'] as const),
    prop(name: 'medicalChart', region: 'full' | 'diagram' | 'node' = 'full') {
      if (name !== 'medicalChart' || !['full', 'diagram', 'node'].includes(region)) directionFail('UNKNOWN_REGION', 'Unknown clinic prop region');
      return Object.freeze({ subject: name, region });
    },
    mark: (name: 'doctor') => {
      if (name !== 'doctor') directionFail('UNKNOWN_MARK', String(name));
      return targets.mark(name);
    },
    seat: (name: 'examSeat') => {
      if (name !== 'examSeat') directionFail('UNKNOWN_SEAT', String(name));
      return targets.seat(name);
    },
    target: (name: 'diagram' | 'diagramHead') => {
      if (!['diagram', 'diagramHead'].includes(name)) directionFail('UNKNOWN_TARGET', String(name));
      return targets.target(name);
    },
    floor: () => environment.floorTarget(),
    bind(cast: {
      actors: Readonly<Record<string, CastActor>>;
    }) {
      live();
      parented();
      if (bindings) directionFail('ALREADY_BOUND', 'Bind the stage cast once');
      bindings = Object.fromEntries(Object.entries(cast.actors).map(([id, a]) => [id, bindActor(id, a, engine.scene)]));
    },
    snapshot(state: CastSnapshot): CompositionSnapshot {
      live();
      parented();
      if (!bindings) directionFail('CAST_NOT_BOUND', 'Call stage.bind(cast) first');
      if (!Number.isInteger(state.frame) || state.frame < 0 || !Number.isFinite(state.fps) || state.fps <= 0) directionFail('INVALID_FRAME', 'Invalid composition frame');
      const front = new T.Vector3(0, 0, 1).transformDirection(environment.group.matrixWorld).toArray() as unknown as Vec3;
      chart.updateWorldMatrix(true, false);
      const actors = Object.fromEntries(Object.entries(bindings).map(([id, capture]) => [id, capture(state)]));
      const mark = environment.doctorMark.getWorldPosition(new T.Vector3()).toArray() as unknown as Vec3,
        seat = environment.examinationCushion.getWorldPosition(new T.Vector3()).toArray() as unknown as Vec3;
      let visible = true;
      for (let p: T.Object3D | null = chart; p; p = p.parent) visible = visible && p.visible;
      const a = actors.doctor?.origin ?? mark,
        b = actors.patient?.origin ?? seat;
      const result: CompositionSnapshot = freezeData({
        frame: state.frame,
        fps: state.fps,
        actors,
        front,
        axis: {
          from: [a[0], mark[1], a[2]],
          to: [b[0], mark[1], b[2]]
        },
        props: {
          medicalChart: {
            visible,
            facing: new T.Vector3(0, 0, 1).transformDirection(chart.matrixWorld).toArray(),
            regions: {
              full: transformBounds(local, chart.matrixWorld),
              diagram: transformBounds(diagram, chart.matrixWorld),
              node: transformBounds(nodeBox, chart.matrixWorld)
            }
          }
        }
      });
      issued.add(result);
      return result;
    },
    accepts(snapshot: CompositionSnapshot) {
      live();
      if (!issued.has(snapshot)) directionFail('INVALID_SNAPSHOT', 'Snapshot belongs to a different stage');
    },
    dispose
  };
  return Object.freeze(stage);
}
export type ClinicStage = ReturnType<typeof createClinicStage>;
