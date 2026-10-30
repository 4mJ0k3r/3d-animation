import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderLib } from 'three';
import { getOutlineGroup, getOutlineMode } from './policy';

const vertexShader = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

export const CartoonOutlineShader = {
  name: 'ToonKitOutline',
  defines: {OUTLINE_DIRECTIONS: 4},
  uniforms: {
    tDiffuse: {value: null}, tNormal: {value: null}, tDepth: {value: null}, tPolicy: {value: null},
    saturation: {value: 1.06}, warmth: {value: 0.015}, contrast: {value: 1.01},
    resolution: {value: new THREE.Vector2()}, thickness: {value: 2.4},
    depthThreshold: {value: 0.015}, normalThreshold: {value: 0.46},
    outlineColor: {value: new THREE.Color(0x080808)}, cameraNear: {value: 0.1}, cameraFar: {value: 100},
  },
  vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse,tNormal,tDepth,tPolicy;
    uniform vec2 resolution;
    uniform float thickness,depthThreshold,normalThreshold,cameraNear,cameraFar,saturation,warmth,contrast;
    uniform vec3 outlineColor;
    varying vec2 vUv;
    float depth(vec2 uv){
      float z=texture2D(tDepth,uv).r*2.0-1.0;
      return 2.0*cameraNear*cameraFar/(cameraFar+cameraNear-z*(cameraFar-cameraNear));
    }
    float edgeAt(vec2 a,vec2 b){
      vec4 pa=texture2D(tPolicy,a),pb=texture2D(tPolicy,b);
      bool occupiedA=dot(pa.rgb,vec3(1.0))>0.0;
      bool occupiedB=dot(pb.rgb,vec3(1.0))>0.0;
      // Background has ID 0. Opaque 'none' still occludes, but never inks.
      if(!occupiedA && !occupiedB) return 0.0;
      if(pa.a<0.1 && pb.a<0.1) return 0.0;
      if(occupiedA != occupiedB) return occupiedA ? step(0.1,pa.a) : step(0.1,pb.a);
      bool sameActor=distance(pa.rgb,pb.rgb)<0.001;
      // Hair/decal/lapel boundaries inside their actor never create ink seams.
      if(sameActor && (pa.a<0.75 || pb.a<0.75)) return 0.0;
      float da=depth(a),db=depth(b);
      float d=abs(da-db)/max(min(da,db),0.2);
      vec3 na=normalize(texture2D(tNormal,a).rgb*2.0-1.0);
      vec3 nb=normalize(texture2D(tNormal,b).rgb*2.0-1.0);
      float n=1.0-clamp(dot(na,nb),-1.0,1.0);
      // Cross-actor silhouettes may be coplanar; only full surfaces add creases.
      float boundary=sameActor ? 0.0 : max(step(0.1,pa.a),step(0.1,pb.a));
      float crease=(pa.a>0.75 && pb.a>0.75)?smoothstep(normalThreshold,normalThreshold*1.5,n):0.0;
      return max(boundary,max(smoothstep(depthThreshold,depthThreshold*1.5,d),crease));
    }
    void main(){
      vec2 r=0.5*thickness/resolution;
      float edge=0.0;
      // Symmetric diameter sampling keeps horizontal/vertical/diagonal width consistent.
      for(int i=0;i<OUTLINE_DIRECTIONS;i++){
        float angle=float(i)*3.14159265359/float(OUTLINE_DIRECTIONS);
        vec2 o=vec2(cos(angle),sin(angle))*r;
        edge=max(edge,edgeAt(clamp(vUv-o,vec2(0.0),vec2(1.0)),clamp(vUv+o,vec2(0.0),vec2(1.0))));
      }
      vec4 color=texture2D(tDiffuse,vUv);
      vec3 rgb=mix(color.rgb,outlineColor,edge);
      float l=dot(rgb,vec3(0.2126,0.7152,0.0722));
      rgb=mix(vec3(l),rgb,saturation)*vec3(1.0+warmth,1.0+warmth*0.35,1.0-warmth*0.45);
      gl_FragColor=vec4(max((rgb-0.5)*contrast+0.5,vec3(0.0)),color.a);
    }`,
};

export const CartoonGradeShader = {
  name: 'ToonKitGrade',
  uniforms: {tDiffuse: {value: null}, saturation: {value: 1.06}, warmth: {value: 0.015}, contrast: {value: 1.01}},
  vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float saturation,warmth,contrast;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);
      float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));
      vec3 rgb=mix(vec3(l),c.rgb,saturation);
      rgb*=vec3(1.0+warmth,1.0+warmth*0.35,1.0-warmth*0.45);
      gl_FragColor=vec4(max((rgb-0.5)*contrast+0.5,vec3(0.0)),c.a);
    }`,
};

/** GTAO's stock denoiser constructs random simplex noise. Replace at construction. */
export class DeterministicGTAOPass extends GTAOPass {
  _generateNoise(size = 64): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    let state = 0x746f6f6e;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      data[i] = state >>> 24;
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }
}

/** Use the alpha-aware shared depth, not BokehPass's solid override-material pass. */
export class GBufferBokehPass extends BokehPass {
  private quad: FullScreenQuad;
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, depth: THREE.DepthTexture, options: ConstructorParameters<typeof BokehPass>[2]) {
    super(scene, camera, options);
    this.materialBokeh.defines.DEPTH_PACKING = 0;
    this.materialBokeh.depthTest = false;
    this.materialBokeh.depthWrite = false;
    this.materialBokeh.uniforms.tDepth.value = depth;
    this.quad = new FullScreenQuad(this.materialBokeh);
  }
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.materialBokeh.uniforms.tColor.value = read.texture;
    this.materialBokeh.uniforms.nearClip.value = (this.camera as THREE.PerspectiveCamera).near;
    this.materialBokeh.uniforms.farClip.value = (this.camera as THREE.PerspectiveCamera).far;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    this.quad.render(renderer);
  }
  dispose(): void {this.quad.dispose(); super.dispose();}
}

