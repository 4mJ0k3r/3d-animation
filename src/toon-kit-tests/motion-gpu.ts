import { CartoonEngine } from '../toon-kit/engine';
import { createCaptionLayout } from '../toon-kit/caption-layout';
import { createMotionFixture, MOTION_WORDS } from './motion-fixture';
import { evaluateCameraMotion, assessComposition, compactVisibilityFrame } from '../toon-kit/direction';
import * as T from 'three';
export async function verifyMotion(parent: CartoonEngine) {
  const results: {
      name: string;
      pass: boolean;
      details: unknown;
    }[] = [],
    captures: {
      aspect: number;
      instance: number;
      frame: number;
      camera: string;
      png: string;
    }[] = [];
  const record = (name: string, pass: boolean, details: unknown = {}) => results.push({
    name,
    pass,
    details
  });
  const hash = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  for (const [width, height] of [[360, 640], [640, 360]]) for (let instance = 0; instance < 2; instance++) {
    const engine = new CartoonEngine(document.createElement('canvas'), width, height, {
      quality: 'software-safe'
    });
    parent.registerCleanup(() => engine.dispose());
    try {
      const captions = await parent.wait(createCaptionLayout({
        width,
        height,
        words: MOTION_WORDS,
        fontSize: Math.min(width * 66 / 1080, height * .072),
        strokeWidth: 2,
        bottom: 48
      }, engine.signal));
      const start = performance.now(),
        f = createMotionFixture(engine, captions),
        prep = performance.now() - start;
      await parent.wait(engine.prepare());
      // Three lazily uploads a previously off-screen actor's existing textures.
      // Warm each distinct shot before measuring steady-state GPU allocations.
      for (const frame of [0, 30, 60]) {
        f.evaluate(frame);
        engine.renderFrame(frame, 30);
      }
      const memory = JSON.stringify(engine.renderer.info.memory),
        programs = engine.renderer.info.programs?.length,
        gl = engine.renderer.getContext(),
        old = [gl.createTexture, gl.createFramebuffer, gl.createRenderbuffer] as const;
      let allocations = 0;
      gl.createTexture = function () {
        allocations++;
        return old[0].call(gl);
      };
      gl.createFramebuffer = function () {
        allocations++;
        return old[1].call(gl);
      };
      gl.createRenderbuffer = function () {
        allocations++;
        return old[2].call(gl);
      };
      try {
        for (const frame of [0, 80, 20, 80, 0, 29, 30, 45, 59, 60, 75, 89]) {
          engine.camera.zoom = 7;
          engine.camera.position.set(99, -99, 99);
          const snapshot = f.sample(frame),
            camera = f.director.applyFrame({
              frame,
              snapshot
            });
          engine.renderFrame(frame, 30);
          const data = atob(engine.renderer.domElement.toDataURL('image/png').split(',')[1]);
          captures.push({
            aspect: width / height,
            instance,
            frame,
            camera: JSON.stringify(camera),
            png: await hash(Uint8Array.from(data, c => c.charCodeAt(0)))
          });
          const shot = f.director.timeline.select(frame),
            r = assessComposition(shot, compactVisibilityFrame(shot, snapshot), camera, {
              captions
            });
          record(`motion visibility/resources ${width}/${instance}/${frame}`, r.valid && allocations === 0 && memory === JSON.stringify(engine.renderer.info.memory) && programs === engine.renderer.info.programs?.length, {
            failures: r.failures,
            allocations,
            memory: {
              ...engine.renderer.info.memory
            }
          });
        }
      } finally {
        [gl.createTexture, gl.createFramebuffer, gl.createRenderbuffer] = old;
      }
      const continuity = [0, 30, 60].map(frame => {
        const p = f.director.describe(frame).motion!;
        let last = p.start,
          maxPositionStep = 0,
          maxAngleStep = 0;
        for (let t = frame + 1; t < p.endFrame; t++) {
          const c = evaluateCameraMotion(p, t);
          maxPositionStep = Math.max(maxPositionStep, new T.Vector3(...c.position).distanceTo(new T.Vector3(...last.position)));
          maxAngleStep = Math.max(maxAngleStep, new T.Quaternion(...c.quaternion).angleTo(new T.Quaternion(...last.quaternion)));
          last = c;
        }
        const start = performance.now();
        for (let i = 0; i < 1000; i++) evaluateCameraMotion(p, frame + 14.5);
        return {
          type: p.type,
          maxPositionStep,
          maxAngleStep,
          evaluationUs: performance.now() - start,
          checks: p.checks
        };
      });
      record(`endpoints/continuity ${width}/${instance}`, continuity.every(c => c.maxAngleStep < .12 && c.maxPositionStep < .4), {
        continuity,
        prepMs: prep,
        stats: f.director.preparationStats()
      });
      f.dispose();
    } finally {
      engine.dispose();
    }
    record(`motion context disposed ${width}/${instance}`, engine.renderer.getContext().isContextLost());
  }
  for (const aspect of [9 / 16, 16 / 9]) {
    const first = new Map<number, typeof captures[number]>(),
      subset = captures.filter(c => c.aspect === aspect);
    record('fresh/order PNG/camera ' + aspect, subset.every(c => {
      const old = first.get(c.frame);
      if (!old) {
        first.set(c.frame, c);
        return true;
      }
      return old.png === c.png && old.camera === c.camera;
    }), subset.map(({
      camera,
      ...c
    }) => c));
  }
  console.log('AUDIT_MOTION_RESULTS:' + JSON.stringify(results));
  if (results.some(r => !r.pass)) throw new Error('Camera motion assertions failed');
}
