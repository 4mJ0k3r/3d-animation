import * as THREE from 'three';
/** Baseline transforms, not accumulated animation deltas. No globals. */
export function captureFrameState(scene: THREE.Scene, camera: THREE.Camera): () => void {
  const states: {object: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3; visible: boolean}[] = [];
  const save = (object: THREE.Object3D) => states.push({object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), visible: object.visible});
  scene.traverse(save); save(camera);
  const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null;
  const projection = perspective ? {near: perspective.near, far: perspective.far, fov: perspective.fov, zoom: perspective.zoom} : null;
  return () => {for (const state of states) {
    state.object.position.copy(state.position); state.object.quaternion.copy(state.quaternion);
    state.object.scale.copy(state.scale); state.object.visible = state.visible;
  }
    if (perspective && projection) {Object.assign(perspective, projection); perspective.updateProjectionMatrix();}
  };
}
