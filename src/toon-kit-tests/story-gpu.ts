import { CartoonEngine } from '../toon-kit/engine';
import { compileStory } from '../toon-kit/story';
import { createCaptionLayout } from '../toon-kit/caption-layout';
import { createStoryFixture } from './story-fixture';
import { TEN_SECOND_STORY } from './story-plan';
export const STORY_FONT = '"Nirmala UI", Arial, sans-serif';
export async function verifyStory(parent: CartoonEngine) {
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
      state: string;
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
      const begin = performance.now(),
        timeline = compileStory(TEN_SECOND_STORY),
        compileMs = performance.now() - begin,
        captions = await parent.wait(createCaptionLayout({
          width,
          height,
          words: timeline.captionWords,
          fontSize: Math.min(width * 64 / 1080, height * .068),
          fontFamily: STORY_FONT,
          strokeWidth: Math.min(width * 4 / 1080, 2),
          bottom: 48
        }, engine.signal));
      const start = performance.now(),
        player = createStoryFixture(engine, captions, timeline),
        prepareMs = performance.now() - start;
      await parent.wait(engine.prepare());
      for (const frame of [0, 60, 80, 120, 130, 170, 230, 245]) {
        player.applyFrame(frame);
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
        for (const frame of [0, 80, 20, 80, 0, 59, 60, 119, 120, 159, 169, 170, 230, 245, 299]) {
          const state = player.applyFrame(frame);
          engine.renderFrame(frame, 30);
          const raw = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
          const data = atob(engine.canvas.toDataURL('image/png').split(',')[1]);
          captures.push({
            aspect: width / height,
            instance,
            frame,
            png: await hash(Uint8Array.from(data, c => c.charCodeAt(0))),
            rgba: await hash(raw),
            state: JSON.stringify(state)
          });
          record(`story resources ${width}/${instance}/${frame}`, allocations === 0 && memory === JSON.stringify(engine.renderer.info.memory) && programs === engine.renderer.info.programs?.length, {
            allocations,
            memory: {
              ...engine.renderer.info.memory
            },
            scene: state.scene,
            shot: state.camera.shotId
          });
        }
      } finally {
        [gl.createTexture, gl.createFramebuffer, gl.createRenderbuffer] = old;
      }
      record(`story preparation ${width}/${instance}`, player.preparationStats().reduce((n, s) => n + s.signatureBytes, 0) < 16 * 1024 * 1024, {
        compileMs,
        prepareMs,
        stats: player.preparationStats()
      });
      player.dispose();
    } finally {
      engine.dispose();
    }
    record(`story context disposed ${width}/${instance}`, engine.renderer.getContext().isContextLost());
  }
  for (const aspect of [9 / 16, 16 / 9]) {
    const first = new Map<number, typeof captures[number]>(),
      a = captures.filter(c => c.aspect === aspect);
    record('story PNG/RGBA/state fresh-order ' + aspect, a.every(c => {
      const old = first.get(c.frame);
      if (!old) {
        first.set(c.frame, c);
        return true;
      }
      return old.png === c.png && old.rgba === c.rgba && old.state === c.state;
    }), a.map(({
      state,
      ...c
    }) => c));
  }
  console.log('AUDIT_STORY_RESULTS:' + JSON.stringify(results));
  if (results.some(r => !r.pass)) throw new Error('Story browser assertions failed');
}
