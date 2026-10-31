import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { qualityProfile, QualityProfile } from './quality';
import type { CartoonEngine } from './engine';
import { OutlineMode } from './internal/policy';
export type { OutlineMode } from './internal/policy';

export interface BasePrimitiveOptions {
  color?: THREE.ColorRepresentation;
  material?: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  position?: [number, number, number] | THREE.Vector3;
  rotation?: [number, number, number] | THREE.Euler;
  scale?: [number, number, number] | THREE.Vector3;
  name?: string;
  quality?: QualityProfile;
  gradientSteps?: number;
  outlineMode?: OutlineMode;
  outlineGroup?: string | number;
}

export interface BoxOptions extends BasePrimitiveOptions {
  width?: number;
  height?: number;
  depth?: number;
}

export interface CylinderOptions extends BasePrimitiveOptions {
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  radialSegments?: number;
}

export interface SphereOptions extends BasePrimitiveOptions {
  radius?: number;
  widthSegments?: number;
  heightSegments?: number;
}

export interface CapsuleOptions extends BasePrimitiveOptions {
  radius?: number;
  length?: number;
  capSubdivisions?: number;
  radialSegments?: number;
}

export interface PlaneOptions extends BasePrimitiveOptions {
  width?: number;
  height?: number;
}

export interface LightingOptions {
  ambientColor?: THREE.ColorRepresentation;
  ambientIntensity?: number;
  keyLightColor?: THREE.ColorRepresentation;
  keyLightIntensity?: number;
  keyLightPosition?: [number, number, number];
  fillLightColor?: THREE.ColorRepresentation;
  fillLightIntensity?: number;
  fillLightPosition?: [number, number, number];
  quality?: QualityProfile;
  shadowMapSize?: number;
  hemisphereIntensity?: number;
  groundColor?: THREE.ColorRepresentation;
}

/** Fresh, scene-owned linear ramp. The requested step count is exact. */
export function createToonGradientMap(steps: number = 3): THREE.DataTexture {
  if (!Number.isInteger(steps) || steps < 2 || steps > 256) {
    throw new Error('Toon gradient steps must be an integer between 2 and 256');
  }
  const data = Uint8Array.from({length: steps}, (_, i) => Math.round(210 + 45 * i / (steps - 1)));
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Helper to generate a MeshToonMaterial with cartoon cel-shaded ramp
 */
export function createToonMaterial(
  color: THREE.ColorRepresentation = 0xffffff,
  gradientSteps: number = 3,
  extraProps: Partial<THREE.MeshToonMaterialParameters> = {}
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: createToonGradientMap(gradientSteps),
    ...extraProps,
  });
}

/**
 * Applies transform, shadows, and names to any 3D mesh
 */
function applyPrimitiveTransforms(mesh: THREE.Mesh, options: BasePrimitiveOptions): THREE.Mesh {
  if (options.outlineMode !== undefined) mesh.userData.outlineMode = options.outlineMode;
  if (options.outlineGroup !== undefined) mesh.userData.outlineGroup = options.outlineGroup;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;

  if (options.name) mesh.name = options.name;

  if (options.position) {
    if (Array.isArray(options.position)) {
      mesh.position.set(...options.position);
    } else {
      mesh.position.copy(options.position);
    }
  }

  if (options.rotation) {
    if (Array.isArray(options.rotation)) {
      mesh.rotation.set(...options.rotation);
    } else {
      mesh.rotation.copy(options.rotation);
    }
  }

  if (options.scale) {
    if (Array.isArray(options.scale)) {
      mesh.scale.set(...options.scale);
    } else {
      mesh.scale.copy(options.scale);
    }
  }

  return mesh;
}

/**
 * Box Primitive
 */
export function createBox(options: BoxOptions = {}): THREE.Mesh {
  const geom = new THREE.BoxGeometry(
    options.width ?? 1,
    options.height ?? 1,
    options.depth ?? 1
  );
  const mat =
    options.material ??
    createToonMaterial(options.color ?? 0x5a94e8, options.gradientSteps ?? 3);
  const mesh = new THREE.Mesh(geom, mat);
  return applyPrimitiveTransforms(mesh, options);
}

/**
 * Cylinder Primitive
 */
export function createCylinder(options: CylinderOptions = {}): THREE.Mesh {
  const geom = new THREE.CylinderGeometry(
    options.radiusTop ?? 0.5,
    options.radiusBottom ?? 0.5,
    options.height ?? 1.5,
    options.radialSegments ?? qualityProfile(options.quality).radialSegments
  );
  const mat =
    options.material ??
    createToonMaterial(options.color ?? 0x76b852, options.gradientSteps ?? 3);
  const mesh = new THREE.Mesh(geom, mat);
  return applyPrimitiveTransforms(mesh, options);
}

