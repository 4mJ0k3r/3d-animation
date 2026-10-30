import * as THREE from 'three';

export type OutlineMode = 'full' | 'silhouette-only' | 'none';

/** Policies inherit from groups. Explicit mesh policies take precedence. */
export function getOutlineMode(object: THREE.Object3D): OutlineMode {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const mode: unknown = node.userData.outlineMode;
    if (mode === 'full' || mode === 'silhouette-only' || mode === 'none') return mode;
    // Compatibility for existing face/lapel decals, without name-based guessing.
    if (node.userData.excludeFromOutline === true) return 'silhouette-only';
  }
  return 'full';
}

/** A top-level actor shares a silhouette; outlineGroup can explicitly join parts. */
export function getOutlineGroup(object: THREE.Object3D): THREE.Object3D | string | number {
  let root = object;
  for (let node: THREE.Object3D | null = object; node && !(node instanceof THREE.Scene); node = node.parent) {
    if (node.userData.outlineGroup !== undefined) return node.userData.outlineGroup;
    root = node;
  }
  return root;
}
