/** Isolated render regression fixture; never modifies the clinic composition. */
import React from 'react';
import * as THREE from 'three';
import { Composition, registerRoot } from 'remotion';
import { CartoonEngine, ThreeCanvas, createStudioRoom, setupCartoonLighting, sphere, capsule, box, roundedBox, cylinder, plane, createToonGradientMap } from '../toon-kit';

async function verifyEngine(): Promise<void> {
  const engine = new CartoonEngine(document.createElement('canvas'), 64, 64, {quality: 'high'});
  setupCartoonLighting(engine.scene, {shadowMapSize: 128});
  const actor = new THREE.Group();
  const head = sphere({radius: 0.8, color: '#fedcbd'});
  const patch = box({width: 0.7, height: 0.25, depth: 0.1, position: [0, 0.25, 0.78], color: '#fedcbd'});
  actor.add(head, patch); engine.scene.add(actor);
  engine.camera.position.set(0, 0, 3); engine.camera.lookAt(0, 0, 0);
  await engine.prepare();
  const read = (): Uint8Array => {
    const gl = engine.renderer.getContext();
    const data = new Uint8Array(128 * 128 * 4);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return data;
  };
  engine.renderFrame(12, 30); const full = read();
  patch.userData.outlineMode = 'silhouette-only';
  engine.renderFrame(12, 30); const seamless = read();
  if (!full.some((v, i) => v !== seamless[i])) throw new Error('Outline policy does not suppress patch seams');
  actor.rotation.y = 0.3; engine.renderFrame(0, 30);
  actor.rotation.y = 0; engine.renderFrame(12, 30); const repeated = read();
  if (seamless.some((v, i) => v !== repeated[i])) throw new Error('Out-of-order frame regression');
  const noise = engine.gtaoPass.pdNoiseTexture.image.data!.slice();
  let disposed = 0;
  head.geometry.addEventListener('dispose', () => disposed++);
  const material = head.material as THREE.MeshToonMaterial;
  material.addEventListener('dispose', () => disposed++);
  material.gradientMap!.addEventListener('dispose', () => disposed++);
  engine.dispose(); engine.dispose();
  if (disposed !== 3 || engine.renderer.info.memory.geometries !== 0 || engine.renderer.info.memory.textures !== 0) throw new Error('GPU resource disposal regression');
  const next = new CartoonEngine(document.createElement('canvas'), 16, 16, {quality: 'high'});
  const nextNoise = next.gtaoPass.pdNoiseTexture.image.data!;
  if (noise.some((v, i) => v !== nextNoise[i])) throw new Error('GTAO noise differs across engines');
  next.dispose();
  console.log('Phase 1 checks passed: outline policy, out-of-order pixels, deterministic noise, disposal');
}

const Fixture: React.FC = () => <ThreeCanvas engineOptions={{quality: 'high'}}
  fonts={['900 24px Arial']}
  initScene={async (engine) => {
    await verifyEngine();
    for (const count of [2, 3, 5]) {
      const ramp = createToonGradientMap(count);
      if (ramp.image.width !== count || ramp.image.data?.length !== count) throw new Error('Gradient step count regression');
      ramp.dispose();
    }
    engine.scene.add(createStudioRoom({width: 9, height: 8, depth: 6}));
    setupCartoonLighting(engine.scene);
    const actors = new THREE.Group();
    actors.name = 'framing-subjects';
    engine.scene.add(actors);
    for (const [index, x] of [-1.1, 1.1].entries()) {
      const actor = new THREE.Group();
      actor.userData.outlineGroup = `actor-${index}`;
      actor.position.x = x;
      actor.add(sphere({radius: 0.6, position: [0, 2.2, 0], color: '#fedcbd'}));
      const cap = sphere({radius: 0.62, color: '#4a3525', position: [0, 2.26, -0.03], outlineMode: index === 0 ? 'silhouette-only' : 'full'});
      cap.geometry.dispose();
      cap.geometry = new THREE.SphereGeometry(0.62, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.42);
      actor.add(cap);
      actor.add(capsule({radius: 0.3, length: 0.6, position: [0, 1.25, 0], color: index ? '#ffbd59' : '#00a3af'}));
      for (const side of [-1, 1]) {
        actor.add(cylinder({radiusTop: 0.035, radiusBottom: 0.035, height: 0.75, position: [side * 0.18, 0.375, 0], color: '#111111'}));
        actor.add(sphere({radius: 0.04, position: [side * 0.19, 2.24, 0.57], color: '#111111', outlineMode: 'none', castShadow: false}));
      }
      actors.add(actor);
    }
    actors.add(roundedBox({width: 1.1, height: 0.4, depth: 0.6, position: [0, 0.2, 0.6], radius: 0.1, color: '#bd8351'}));
    actors.add(box({width: 0.25, height: 0.25, depth: 0.25, position: [0, 0.55, 0.6], color: '#fff6e5'}));
    // Simulates an async scene-owned texture loader registered independently.
    engine.registerReady(Promise.resolve().then(() => {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff6e5'; ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#111111'; ctx.font = '900 24px Arial'; ctx.fillText('TOON KIT', 50, 40);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      actors.add(plane({width: 1.2, height: 0.3, position: [0, 3.1, 0], material: new THREE.MeshBasicMaterial({map: texture}), outlineMode: 'silhouette-only'}));
    }));
  }}
  framingSubjects={(engine) => engine.scene.getObjectByName('framing-subjects')!}
  onFrame={({engine, frame}) => {
    if (engine.renderer.getPixelRatio() !== 2) throw new Error('Supersampling regression');
    // Every actor bounds corner must lie inside both camera axes.
    const actors = engine.scene.getObjectByName('framing-subjects')!;
    const bounds = new THREE.Box3().setFromObject(actors);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const projected = new THREE.Vector3(x, y, z).project(engine.camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) throw new Error('Camera framing regression');
    }
    actors.rotation.y = Math.sin(frame / 30) * 0.025;
  }}
/>;

registerRoot(() => <>
  <Composition id="Phase1Portrait" component={Fixture} width={1080} height={1920} fps={30} durationInFrames={60} />
  <Composition id="Phase1Landscape" component={Fixture} width={1920} height={1080} fps={30} durationInFrames={60} />
</>);
