import * as THREE from 'three';

/** Engine owns attached resources. Do not share them across live engines. */
export class ResourceOwner {
  private resources = new Set<{dispose(): void}>();

  track(root: THREE.Object3D): void {
    const texture = (value: unknown): void => {
      if (value instanceof THREE.Texture) this.resources.add(value);
    };
    root.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry) this.resources.add(renderable.geometry);
      const materials = [...(Array.isArray(renderable.material) ? renderable.material : [renderable.material]), renderable.customDepthMaterial, renderable.customDistanceMaterial];
      for (const material of materials) {
        if (!material) continue;
        this.resources.add(material);
        Object.values(material).forEach(texture);
        if (material instanceof THREE.ShaderMaterial) {
          Object.values(material.uniforms).forEach((uniform) => {
            if (Array.isArray(uniform.value)) uniform.value.forEach(texture);
            else texture(uniform.value);
          });
        }
      }
      if (object instanceof THREE.SkinnedMesh) this.resources.add(object.skeleton);
      if (object instanceof THREE.Light && 'shadow' in object) {
        this.resources.add((object as THREE.DirectionalLight).shadow);
      }
    });
    if (root instanceof THREE.Scene) {
      texture(root.background);
      texture(root.environment);
    }
  }

  dispose(): void {
    const errors: unknown[] = [];
    for (const resource of this.resources) {
      try { resource.dispose(); } catch (error) { errors.push(error); }
    }
    this.resources.clear();
    if (errors.length) throw new AggregateError(errors, 'Scene resource cleanup failed');
  }
}
