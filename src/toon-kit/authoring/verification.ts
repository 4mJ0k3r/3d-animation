import OFFICE_FIXTURE from '../../../examples/office-idea.story.json';
import STREET_FIXTURE from '../../../examples/street-meeting.story.json';
import { CartoonEngine } from '../engine';
import { createStory } from '../story/player';
import { prepareStoryAudio } from '../story/audio-assets';
import { createCaptionLayout, captionAt } from '../caption-layout';
import { createStoryEnvironments } from './starters';
import { prepareStoryFont } from './font';
import { compileStoryDocument } from './document';
import type { CompiledStoryDocument } from './document';
/** Optional bounded check; two sequential contexts inside the one guarded browser. */
export async function verifyAuthoredStory(parent: CartoonEngine, source: CompiledStoryDocument, offset = 0, layoutOrder: readonly string[] = Object.keys(source.document.layouts)) {
  const results: {
      name: string;
      pass: boolean;
      details?: unknown;
    }[] = [],
    all: {
      frame: number;
      png: string;
      state: string;
    }[][] = [];
  const record = (name: string, pass: boolean, details?: unknown) => results.push({
      name,
      pass,
      details
    }),
    last = source.timeline.plan.durationInFrames - 1;
  const frames = [0, Math.min(80, last), Math.min(20, last), Math.min(80, last), 0, ...Array.from(new Set(source.timeline.plan.scenes.flatMap(s => [s.startFrame, s.endFrame - 1, ...s.shots.flatMap(sh => [sh.startFrame, sh.endFrame - 1])]))).filter(f => f !== 0).slice(0, 10), last];
  for (let instance = 0; instance < 2; instance++) {
    const engine = new CartoonEngine(document.createElement('canvas'), 360, 640, {
      quality: 'software-safe'
    });
    parent.registerCleanup(() => engine.dispose());
    try {
      const compiled = source,
        family = await prepareStoryFont(engine),
        audio = await prepareStoryAudio(engine, compiled.timeline),
        captions = await createCaptionLayout({
          width: 360,
          height: 640,
          words: compiled.timeline.captionWords,
          fontSize: 22,
          fontFamily: `"${family}"`,
          strokeWidth: 1,
          bottom: 48
        }, engine.signal),
        player = createStory(engine, {
          globalFrameOffset: offset,
          timeline: compiled.timeline,
          settings: createStoryEnvironments(engine, compiled, layoutOrder),
          captions,
          audio
        });
      player.prepare();
      await engine.prepare();
      for (const f of [...compiled.timeline.plan.scenes.map(s => s.startFrame), ...frames]) {
        player.applyFrame(f);
        engine.renderFrame(f, compiled.timeline.plan.fps);
      }
      const memory = {
          ...engine.renderer.info.memory
        },
        gl = engine.renderer.getContext();
      let allocations = 0;
      const originals = Object.fromEntries(['createTexture', 'createFramebuffer', 'createRenderbuffer'].map(k => [k, (gl as unknown as Record<string, Function>)[k]]));
      for (const [k, fn] of Object.entries(originals)) (gl as unknown as Record<string, Function>)[k] = (...args: unknown[]) => {
        allocations++;
        return fn.apply(gl, args);
      };
      const samples = [];
      try {
        for (const f of frames) {
          const state = JSON.stringify({
            pose: player.applyFrame(f),
            word: captionAt(captions, f),
            audio: compiled.timeline.sample(f).audio
          });
          engine.renderFrame(f, compiled.timeline.plan.fps);
          const png = engine.renderer.domElement.toDataURL('image/png'),
            hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(png))), n => n.toString(16).padStart(2, '0')).join('');
          samples.push({
            frame: f,
            png: hash,
            state
          });
        }
      } finally {
        for (const [k, fn] of Object.entries(originals)) (gl as unknown as Record<string, Function>)[k] = fn;
      }
      all.push(samples);
      record('frame order ' + instance, JSON.stringify(samples[0]) === JSON.stringify(samples[4]) && JSON.stringify(samples[1]) === JSON.stringify(samples[3]));
      record('warm allocations ' + instance, allocations === 0, {
        allocations
      });
      record('stable residency ' + instance, JSON.stringify(memory) === JSON.stringify(engine.renderer.info.memory), {
        before: memory,
        after: {
          ...engine.renderer.info.memory
        }
      });
      player.dispose();
      player.dispose();
    } finally {
      const gl = engine.renderer.getContext();
      engine.dispose();
      record('context disposal ' + instance, gl.isContextLost());
    }
  }
  for (let i = 0; i < all[0].length; i++) record('fresh engine frame ' + frames[i], JSON.stringify(all[0][i]) === JSON.stringify(all[1][i]), {
    frame: frames[i],
    png: all[0][i].png
  });
  for (const kind of ['landscape', 'clinic', 'office', 'street'] as const) {
    const engine = new CartoonEngine(document.createElement('canvas'), kind === 'landscape' ? 640 : 360, kind === 'landscape' ? 360 : 640, {
      quality: 'software-safe'
    });
    parent.registerCleanup(() => engine.dispose());
    try {
      const clinic = {
        version: 1,
        video: {
          width: 720,
          height: 1280
        },
        font: 'noto-sans-devanagari',
        layouts: {
          room: {
            preset: 'clinic'
          }
        },
        story: {
          version: 1,
          fps: 30,
          durationInFrames: 30,
          characters: {
            doctor: {
              appearance: 'doctor'
            },
            patient: {
              appearance: 'patient'
            }
          },
          scenes: [{
            id: 'clinic',
            setting: 'room',
            startFrame: 0,
            endFrame: 30,
            axis: ['doctor', 'patient'],
            characters: {
              doctor: {
                stance: {
                  type: 'stand',
                  at: 'doctor'
                }
              },
              patient: {
                stance: {
                  type: 'sit',
                  seat: 'examSeat',
                  floor: 'ground'
                }
              }
            },
            beats: [],
            shots: [{
              id: 'both',
              type: 'twoShot',
              subjects: ['doctor', 'patient'],
              startFrame: 0,
              endFrame: 30
            }]
          }]
        }
      };
      const compiled = compileStoryDocument(kind === 'clinic' ? clinic : kind === 'office' ? OFFICE_FIXTURE : kind === 'street' ? STREET_FIXTURE : source.document),
        family = await prepareStoryFont(engine),
        audio = await prepareStoryAudio(engine, compiled.timeline),
        captions = await createCaptionLayout({
          width: engine.renderer.domElement.width,
          height: engine.renderer.domElement.height,
          words: compiled.timeline.captionWords,
          fontSize: 20,
          fontFamily: `"${family}"`,
          bottom: 48,
          strokeWidth: 1
        }, engine.signal),
        player = createStory(engine, {
          globalFrameOffset: offset,
          timeline: compiled.timeline,
          settings: createStoryEnvironments(engine, compiled, kind === 'landscape' ? layoutOrder : undefined),
          captions,
          audio
        });
      player.prepare();
      await engine.prepare();
      for (const f of [0, Math.floor(compiled.timeline.plan.durationInFrames / 2), compiled.timeline.plan.durationInFrames - 1]) {
        player.applyFrame(f);
        engine.renderFrame(f, compiled.timeline.plan.fps);
      }
      record(kind + ' preset/framing', true);
      player.dispose();
    } finally {
      engine.dispose();
    }
  }
  console.log('AUDIT_AUTHORING_RESULTS:' + JSON.stringify(results));
  if (results.some(x => !x.pass)) throw new Error('Authored story verification failed');
}
