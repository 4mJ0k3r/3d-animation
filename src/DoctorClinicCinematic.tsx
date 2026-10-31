import React from 'react';
import { getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas, ToonCaptions } from './toon-kit';
import { createCinematicClinic } from './clinic-cinematic';
import { UNIVERSAL_CLINIC_CAPTIONS } from './clinic-universal-story';
export const DoctorClinicCinematic: React.FC = () => {
  const ref = React.useRef<ReturnType<typeof createCinematicClinic> | null>(null),
    timing = React.useRef(0),
    {
      width,
      height
    } = useVideoConfig(),
    frame = useCurrentFrame();
  const props = getInputProps() as {
    verify?: boolean;
    previewFrames?: number[];
    close?: boolean;
  };
  const at = (f: number) => props.previewFrames?.[f] ?? f,
    shift = frame - at(frame);
  return <div style={{
    position: 'relative',
    width: '100%',
    height: '100%'
  }}><ThreeCanvas autoFrame={false} fonts={['900 66px "Arial Black"', 'bold 28px Arial']} engineOptions={{
      quality: 'software-safe',
      outlineThickness: 2.8,
      depthThreshold: .015,
      normalThreshold: .46,
      saturation: 1.14,
      warmth: .04
    }} initScene={async engine => {
      if (props.verify) {
        const {
          verifyDirection
        } = await import('./toon-kit-tests/direction-gpu');
        await verifyDirection(engine);
      }
      engine.signal.throwIfAborted();
      const t = performance.now();
      ref.current = createCinematicClinic(engine, width / height, props.close ? [{
        id: 'close',
        type: 'closeUp',
        subject: 'patient',
        view: 'subjectFront',
        startFrame: 0,
        endFrame: 150
      }] : undefined);
      console.log('AUDIT_DIRECTION_PREPARATION:' + JSON.stringify({
        ms: performance.now() - t,
        samples: 151,
        restoredFrame: 0
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
          solveMs: timing.current,
          shot: ref.current!.director.timeline.select(at(f)).id,
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
      const t = performance.now();
      ref.current!.evaluate(at(frame));
      timing.current = performance.now() - t;
    }} />
 <ToonCaptions words={UNIVERSAL_CLINIC_CAPTIONS.map(w => ({
      ...w,
      startFrame: w.startFrame + shift,
      endFrame: w.endFrame + shift
    }))} fontSize={width * 66 / 1080} bottom={height * 100 / 1920} strokeWidth={width * 5 / 1080} /></div>;
};
