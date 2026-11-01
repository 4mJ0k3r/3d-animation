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
import { compileStorySegment, planStorySegments } from './segments';
import type { CaptionWord } from '../captions';
export const AuthoredStory: React.FC<{
  document: unknown;
  verify?: boolean;
  segmentIndex?: number;
}> = props => {
  const source = React.useMemo(() => compileStoryDocument(props.document), [props.document]);
  const compiled = React.useMemo(() => props.segmentIndex === undefined ? source : compileStorySegment(source, props.segmentIndex), [source, props.segmentIndex]);
  if (compiled.timeline.plan.durationInFrames > 600) throw new Error('Use the guarded story CLI for segmented stories');
  const offset = props.segmentIndex === undefined ? 0 : planStorySegments(source)[props.segmentIndex].startFrame;
  const key = React.useMemo(() => JSON.stringify(compiled.document), [compiled]);
  return <StorySession key={key} compiled={compiled} verify={props.verify} offset={offset} displayWords={source.timeline.captionWords} layoutOrder={Object.keys(source.document.layouts)} />;
};
const StorySession: React.FC<{
  compiled: CompiledStoryDocument;
  verify?: boolean;
  offset: number;
  layoutOrder: readonly string[];
  displayWords: readonly CaptionWord[];
}> = ({
  compiled,
  verify, offset, displayWords, layoutOrder
}) => {
  const {
      width,
      height
    } = useVideoConfig(),
    frame = useCurrentFrame();
  const [ready, setReady] = React.useState<{
      captions: CaptionLayout;
      display: CaptionLayout;
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
          display = await engine.wait(createCaptionLayout({
            width,
            height,
            words: displayWords,
            fontSize: Math.min(width * 64 / 1080, height * .068),
            fontFamily: `"${family}"`,
            strokeWidth: Math.min(width * 4 / 1080, 2),
            bottom: Math.max(height * 96 / 1920, 48)
          }, engine.signal));
        const captions: CaptionLayout = {...display, words: display.words.filter(w => w.startFrame < offset + compiled.timeline.plan.durationInFrames && w.endFrame > offset).map(w=>({...w,startFrame:Math.max(offset,w.startFrame)-offset,endFrame:Math.min(offset+compiled.timeline.plan.durationInFrames,w.endFrame)-offset}))};
        await engine.wait(new Promise<void>(resolve => {
          commit.current = resolve;
          setReady({
            captions,
            display,
            audio
          });
        }));
        if (verify) {
          const {
            verifyAuthoredStory
          } = await import('./verification');
          await verifyAuthoredStory(engine, compiled, offset, layoutOrder);
        }
        const start = performance.now();
        player.current = createStory(engine, {
          globalFrameOffset: offset,
          timeline: compiled.timeline,
          settings: createStoryEnvironments(engine, compiled, layoutOrder),
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
        const expected = captionAt(ready.display, f+offset),
          span = document.querySelector('[data-authored-captions] span');
        if (span?.textContent !== (expected?.text ?? undefined)) throw new Error('Authored caption/frame mismatch');
      }
    }} />{ready && <><StoryAudio prepared={ready.audio} /><div data-authored-captions><ToonCaptions layout={ready.display} sourceFrame={frame+offset} /></div></>}</div>;
};
