import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import { CartoonEngine, CartoonEngineOptions } from './engine';
import { captureFrameState } from './internal/frame-state';
import { FramingOptions } from './camera';
import { setupCartoonLighting } from './lib';
import { ToonCaptions, ToonCaptionsProps } from './captions';

export interface FrameContext {frame: number; time: number; fps: number; engine: CartoonEngine; signal: AbortSignal}
export interface ThreeCanvasProps {
  width?: number; height?: number;
  engineOptions?: CartoonEngineOptions;
  /** Await loaders here, or register promises with engine.registerReady(). */
  initScene?: (engine: CartoonEngine) => void | Promise<void>;
  /** Assign state from frame; never integrate from previous frames. */
  onFrame?: (context: FrameContext) => void | Promise<void>;
  captions?: ToonCaptionsProps;
  autoFrame?: boolean | 'static' | 'dynamic';
  framing?: FramingOptions;
  framingSubjects?: (engine: CartoonEngine) => THREE.Object3D | THREE.Object3D[] | THREE.Box3;
  /** CSS font descriptors to load before constructing canvas text. */
  fonts?: string[];
}

/** One queue per engine; capture gates cover initialization AND each frame. */
export const ThreeCanvas: React.FC<ThreeCanvasProps> = (props) => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const width = props.width ?? config.width, height = props.height ?? config.height;
  const optionsKey = JSON.stringify(props.engineOptions ?? {});
  const fontsKey = JSON.stringify(props.fonts ?? []);
  const latest = useRef(props);
  latest.current = props;
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<{engine: CartoonEngine; queue: Promise<void>; active: boolean; failed: boolean; failureGate:number|null; fail: (error: unknown) => void; reset: () => void; direction: [number,number,number]; staticBounds: THREE.Box3 | null} | null>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    // Each lifecycle gets a fresh context, including React StrictMode re-mounts.
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    host.current.replaceChildren(canvas);
    let engine: CartoonEngine;
    try { engine = new CartoonEngine(canvas, width, height, latest.current.engineOptions); }
    catch (error) { cancelRender(error); return; }
    const current = {engine, queue: Promise.resolve(), active: true, failed: false, failureGate:null as number|null, fail: (_error: unknown) => {}, reset: () => {}, direction: [0,0,1] as [number,number,number], staticBounds: null as THREE.Box3 | null};
    current.fail = (error) => {
      if (!current.active || current.failed) return;
      current.failed = true;
      // Remotion 4.0.539 tests ready BEFORE cancelled. Keep this failed lifecycle
      // blocked even when ordinary frame gates complete or React re-renders.
      // Cancellation rejects capture; unmount releases this one owned latch.
      current.failureGate=delayRender('Toon-Kit cancelled lifecycle');
      // Remotion records the cancellation and then throws; do not turn that into
      // a second unhandled rejection or cancel the same session twice.
      try {cancelRender(error);} catch {}
    };
    session.current = current;
    const initial = latest.current;
    current.queue = (async () => {
      await engine.wait(Promise.all((initial.fonts ?? []).map((font) => document.fonts.load(font))));
      await engine.wait(document.fonts.ready);
      if (!current.active) return;
      await engine.wait(Promise.resolve(initial.initScene?.(engine)));
      if (!current.active) return;
      let hasLights = false;
      engine.scene.traverse((object) => { if (object instanceof THREE.Light) hasLights = true; });
      if (!hasLights) setupCartoonLighting(engine.scene, {quality: initial.engineOptions?.quality});
      await engine.prepare();
      if (!current.active) return;
      current.reset = captureFrameState(engine.scene, engine.camera);
      current.direction = engine.camera.getWorldDirection(new THREE.Vector3()).negate().toArray() as [number,number,number];
      const subjects = initial.framingSubjects?.(engine) ?? engine.scene.children.filter((o) => !(o instanceof THREE.Light) && !o.userData.excludeFromFraming);
      const bounds = new THREE.Box3();
      if (subjects instanceof THREE.Box3) bounds.copy(subjects);
      else for (const object of Array.isArray(subjects) ? subjects : [subjects]) bounds.union(new THREE.Box3().setFromObject(object));
      current.staticBounds = bounds;
    })();
    void current.queue.catch(current.fail);
    return () => {
      current.active = false;
      if(current.failureGate!==null){continueRender(current.failureGate);current.failureGate=null;}
      if (session.current === current) session.current = null;
      // Do not await loaders. Abort the barrier and release ownership synchronously.
      try { engine.dispose(); } catch (error) { console.error(error); }
    };
  }, [width, height, optionsKey, fontsKey]);

  useLayoutEffect(() => {
    // Commit-time gating precedes paint/capture and avoids leaked handles from
    // discarded concurrent/StrictMode React renders.
    const gate = delayRender(`Toon-Kit frame ${frame}`);
    const current = session.current;
    if (!current) { continueRender(gate); return; }
    let cancelled = false;
    let completed = false;
    const complete = () => {if (!completed) {completed = true; continueRender(gate);}};
    const frameProps = latest.current;
    current.queue = current.queue.then(async () => {
      if (cancelled || !current.active || current.failed) {complete(); return;}
      current.reset();
      const beforePosition = current.engine.camera.position.clone();
      const beforeQuaternion = current.engine.camera.quaternion.clone();
      await current.engine.wait(Promise.resolve(frameProps.onFrame?.({frame, time: frame / config.fps, fps: config.fps, engine: current.engine, signal: current.engine.signal})));
      await current.engine.prepare();
      if (cancelled || !current.active) return;
      current.engine.scene.updateMatrixWorld(true);
      const explicitCamera = !current.engine.camera.position.equals(beforePosition) || !current.engine.camera.quaternion.equals(beforeQuaternion);
      if ((frameProps.autoFrame ?? true) && !explicitCamera) {
        const subjects = frameProps.autoFrame === 'static' ? current.staticBounds! : frameProps.framingSubjects?.(current.engine) ?? current.engine.scene.children.filter(
          (object) => !(object instanceof THREE.Light) && !object.userData.excludeFromFraming,
        );
        current.engine.frameSubjects(subjects, {direction: current.direction, ...frameProps.framing});
      }
      current.engine.camera.updateMatrixWorld(true);
      current.engine.renderFrame(frame, config.fps);
      complete();
    }).catch((error: unknown) => { if (!cancelled) current.fail(error); complete(); });
    return () => { cancelled = true; complete(); };
  }, [frame, config.fps, width, height, optionsKey, fontsKey, props.onFrame, props.autoFrame, props.framing, props.framingSubjects]);

  return <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden'}}>
    <div ref={host} style={{width: '100%', height: '100%'}} />
    {props.captions && <ToonCaptions {...props.captions} />}
  </div>;
};
