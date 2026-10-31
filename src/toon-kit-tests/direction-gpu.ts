import { CartoonEngine } from '../toon-kit/engine';
import { createCinematicClinic } from '../clinic-cinematic';
import { projectedBoundsFit, createDirector } from '../toon-kit/direction';
export async function verifyDirection(parent: CartoonEngine) {
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
  });
  const hash = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  for (const [width, height] of [[360, 640], [640, 360]]) for (let instance = 0; instance < 2; instance++) {
    const engine = new CartoonEngine(document.createElement('canvas'), width, height, {
      quality: 'software-safe'
    });
    parent.registerCleanup(() => engine.dispose());
    try {
      const f = createCinematicClinic(engine);
      await parent.wait(engine.prepare());
      f.evaluate(0);
      engine.renderFrame(0, 30);
      const memory = JSON.stringify(engine.renderer.info.memory),
        programs = engine.renderer.info.programs?.length;
      const sheets: Record<number, string> = {};
      const gl = engine.renderer.getContext();
      let allocations = 0;
      const original = gl.createFramebuffer.bind(gl),
        texture = gl.createTexture.bind(gl),
        buffer = gl.createRenderbuffer.bind(gl);
      gl.createFramebuffer = () => {
        allocations++;
        return original();
      };
      gl.createTexture = () => {
        allocations++;
        return texture();
      };
      gl.createRenderbuffer = () => {
        allocations++;
        return buffer();
      };
      for (const frame of [0, 80, 20, 80, 0, 43, 75, 114, 149]) {
        const {
          camera
        } = f.evaluate(frame);
        engine.renderFrame(frame, 30);
        const gl = engine.renderer.getContext(),
          bytes = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        const png = atob(engine.canvas.toDataURL('image/png').split(',')[1]);
        captures.push({
          aspect: width / height,
          instance,
          frame,
          camera: JSON.stringify(camera),
          png: await hash(Uint8Array.from(png, c => c.charCodeAt(0))),
          rgba: await hash(bytes)
        });
        if (instance === 0 && [0, 43, 80, 114].includes(frame)) sheets[frame] = engine.canvas.toDataURL('image/png');
        record(`stable resources and required framing ${width}/${instance}/${frame}`, allocations === 0 && memory === JSON.stringify(engine.renderer.info.memory) && programs === engine.renderer.info.programs?.length && projectedBoundsFit(f.director.describe(frame).protectedBounds, camera), {
          ...engine.renderer.info.memory,
          programs,
          framebufferAllocations: allocations
        });
      }
      gl.createFramebuffer = original;
      gl.createTexture = texture;
      gl.createRenderbuffer = buffer;
      if (instance === 0) {
        const sheet = document.createElement('canvas');
        sheet.width = width * 2;
        sheet.height = height * 2;
        const ctx = sheet.getContext('2d')!;
        let i = 0;
        for (const frame of [0, 43, 80, 114]) {
          const image = new Image();
          image.src = sheets[frame];
          await parent.wait(image.decode());
          ctx.drawImage(image, i % 2 * width, Math.floor(i / 2) * height);
          i++;
        }
        console.log(`AUDIT_DIRECTION_SHEET_${width < height ? 'PORTRAIT' : 'LANDSCAPE'}:` + sheet.toDataURL('image/png').split(',')[1]);
        if (width < height) {
          for (const frame of [43, 80, 114]) console.log('AUDIT_DIRECTION_IMAGE_' + frame + ':' + sheets[frame].split(',')[1]);
          const close = createDirector(engine, {
            stage: f.stage,
            shots: [{
              id: 'close',
              type: 'closeUp',
              subject: 'patient',
              view: 'subjectFront',
              startFrame: 0,
              endFrame: 150
            }],
            durationInFrames: 150,
            aspect: width / height
          });
          close.prepare({
            sample: f.sample
          });
          close.applyFrame({
            frame: 137,
            snapshot: f.sample(137)
          });
          engine.renderFrame(137, 30);
          console.log('AUDIT_DIRECTION_CLOSE:' + engine.canvas.toDataURL('image/png').split(',')[1]);
          close.dispose();
        }
      }
      f.dispose();
    } finally {
      engine.dispose();
    }
    record(`context release ${width}/${instance}`, engine.renderer.getContext().isContextLost());
  }
  for (const aspect of [360 / 640, 640 / 360]) {
    const first = new Map<number, typeof captures[number]>();
    record(`fresh/order camera PNG RGBA equality ${aspect}`, captures.filter(c => c.aspect === aspect).every(c => {
      const old = first.get(c.frame);
      if (!old) {
        first.set(c.frame, c);
        return true;
      }
      return old.camera === c.camera && old.png === c.png && old.rgba === c.rgba;
    }), captures.filter(c => c.aspect === aspect));
    record(`four cuts distinct ${aspect}`, new Set([0, 43, 80, 114].map(f => first.get(f)!.png)).size === 4);
  }
  console.log('AUDIT_DIRECTION_RESULTS:' + JSON.stringify(results));
  if (results.some(r => !r.pass)) throw new Error('Direction GPU tests failed');
}
