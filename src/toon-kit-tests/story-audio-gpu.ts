import { CartoonEngine } from '../toon-kit/engine';
import { compileStory, createStory, prepareStoryAudio } from '../toon-kit/story';
import type { CompiledStory } from '../toon-kit/story';
import { createCaptionLayout, captionAt } from '../toon-kit/caption-layout';
import { createStorySettings } from './story-fixture';
export async function verifyStoryAudio(parent: CartoonEngine, source: CompiledStory) {
  const results: {
      name: string;
      pass: boolean;
      details?: unknown;
    }[] = [],
    captures: {
      frame: number;
      png: string;
      state: string;
    }[][] = [];
  const record = (name: string, pass: boolean, details?: unknown) => results.push({
    name,
    pass,
    details
  });
  for (let instance = 0; instance < 2; instance++) {
    const engine = new CartoonEngine(document.createElement('canvas'), 360, 640, {
      quality: 'software-safe'
    });
    parent.registerCleanup(() => engine.dispose());
    try {
      // Put a cut inside a caption word; global caption age must remain unchanged.
      const data = structuredClone(source.plan),
        scene = data.scenes[0];
      const split = {
        ...scene,
        id: 'after-cut',
        startFrame: 83,
        beats: scene.beats,
        cues: scene.cues!.filter(c => c.startFrame >= 83),
        shots: [{
          ...scene.shots[0],
          id: 'continue',
          startFrame: 83,
          endFrame: 144
        }, ...scene.shots.slice(1)]
      };
      const timeline = compileStory({
          ...data,
          scenes: [{
            ...scene,
            endFrame: 83,
            beats: [],
            cues: scene.cues!.filter(c => c.startFrame < 83),
            shots: [{
              ...scene.shots[0],
              endFrame: 83
            }]
          }, split]
        }),
        captions = await createCaptionLayout({
          width: 360,
          height: 640,
          words: timeline.captionWords,
          fontSize: 22,
          fontFamily: '"Nirmala UI", Arial, sans-serif',
          bottom: 48,
          strokeWidth: 1
        }, engine.signal);
      const audio = await prepareStoryAudio(engine, timeline),
        settings = createStorySettings(engine);
      settings.meeting.root.visible = false;
      const player = createStory(engine, {
        timeline,
        settings: {
          office: settings.office
        },
        captions,
        audio
      });
      player.prepare();
      await engine.prepare();
      for (const f of [0, 144, 192, 230]) {
        player.applyFrame(f);
        engine.renderFrame(f, 30);
      }
      const before = {
          ...engine.renderer.info.memory
        },
        gl = engine.renderer.getContext();
      let allocations = 0;
      const originals = Object.fromEntries(['createTexture', 'createFramebuffer', 'createRenderbuffer'].map(k => [k, (gl as unknown as Record<string, Function>)[k]]));
      for (const [k, fn] of Object.entries(originals)) (gl as unknown as Record<string, Function>)[k] = (...args: unknown[]) => {
        allocations++;
        return fn.apply(gl, args);
      };
      const list = [];
      try {
        for (const f of [0, 80, 20, 80, 0, 82, 83, 84, 137, 138, 143, 144, 185, 186, 192, 275, 276, 287]) {
          const state = JSON.stringify({
            result: player.applyFrame(f),
            word: captionAt(captions, f),
            audio: timeline.sample(f).audio
          });
          engine.renderFrame(f, 30);
          const png = engine.renderer.domElement.toDataURL('image/png');
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(png))), n => n.toString(16).padStart(2, '0')).join('');
          list.push({
            frame: f,
            png: hash,
            state
          });
        }
      } finally {
        for (const [k, fn] of Object.entries(originals)) (gl as unknown as Record<string, Function>)[k] = fn;
      }
      captures.push(list);
      record('repeated frames/state ' + instance, list[0].png === list[4].png && list[1].png === list[3].png && list[0].state === list[4].state && list[1].state === list[3].state);
      record('no new warm WebGL allocations ' + instance, allocations === 0, {
        allocations
      });
      record('stable residency ' + instance, JSON.stringify(before) === JSON.stringify(engine.renderer.info.memory), {
        before,
        after: {
          ...engine.renderer.info.memory
        }
      });
      record('caption continues across scene cut ' + instance, captionAt(captions, 82) === captionAt(captions, 83) && timeline.sample(83).scene.id === 'after-cut');
      record('short pause blank ' + instance, !captionAt(captions, 138) && !captionAt(captions, 143));
      record('final caption clears ' + instance, !captionAt(captions, 276) && !captionAt(captions, 287));
      player.dispose();
      player.dispose();
    } finally {
      const gl = engine.renderer.getContext();
      engine.dispose();
      record('context disposed ' + instance, gl.isContextLost());
    }
  }
  for (let i = 0; i < captures[0].length; i++) record('fresh-instance equality ' + captures[0][i].frame, captures[0][i].png === captures[1][i].png && captures[0][i].state === captures[1][i].state, {
    frame: captures[0][i].frame,
    png: captures[0][i].png
  });
  console.log('AUDIT_STORY_AUDIO_RESULTS:' + JSON.stringify(results));
  if (results.some(x => !x.pass)) throw new Error('Story audio browser assertion failed');
}
