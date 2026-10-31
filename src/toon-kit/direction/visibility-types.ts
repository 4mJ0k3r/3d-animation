import type { Bounds, Vec3 } from './types';
import type { CaptionLayout } from '../caption-layout';
export type VisibilityProxy = {
  readonly id: string;
  readonly owner: string;
} & ({
  readonly kind: 'sphere';
  readonly center: Vec3;
  readonly radius: number;
} | {
  readonly kind: 'capsule';
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
} | {
  readonly kind: 'box' | 'plane';
  readonly center: Vec3;
  readonly axes: readonly Vec3[];
  readonly half: Vec3;
});
export interface FeatureSamples {
  readonly points: readonly Vec3[];
  readonly normals?: readonly Vec3[];
  readonly ignore: readonly string[];
}
export interface ActorVisibility {
  readonly proxies: readonly VisibilityProxy[];
  readonly features: Readonly<Record<'face' | 'eyes' | 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot', FeatureSamples>>;
  readonly activeHands: readonly ('left' | 'right')[];
}
export interface CameraZone {
  readonly origin: Vec3;
  readonly right: Vec3;
  readonly front: Vec3;
  readonly halfWidth: number;
  readonly back: number;
  readonly forward: number;
  readonly minHeight: number;
  readonly maxHeight: number;
}
export interface StageVisibility {
  readonly proxies: readonly VisibilityProxy[];
  readonly zone: CameraZone;
  readonly viewpoints: readonly {
    readonly id: string;
    readonly yaw: number;
  }[];
}
export interface CompositionOptions {
  readonly captions?: CaptionLayout;
}
export interface RequiredRegion extends FeatureSamples {
  readonly id: string;
  readonly owner: string;
  readonly type: 'face' | 'eyes' | 'hand' | 'prop' | 'body' | 'foot';
  readonly bounds: Bounds;
  readonly fraction: number;
}
export interface CompactVisibilityFrame {
  readonly frame: number;
  readonly required: readonly RequiredRegion[];
  readonly fitting: Bounds;
  readonly heads: readonly {
    owner: string;
    bounds: Bounds;
    center: Vec3;
    radius: number;
  }[];
  readonly proxies: readonly VisibilityProxy[];
  readonly zone: CameraZone;
  readonly front: Vec3;
  readonly axis: {
    readonly from: Vec3;
    readonly to: Vec3;
  };
  readonly viewpoints: StageVisibility['viewpoints'];
}
