import React, {StrictMode, useLayoutEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {Composition, Sequence, registerRoot, delayRender, continueRender, getInputProps} from 'remotion';
import * as SDK from '../toon-kit';
import {CartoonEngine as LegacyEngine} from '../engine';
import {sphere as legacySphere} from '../lib';
import {ThreeCanvas as LegacyCanvas} from '../ThreeCanvas';
import {getOutlineMode} from '../toon-kit/internal/policy';

type Result = {name: string; pass: boolean; details: unknown};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const neutral = {aoIntensity: 0, bokehMaxBlur: 0, saturation: 1, warmth: 0, contrast: 1};
function pixel(engine: SDK.CartoonEngine): Uint8Array {
  const gl = engine.renderer.getContext();
  const data = new Uint8Array(engine.canvas.width * engine.canvas.height * 4);
  gl.readPixels(0, 0, engine.canvas.width, engine.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return data;
}
async function capture(engine: SDK.CartoonEngine): Promise<{hash: string; png: string; dark: number}> {
  const pixels = pixel(engine);
  let dark = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 50 && pixels[i + 1] < 50 && pixels[i + 2] < 50) dark++;
  const png = engine.canvas.toDataURL('image/png');
  const bytes = Uint8Array.from(atob(png.split(',')[1]), (c) => c.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {hash: [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join(''), png, dark};
}
function make(options: SDK.CartoonEngineOptions = {}): SDK.CartoonEngine {
  const e = new SDK.CartoonEngine(document.createElement('canvas'), 160, 160, {quality: 'high', ...options});
  const gl = e.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  if (!/swiftshader/i.test(renderer)) throw new Error('Audit requires verified SwiftShader, got '+renderer);
  e.camera.position.set(0, 0, 5); e.camera.lookAt(0, 0, 0);
  e.scene.background = new THREE.Color('#ffffff');
  return e;
}
function basic(color = '#ffffff'): THREE.MeshBasicMaterial { return new THREE.MeshBasicMaterial({color}); }

async function engineAudit(): Promise<void> {
  const results: Result[] = [];
  const record = (name: string, pass: boolean, details: unknown) => results.push({name, pass, details});
  record('compatibility exports', LegacyEngine === SDK.CartoonEngine && legacySphere === SDK.sphere && LegacyCanvas === SDK.ThreeCanvas, 'Root exports reference the same implementations');
  {
    const e = new SDK.CartoonEngine(document.createElement('canvas'),108,192);
    let aoDisabled=false,bokehDisabled=false;try{void e.gtaoPass;}catch{aoDisabled=true;}try{void e.bokehPass;}catch{bokehDisabled=true;}
    record('software-safe allocation budget', e.supersample===1 && e.composer.passes.length===3 && aoDisabled && bokehDisabled && e.normalDepthRenderTarget.width===108, {supersample:e.supersample,passes:e.composer.passes.length,aoDisabled,bokehDisabled});
    e.dispose();
    let bounded=false;try{new SDK.CartoonEngine(document.createElement('canvas'),1080,1920,{supersample:2});}catch{bounded=true;}
    record('oversized software buffers rejected before context allocation',bounded,{bounded});
  }
  const order = [0, 80, 20, 80, 0];
  for (const auto of [false, true]) {
    const hashes: {instance: number; frame: number; hash: string}[] = [];
    for (let instance = 0; instance < 2; instance++) {
      const e = make();
      SDK.setupCartoonLighting(e.scene, {shadowMapSize: 128});
      e.scene.add(SDK.plane({width: 12, height: 12, rotation: [-Math.PI / 2, 0, 0], position: [0, -1, 0], outlineMode: 'none'}));
      const actor = SDK.sphere({radius: 0.65, color: '#fedcbd'}); e.scene.add(actor);
      await e.prepare();
      for (const frame of order) {
        // This is exactly the production bridge's ordering: framing, then onFrame.
        actor.position.x = Math.sin(frame / 30) * 1.3;
        actor.rotation.y = frame / 60;
        actor.updateWorldMatrix(true, true);
        if (auto) e.frameSubjects(actor, {direction: [0,0,1]});
        e.renderFrame(frame, 30);
        const {hash, png} = await capture(e);
        console.log('AUDIT_IMAGE:' + JSON.stringify({name: `${auto ? 'auto' : 'fixed'}-${instance}-${hashes.length}-${frame}`, png}));
        hashes.push({instance, frame, hash});
      }
      e.dispose();
    }
    record(auto ? 'auto-framing order independence' : 'fixed-camera order independence', [0, 20, 80].every((frame) => new Set(hashes.filter((v) => v.frame === frame).map((v) => v.hash)).size === 1), hashes);
  }

  const parent = new THREE.Group(); parent.userData.outlineMode = 'silhouette-only';
  const child = SDK.sphere(); parent.add(child);
  record('primitive outline policy inheritance', getOutlineMode(child) === 'silhouette-only', {actual: getOutlineMode(child)});
  const nested = new THREE.Group(); nested.add(child); parent.add(nested);
  const inherited = getOutlineMode(child); nested.userData.outlineMode = 'none';
  const nestedMode = getOutlineMode(child); child.userData.outlineMode = 'full';
  record('nested outline policies and explicit overrides', inherited === 'silhouette-only' && nestedMode === 'none' && getOutlineMode(child) === 'full', {inherited,nestedMode,explicit:getOutlineMode(child)});
  child.geometry.dispose(); (child.material as THREE.MeshToonMaterial).gradientMap!.dispose(); (child.material as THREE.Material).dispose();

  for (const kind of ['overlapping-hair', 'layered-clothing', 'close-contact', 'intersection']) {
    const e = make(neutral); const actor = new THREE.Group(); e.scene.add(actor);
    const primary = SDK.sphere({radius: 0.85, material: basic('#fedcbd')}); actor.add(primary);
    const patches: THREE.Mesh[] = [];
    if (kind === 'overlapping-hair') {
      for (const x of [-0.22, 0.22]) {
        const mesh = SDK.sphere({radius: 0.62, position: [x, 0.58, 0.12], material: basic('#4a3525')}); actor.add(mesh); patches.push(mesh);
      }
    } else {
      const mesh = SDK.box({width: 0.7, height: 0.4, depth: 0.2, position: [kind === 'intersection' ? 0.65 : 0, 0.15, kind === 'close-contact' ? 0.75 : 0.83], material: basic('#00a3af')});
      actor.add(mesh); patches.push(mesh);
    }
    await e.prepare(); e.renderFrame(0, 30); const full = await capture(e);
    patches.forEach((mesh) => {mesh.userData.outlineMode = 'silhouette-only';});
    e.renderFrame(0, 30); const seam = await capture(e);
    console.log('AUDIT_IMAGE:' + JSON.stringify({name: `${kind}-full`, png: full.png}));
    console.log('AUDIT_IMAGE:' + JSON.stringify({name: `${kind}-silhouette`, png: seam.png}));
    record(`${kind} seam suppression`, full.dark > seam.dark && seam.dark > 0, {fullInkPixels: full.dark, silhouetteInkPixels: seam.dark, fullHash: full.hash, silhouetteHash: seam.hash});
    e.dispose();
  }
  {
    const e = make(neutral);
    e.scene.add(SDK.box({width: 1.4, height: 1.4, depth: 0.3, material: basic(), outlineMode: 'none'}), SDK.box({width: 0.7, height: 0.7, depth: 0.3, position: [0.3, 0, 0.5], material: basic(), outlineMode: 'none'}));
    await e.prepare(); e.renderFrame(0, 30); const result = await capture(e);
    record('none policy produces no ink', result.dark === 0, {darkPixels: result.dark});
    console.log('AUDIT_IMAGE:' + JSON.stringify({name: 'none-intersection', png: result.png})); e.dispose();
  }
  {
    const e = make(neutral);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 32, 32); ctx.clearRect(8, 8, 16, 16);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = SDK.plane({width: 1.5, height: 1.5, material: new THREE.MeshBasicMaterial({map: tex, alphaTest: 0.5})}); e.scene.add(mesh);
    await e.prepare(); e.renderFrame(0, 30);
    const value = new Uint8Array(4); e.renderer.readRenderTargetPixels(e.normalDepthRenderTarget, 160, 160, 1, 1, value);
    record('alpha cutout G-buffer matches beauty', value[0] === 0 && value[1] === 0 && value[2] === 0, {transparentHoleNormalPixel: [...value]});
    const cutoutMaterial=mesh.material as THREE.MeshBasicMaterial;
    cutoutMaterial.map=null;cutoutMaterial.needsUpdate=true;await e.prepare();e.renderFrame(0,30);
    e.registerReady(Promise.resolve().then(()=>{cutoutMaterial.map=tex;cutoutMaterial.needsUpdate=true;}));
    await e.prepare();e.renderFrame(0,30);e.renderer.readRenderTargetPixels(e.normalDepthRenderTarget,160,160,1,1,value);
    record('late alpha-mask assignment refreshes buffer shader',value.slice(0,3).every((v)=>v===0),{hole:[...value]});
    const result = await capture(e); console.log('AUDIT_IMAGE:' + JSON.stringify({name: 'alpha-cutout', png: result.png})); e.dispose();
  }
  {
    const e = make(neutral);
    const actor = new THREE.Group(); e.scene.add(actor);
    actor.add(SDK.sphere({radius: 0.85, material: basic('#fedcbd')}));
    await e.prepare(); e.renderFrame(0, 30);
    const before = new Uint8Array(320 * 320 * 4); e.renderer.readRenderTargetPixels(e.normalDepthRenderTarget, 0, 0, 320, 320, before);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#000000';
    for (const x of [20, 44]) {ctx.beginPath(); ctx.arc(x, 26, 5, 0, Math.PI * 2); ctx.fill();}
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    actor.add(SDK.plane({width: 0.8, height: 0.8, position: [0, 0, 0.9], material: new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false}), outlineMode: 'silhouette-only', castShadow: false}));
    await e.prepare(); e.renderFrame(0, 30);
    const after = new Uint8Array(before.length); e.renderer.readRenderTargetPixels(e.normalDepthRenderTarget, 0, 0, 320, 320, after);
    record('transparent facial decal introduces no G-buffer seams', before.every((v, i) => v === after[i]), 'Normal buffer unchanged after transparent eyes decal');
    const result = await capture(e); console.log('AUDIT_IMAGE:' + JSON.stringify({name: 'facial-decal', png: result.png})); e.dispose();
  }
  {
    const e = make();
    const canvas = document.createElement('canvas'); canvas.width=canvas.height=16;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,16,16);ctx.fillStyle='#000000';ctx.fillRect(4,4,8,8);
    const alpha=new THREE.CanvasTexture(canvas);
    const material=new THREE.MeshBasicMaterial({alphaMap:alpha,alphaTest:.5,opacity:.75});
    const mesh=SDK.plane({width:1.5,height:1.5,material});e.scene.add(mesh);
    await e.prepare();e.renderFrame(0,30);
    const value=new Uint8Array(4);e.renderer.readRenderTargetPixels(e.normalDepthRenderTarget,160,160,1,1,value);
    record('alphaMap opacity and shared AO Bokeh depth', value.slice(0,3).every((v)=>v===0) && e.gtaoPass.normalTexture===e.normalDepthRenderTarget.texture && e.bokehPass.materialBokeh.uniforms.tDepth.value===e.normalDepthRenderTarget.depthTexture, {hole:[...value]});
    e.dispose();
  }
  {
    const e = make(neutral); const actor = SDK.sphere({material: basic('#808080'), outlineMode: 'none'}); e.scene.add(actor);
    await e.prepare(); e.renderFrame(0, 30); const bytes = pixel(e); const offset = (160 * 320 + 160) * 4;
    record('single sRGB conversion', Math.abs(bytes[offset] - 128) <= 1, {expected: 128, actual: [...bytes.slice(offset, offset + 4)]});
    const sizes: unknown[] = [];
    for (const [w, h] of [[108, 192], [192, 108], [108, 192]]) {
      e.resize(w, h); e.frameSubjects(actor); e.renderFrame(0, 30);
      sizes.push({w, h, canvas: [e.canvas.width, e.canvas.height], buffer: [e.normalDepthRenderTarget.width, e.normalDepthRenderTarget.height], aspect: e.camera.aspect});
    }
    record('same-instance portrait-landscape resize', sizes.every((value) => {const v = value as {w: number; h: number; canvas: number[]; buffer: number[]; aspect: number}; return v.canvas[0] === v.w * 2 && v.canvas[1] === v.h * 2 && v.buffer[0] === v.w * 2 && v.aspect === v.w / v.h;}), sizes);
    e.dispose();
  }
  {
    const e = make(); await e.prepare();
    e.registerReady(Promise.resolve());
    let blocked=false; try {e.renderFrame(0,30);} catch {blocked=true;}
    await e.prepare();e.renderFrame(0,30);
    const primitives=SDK.createPrimitiveFactory(e), a=primitives.sphere({color:'#ffccaa'}), b=primitives.sphere({color:'#ffccaa',position:[1,0,0]});
    record('post-finalization registration reopens barrier and pooled ownership',blocked && a.geometry===b.geometry && a.material===b.material,{blocked,sharedGeometry:a.geometry===b.geometry,sharedMaterial:a.material===b.material});
    let aborted=0;e.signal.addEventListener('abort',()=>aborted++,{once:true});
    const pending=e.wait(new Promise<void>(()=>{})).then(()=>false,(error:DOMException)=>error.name==='AbortError');
    e.dispose();record('cancellation aborts pending wait',await pending && aborted===1,{aborted});
  }
  {
    const e = make(); let loaded = false; let release!: () => void;
    const asset = new Promise<void>((resolve) => {release = () => {loaded = true; resolve();};});
    const preparing = e.prepare();
    // An explicitly tracked loader can start while fonts/images are being awaited.
    e.registerReady(asset);
    let ready = false; void preparing.then(() => {ready = true;});
    await wait(50);
    record('readiness registration during prepare', !ready && !loaded, {prepareResolvedBeforeTrackedAsset: ready, loaded});
    release(); await preparing; await e.prepare(); e.dispose();
  }
  const cycles: unknown[] = [];
  for (let cycle = 0; cycle < 8; cycle++) {
    const canvas = document.createElement('canvas');
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const add = canvas.addEventListener.bind(canvas); const remove = canvas.removeEventListener.bind(canvas);
    canvas.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); add(type, listener, options);}) as typeof canvas.addEventListener;
    canvas.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {listeners.get(type)?.delete(listener); remove(type, listener, options);}) as typeof canvas.removeEventListener;
    const e = new SDK.CartoonEngine(canvas, 32, 32, {quality: 'high'}); SDK.setupCartoonLighting(e.scene, {shadowMapSize: 64});
    const mesh = SDK.sphere(); e.scene.add(mesh); await e.prepare(); e.renderFrame(0, 30);
    let geometries = 0, materials = 0, textures = 0, targets = 0, cleanup = 0, passMaterials = 0;
    mesh.geometry.addEventListener('dispose', () => geometries++);
    const material = mesh.material as THREE.MeshToonMaterial; material.addEventListener('dispose', () => materials++); material.gradientMap!.addEventListener('dispose', () => textures++);
    const internals = e as unknown as {buffers: {policy: THREE.WebGLRenderTarget; materials: Map<string, THREE.Material>}};
    const bokeh = e.bokehPass as unknown as {_renderTargetDepth: THREE.WebGLRenderTarget; _materialDepth: THREE.Material};
    const targetSet = new Set([e.normalDepthRenderTarget, internals.buffers.policy, e.composer.renderTarget1, e.composer.renderTarget2, e.gtaoPass.gtaoRenderTarget, e.gtaoPass.pdRenderTarget, bokeh._renderTargetDepth]);
    targetSet.forEach((target) => target.addEventListener('dispose', () => targets++));
    const passSet = new Set<THREE.Material>([...internals.buffers.materials.values(), e.gtaoPass.gtaoMaterial, e.gtaoPass.pdMaterial, e.gtaoPass.blendMaterial, e.gtaoPass.copyMaterial, e.gtaoPass.depthRenderMaterial, e.gtaoPass.normalMaterial, bokeh._materialDepth, e.bokehPass.materialBokeh, e.outlinePass.material, e.gradePass.material, e.outputPass.material, e.composer.copyPass.material]);
    passSet.forEach((material) => material.addEventListener('dispose', () => passMaterials++));
    const gl = e.renderer.getContext();
    const programs = e.renderer.info.programs?.map((p) => p.program as WebGLProgram) ?? [];
    e.registerCleanup(() => cleanup++); e.dispose(); e.dispose();
    await wait(30);
    cycles.push({cycle, geometries, materials, textures, targets, expectedTargets: targetSet.size, passMaterials, expectedPassMaterials: passSet.size, cleanup, liveGeometry: e.renderer.info.memory.geometries, liveTextures: e.renderer.info.memory.textures, listeners: [...listeners.values()].reduce((n, set) => n + set.size, 0), retainedProgramRecords: e.renderer.info.programs?.length, contextLost: gl.isContextLost(), driverProgramsLive: programs.filter((program) => gl.isProgram(program)).length});
  }
  record('repeated engine disposal', cycles.every((value) => {const v = value as Record<string, number | boolean>; return v.geometries === 1 && v.materials === 1 && v.textures === 1 && v.targets === v.expectedTargets && v.passMaterials === v.expectedPassMaterials && v.cleanup === 1 && v.liveGeometry === 0 && v.liveTextures === 0 && v.listeners === 0 && v.contextLost && v.driverProgramsLive === 0;}), cycles);
  console.log('AUDIT_RESULTS:' + JSON.stringify(results));
}

