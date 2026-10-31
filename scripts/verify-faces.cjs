'use strict';
// Every render passes through the unchanged production launcher; never launch a second browser.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'out','phase2da');
async function main(){
 if(process.argv.length>3||(process.argv[2]!==undefined&&!['portrait-only','expressions-only','demo-only'].includes(process.argv[2])))throw new Error('Only portrait-only/expressions-only/demo-only is supported');
 fs.mkdirSync(out,{recursive:true});
 const portrait=['portrait',84,{mode:'portrait',high:true,verify:false}];
 const all=[['expressions',14,{mode:'sheet'}],['gaze',19,{mode:'gaze',verify:false}],['demo',180,{mode:'demo',verify:false}],['interaction',60,{mode:'interaction',verify:false}],['closeup-512',1,{mode:'sheet',high:true,verify:false}],portrait];
 const jobs=process.argv[2]==='portrait-only'?[portrait]:process.argv[2]==='expressions-only'?[all[0]]:process.argv[2]==='demo-only'?[all[2]]:all;
 for(const [name,frames,inputProps]of jobs){
  const reportPath=path.join(out,name+'-report.json'),video=path.join(out,name+'.mp4');
  // Keep machine-readable assertion evidence from the worker's console.
  const log=fs.openSync(path.join(out,name+'.log'),'w');
  try{await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(__dirname,'render.cjs'),'--entry=src/toon-kit-tests/faces.tsx','--composition=FaceValidation',`--frames=${frames}`,`--width=${name==='portrait'?720:1080}`,`--height=${name==='portrait'?1280:720}`,`--inputProps=${JSON.stringify(inputProps)}`,`--output=${video}`,`--report=${reportPath}`],{cwd:root,stdio:['ignore',log,log],windowsHide:true});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(name+' render failed; inspect '+path.join(out,name+'.log'))));
  });}finally{fs.closeSync(log);}
  const report=JSON.parse(fs.readFileSync(reportPath));
  if(report.worker?.renderer?.some(r=>!/swiftshader/i.test(r.renderer))||!report.worker?.renderer?.length)throw new Error('SwiftShader verification absent');
  console.log('FACE_VIDEO '+name+' '+JSON.stringify(report.worker.runs));
  // Extraction has its own verified workspace scratch, installed before Remotion import/FFmpeg.
  const base=path.join(root,'.remotion-tmp');if(fs.realpathSync(base)!==path.resolve(base))throw new Error('Redirected scratch root');
  const id=crypto.randomUUID(),scratch=path.join(base,'face-extract-'+id);fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'owner.json'),JSON.stringify({id}));
  const old=Object.fromEntries(['TMPDIR','TMP','TEMP'].map(k=>[k,process.env[k]]));
  try{
   for(const k of Object.keys(old))process.env[k]=scratch;
   const {RenderInternals}=require('@remotion/renderer');const ffmpeg=RenderInternals.getExecutablePath({type:'ffmpeg',binariesDirectory:null,indent:false,logLevel:'error'});
   const directory=path.join(out,name);fs.mkdirSync(directory,{recursive:true});
   const args=['-hide_banner','-loglevel','error','-y','-threads','2',...(name==='portrait'?['-ss','0.8']:[]),'-i',video,'-frames:v',String(name==='expressions'||name==='gaze'?frames:1),'-threads','1',path.join(directory,'%02d.png')];
   execFileSync(ffmpeg,args,{cwd:root,env:{...process.env,TMPDIR:scratch,TMP:scratch,TEMP:scratch},windowsHide:true});
  }finally{
   for(const [k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
   if(path.dirname(scratch)===base&&fs.realpathSync(scratch)===scratch&&JSON.parse(fs.readFileSync(path.join(scratch,'owner.json'))).id===id)fs.rmSync(scratch,{recursive:true,maxRetries:5,retryDelay:100});
  }
 }
 if(process.argv[2]==='portrait-only'||process.argv[2]==='demo-only')return;
 const log=fs.readFileSync(path.join(out,'expressions.log'),'utf8'),match=/AUDIT_FACE_RESULTS:(\[[^\n]*\])/.exec(log);
 if(!match)throw new Error('Missing facial assertions');const results=JSON.parse(match[1]);if(results.some(r=>!r.pass))throw new Error('Failed facial assertions');
 fs.writeFileSync(path.join(out,'validation-results.json'),JSON.stringify({results},null,2));console.log('FACE_ASSERTIONS '+results.length+' passed');
 for(const [prefix,name]of [['AUDIT_FACE_SHEET:','contact-sheet.png'],['AUDIT_GAZE_SHEET:','gaze-blink-sheet.png']]){
  const line=log.split('\n').find(line=>line.startsWith(prefix));if(!line)throw new Error('Missing '+name);
  fs.writeFileSync(path.join(out,name),Buffer.from(line.slice(prefix.length).trim(),'base64'));
 }
}
async function run(){
 const base=path.join(root,'.remotion-tmp');fs.mkdirSync(base,{recursive:true});if(fs.realpathSync(base)!==base)throw new Error('Redirected scratch root');
 if(fs.existsSync(path.join(base,'active.lock')))throw new Error('A production render is active; run face verification serially');
 const lock=path.join(base,'faces-validation.lock'),id=crypto.randomUUID(),fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({id,pid:process.pid}));
 try{await main();}finally{fs.closeSync(fd);if(JSON.parse(fs.readFileSync(lock)).id===id)fs.unlinkSync(lock);}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