/**
 * Sphere Primitive
 */
export function createSphere(options: SphereOptions = {}): THREE.Mesh {
  const geom = new THREE.SphereGeometry(
    options.radius ?? 0.8,
    options.widthSegments ?? qualityProfile(options.quality).sphereSegments,
    options.heightSegments ?? Math.round(qualityProfile(options.quality).sphereSegments * 0.75)
  );
  const mat =
    options.material ??
    createToonMaterial(options.color ?? 0xf368e0, options.gradientSteps ?? 3);
  const mesh = new THREE.Mesh(geom, mat);
  return applyPrimitiveTransforms(mesh, options);
}

/**
 * Capsule Primitive (Ideal for cartoon characters, pill props, rounded bodies)
 */
export function createCapsule(options: CapsuleOptions = {}): THREE.Mesh {
  const geom = new THREE.CapsuleGeometry(
    options.radius ?? 0.5,
    options.length ?? 1.2,
    options.capSubdivisions ?? 16,
    options.radialSegments ?? qualityProfile(options.quality).radialSegments
  );
  const mat =
    options.material ??
    createToonMaterial(options.color ?? 0xff9f43, options.gradientSteps ?? 3);
  const mesh = new THREE.Mesh(geom, mat);
  return applyPrimitiveTransforms(mesh, options);
}

/**
 * Plane Primitive (Floors, walls, backdrops)
 */
export function createPlane(options: PlaneOptions = {}): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(
    options.width ?? 10,
    options.height ?? 10
  );
  const mat =
    options.material ??
    createToonMaterial(options.color ?? 0xe6e3dc, options.gradientSteps ?? 3);
  const mesh = new THREE.Mesh(geom, mat);
  return applyPrimitiveTransforms(mesh, {
    receiveShadow: true,
    castShadow: false,
    ...options,
  });
}

/**
 * Set up soft cartoon studio lighting with soft shadows & key/fill balance
 */
export function setupCartoonLighting(
  scene: THREE.Scene,
  options: LightingOptions = {}
): {
  ambient: THREE.AmbientLight;
  hemisphere: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
} {
  // 1. Ambient Light (provides high cartoon floor illumination)
  const ambient = new THREE.AmbientLight(
    options.ambientColor ?? 0xfff9f0,
    options.ambientIntensity ?? 1.35
  );
  scene.add(ambient);
  const hemisphere = new THREE.HemisphereLight(0xfff6e5, options.groundColor ?? 0xe8d5bd, options.hemisphereIntensity ?? 1.0);
  scene.add(hemisphere);

  // 2. Key Light (directional light casting soft cartoon shadows)
  const keyLight = new THREE.DirectionalLight(
    options.keyLightColor ?? 0xffffff,
    options.keyLightIntensity ?? 0.65
  );
  const [kx, ky, kz] = options.keyLightPosition ?? [5, 9, 6];
  keyLight.position.set(kx, ky, kz);
  keyLight.castShadow = true;

  const shadowSize = options.shadowMapSize ?? qualityProfile(options.quality).shadowMapSize;
  keyLight.shadow.mapSize.width = shadowSize;
  keyLight.shadow.mapSize.height = shadowSize;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 25;
  keyLight.shadow.camera.left = -6;
  keyLight.shadow.camera.right = 6;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.radius = 5; // Filtered penumbra in shadow texels
  scene.add(keyLight, keyLight.target);

  // 3. Fill Light (soft opposing bounce)
  const fillLight = new THREE.DirectionalLight(
    options.fillLightColor ?? 0xffefdd,
    options.fillLightIntensity ?? 0.25
  );
  const [fx, fy, fz] = options.fillLightPosition ?? [-5, 4, -4];
  fillLight.position.set(fx, fy, fz);
  scene.add(fillLight);

  return { ambient, hemisphere, keyLight, fillLight };
}

export interface RoundedBoxOptions extends BoxOptions { radius?: number; segments?: number }

export function createRoundedBox(options: RoundedBoxOptions = {}): THREE.Mesh {
  const width = options.width ?? 1, height = options.height ?? 1, depth = options.depth ?? 1;
  const radius = options.radius ?? 0.08;
  if (radius <= 0 || radius > Math.min(width, height, depth) / 2) throw new Error('Rounded box radius must fit its dimensions');
  return applyPrimitiveTransforms(new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, options.segments ?? 3, radius),
    options.material ?? createToonMaterial(options.color ?? 0xe8dfd1, options.gradientSteps ?? 3),
  ), options);
}

export const box = createBox;
export const cylinder = createCylinder;
export const sphere = createSphere;
export const capsule = createCapsule;
export const plane = createPlane;
export const roundedBox = createRoundedBox;

