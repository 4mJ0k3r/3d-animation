import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { frameSubjects, FramingOptions } from './camera';
import { QualityProfile, qualityProfile, RenderQuality } from './quality';
import { Readiness } from './internal/readiness';
import { ResourceOwner } from './internal/resources';
import { CartoonOutlineShader, CartoonGradeShader, DeterministicGTAOPass, GBufferBokehPass, OutlineBuffers } from './internal/postprocessing';
export { CartoonOutlineShader, CartoonGradeShader } from './internal/postprocessing';

export interface CartoonEngineOptions {
  quality?: QualityProfile;
  supersample?: number;
  cameraFov?: number; cameraNear?: number; cameraFar?: number;
  outlineThickness?: number; depthThreshold?: number; normalThreshold?: number;
  outlineColor?: THREE.ColorRepresentation;
  aoIntensity?: number; aoRadius?: number;
  bokehFocus?: number; bokehAperture?: number; bokehMaxBlur?: number;
  saturation?: number; warmth?: number; contrast?: number;
  /** @deprecated Vignette is intentionally absent. Kept for source compatibility. */
  vignetteDarkness?: number;
  /** @deprecated Vignette is intentionally absent. */
  vignetteOffset?: number;
}

export class CartoonEngine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  private ao: DeterministicGTAOPass | null = null;
  get gtaoPass(): DeterministicGTAOPass { if (!this.ao) throw new Error('GTAO disabled by quality profile'); return this.ao; }
  private bokeh: BokehPass | null = null;
  get bokehPass(): BokehPass { if (!this.bokeh) throw new Error('Bokeh disabled by quality profile'); return this.bokeh; }
  readonly outlinePass: ShaderPass;
  readonly gradePass: ShaderPass;
  readonly outputPass: OutputPass;
  readonly supersample: number;
  readonly normalDepthRenderTarget: THREE.WebGLRenderTarget;
  private readonly buffers: OutlineBuffers;
  private readonly resources = new ResourceOwner();
  readonly quality: Readonly<RenderQuality>;
  readonly profile: QualityProfile;
  private readonly readiness = new Readiness();
  get signal(): AbortSignal { return this.readiness.signal; }
  private readonly cleanups = new Set<() => void>();
  private disposed = false;

  constructor(readonly canvas: HTMLCanvasElement, public width: number, public height: number, options: CartoonEngineOptions = {}) {
    this.profile = options.quality ?? 'software-safe';
    this.quality = qualityProfile(this.profile);
    this.supersample = options.supersample ?? this.quality.supersample;
    if (!Number.isFinite(this.supersample) || this.supersample < 1 || this.supersample > 4) throw new Error('supersample must be between 1 and 4');
    this.validateSize(width, height);
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false});
    this.renderer.setPixelRatio(this.supersample);
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // High-key materials retain their palette; final OutputPass performs sRGB once.
    this.renderer.toneMapping = THREE.NoToneMapping;
    const add = this.scene.add.bind(this.scene);
    this.scene.add = (...objects: THREE.Object3D[]) => {
      if (this.disposed) { objects.forEach((object) => this.track(object)); return this.scene; }
      return add(...objects);
    };
    this.scene.background = new THREE.Color('#e8dfd1');
    this.camera = new THREE.PerspectiveCamera(options.cameraFov ?? 40, width / height, options.cameraNear ?? 0.1, options.cameraFar ?? 100);
    this.camera.position.set(0, 2.5, 9);
    this.camera.lookAt(0, 1.5, 0);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.buffers = new OutlineBuffers(size.x, size.y);
    this.normalDepthRenderTarget = this.buffers.normals;
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {type: THREE.UnsignedByteType});
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setSize(width, height);
    this.renderPass = new RenderPass(this.scene, this.camera);
    if ((options.aoIntensity ?? this.quality.aoIntensity) > 0) {
      this.ao = new DeterministicGTAOPass(this.scene, this.camera, size.x, size.y, {
        depthTexture: this.buffers.normals.depthTexture!, normalTexture: this.buffers.normals.texture,
      });
      this.ao.blendIntensity = options.aoIntensity ?? this.quality.aoIntensity;
      this.ao.updateGtaoMaterial({radius: options.aoRadius ?? 0.3, thickness: 0.5, distanceFallOff: 1, samples: 16});
    }
    if ((options.bokehMaxBlur ?? this.quality.bokehMaxBlur) > 0) {
      this.bokeh = new GBufferBokehPass(this.scene, this.camera, this.buffers.normals.depthTexture!, {
        focus: options.bokehFocus ?? 9, aperture: options.bokehAperture ?? 0.00002, maxblur: options.bokehMaxBlur ?? this.quality.bokehMaxBlur,
      });
    }
    this.outlinePass = new ShaderPass(CartoonOutlineShader);
    Object.assign(this.outlinePass.uniforms.tNormal, {value: this.buffers.normals.texture});
    Object.assign(this.outlinePass.uniforms.tDepth, {value: this.buffers.normals.depthTexture});
    Object.assign(this.outlinePass.uniforms.tPolicy, {value: this.buffers.policy.texture});
    this.outlinePass.uniforms.thickness.value = (options.outlineThickness ?? 2.4) * this.supersample;
    this.outlinePass.uniforms.depthThreshold.value = options.depthThreshold ?? 0.015;
    this.outlinePass.uniforms.normalThreshold.value = options.normalThreshold ?? 0.46;
    this.outlinePass.uniforms.outlineColor.value.set(options.outlineColor ?? 0x080808);
    this.outlinePass.material.defines.OUTLINE_DIRECTIONS = this.quality.outlineDirections;
    this.gradePass = this.outlinePass; // Grade is fused into ink: one fewer fullscreen pass.
    this.gradePass.uniforms.saturation.value = options.saturation ?? 1.06;
    this.gradePass.uniforms.warmth.value = options.warmth ?? 0.015;
    this.gradePass.uniforms.contrast.value = options.contrast ?? 1.01;
    this.outputPass = new OutputPass();
    // Blur the beauty before inking so the line pass stays crisp.
    for (const pass of [this.renderPass, this.ao, this.bokeh, this.outlinePass, this.outputPass]) if (pass) this.composer.addPass(pass);
    this.resize(width, height);
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    console.log('TOON_RENDERER:' + JSON.stringify({
      renderer: String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      vendor: String(info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      quality: this.profile, canvas: [canvas.width, canvas.height],
    }));
  }

  private validateSize(width: number, height: number): void {
    if (Math.max(width, height) * this.supersample > 8192) throw new Error('Render target dimension exceeds SDK budget');
    if (width * height * this.supersample ** 2 > this.quality.maxBufferPixels) throw new Error('Render target exceeds quality pixel budget');
    if (![width, height].every((n) => Number.isInteger(n) && n > 0)) throw new Error('Render dimensions must be positive integers');
  }

  resize(width: number, height: number): void {
    this.validateSize(width, height);
    this.width = width; this.height = height;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.buffers.resize(size.x, size.y);
    this.outlinePass.uniforms.resolution.value.copy(size);
  }

  frameSubjects(subjects: Parameters<typeof frameSubjects>[1], options?: FramingOptions): void {
    frameSubjects(this.camera, subjects, options);
    const bounds = new THREE.Box3();
    if (subjects instanceof THREE.Box3) bounds.copy(subjects);
    else for (const subject of Array.isArray(subjects) ? subjects : [subjects]) bounds.union(new THREE.Box3().setFromObject(subject));
    if (this.bokeh && !bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      (this.bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = center.sub(this.camera.position).dot(this.camera.getWorldDirection(new THREE.Vector3()));
    }
  }

  /** Register custom asset loading, including fonts needed by canvas textures. */
  registerReady<T>(promise: Promise<T>): Promise<T> { return this.readiness.register(promise); }

  /** Cancel-aware wrappers for asynchronous scene callbacks. */
  wait<T>(promise: Promise<T>): Promise<T> { return this.readiness.wait(promise); }

  registerCleanup(cleanup: () => void): void {
    if (this.disposed) cleanup(); else this.cleanups.add(cleanup);
  }

  track(object: THREE.Object3D): void {
    if (this.disposed) { const owner = new ResourceOwner(); owner.track(object); owner.dispose(); }
    else this.resources.track(object);
  }

  async prepare(): Promise<void> {
    return this.readiness.prepare(async () => {
      await document.fonts.ready;
      const images = new Set<HTMLImageElement>();
      this.scene.traverse((object) => {
        const material = (object as THREE.Mesh).material;
        for (const mat of Array.isArray(material) ? material : [material]) {
          if (!mat) continue;
          const textures: unknown[] = Object.values(mat);
          if (mat instanceof THREE.ShaderMaterial) textures.push(...Object.values(mat.uniforms).map((u) => u.value));
          for (const value of textures) if (value instanceof THREE.Texture && value.image instanceof HTMLImageElement) images.add(value.image);
        }
      });
      await Promise.all([...images].map((image) => image.decode()));
      if (this.disposed) return;
      this.resources.track(this.scene);
      await this.renderer.compileAsync(this.scene, this.camera);
    });
  }

  renderFrame(frame: number, fps: number): void {
    if (this.disposed) throw new Error('Cannot render a disposed engine');
    if (!this.readiness.ready) throw new Error('Assets changed: await engine.prepare() before rendering');
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) throw new Error('Invalid frame/fps');
    this.resources.track(this.scene);
    this.buffers.render(this.renderer, this.scene, this.camera);
    this.outlinePass.uniforms.cameraNear.value = this.camera.near;
    this.outlinePass.uniforms.cameraFar.value = this.camera.far;
    this.composer.render(1 / fps);
    // Capture completes only after GPU writes to the canvas have completed.
    this.renderer.getContext().finish();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.readiness.dispose();
    this.resources.track(this.scene);
    const actions = [...this.cleanups, () => this.resources.dispose(), () => this.scene.clear(),
      ...[...new Set(this.composer.passes)].map((pass) => () => pass.dispose()),
      // Three r187 GTAOPass.dispose omits these two materials.
      () => this.ao?.gtaoMaterial.dispose(), () => this.ao?.blendMaterial.dispose(),
      () => this.buffers.dispose(), () => this.composer.dispose(),
      () => this.renderer.renderLists.dispose(), () => this.renderer.dispose(), () => this.renderer.forceContextLoss(),
    ];
    this.cleanups.clear();
    const errors: unknown[] = [];
    for (const action of actions) { try { action(); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError(errors, 'Engine cleanup failed');
  }
}