const Audit: React.FC = () => <SDK.ThreeCanvas autoFrame={false} initScene={engineAudit} />;

const PendingUnmount: React.FC = () => {
  const [mounted, setMounted] = useState(true);
  const state = useRef<{engine?: SDK.CartoonEngine; disposals: number}>({disposals: 0});
  useLayoutEffect(() => {
    const gate = delayRender('audit unmount with pending asset');
    const remove = setTimeout(() => setMounted(false), 80);
    const inspect = setTimeout(() => {
      const result = {pass: state.current.disposals > 0, disposals: state.current.disposals, contextStillLive: state.current.engine ? !state.current.engine.renderer.getContext().isContextLost() : null};
      console.log('AUDIT_PENDING_UNMOUNT:' + JSON.stringify(result)); continueRender(gate);
    }, 250);
    return () => {clearTimeout(remove); clearTimeout(inspect); continueRender(gate);};
  }, []);
  return mounted ? <SDK.ThreeCanvas initScene={(e) => {
    state.current.engine = e;
    const dispose = e.dispose.bind(e); e.dispose = () => {state.current.disposals++; dispose();};
    e.scene.add(SDK.sphere()); e.registerReady(new Promise(() => {}));
  }} /> : null;
};

const Failure: React.FC = () => <SDK.ThreeCanvas initScene={(e) => {
  e.registerReady(Promise.reject(new Error('AUDIT_EXPECTED_ASSET_FAILURE')));
}} />;

