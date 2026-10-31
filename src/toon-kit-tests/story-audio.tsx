import React from 'react';
import { useVideoConfig, useCurrentFrame, getInputProps } from 'remotion';
import { ThreeCanvas, ToonCaptions, compileStory, prepareStoryAudio, StoryAudio, createCaptionLayout, createStory, captionAt } from '../toon-kit';
import type { CaptionLayout, PreparedStoryAudio, StoryPlayer } from '../toon-kit';
import { createStorySettings } from './story-fixture';
import { AUDIO_STORY } from './story-audio-plan';
export const StoryAudioValidation: React.FC = () => {
  const {
      width,
      height
    } = useVideoConfig(),
    frame = useCurrentFrame(),
    verify = !!getInputProps().verify;
  const [ready, setReady] = React.useState<{
      captions: CaptionLayout;
      audio: PreparedStoryAudio;
    } | null>(null),
    commit = React.useRef<(() => void) | null>(null),
    player = React.useRef<StoryPlayer | null>(null),
    storyMs = React.useRef(0);
  React.useLayoutEffect(() => {
    if (ready) commit.current?.();
  }, [ready]);
  return <div data-audio-story style={{
    position: 'relative',
    width: '100%',
    height: '100%'
  }}><ThreeCanvas autoFrame={false} fonts={['900 44px "Nirmala UI"']} engineOptions={{
      quality: 'software-safe'
    }} initScene={async engine => {
      const timeline = compileStory(AUDIO_STORY),
        audio = await prepareStoryAudio(engine, timeline);
      const captions = await engine.wait(createCaptionLayout({
        width,
        height,
        words: timeline.captionWords,
        fontSize: Math.min(width * 64 / 1080, height * .068),
        fontFamily: '"Nirmala UI", Arial, sans-serif',
        strokeWidth: Math.min(width * 4 / 1080, 2),
        bottom: Math.max(height * 96 / 1920, 48)
      }, engine.signal));
      if (verify) {
        const {
          verifyStoryAudio
        } = await import('./story-audio-gpu');
        await verifyStoryAudio(engine, timeline);
      }
      await engine.wait(new Promise<void>(resolve => {
        commit.current = resolve;
        setReady({
          captions,
          audio
        });
      }));
      const start = performance.now(),
        settings = createStorySettings(engine);
      settings.meeting.root.visible = false;
      player.current = createStory(engine, {
        timeline,
        settings: {
          office: settings.office
        },
        captions,
        audio
      });
      player.current.prepare();
      console.log('AUDIT_AUDIO_READY:' + JSON.stringify({
        assets: audio.assets,
        captionTiming: timeline.captionTiming,
        prepareMs: performance.now() - start,
        stats: player.current.preparationStats()
      }));
      engine.renderer.info.autoReset = false;
      const render = engine.renderFrame.bind(engine);
      engine.renderFrame = (f, fps) => {
        engine.renderer.info.reset();
        const t = performance.now();
        render(f, fps);
        console.log('TOON_FRAME:' + JSON.stringify({
          frame: f,
          ms: performance.now() - t,
          storyMs: storyMs.current,
          memory: {
            ...engine.renderer.info.memory
          },
          calls: engine.renderer.info.render.calls,
          triangles: engine.renderer.info.render.triangles
        }));
      };
    }} onFrame={({
      frame: f
    }) => {
      const start = performance.now();
      player.current!.applyFrame(f);
      storyMs.current = performance.now() - start;
      if (ready) {
        const span = document.querySelector('[data-audio-captions] span'),
          expected = captionAt(ready.captions, f);
        if (span?.textContent !== (expected?.text ?? undefined)) throw new Error('Audio caption/frame mismatch');
      }
    }} />{ready && <><StoryAudio prepared={ready.audio} /><div data-audio-captions><ToonCaptions layout={ready.captions} sourceFrame={frame} /></div></>}</div>;
};
