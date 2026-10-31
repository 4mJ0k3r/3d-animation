import { CartoonEngine } from '../toon-kit/engine';
import { createCaptionLayout } from '../toon-kit/caption-layout';
import { createOfficeFixture, OFFICE_WORDS } from './office-fixture';
import { createCinematicClinic, CLINIC_INTEGRATED_SHOTS } from '../clinic-cinematic';
import { UNIVERSAL_CLINIC_CAPTIONS } from '../clinic-universal-story';
import { assessComposition, compactVisibilityFrame } from '../toon-kit/direction';
/** Reuses critical Phase 2 assertions without generating their historical videos. */
export async function verifyPhase3(parent: CartoonEngine) {
  const {
    verifyCharacterGpu
  } = await import('./character-gpu');
  await verifyCharacterGpu(parent);
  const {
    verifyContactGpu
  } = await import('./contact-gpu');
  await verifyContactGpu(parent);
  const {
    verifyCastGpu
  } = await import('./cast-gpu');
  await verifyCastGpu(parent);
  const {
    verifyFaces
  } = await import('./faces-gpu');
  await verifyFaces(parent);
  const {
    verifyUniversalClinic
  } = await import('./clinic-universal-gpu');
  await verifyUniversalClinic(parent);
  const results: {
      name: string;
      pass: boolean;
      details: unknown;
    }[] = [],
    captures: {
      scene: string;
      aspect: number;
      instance: number;
      frame: number;
      png: string;
      camera: string;
      snapshot: string;
    }[] = [];
  const record = (name: string, pass: boolean, details: unknown = {}) => results.push({
    name,
    pass,
    details
  });
  const hash = async (data: string) => {
    const bytes = Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  };
  for (const scene of ['office', 'clinic']) for (const [width, height] of [[360, 640], [640, 360]]) for (let instance = 0; instance < 2; instance++) {
    const engine = new CartoonEngine(document.createElement('canvas'), width, height, {
      quality: 'software-safe'
    });
    parent.registerCleanup(() => engine.dispose());
    try {
      const captions = await parent.wait(createCaptionLayout({
        width,
        height,
        words: scene === 'office' ? OFFICE_WORDS : UNIVERSAL_CLINIC_CAPTIONS,
        fontSize: Math.min(width * 66 / 1080, height * .072),
        strokeWidth: Math.min(width * 5 / 1080, height * .072 * 5 / 66),
        bottom: 48
      }, engine.signal));
      const f = scene === 'office' ? createOfficeFixture(engine, captions) : createCinematicClinic(engine, width / height, CLINIC_INTEGRATED_SHOTS, {
        captions
      });
      await parent.wait(engine.prepare());
      for (const frame of scene === 'office' ? [0, 30, 60] : [0, 43, 75, 114]) {
        const s = f.sample(frame);
        f.director.applyFrame({
          frame,
          snapshot: s
        });
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
        for (const frame of scene === 'office' ? [0, 80, 20, 80, 0, 29, 30, 45, 59, 60, 75, 89] : [0, 80, 20, 80, 0, 42, 43, 74, 75, 113, 114, 137, 149]) {
          const s = f.sample(frame),
            c = f.director.applyFrame({
              frame,
              snapshot: s
            });
          engine.renderFrame(frame, 30);
          const shot = f.director.timeline.select(frame),
            r = assessComposition(shot, compactVisibilityFrame(shot, s), c, {
              captions
            });
          captures.push({
            scene,
            aspect: width / height,
            instance,
            frame,
            png: await hash(engine.canvas.toDataURL('image/png')),
            camera: JSON.stringify(c),
            snapshot: JSON.stringify(s)
          });
          record(`closeout ${scene}/${width}/${instance}/${frame}`, r.valid && allocations === 0 && memory === JSON.stringify(engine.renderer.info.memory) && programs === engine.renderer.info.programs?.length, {
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
      f.dispose();
    } finally {
      engine.dispose();
    }
    record(`closeout context released ${scene}/${width}/${instance}`, engine.renderer.getContext().isContextLost());
  }
  for (const scene of ['office', 'clinic']) for (const aspect of [9 / 16, 16 / 9]) {
    const first = new Map<number, typeof captures[number]>(),
      a = captures.filter(c => c.scene === scene && c.aspect === aspect);
    record(`closeout fresh/order ${scene}/${aspect}`, a.every(c => {
      const old = first.get(c.frame);
      if (!old) {
        first.set(c.frame, c);
        return true;
      }
      return old.png === c.png && old.camera === c.camera && old.snapshot === c.snapshot;
    }), a.map(({
      camera,
      snapshot,
      ...c
    }) => c));
  }
  console.log('AUDIT_PHASE3_RESULTS:' + JSON.stringify(results));
  if (results.some(r => !r.pass)) throw new Error('Phase 3 closeout assertions failed');
}
