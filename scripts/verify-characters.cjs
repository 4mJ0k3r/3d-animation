'use strict';
// Rendering always goes through the unchanged production admission/monitor/worker launcher.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync,spawn} = require('node:child_process');
async function main() {
  const contacts=process.argv[2]==='contacts';
  if(process.argv.length>2&&!contacts)throw new Error('Only the optional contacts validation mode is supported');
  const stage=contacts?'phase2b':'phase2a',prefix=contacts?'AUDIT_CONTACT':'AUDIT_CHARACTER';
  const root = path.resolve(__dirname,'..'), out = path.join(root,'out',stage);
  const job={entry:contacts?'src/toon-kit-tests/contacts.tsx':'src/toon-kit-tests/characters.tsx',composition:contacts?'ContactValidation':'CharacterValidation',
    frames:contacts?90:3,width:contacts?1600:1280,height:contacts?900:720,output:`out/${stage}/views.mp4`,report:`out/${stage}/production-report.json`};
  let results, counts;
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(__dirname,'render.cjs'),...Object.entries(job).map(([key,value])=>`--${key}=${value}`)],
      {cwd:root,windowsHide:true,stdio:['ignore','pipe','inherit']});
    let pending='';
    child.stdout.on('data',(chunk)=>{
      process.stdout.write(chunk);pending+=chunk.toString();const lines=pending.split('\n');pending=lines.pop();
      for(const raw of lines) {
        const line=raw.trim();
        if(line.startsWith(prefix+'_RESULTS:'))results=JSON.parse(line.slice((prefix+'_RESULTS:').length));
        if(line.startsWith(prefix+'_COUNTS:'))counts=JSON.parse(line.slice((prefix+'_COUNTS:').length));
      }
    });
    child.once('error',reject);child.once('exit',(code)=>code===0?resolve():reject(new Error(`Character verification exited ${code}`)));
  });
  if(!Array.isArray(results)||results.length!==(contacts?42:27)||results.some((result)=>!result.pass)||!Array.isArray(counts))throw new Error('Character GPU assertion evidence missing or failed');
  const report=path.join(root,job.report);
  const data = JSON.parse(fs.readFileSync(report));
  if (!data.worker?.renderer?.length || data.worker.renderer.some((info) => !/swiftshader/i.test(info.renderer))) throw new Error('SwiftShader verification absent');
  // Extract only three owned output frames. No browser or raw renderMedia bypass.
  const base = path.join(root,'.remotion-tmp');
  if(fs.realpathSync(base)!==path.resolve(base))throw new Error('Scratch root must not be redirected');
  const id=crypto.randomUUID(),scratch=path.join(base,`character-extract-${id}`);
  fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'owner.json'),JSON.stringify({id}));
  const previousTemp=Object.fromEntries(['TMPDIR','TMP','TEMP'].map((key)=>[key,process.env[key]]));
  try {
    // Install private temp paths before even importing Remotion in this process.
    for(const key of Object.keys(previousTemp))process.env[key]=scratch;
    const {RenderInternals}=require('@remotion/renderer');
    const ffmpeg=RenderInternals.getExecutablePath({type:'ffmpeg',binariesDirectory:null,indent:false,logLevel:'error'});
    const ffmpegOptions={cwd:root,windowsHide:true,env:{...process.env,TMPDIR:scratch,TMP:scratch,TEMP:scratch}};
    if(contacts) {
      // The pinned compositor FFmpeg omits select-filter options. Accurate
      // decoder seeks capture CFR frames 0/30/60 without optional filters.
      for(let index=0;index<3;index++)execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-threads','2',
        '-ss',String(index),'-i',path.join(out,'views.mp4'),'-frames:v','1','-threads','1',path.join(out,`view-${index+1}.png`)],ffmpegOptions);
    }else execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-threads','2','-i',path.join(out,'views.mp4'),
      '-frames:v','3','-threads','1',path.join(out,'view-%01d.png')],ffmpegOptions);
    ['front','three-quarter','side'].forEach((name,index)=>fs.renameSync(path.join(out,`view-${index+1}.png`),path.join(out,`${name}.png`)));
    const images=['front','three-quarter','side'].map((name)=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,`${name}.png`))).digest('hex')}));
    fs.writeFileSync(path.join(out,'validation-results.json'),JSON.stringify({results,counts,images,source:contacts?
      'Screenshots extracted at 0/1/2 seconds of the production H.264 video; determinism compares raw RGBA and direct canvas PNG bytes before video encoding':
      'PNG frames extracted from the production H.264 validation video; determinism hashes above use raw RGBA before encoding'},null,2));
  }finally {
    for(const [key,value] of Object.entries(previousTemp)) {
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    const marker=path.join(scratch,'owner.json');
    if(fs.existsSync(marker)&&JSON.parse(fs.readFileSync(marker)).id===id&&fs.realpathSync(scratch)===path.resolve(scratch)&&path.dirname(scratch)===base)
      fs.rmSync(scratch,{recursive:true,maxRetries:5,retryDelay:100});
  }
  console.log('CHARACTER_VIEWS '+out);
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