const BridgeOrder: React.FC<{mode?: 'static' | 'dynamic'}> = ({mode}) => {
  const order = [0, 80, 20, 80, 0];
  const [request, setRequest] = useState(0);
  const records = useRef<{instance: number; frame: number; hash: string}[]>([]);
  const gate = useRef<number | null>(null);
  useLayoutEffect(() => {gate.current = delayRender('audit actual bridge frame order'); return () => {if (gate.current !== null) continueRender(gate.current);};}, []);
  const instance = Math.floor(request / order.length), frame = order[request % order.length];
  return <Sequence from={-frame} durationInFrames={1000}><SDK.ThreeCanvas key={instance} autoFrame={mode ?? true}
    framingSubjects={mode==='static'?()=>new THREE.Box3(new THREE.Vector3(-2,-1,-1),new THREE.Vector3(2,1,1)):undefined}
    initScene={(e) => {
      e.scene.add(SDK.sphere({radius: 0.65, color: '#fedcbd', name: 'moving'}));
      const render = e.renderFrame.bind(e);
      e.renderFrame = (frame, fps) => {
        render(frame, fps);
        void capture(e).then(({hash}) => {
          records.current.push({instance, frame, hash});
          if (records.current.length < 10) setRequest((value) => value + 1);
          else {
            const pass = [0, 20, 80].every((f) => new Set(records.current.filter((v) => v.frame === f).map((v) => v.hash)).size === 1);
            console.log('AUDIT_BRIDGE_ORDER:' + JSON.stringify({pass, order: records.current}));
            if (gate.current !== null) continueRender(gate.current);
          }
        });
      };
    }}
    onFrame={({engine, frame}) => {
      const actor = engine.scene.getObjectByName('moving')!;
      actor.position.x = Math.sin(frame / 30) * 1.3; actor.rotation.y = frame / 60;
    }}
  /></Sequence>;
};

