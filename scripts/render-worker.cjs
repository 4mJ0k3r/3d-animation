'use strict';
// Started only by render.cjs, after the private scratch environment is installed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn,execFileSync} = require('node:child_process');
const {productionPolicy: policy} = require('./render-policy.cjs');
const job = JSON.parse(fs.readFileSync(process.argv[2]));
const scratch = process.env.TOON_SCRATCH;
if (!scratch || !path.isAbsolute(scratch) || os.tmpdir() !== scratch || !['TMP','TEMP','TMPDIR'].every((key) => process.env[key] === scratch)) throw new Error('Workspace temp bootstrap missing');
const report = {node:process.version,platform:process.platform,temp:os.tmpdir(),environment:{TMPDIR:process.env.TMPDIR,TMP:process.env.TMP,TEMP:process.env.TEMP},versions:{},frames:[],renderer:[],runs:[],policy};
const quantile = (values,p) => {if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(p*sorted.length)-1];};
let cancelCapture = () => {};
const onBrowserLog = ({text,type}) => {
  if (text.startsWith('TOON_FRAME:')) report.frames.push(JSON.parse(text.slice(11)));
  else if (text.startsWith('TOON_RENDERER:')) {const info=JSON.parse(text.slice(14));report.renderer.push(info);if(!/swiftshader/i.test(info.renderer)) {report.error='Selected backend did not produce SwiftShader: '+info.renderer; cancelCapture();}}
  else if (text.startsWith('AUDIT_')) console.log(text);
  else if (type === 'error') console.error(text);
};
async function main() {
  report.versions = Object.fromEntries(['remotion','@remotion/renderer','@remotion/bundler','three','react','typescript'].map((name)=>[name,JSON.parse(fs.readFileSync(path.resolve('node_modules',name,'package.json'))).version]));
  if (job.mode === 'cli') {
    const args = [path.resolve('node_modules/@remotion/cli/remotion-cli.js'), 'render', job.entry || 'src/toon-kit-tests/software.tsx', job.composition || 'SoftwarePortrait', path.resolve(job.output || 'out/software-cli.mp4'),
      '--concurrency=1',`--gl=${job.backend}`,`--timeout=${policy.timeout}`,'--disallow-parallel-encoding','--hardware-acceleration=disable',
      `--offthreadvideo-cache-size-in-bytes=${policy.offthreadVideoCacheSizeInBytes}`,`--media-cache-size-in-bytes=${policy.mediaCacheSizeInBytes}`,
      '--codec=h264','--x264-preset=veryfast','--log=verbose',`--props=${JSON.stringify({...job.inputProps,quality:job.quality})}`];
    if(job.width)args.push(`--width=${job.width}`);if(job.height)args.push(`--height=${job.height}`);if(job.frames)args.push(`--frames=0-${job.frames-1}`);
    report.cliArguments=args;
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe'],windowsHide:true,env:process.env});
      let lines='';
      const inspect=(chunk)=>{
        lines+=chunk.toString(); const complete=lines.split('\n'); lines=complete.pop();
        for(const line of complete) {
          const match=/TOON_RENDERER:(\{.*\})/.exec(line);
          if(match) try {
            const info=JSON.parse(match[1]); report.renderer.push(info);
            if(!/swiftshader/i.test(info.renderer)){report.error='CLI backend did not produce SwiftShader';child.kill();}
          }catch{}
        }
      };
      child.stdout.on('data',(chunk)=>{process.stdout.write(chunk);inspect(chunk);});
      child.stderr.on('data',(chunk)=>{process.stderr.write(chunk);inspect(chunk);});
      child.once('error',reject);child.once('exit',(code)=>code===0?resolve():reject(new Error(`CLI exit ${code}`)));
    });
    if(!report.renderer.length)throw new Error('CLI did not verify a Toon-Kit software renderer');
    return;
  }
  if (job.mode === 'audit') {
    process.env.TOON_AUDIT_OUT = path.resolve(job.output || 'out/phase1.1-audit');
    // Audit runner opens one browser and awaits all compositions before closing it.
    require('../src/toon-kit-tests/run-audit.cjs');
    return;
  }
  const {bundle} = require('@remotion/bundler');
  const {openBrowser,selectComposition,renderMedia,makeCancelSignal,RenderInternals} = require('@remotion/renderer');
  const {cancelSignal,cancel} = makeCancelSignal(); cancelCapture = cancel;
  // Verified against renderer 4.0.539; report the actual bundled binary, not PATH ffmpeg.
  const ffmpeg = RenderInternals.getExecutablePath({type:'ffmpeg',binariesDirectory:null,indent:false,logLevel:'error'});
  report.ffmpeg = {path:ffmpeg,version:execFileSync(ffmpeg,['-version'],{encoding:'utf8',windowsHide:true}).split('\n')[0]};
  const entry = path.resolve(job.entry || 'src/toon-kit-tests/software.tsx');
  const serveUrl = await bundle({entryPoint:entry,outDir:path.join(scratch,'bundle'),enableCaching:false});
  const browser = await openBrowser('chrome',{chromiumOptions:{gl:job.backend,enableMultiProcessOnLinux:false}});
  try {
    const variants = job.mode === 'benchmark' ? ['base','ao','bokeh','no-shadows'] : [job.inputProps?.variant || 'base'];
    for (const variant of variants) {
      const inputProps = {...job.inputProps,quality:job.quality,variant};
      const composition = await selectComposition({serveUrl,id:job.composition || 'SoftwarePortrait',inputProps,puppeteerInstance:browser,timeoutInMilliseconds:policy.timeout,chromiumOptions:{gl:job.backend}});
      if(job.width) composition.width=job.width; if(job.height)composition.height=job.height;
      const frames = job.frames || (job.mode==='benchmark'?12:24);
      if(!Number.isInteger(frames)||frames<1||frames>composition.durationInFrames) throw new Error('Invalid frame count');
      const output = path.resolve(job.output ? (variants.length===1?job.output:job.output.replace(/\.mp4$/,`-${variant}.mp4`)) : `out/phase1.1/${job.backend}-${job.quality}-${composition.width}x${composition.height}-${variant}.mp4`);
      fs.mkdirSync(path.dirname(output),{recursive:true});
      const start=performance.now(), first=report.frames.length;
      const progress=[]; let rendered=0, previous=start;
      await renderMedia({serveUrl,composition,inputProps,outputLocation:output,codec:'h264',x264Preset:'veryfast',pixelFormat:'yuv420p',
        frameRange:[0,frames-1],concurrency:1,cancelSignal,puppeteerInstance:browser,chromiumOptions:{gl:job.backend,enableMultiProcessOnLinux:false},
        timeoutInMilliseconds:policy.timeout,disallowParallelEncoding:true,hardwareAcceleration:'disable',
        mediaCacheSizeInBytes:policy.mediaCacheSizeInBytes,offthreadVideoCacheSizeInBytes:policy.offthreadVideoCacheSizeInBytes,
        onBrowserLog,onProgress:({renderedFrames})=>{if(renderedFrames>rendered){const now=performance.now();progress.push((now-previous)/(renderedFrames-rendered));previous=now;rendered=renderedFrames;}},
        ffmpegOverride:({args}) => {report.ffmpegArguments=args;return [...args.slice(0,-1),'-threads','2',args.at(-1)];},
      });
      const samples=report.frames.slice(first).filter((v)=>v.frame>=2).map((v)=>v.ms);
      report.runs.push({variant,output,width:composition.width,height:composition.height,frames,wallMs:performance.now()-start,
        renderFrameMedianMs:quantile(samples,.5),renderFrameP95Ms:quantile(samples,.95),samples:samples.length,
        captureIntervalMedianMs:quantile(progress.slice(2),.5),captureIntervalP95Ms:quantile(progress.slice(2),.95)});
      fs.writeFileSync(path.join(scratch,'worker-report.json'),JSON.stringify(report,null,2));
      console.log('BENCHMARK '+JSON.stringify(report.runs.at(-1)));
    }
    if (!report.renderer.length) throw new Error('Software renderer identity was not observed; entry must use Toon-Kit');
  } finally {await browser.close({silent:true});}
}
main().then(()=>{fs.writeFileSync(path.join(scratch,'worker-report.json'),JSON.stringify(report,null,2));}).catch((error)=>{report.error=String(error);fs.writeFileSync(path.join(scratch,'worker-report.json'),JSON.stringify(report,null,2));console.error(error);process.exitCode=1;});
