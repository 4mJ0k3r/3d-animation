import React from 'react';
import { getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas, ToonCaptions, createCaptionLayout, captionAt, createProjection, compactVisibilityFrame, rectsIntersect } from './toon-kit';
import type { CaptionLayout } from './toon-kit';
import { createCinematicClinic, CLINIC_INTEGRATED_SHOTS } from './clinic-cinematic';
import { UNIVERSAL_CLINIC_CAPTIONS } from './clinic-universal-story';
export const DoctorClinicCinematic: React.FC<{
  visibility?: boolean;
  integrated?: boolean;
}> = ({
  visibility = false, integrated = false
}) => {
  const [captionLayout, setCaptionLayout] = React.useState<CaptionLayout | null>(null),
    captionCommit = React.useRef<(() => void) | null>(null),
    directorMs = React.useRef(0);
  React.useLayoutEffect(() => {
    if (captionLayout) captionCommit.current?.();
  }, [captionLayout]);
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
    captionCase?: 'long' | 'large';
    closeout?: boolean;
  };
  const at = (f: number) => props.previewFrames?.[f] ?? f,
    shift = frame - at(frame);
  return <div data-cinematic-root style={{
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
      if (props.verify && !visibility) {
        const {
          verifyDirection
        } = await import('./toon-kit-tests/direction-gpu');
        await verifyDirection(engine);
      }
      engine.signal.throwIfAborted();
      const captionStart = performance.now();
      const layout = visibility ? await engine.wait(createCaptionLayout({
        width,
        height,
        words: props.captionCase === 'long' ? [{
          text: 'PNEUMONOULTRAMICROSCOPICSILICOVOLCANOCONIOSIS',
          startFrame: 0,
          endFrame: 150
        }] : UNIVERSAL_CLINIC_CAPTIONS,
        fontSize: props.captionCase === 'large' ? width * 88 / 1080 : Math.min(width * 66 / 1080, height * .072),
        strokeWidth: Math.min(width * 5 / 1080, height * .072 * 5 / 66),
        bottom: Math.max(height * 100 / 1920, 48)
      }, engine.signal)) : undefined;
      if (layout) await engine.wait(new Promise<void>(resolve => {
        captionCommit.current = resolve;
        setCaptionLayout(layout);
      }));
      const captionMeasurementMs = performance.now() - captionStart;
      if (visibility && props.verify) {
        const {
          verifyComposition
        } = await import('./toon-kit-tests/composition-gpu');
        await verifyComposition(engine);
      }
      if(visibility&&props.closeout){const {verifyPhase3}=await import('./toon-kit-tests/phase3-gpu');await verifyPhase3(engine);}
      const t = performance.now();
      ref.current = createCinematicClinic(engine, width / height, props.close ? [{
        id: 'close',
        type: 'closeUp',
        subject: 'patient',
        view: 'subjectFront',
        startFrame: 0,
        endFrame: 150
      }] : integrated ? CLINIC_INTEGRATED_SHOTS : undefined, visibility ? {
        captions: layout
      } : undefined);
      if (visibility) console.log('AUDIT_COMPOSITION_PLANS:' + JSON.stringify([0, 43, 75, 114].map(f => ref.current!.director.describe(f))));
      console.log('AUDIT_DIRECTION_PREPARATION:' + JSON.stringify({
        ms: performance.now() - t,
        samples: 151,
        restoredFrame: 0,
        captionMeasurementMs,
        ...ref.current!.director.preparationStats()
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
          directorMs: directorMs.current,
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
      const f = ref.current!,
        snapshot = f.sample(at(frame)),
        start = performance.now(),
        camera = f.director.applyFrame({
          frame: at(frame),
          snapshot
        });
      directorMs.current = performance.now() - start;
      if (visibility && captionLayout) {
        const word = captionAt(captionLayout, at(frame)),
          host = document.querySelector('[data-cinematic-root]')!,
          span = host.querySelector('[data-cinematic-captions] span') as HTMLElement | null;
        if (span?.textContent !== (word?.text ?? undefined)) throw new Error('Actual caption word mismatch');
        if (span && word) {
          const r = span.getBoundingClientRect(),
            h = host.getBoundingClientRect();
          if ((r.left - h.left) / width < word.rect.left - 1e-4 || (r.right - h.left) / width > word.rect.right + 1e-4 || (r.top - h.top) / height < word.rect.top - 1e-4 || (r.bottom - h.top) / height > word.rect.bottom + 1e-4) throw new Error('Actual caption exceeds measured reservation');
          const projection = createProjection(camera),
            shot = f.director.timeline.select(at(frame)),
            compact = compactVisibilityFrame(shot, snapshot);
          for (const required of compact.required) if (rectsIntersect(projection.rect(required.bounds), word.rect)) throw new Error('Caption overlaps critical rendered region');
        }
      }
      timing.current = performance.now() - t;
    }} />
 <div data-cinematic-captions>{captionLayout ? <ToonCaptions layout={captionLayout} sourceFrame={at(frame)} /> : <ToonCaptions words={UNIVERSAL_CLINIC_CAPTIONS.map(w => ({
        ...w,
        startFrame: w.startFrame + shift,
        endFrame: w.endFrame + shift
      }))} fontSize={width * 66 / 1080} bottom={height * 100 / 1920} strokeWidth={width * 5 / 1080} />}</div></div>;
};
export const DoctorClinicVisible: React.FC = () => <DoctorClinicCinematic visibility />;
export const DoctorClinicIntegrated:React.FC=()=> <DoctorClinicCinematic visibility integrated />;
