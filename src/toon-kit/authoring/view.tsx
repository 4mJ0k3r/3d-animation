import React from 'react';
import { useVideoConfig, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '../ThreeCanvas';
import { ToonCaptions } from '../captions';
import { createCaptionLayout, captionAt } from '../caption-layout';
import type { CaptionLayout } from '../caption-layout';
import { createStory } from '../story/player';
import type { StoryPlayer } from '../story/player';
import { prepareStoryAudio } from '../story/audio-assets';
import type { PreparedStoryAudio } from '../story/audio-assets';
import { StoryAudio } from '../story/audio';
import { compileStoryDocument } from './document';
import type { CompiledStoryDocument } from './document';
import { createStoryEnvironments } from './starters';
import { prepareStoryFont } from './font';
export const AuthoredStory: React.FC<{
  document: unknown;
  verify?: boolean;
}> = props => {
  const compiled = React.useMemo(() => compileStoryDocument(props.document), [props.document]);
  const key = React.useMemo(() => JSON.stringify(compiled.document), [compiled]);
  return <StorySession key={key} compiled={compiled} verify={props.verify} />;
};
const StorySession: React.FC<{
  compiled: CompiledStoryDocument;
  verify?: boolean;
}> = ({
  compiled,
  verify
}) => {
  const {
      width,
      height
    } = useVideoConfig(),
    frame = useCurrentFrame();
  const [ready, setReady] = React.useState<{
      captions: CaptionLayout;
      audio: PreparedStoryAudio;
    } | null>(null),
    commit = React.useRef<(() => void) | null>(null),
    player = React.useRef<StoryPlayer | null>(null),
    evalMs = React.useRef(0);
  React.useLayoutEffect(() => {
    if (ready) commit.current?.();
  }, [ready]);
  return <div data-authored-story style={{
    position: 'relative',
    width: '100%',
    height: '100%'
  }}><ThreeCanvas autoFrame={false} engineOptions={{
      quality: 'software-safe'
    }} initScene={async engine => {
      try {
        const family = await prepareStoryFont(engine),
          audio = await prepareStoryAudio(engine, compiled.timeline),
          captions = await engine.wait(createCaptionLayout({
            width,
            height,
            words: compiled.timeline.captionWords,
            fontSize: Math.min(width * 64 / 1080, height * .068),
            fontFamily: `"${family}"`,
            strokeWidth: Math.min(width * 4 / 1080, 2),
            bottom: Math.max(height * 96 / 1920, 48)
          }, engine.signal));
        await engine.wait(new Promise<void>(resolve => {
          commit.current = resolve;
          setReady({
            captions,
            audio
          });
        }));
        if (verify) {
          const {
            verifyAuthoredStory
          } = await import('./verification');
          await verifyAuthoredStory(engine, compiled);
        }
        const start = performance.now();
        player.current = createStory(engine, {
          timeline: compiled.timeline,
          settings: createStoryEnvironments(engine, compiled),
          captions,
          audio
        });
        player.current.prepare();
        console.log('AUDIT_AUTHORING_READY:' + JSON.stringify({
          font: family,
          captionTiming: compiled.timeline.captionTiming,
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
            storyMs: evalMs.current,
            memory: {
              ...engine.renderer.info.memory
            },
            calls: engine.renderer.info.render.calls,
            triangles: engine.renderer.info.render.triangles
          }));
        };
      } catch (e) {
        console.log('AUDIT_AUTHORING_ERROR:' + JSON.stringify({
          ...((e as {
            diagnostic?: object;
          }).diagnostic ?? {
            code: 'AUTHORING_PREPARATION',
            message: String(e)
          }),
          hint: 'Check named slots and assets. For framing, use a wider twoShot/fullBody preset or shorter captions; never patch camera coordinates.'
        }));
        throw e;
      }
    }} onFrame={({
      frame: f
    }) => {
      const t = performance.now();
      player.current!.applyFrame(f);
      evalMs.current = performance.now() - t;
      if (ready) {
        const expected = captionAt(ready.captions, f),
          span = document.querySelector('[data-authored-captions] span');
        if (span?.textContent !== (expected?.text ?? undefined)) throw new Error('Authored caption/frame mismatch');
      }
    }} />{ready && <><StoryAudio prepared={ready.audio} /><div data-authored-captions><ToonCaptions layout={ready.captions} sourceFrame={frame} /></div></>}</div>;
};
