import * as THREE from 'three';
import {CartoonEngine} from '../toon-kit/engine';
import {plane, setupCartoonLighting} from '../toon-kit/lib';
import {createCharacterFactory, createRestPose, measureCharacter} from '../toon-kit/characters';
import {COMPACT, TALL} from './character-fixture';

type Result = {name: string; pass: boolean; details: unknown};
async function hashCanvas(engine: CartoonEngine): Promise<string> {
  const gl = engine.renderer.getContext();
  const pixels = new Uint8Array(engine.canvas.width * engine.canvas.height * 4);
  gl.readPixels(0, 0, engine.canvas.width, engine.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const hash = await crypto.subtle.digest('SHA-256', pixels);
  return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('');
}

/** Small, sequential software contexts; the enclosing production job still owns all processes. */
export async function verifyCharacterGpu(parent: CartoonEngine): Promise<void> {
  const results: Result[] = [], hashes: {instance: number; frame: number; hash: string}[] = [];
  const record = (name: string, pass: boolean, details: unknown) => {results.push({name, pass, details});};
  for (let instance = 0; instance < 5; instance++) {
    parent.signal.throwIfAborted();
    const canvas = document.createElement('canvas');
    const engine = new CartoonEngine(canvas, 320, 400, {quality:'software-safe'});
    parent.registerCleanup(() => engine.dispose());
    const gl = engine.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    record(`SwiftShader context ${instance}`, /swiftshader/i.test(renderer), {renderer});
    const events = new Map<THREE.EventDispatcher, number>();
    try {
      setupCartoonLighting(engine.scene);
      const floor = plane({width:8,height:8,rotation:[-Math.PI/2,0,0],color:'#ddc8ad',outlineMode:'none'});
      engine.scene.add(floor);
      const factory = createCharacterFactory(engine);
      const a = factory.create({id:'compact',proportions:COMPACT,colors:{torso:'#e5ae40'}});
      const b = factory.create({id:'tall',proportions:TALL});
      engine.scene.add(a.root,b.root);
      for (const actor of [a,b]) actor.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material as THREE.MeshToonMaterial;
        for (const resource of [object.geometry, material, material.gradientMap]) {
          if (!resource || events.has(resource)) continue;
          events.set(resource, 0);
          resource.addEventListener('dispose', () => events.set(resource, events.get(resource)! + 1));
        }
      });
      await parent.wait(engine.prepare());
      const order = instance < 2 ? [0,80,20,80,0] : [0];
      for (const frame of order) {
        a.applyPose(createRestPose(a.definition, {position:[-.68 + Math.sin(frame*.03)*.15,0,0],yaw:frame*.006}));
        b.applyPose(createRestPose(b.definition, {position:[.68,0,0]}));
        engine.scene.updateMatrixWorld(true);
        engine.camera.position.set(0,2.1,7);
        engine.frameSubjects([a.root,b.root], {padding:1.18});
        engine.camera.updateMatrixWorld(true);
        engine.renderFrame(frame,30);
        if (instance < 2) hashes.push({instance,frame,hash:await parent.wait(hashCanvas(engine))});
      }
      const memories = {...engine.renderer.info.memory};
      a.dispose();
      b.applyPose(b.definition.restPose);
      record(`shared resources survive character removal ${instance}`, [...events.values()].every((n) => n === 0), {tracked:events.size});
      record(`neutral mesh budget ${instance}`, measureCharacter(b).triangles <= 8000, measureCharacter(b));
      factory.dispose();
      engine.dispose(); engine.dispose();
      record(`geometry/material/gradient disposal once ${instance}`, [...events.values()].every((n) => n === 1), {tracked:events.size,memories});
      // WEBGL_lose_context reports loss asynchronously in Chromium.
      await parent.wait(new Promise<void>((resolve) => setTimeout(resolve, 25)));
      record(`WebGL context released ${instance}`, gl.isContextLost(), {lost:gl.isContextLost()});
    } finally {engine.dispose();canvas.remove();}
  }
  const groups = [0,20,80].map((frame) => hashes.filter((v) => v.frame === frame));
  record('nonsequential and fresh-instance raw RGBA hashes match with automatic framing',
    groups.every((group) => group.every((v) => v.hash === group[0].hash)), hashes);
  record('different explicit poses produce different rendered frames',new Set(groups.map((g) => g[0].hash)).size === 3,hashes);
  console.log('AUDIT_CHARACTER_RESULTS:' + JSON.stringify(results));
  if (results.some((r) => !r.pass)) throw new Error('Character GPU assertions failed: ' + results.filter((r) => !r.pass).map((r) => r.name).join(', '));
}
