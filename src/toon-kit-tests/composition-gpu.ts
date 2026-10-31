import { CartoonEngine } from '../toon-kit/engine';
import { createCinematicClinic } from '../clinic-cinematic';
import { createCaptionLayout, captionAt } from '../toon-kit/caption-layout';
import { UNIVERSAL_CLINIC_CAPTIONS } from '../clinic-universal-story';
import { compactVisibilityFrame, assessComposition } from '../toon-kit/direction/composition';
export async function verifyComposition(parent: CartoonEngine) {
  const results: {
      name: string;
      pass: boolean;
      details: unknown;
    }[] = [],
    captures: {
      aspect: number;
      instance: number;
      frame: number;
      png: string;
      rgba: string;
      camera: string;
    }[] = [];
  const record = (name: string, pass: boolean, details: unknown = {}) => results.push({
      name,
      pass,
      details
    }),
    hash = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
  for (const [width, height] of [[360, 640], [640, 360]]) {
    const captions = await parent.wait(createCaptionLayout({
      width,
      height,
      words: UNIVERSAL_CLINIC_CAPTIONS,
      fontSize: Math.min(width * 66 / 1080, height * .072),
      strokeWidth: Math.min(width * 5 / 1080, height * .072 * 5 / 66),
      bottom: 48
    }, parent.signal));
    for (let instance = 0; instance < 2; instance++) {
      const engine = new CartoonEngine(document.createElement('canvas'), width, height, {
        quality: 'software-safe',
        outlineThickness: 2.8,
        depthThreshold: .015,
        normalThreshold: .46,
        saturation: 1.14,
        warmth: .04
      });
      parent.registerCleanup(() => engine.dispose());
      try {
        const f = createCinematicClinic(engine, width / height, undefined, {
            captions
          }),
          start = performance.now();
        await parent.wait(engine.prepare());
        f.evaluate(0);
        engine.renderFrame(0, 30);
        const memory = JSON.stringify(engine.renderer.info.memory),
          programs = engine.renderer.info.programs?.length,
          gl = engine.renderer.getContext();
        let allocations = 0;
        const tex = gl.createTexture.bind(gl),
          fb = gl.createFramebuffer.bind(gl),
          rb = gl.createRenderbuffer.bind(gl);
        gl.createTexture = () => {
          allocations++;
          return tex();
        };
        gl.createFramebuffer = () => {
          allocations++;
          return fb();
        };
        gl.createRenderbuffer = () => {
          allocations++;
          return rb();
        };
        for (const frame of [0, 80, 20, 80, 0, 43, 75, 114, 149]) {
          const {
            snapshot,
            camera
          } = f.evaluate(frame);
          engine.renderFrame(frame, 30);
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          const b = atob(engine.canvas.toDataURL('image/png').split(',')[1]);
          captures.push({
            aspect: width / height,
            instance,
            frame,
            camera: JSON.stringify(camera),
            png: await hash(Uint8Array.from(b, c => c.charCodeAt(0))),
            rgba: await hash(pixels)
          });
          const shot = f.director.timeline.select(frame),
            r = assessComposition(shot, compactVisibilityFrame(shot, snapshot), camera, {
              captions
            });
          record(`visibility/captions/resources ${width}/${instance}/${frame}`, r.valid && allocations === 0 && memory === JSON.stringify(engine.renderer.info.memory) && programs === engine.renderer.info.programs?.length, {
            failures: r.failures,
            allocations,
            memory: {
              ...engine.renderer.info.memory
            }
          });
        }
        gl.createTexture = tex;
        gl.createFramebuffer = fb;
        gl.createRenderbuffer = rb;
        record(`four locked candidates ${width}/${instance}`, [0, 43, 75, 114].every(frame => f.director.describe(frame).composition!.candidateCount <= 6), {
          ms: performance.now() - start,
          plans: [0, 43, 75, 114].map(frame => ({
            shot: f.director.describe(frame).shot.id,
            candidate: f.director.describe(frame).composition!.id
          }))
        });
        f.dispose();
      } finally {
        engine.dispose();
      }
      record(`context disposed ${width}/${instance}`, engine.renderer.getContext().isContextLost());
    }
  }
  for (const aspect of [360 / 640, 640 / 360]) {
    const first = new Map<number, typeof captures[number]>();
    record(`fresh/order camera PNG RGBA ${aspect}`, captures.filter(c => c.aspect === aspect).every(c => {
      const old = first.get(c.frame);
      if (!old) {
        first.set(c.frame, c);
        return true;
      }
      return old.camera === c.camera && old.png === c.png && old.rgba === c.rgba;
    }), captures.filter(c => c.aspect === aspect));
  }
  for (const size of [32, 64]) {
    const layout = await parent.wait(createCaptionLayout({
      width: 720,
      height: 1280,
      words: [{
        text: 'PNEUMONOULTRAMICROSCOPICSILICOVOLCANOCONIOSIS',
        startFrame: 0,
        endFrame: 150
      }],
      fontSize: size,
      bottom: '6%'
    }, parent.signal));
    const r = captionAt(layout, 0)!.rect;
    record('long word real-font measurement ' + size, r.left >= 0 && r.right <= 1 && r.top >= 0 && r.bottom <= 1, {
      rect: r,
      font: layout.style.fontFamily,
      fontSize: size
    });
  }
  console.log('AUDIT_COMPOSITION_RESULTS:' + JSON.stringify(results));
  if (results.some(r => !r.pass)) throw new Error('Visibility composition assertions failed');
}