/** Optional engine-owned pool. No process-global caches or cross-engine sharing. */
export function createPrimitiveFactory(engine: CartoonEngine) {
  const geometry = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.Material>();
  engine.registerCleanup(() => {geometry.clear(); materials.clear();});
  function pooled<T extends BasePrimitiveOptions>(name: string, build: (options: T) => THREE.Mesh) {
    return (options: T = {} as T): THREE.Mesh => {
      if (engine.signal.aborted) throw new Error('Primitive factory owner disposed');
      const {position: _p, rotation: _r, scale: _s, name: _n, color, material, castShadow: _c, receiveShadow: _v, outlineGroup: _g, outlineMode: _o, gradientSteps, ...shape} = options;
      const key = name + JSON.stringify({...shape, quality: options.quality ?? engine.profile});
      const matKey = new THREE.Color(color ?? 0xffffff).getHexString() + ':' + (gradientSteps ?? 3);
      let geom = geometry.get(key), mat = material ?? materials.get(matKey);
      if (!geom || !mat) {
        const mesh = build({...options, quality: options.quality ?? engine.profile, color: color ?? 0xffffff});
        if (!geom) {geom = mesh.geometry; geometry.set(key, geom);} else mesh.geometry.dispose();
        if (!mat) {mat = mesh.material as THREE.Material; materials.set(matKey, mat);}
        else if (!material) {const fresh = mesh.material as THREE.MeshToonMaterial; fresh.gradientMap?.dispose(); fresh.dispose();}
      }
      const result = applyPrimitiveTransforms(new THREE.Mesh(geom, mat), {castShadow: name !== 'plane', ...options});
      engine.track(result);
      return result;
    };
  }
  return {box: pooled<BoxOptions>('box', createBox), cylinder: pooled<CylinderOptions>('cylinder', createCylinder), sphere: pooled<SphereOptions>('sphere', createSphere),
    capsule: pooled<CapsuleOptions>('capsule', createCapsule), plane: pooled<PlaneOptions>('plane', createPlane), roundedBox: pooled<RoundedBoxOptions>('roundedBox', createRoundedBox)};
}

export interface StudioRoomOptions {
  width?: number; depth?: number; height?: number;
  /** Extra floor toward the open front, keeping portrait camera views covered. */
  floorExtension?: number;
  wallColor?: THREE.ColorRepresentation;
  floorColor?: THREE.ColorRepresentation;
  baseboardColor?: THREE.ColorRepresentation;
  glowColor?: THREE.ColorRepresentation;
  sideWalls?: boolean;
}

/** Open-front room, floor at Y=0, back wall at -depth/2; engine owns resources. */
export function createStudioRoom(options: StudioRoomOptions = {}): THREE.Group {
  const width = options.width ?? 10, depth = options.depth ?? 8, height = options.height ?? 8;
  const extension = options.floorExtension ?? 20;
  if (!Number.isFinite(extension) || extension < 0) throw new Error('Floor extension must be non-negative');
  if (![width, depth, height].every((v) => Number.isFinite(v) && v > 0)) throw new Error('Room dimensions must be positive');
  const room = new THREE.Group();
  room.name = 'StudioRoom';
  room.userData.excludeFromFraming = true;
  const wall = options.wallColor ?? '#e8dfd1';
  const wood = options.baseboardColor ?? '#4a3525';
  room.add(plane({width, height: depth + extension, position: [0, 0, extension / 2], rotation: [-Math.PI / 2, 0, 0], color: options.floorColor ?? '#dfc9aa', outlineMode: 'none'}));
  room.add(box({width, height, depth: 0.12, position: [0, height / 2, -depth / 2 - 0.06], color: wall, castShadow: false}));
  room.add(box({width, height: 0.18, depth: 0.08, position: [0, 0.09, -depth / 2 + 0.04], color: wood}));
  if (options.sideWalls ?? true) for (const sign of [-1, 1]) {
    room.add(box({width: 0.12, height, depth, position: [sign * (width / 2 + 0.06), height / 2, 0], color: wall, castShadow: false}));
    room.add(box({width: 0.08, height: 0.18, depth, position: [sign * (width / 2 - 0.04), 0.09, 0], color: wood}));
  }
  const receiver = plane({width, height: depth + extension, rotation: [-Math.PI / 2, 0, 0], position: [0, 0.002, extension / 2],
    material: new THREE.ShadowMaterial({color: '#59432e', opacity: 0.12}), outlineMode: 'none'});
  room.add(receiver);
  // A real broad spotlight adds warm wall illumination without a screen-space vignette.
  const glow = new THREE.SpotLight(options.glowColor ?? '#fff6e5', 1.1, height * 2, Math.PI / 3, 1, 1);
  glow.position.set(0, height - 0.2, -depth / 2 + 1.0);
  glow.target.position.set(0, height * 0.62, -depth / 2);
  room.add(glow, glow.target);
  return room;
}

