'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'out','phase2db');
async function main(){
 const mode=process.argv[2];if(process.argv.length>3||(mode!==undefined&&!['audit-only','video-only','portrait-only'].includes(mode)))throw new Error('Use audit-only/video-only/portrait-only or no argument');
 fs.mkdirSync(out,{recursive:true});const all=[['audit',1,1600,900,{}],['interaction',90,1600,900,{verify:false}],['portrait',1,720,1280,{mode:'portrait',index:0,verify:false}],['portrait-casual',1,720,1280,{mode:'portrait',index:3,verify:false}]];
 const jobs=mode==='audit-only'?[all[0]]:mode==='video-only'?[all[1]]:mode==='portrait-only'?all.slice(2):all;
 for(const [name,frames,width,height,inputProps]of jobs){
  const reportPath=path.join(out,name+'-report.json'),video=path.join(out,name+'.mp4'),logPath=path.join(out,name+'.log'),fd=fs.openSync(logPath,'w');
  try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(__dirname,'render.cjs'),'--entry=src/toon-kit-tests/appearance.tsx','--composition=AppearanceValidation',`--frames=${frames}`,`--width=${width}`,`--height=${height}`,`--inputProps=${JSON.stringify(inputProps)}`,`--output=${video}`,`--report=${reportPath}`],{cwd:root,stdio:['ignore',fd,fd],windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(name+' failed; inspect '+logPath)));});}finally{fs.closeSync(fd);}
  const r=JSON.parse(fs.readFileSync(reportPath));if(!r.worker?.renderer?.length||r.worker.renderer.some(r=>!/swiftshader/i.test(r.renderer)))throw new Error('SwiftShader not verified');console.log('APPEARANCE_VIDEO '+name+' '+JSON.stringify(r.worker.runs));
  const log=fs.readFileSync(logPath,'utf8'),read=prefix=>{const line=log.split('\n').find(l=>l.startsWith(prefix));if(!line)throw new Error('Missing '+prefix);return line.slice(prefix.length);};
  if(name==='audit'){
   const results=JSON.parse(read('AUDIT_APPEARANCE_RESULTS:'));if(results.length!==34||results.some(r=>!r.pass))throw new Error('Appearance assertions missing or failed');
   for(const [p,n]of [['AUDIT_APPEARANCE_SHEET_0:','front'],['AUDIT_APPEARANCE_SHEET_1:','three-quarter'],['AUDIT_APPEARANCE_SHEET_2:','side'],['AUDIT_APPEARANCE_HEADS:','heads']])fs.writeFileSync(path.join(out,n+'.png'),Buffer.from(read(p),'base64'));
   fs.writeFileSync(path.join(out,'validation-results.json'),JSON.stringify({results,counts:JSON.parse(read('AUDIT_APPEARANCE_COUNTS:')),baseline:JSON.parse(read('AUDIT_APPEARANCE_BASELINE:')),costs:JSON.parse(read('AUDIT_APPEARANCE_COSTS:'))},null,2));console.log('APPEARANCE_ASSERTIONS '+results.length+' passed');
  }
  // Decoder process and its imports use private workspace scratch too.
  const base=path.join(root,'.remotion-tmp');if(fs.realpathSync(base)!==base)throw new Error('Redirected scratch root');
  const id=crypto.randomUUID(),scratch=path.join(base,'appearance-extract-'+id);fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'owner.json'),JSON.stringify({id}));const old=Object.fromEntries(['TMPDIR','TMP','TEMP'].map(k=>[k,process.env[k]]));
  try{for(const k of Object.keys(old))process.env[k]=scratch;
   const {RenderInternals}=require('@remotion/renderer'),ffmpeg=RenderInternals.getExecutablePath({type:'ffmpeg',binariesDirectory:null,indent:false,logLevel:'error'});
   const args=['-hide_banner','-loglevel','error','-y','-threads','2',...(name==='interaction'?['-ss','1.5']:[]),'-i',video,'-frames:v','1','-threads','1',path.join(out,name+'.png')];
   execFileSync(ffmpeg,args,{cwd:root,env:{...process.env,TMPDIR:scratch,TMP:scratch,TEMP:scratch},windowsHide:true});
  }finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}if(path.dirname(scratch)===base&&fs.realpathSync(scratch)===scratch&&JSON.parse(fs.readFileSync(path.join(scratch,'owner.json'))).id===id)fs.rmSync(scratch,{recursive:true,maxRetries:5,retryDelay:100});}
 }
}
async function run(){const base=path.join(root,'.remotion-tmp');fs.mkdirSync(base,{recursive:true});if(fs.realpathSync(base)!==base)throw new Error('Redirected scratch root');if(fs.existsSync(path.join(base,'active.lock')))throw new Error('Production job active; run verification serially');const lock=path.join(base,'appearance-validation.lock'),id=crypto.randomUUID(),fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({id,pid:process.pid}));try{await main();}finally{fs.closeSync(fd);if(JSON.parse(fs.readFileSync(lock)).id===id)fs.unlinkSync(lock);}}
run().catch(e=>{console.error(e);process.exitCode=1;});
