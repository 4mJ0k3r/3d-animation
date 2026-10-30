import * as THREE from 'three';

/**
 * Computes world-space bounding box of an Object3D or Group
 */
export function getBoundingBox(
  object: THREE.Object3D,
  targetBox: THREE.Box3 = new THREE.Box3()
): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  targetBox.setFromObject(object);
  return targetBox;
}

/**
 * Computes world-space bounding sphere of an Object3D or Group
 */
export function getBoundingSphere(
  object: THREE.Object3D,
  targetSphere: THREE.Sphere = new THREE.Sphere()
): THREE.Sphere {
  const box = getBoundingBox(object);
  box.getBoundingSphere(targetSphere);
  return targetSphere;
}

/**
 * Checks whether two objects' bounding boxes overlap
 */
export function checkAABBCollision(objA: THREE.Object3D, objB: THREE.Object3D): boolean {
  const boxA = getBoundingBox(objA);
  const boxB = getBoundingBox(objB);
  return boxA.intersectsBox(boxB);
}

/**
 * Checks whether two objects' bounding spheres overlap
 */
export function checkSphereCollision(objA: THREE.Object3D, objB: THREE.Object3D): boolean {
  const sphereA = getBoundingSphere(objA);
  const sphereB = getBoundingSphere(objB);
  return sphereA.intersectsSphere(sphereB);
}

/**
 * Calculates Minimum Translation Vector (MTV) to resolve penetration of Box A against Box B.
 * Returns the direction and distance to push Box A out of Box B along the axis of minimum overlap.
 */
export function calculatePenetrationOffset(
  boxA: THREE.Box3,
  boxB: THREE.Box3
): THREE.Vector3 | null {
  if (!boxA.intersectsBox(boxB)) {
    return null;
  }

  // Calculate overlaps on all 3 axes
  const xOverlap1 = boxA.max.x - boxB.min.x;
  const xOverlap2 = boxB.max.x - boxA.min.x;
  const xOverlap = Math.min(xOverlap1, xOverlap2);
  const xSign = xOverlap1 < xOverlap2 ? -1 : 1;

  const yOverlap1 = boxA.max.y - boxB.min.y;
  const yOverlap2 = boxB.max.y - boxA.min.y;
  const yOverlap = Math.min(yOverlap1, yOverlap2);
  const ySign = yOverlap1 < yOverlap2 ? -1 : 1;

  const zOverlap1 = boxA.max.z - boxB.min.z;
  const zOverlap2 = boxB.max.z - boxA.min.z;
  const zOverlap = Math.min(zOverlap1, zOverlap2);
  const zSign = zOverlap1 < zOverlap2 ? -1 : 1;

  // Resolve along the axis with the minimum penetration
  const minOverlap = Math.min(xOverlap, yOverlap, zOverlap);

  if (minOverlap === xOverlap) {
    return new THREE.Vector3(xOverlap * xSign, 0, 0);
  } else if (minOverlap === yOverlap) {
    return new THREE.Vector3(0, yOverlap * ySign, 0);
  } else {
    return new THREE.Vector3(0, 0, zOverlap * zSign);
  }
}

/**
 * Pushes movingObject out of static obstacles so props/characters do not clip
 */
export function resolvePenetrations(
  movingObject: THREE.Object3D,
  obstacles: THREE.Object3D[],
  resolveY: boolean = false
): THREE.Vector3 {
  const totalOffset = new THREE.Vector3();
  const boxM = new THREE.Box3();
  const boxO = new THREE.Box3();

  for (const obstacle of obstacles) {
    if (obstacle === movingObject) continue;

    getBoundingBox(movingObject, boxM);
    getBoundingBox(obstacle, boxO);

    const offset = calculatePenetrationOffset(boxM, boxO);
    if (offset) {
      if (!resolveY) {
        offset.y = 0; // Keep character on floor unless full 3D physics requested
      }
      movingObject.position.add(offset);
      totalOffset.add(offset);
      movingObject.updateWorldMatrix(true, true);
    }
  }

  return totalOffset;
}

/**
 * Clamps object position so its lowest bounding point stays on or above the floor
 */
export function clampToFloor(
  object: THREE.Object3D,
  floorY: number = 0,
  targetBox: THREE.Box3 = new THREE.Box3()
): number {
  getBoundingBox(object, targetBox);
  const lowestY = targetBox.min.y;
  if (lowestY < floorY) {
    const delta = floorY - lowestY;
    object.position.y += delta;
    object.updateWorldMatrix(true, true);
    return delta;
  }
  return 0;
}

/**
 * Collision Manager for scenes with multiple moving characters and props
 */
export class CollisionSceneManager {
  private staticColliders: THREE.Object3D[] = [];
  private dynamicColliders: THREE.Object3D[] = [];

  public addStatic(obstacle: THREE.Object3D): void {
    if (!this.staticColliders.includes(obstacle)) {
      this.staticColliders.push(obstacle);
    }
  }

  public addDynamic(characterOrProp: THREE.Object3D): void {
    if (!this.dynamicColliders.includes(characterOrProp)) {
      this.dynamicColliders.push(characterOrProp);
    }
  }

  public remove(object: THREE.Object3D): void {
    this.staticColliders = this.staticColliders.filter((item) => item !== object);
    this.dynamicColliders = this.dynamicColliders.filter((item) => item !== object);
  }

  /**
   * Deterministically updates collisions each frame
   */
  public update(floorY: number = 0): void {
    // 1. Resolve dynamic colliders against static obstacles
    for (const dynamicObj of this.dynamicColliders) {
      resolvePenetrations(dynamicObj, this.staticColliders, false);
      clampToFloor(dynamicObj, floorY);
    }

    // 2. Resolve dynamic vs dynamic colliders (e.g., character vs character or prop)
    const boxA = new THREE.Box3();
    const boxB = new THREE.Box3();

    for (let i = 0; i < this.dynamicColliders.length; i++) {
      for (let j = i + 1; j < this.dynamicColliders.length; j++) {
        const objA = this.dynamicColliders[i];
        const objB = this.dynamicColliders[j];

        getBoundingBox(objA, boxA);
        getBoundingBox(objB, boxB);

        const offset = calculatePenetrationOffset(boxA, boxB);
        if (offset) {
          offset.y = 0; // horizontal separation
          // Push both apart evenly
          objA.position.addScaledVector(offset, 0.5);
          objB.position.addScaledVector(offset, -0.5);
          objA.updateWorldMatrix(true, true);
          objB.updateWorldMatrix(true, true);
        }
      }
    }
  }
}
