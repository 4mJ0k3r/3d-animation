import React from 'react';
import { getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas, ToonCaptions, createCaptionLayout, captionAt, createProjection, compactVisibilityFrame, rectsIntersect } from '../toon-kit';
import type { CaptionLayout } from '../toon-kit';
import { createOfficeFixture, OFFICE_WORDS } from './office-fixture';
export const OfficeCinematicValidation: React.FC = () => {
  const {
      width,
      height
    } = useVideoConfig(),
    frame = useCurrentFrame(),
    props = getInputProps() as {
      previewFrames?: number[];
    },
    at = (f: number) => props.previewFrames?.[f] ?? f;
  const [layout, setLayout] = React.useState<CaptionLayout | null>(null),
    commit = React.useRef<(() => void) | null>(null),
    fixture = React.useRef<ReturnType<typeof createOfficeFixture> | null>(null),
    directorMs = React.useRef(0);
  React.useLayoutEffect(() => {
    if (layout) commit.current?.();
  }, [layout]);
  return <div data-office-root style={{
    position: 'relative',
    width: '100%',
    height: '100%'
  }}><ThreeCanvas autoFrame={false} fonts={['900 44px "Arial Black"']} engineOptions={{
      quality: 'software-safe'
    }} initScene={async engine => {
      const captions = await engine.wait(createCaptionLayout({
        width,
        height,
        words: OFFICE_WORDS,
        fontSize: Math.min(width * 66 / 1080, height * .072),
        strokeWidth: Math.min(width * 5 / 1080, height * .072 * 5 / 66),
        bottom: Math.max(height * 100 / 1920, 48)
      }, engine.signal));
      await engine.wait(new Promise<void>(resolve => {
        commit.current = resolve;
        setLayout(captions);
      }));
      const start = performance.now();
      fixture.current = createOfficeFixture(engine, captions);
      console.log('AUDIT_OFFICE_PREPARATION:' + JSON.stringify({
        ms: performance.now() - start,
        ...fixture.current.director.preparationStats()
      }));
      console.log('AUDIT_OFFICE_PLANS:' + JSON.stringify([0, 30, 60].map(f => ({
        shot: fixture.current!.director.describe(f).shot,
        candidate: fixture.current!.director.describe(f).composition?.id
      }))));
      engine.renderer.info.autoReset = false;
      const render = engine.renderFrame.bind(engine);
      engine.renderFrame = (f, fps) => {
        engine.renderer.info.reset();
        const t = performance.now();
        render(f, fps);
        console.log('TOON_FRAME:' + JSON.stringify({
          frame: f,
          ms: performance.now() - t,
          directorMs: directorMs.current,
          calls: engine.renderer.info.render.calls,
          triangles: engine.renderer.info.render.triangles,
          memory: {
            ...engine.renderer.info.memory
          }
        }));
      };
    }} onFrame={({
      frame
    }) => {
      const f = fixture.current!,
        s = f.sample(at(frame)),
        t = performance.now(),
        c = f.director.applyFrame({
          frame: at(frame),
          snapshot: s
        });
      directorMs.current = performance.now() - t;
      if (layout) {
        const word = captionAt(layout, at(frame)),
          host = document.querySelector('[data-office-root]')!,
          span = host.querySelector('[data-office-captions] span') as HTMLElement | null;
        if (span?.textContent !== (word?.text ?? undefined)) throw new Error('Office caption mismatch');
        if (word && span) {
          const r = span.getBoundingClientRect(),
            h = host.getBoundingClientRect();
          if ((r.left - h.left) / width < word.rect.left - 1e-4 || (r.right - h.left) / width > word.rect.right + 1e-4 || (r.top - h.top) / height < word.rect.top - 1e-4 || (r.bottom - h.top) / height > word.rect.bottom + 1e-4) throw new Error('Office caption outside measured ink');
          const projection = createProjection(c),
            shot = f.director.timeline.select(at(frame));
          for (const region of compactVisibilityFrame(shot, s).required) if (rectsIntersect(projection.rect(region.bounds), word.rect)) throw new Error('Office caption overlaps protected content');
        }
      }
    }} /><div data-office-captions>{layout && <ToonCaptions layout={layout} sourceFrame={at(frame)} />}</div></div>;
};