export class OutlineBuffers {
  readonly normals: THREE.WebGLRenderTarget;
  readonly policy: THREE.WebGLRenderTarget;
  private materials = new Map<string, THREE.ShaderMaterial>();
  private disposed = false;

  constructor(width: number, height: number) {
    this.normals = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType),
    });
    this.policy = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
  }

  private material(source: THREE.Material, id?: number, mode = 1): THREE.ShaderMaterial {
    const original = source as THREE.MeshBasicMaterial;
    const cutout = source.alphaTest > 0;
    const key = `${source.side}:${id ?? 'normal'}:${mode}:${cutout ? source.uuid : 'solid'}`;
    let material = this.materials.get(key);
    if (!material) {
      const rgb = id === undefined ? '' : [id & 255, (id >>> 8) & 255, (id >>> 16) & 255].map((v) => (v / 255).toFixed(8)).join(',');
      // Reuse Three's transform/skinning/UV chunks; explicitly preserve alpha masks.
      let fragment = ShaderLib.normal.fragmentShader.replace('#include <uv_pars_fragment>', `
        #include <uv_pars_fragment>
        #include <map_pars_fragment>
        #include <alphamap_pars_fragment>
        #include <alphatest_pars_fragment>`).replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
        #include <map_fragment>
        #include <alphamap_fragment>
        #include <alphatest_fragment>`);
      if (id !== undefined) fragment = fragment.replace('gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );', `gl_FragColor=vec4(vec3(${rgb}),${mode.toFixed(1)});`).replace('gl_FragColor.a = 1.0;', '');
      material = new THREE.ShaderMaterial({
        vertexShader: ShaderLib.normal.vertexShader, fragmentShader: fragment,
        uniforms: THREE.UniformsUtils.clone(ShaderLib.normal.uniforms),
        side: source.side, blending: THREE.NoBlending,
      });
      this.materials.set(key, material);
    }
    const mapped = material as THREE.ShaderMaterial & {map: THREE.Texture | null; alphaMap: THREE.Texture | null};
    if (mapped.map !== (cutout ? original.map : null) || mapped.alphaMap !== (cutout ? original.alphaMap : null)) material.needsUpdate = true;
    mapped.map = cutout ? original.map : null;
    mapped.alphaMap = cutout ? original.alphaMap : null;
    material.alphaTest = cutout ? source.alphaTest : 0;
    material.uniforms.opacity.value = cutout ? source.opacity : 1;
    material.uniforms.map.value = mapped.map;
    material.uniforms.alphaMap.value = mapped.alphaMap;
    if (mapped.map) {mapped.map.updateMatrix(); material.uniforms.mapTransform.value.copy(mapped.map.matrix);}
    if (mapped.alphaMap) {mapped.alphaMap.updateMatrix(); material.uniforms.alphaMapTransform.value.copy(mapped.alphaMap.matrix);}
    material.uniforms.alphaTest.value = material.alphaTest;
    return material;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    const background = scene.background;
    const override = scene.overrideMaterial;
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.autoUpdate;
    const used = new Set<THREE.ShaderMaterial>();
    const saved: {mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; visible: boolean}[] = [];
    const hidden: THREE.Object3D[] = [];
    const groups = new Map<THREE.Object3D | string | number, number>();
    const idFor = (mesh: THREE.Mesh): number => {
      const group = getOutlineGroup(mesh);
      if (!groups.has(group)) groups.set(group, groups.size + 1);
      return groups.get(group)!;
    };
    try {
      scene.background = null;
      scene.overrideMaterial = null;
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0);
      scene.traverse((object) => {
        if (object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
          if (object.visible) { hidden.push(object); object.visible = false; }
          return;
        }
        if (!(object instanceof THREE.Mesh)) return;
        saved.push({mesh: object, material: object.material, visible: object.visible});
        const originals = Array.isArray(object.material) ? object.material : [object.material];
        // Transparent decals don't provide a solid silhouette. Alpha-tested cutouts do.
        if (originals.every((m) => m.transparent && !m.alphaTest)) object.visible = false;
        const convert = (m: THREE.Material) => { const mat = this.material(m); used.add(mat); return mat; };
        object.material = Array.isArray(object.material) ? originals.map(convert) : convert(originals[0]);
      });
      renderer.setRenderTarget(this.normals);
      renderer.render(scene, camera);
      for (const {mesh, material} of saved) {
        const mode = getOutlineMode(mesh);
        const value = mode === 'full' ? 1 : mode === 'silhouette-only' ? 0.5 : 0;
        const convert = (m: THREE.Material) => { const mat = this.material(m, idFor(mesh), value); used.add(mat); return mat; };
        mesh.material = Array.isArray(material) ? material.map(convert) : convert(material);
      }
      renderer.setRenderTarget(this.policy);
      renderer.render(scene, camera);
    } finally {
      for (const {mesh, material, visible} of saved) { mesh.material = material; mesh.visible = visible; }
      for (const object of hidden) object.visible = true;
      scene.background = background;
      scene.overrideMaterial = override;
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadows;
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.setRenderTarget(previousTarget);
      for (const [key, mat] of this.materials) if (!used.has(mat)) {mat.dispose(); this.materials.delete(key);}
    }
  }

  resize(width: number, height: number): void { this.normals.setSize(width, height); this.policy.setSize(width, height); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.normals.dispose(); this.policy.dispose();
    this.materials.forEach((material) => material.dispose()); this.materials.clear();
  }
}