/** Repeat renders while asynchronous assets are pending, including StrictMode setup/cleanup. */
const Lifecycle: React.FC = () => {
  const {fontUrl} = getInputProps() as {fontUrl: string};
  const [font] = useState(() => {
    const face = new FontFace('AuditDelayed', `url("${fontUrl}")`);
    document.fonts.add(face);
    return face;
  });
  const [tick, setTick] = useState(0);
  const state = useRef({assets: false, fonts: false, captures: 0});
  useLayoutEffect(() => {
    const gate = delayRender('audit lifecycle rerenders');
    const timer = setInterval(() => setTick((value) => value + 1), 15);
    const end = setTimeout(() => { clearInterval(timer); continueRender(gate); }, 300);
    return () => {clearInterval(timer); clearTimeout(end); continueRender(gate);};
  }, []);
  return <SDK.ThreeCanvas fonts={['24px AuditDelayed']} autoFrame={false}
    initScene={async (e) => {
      state.current.fonts = document.fonts.status === 'loaded' && document.fonts.check('24px AuditDelayed') && font.status === 'loaded';
      e.registerReady(wait(120).then(() => {state.current.assets = true; e.scene.add(SDK.sphere());}));
      console.log('AUDIT_INIT');
    }}
    onFrame={async () => {
      if (!state.current.assets || !state.current.fonts) throw new Error('Bridge captured before readiness');
      await wait(10); state.current.captures++;
      console.log('AUDIT_LIFECYCLE:' + JSON.stringify({tick, ...state.current, handles: (window as unknown as {remotion_delayRenderHandles: number[]}).remotion_delayRenderHandles.length}));
    }} />;
};

registerRoot(() => <>
  <Composition id="Phase1Audit" component={Audit} width={320} height={320} fps={30} durationInFrames={100} />
  <Composition id="Phase1Lifecycle" component={() => <StrictMode><Lifecycle /></StrictMode>} width={320} height={320} fps={30} durationInFrames={100} />
  <Composition id="Phase1BridgeOrder" component={BridgeOrder} width={320} height={320} fps={30} durationInFrames={100} />
  <Composition id="Phase1BridgeStatic" component={()=><BridgeOrder mode='static'/>} width={320} height={320} fps={30} durationInFrames={100} />
  <Composition id="Phase1PendingUnmount" component={PendingUnmount} width={320} height={320} fps={30} durationInFrames={100} />
  <Composition id="Phase1Failure" component={Failure} width={320} height={320} fps={30} durationInFrames={100} />
</>);
