import React from 'react';
import { getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas, ToonCaptions, createCaptionLayout, captionAt, rectsIntersect, createProjection, compactVisibilityFrame } from '../toon-kit';
import type { CaptionLayout } from '../toon-kit';
import { createMotionFixture, MOTION_WORDS } from './motion-fixture';
export const CameraMotionValidation: React.FC = () => {
  const {
      width,
      height
    } = useVideoConfig(),
    frame = useCurrentFrame(),
    props = getInputProps() as {
      verify?: boolean;
    };
  const [layout, setLayout] = React.useState<CaptionLayout | null>(null),
    commit = React.useRef<(() => void) | null>(null),
    fixture = React.useRef<ReturnType<typeof createMotionFixture> | null>(null),
    directorMs = React.useRef(0);
  React.useLayoutEffect(() => {
    if (layout) commit.current?.();
  }, [layout]);
  return <div data-motion-root style={{
    position: 'relative',
    width: '100%',
    height: '100%'
  }}><ThreeCanvas autoFrame={false} fonts={['900 44px "Arial Black"']} engineOptions={{
      quality: 'software-safe'
    }} initScene={async engine => {
      const captions = await engine.wait(createCaptionLayout({
        width,
        height,
        words: MOTION_WORDS,
        fontSize: Math.min(width * 66 / 1080, height * .072),
        strokeWidth: Math.min(width * 5 / 1080, height * .072 * 5 / 66),
        bottom: Math.max(height * 100 / 1920, 48)
      }, engine.signal));
      await engine.wait(new Promise<void>(resolve => {
        commit.current = resolve;
        setLayout(captions);
      }));
      if (props.verify) {
        const {
          verifyMotion
        } = await import('./motion-gpu');
        await verifyMotion(engine);
      }
      const start = performance.now();
      fixture.current = createMotionFixture(engine, captions);
      console.log('AUDIT_MOTION_PREPARATION:' + JSON.stringify({
        ms: performance.now() - start,
        ...fixture.current.director.preparationStats()
      }));
      engine.renderer.info.autoReset = false;
      const render = engine.renderFrame.bind(engine);
      engine.renderFrame = (f, fps) => {
        engine.renderer.info.reset();
        const start = performance.now();
        render(f, fps);
        console.log('TOON_FRAME:' + JSON.stringify({
          frame: f,
          ms: performance.now() - start,
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
        snapshot = f.sample(frame),
        start = performance.now(),
        camera = f.director.applyFrame({
          frame,
          snapshot
        });
      directorMs.current = performance.now() - start;
      if (layout) {
        const word = captionAt(layout, frame),
          host = document.querySelector('[data-motion-root]')!,
          span = host.querySelector('[data-motion-captions] span') as HTMLElement | null;
        if (span?.textContent !== (word?.text ?? undefined)) throw new Error('Motion caption mismatch');
        if (word && span) {
          const r = span.getBoundingClientRect(),
            h = host.getBoundingClientRect();
          if ((r.left - h.left) / width < word.rect.left - 1e-4 || (r.right - h.left) / width > word.rect.right + 1e-4 || (r.top - h.top) / height < word.rect.top - 1e-4 || (r.bottom - h.top) / height > word.rect.bottom + 1e-4) throw new Error('Motion caption exceeded reserved ink');
          const projection = createProjection(camera),
            shot = f.director.timeline.select(frame);
          for (const region of compactVisibilityFrame(shot, snapshot).required) if (rectsIntersect(projection.rect(region.bounds), word.rect)) throw new Error('Motion caption intersects critical region');
        }
      }
    }} /><div data-motion-captions>{layout && <ToonCaptions layout={layout} />}</div></div>;
};
