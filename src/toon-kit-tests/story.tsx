import React from 'react';
import { getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas, ToonCaptions, createCaptionLayout, compileStory, captionAt } from '../toon-kit';
import type { CaptionLayout, StoryPlayer } from '../toon-kit';
import { createStoryFixture } from './story-fixture';
import { TEN_SECOND_STORY } from './story-plan';
const StoryView: React.FC<{
  offsetFrame?: number;
}> = ({
  offsetFrame = 120
}) => {
  const {
      width,
      height
    } = useVideoConfig(),
    nativeFrame = useCurrentFrame(),
    props = getInputProps() as {
      verify?: boolean;
    },
    sourceFrame = offsetFrame + nativeFrame;
  const [layout, setLayout] = React.useState<CaptionLayout | null>(null),
    commit = React.useRef<(() => void) | null>(null),
    player = React.useRef<StoryPlayer | null>(null),
    storyMs = React.useRef(0);
  React.useLayoutEffect(() => {
    if (layout) commit.current?.();
  }, [layout]);
  return <div data-story-root style={{
    position: 'relative',
    width: '100%',
    height: '100%'
  }}><ThreeCanvas autoFrame={false} fonts={['900 44px "Nirmala UI"']} engineOptions={{
      quality: 'software-safe'
    }} initScene={async engine => {
      const t = performance.now(),
        timeline = compileStory(TEN_SECOND_STORY),
        compileMs = performance.now() - t;
      const captions = await engine.wait(createCaptionLayout({
        width,
        height,
        words: timeline.captionWords,
        fontSize: Math.min(width * 64 / 1080, height * .068),
        fontFamily: '"Nirmala UI", Arial, sans-serif',
        strokeWidth: Math.min(width * 4 / 1080, 2),
        bottom: Math.max(height * 96 / 1920, 48)
      }, engine.signal));
      await engine.wait(new Promise<void>(resolve => {
        commit.current = resolve;
        setLayout(captions);
      }));
      if (props.verify) {
        const {
          verifyStory
        } = await import('./story-gpu');
        await verifyStory(engine);
      }
      const start = performance.now();
      player.current = createStoryFixture(engine, captions, timeline);
      console.log('AUDIT_STORY_PREPARATION:' + JSON.stringify({
        compileMs,
        prepareMs: performance.now() - start,
        stats: player.current.preparationStats(),
        fps: timeline.plan.fps,
        durationInFrames: timeline.plan.durationInFrames,
        alignment: timeline.alignment
      }));
      engine.renderer.info.autoReset = false;
      const render = engine.renderFrame.bind(engine);
      engine.renderFrame = (frame, fps) => {
        engine.renderer.info.reset();
        const t = performance.now();
        render(frame, fps);
        console.log('TOON_FRAME:' + JSON.stringify({
          frame,
          sourceFrame: offsetFrame + frame,
          ms: performance.now() - t,
          storyMs: storyMs.current,
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
      const globalFrame = offsetFrame + frame,
        t = performance.now();
      player.current!.applyFrame(globalFrame);
      storyMs.current = performance.now() - t;
      if (layout) {
        const word = captionAt(layout, globalFrame),
          host = document.querySelector('[data-story-root]')!,
          span = host.querySelector('[data-story-captions] span') as HTMLElement | null;
        if (span?.textContent !== (word?.text ?? undefined)) throw new Error('Story cue/frame mismatch');
        if (word && span) {
          const r = span.getBoundingClientRect(),
            h = host.getBoundingClientRect();
          if ((r.left - h.left) / width < word.rect.left - 1e-4 || (r.right - h.left) / width > word.rect.right + 1e-4 || (r.top - h.top) / height < word.rect.top - 1e-4 || (r.bottom - h.top) / height > word.rect.bottom + 1e-4) throw new Error('Story caption outside measured ink');
        }
      }
    }} /><div data-story-captions>{layout && <ToonCaptions layout={layout} sourceFrame={sourceFrame} />}</div></div>;
};
export const StoryTimelineValidation: React.FC = () => <StoryView />;
export const DeclarativeStoryExample: React.FC = () => <StoryView offsetFrame={0} />;
