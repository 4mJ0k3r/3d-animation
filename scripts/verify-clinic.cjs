'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'out','phase2f');
async function runJob(name,composition,frames,width,height,inputProps={}){
 const video=path.join(out,name+'.mp4'),report=path.join(out,name+'-report.json'),log=path.join(out,name+'.log'),fd=fs.openSync(log,'w');
 try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(__dirname,'render.cjs'),'--entry=src/index.ts',`--composition=${composition}`,`--frames=${frames}`,`--width=${width}`,`--height=${height}`,`--inputProps=${JSON.stringify(inputProps)}`,`--output=${video}`,`--report=${report}`],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(name+' failed; inspect '+log)));});}finally{fs.closeSync(fd);}
 const data=JSON.parse(fs.readFileSync(report));if(!data.worker?.renderer?.length||data.worker.renderer.some(r=>!/swiftshader/i.test(r.renderer)||r.quality!=='software-safe'))throw new Error('Software renderer verification missing');console.log('CLINIC_RENDER '+JSON.stringify(data.worker.runs));
 if(name==='previews'){const text=fs.readFileSync(log,'utf8'),line=text.split('\n').find(l=>l.startsWith('AUDIT_CLINIC_RESULTS:'));if(!line)throw new Error('Missing clinic assertions');const results=JSON.parse(line.slice('AUDIT_CLINIC_RESULTS:'.length));if(results.length!==20||results.some(r=>!r.pass))throw new Error('Clinic GPU assertions failed');fs.writeFileSync(path.join(out,'validation-results.json'),JSON.stringify({results},null,2));}
 if(composition==='DoctorClinicUniversal'){
  if(!data.worker.frames.length)throw new Error('No valid clinic frames captured');
  for(const f of data.worker.frames)if(!f.caption)throw new Error('Missing actual DOM caption');
 }
 const base=path.join(root,'.remotion-tmp');if(fs.realpathSync(base)!==base)throw new Error('Redirected scratch root');const id=crypto.randomUUID(),scratch=path.join(base,'clinic-extract-'+id);fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'owner.json'),JSON.stringify({id}));const previous=Object.fromEntries(['TMPDIR','TMP','TEMP'].map(k=>[k,process.env[k]]));
 try{for(const k of Object.keys(previous))process.env[k]=scratch;const {RenderInternals}=require('@remotion/renderer'),ffmpeg=RenderInternals.getExecutablePath({type:'ffmpeg',binariesDirectory:null,indent:false,logLevel:'error'}),options={cwd:root,env:{...process.env,TMPDIR:scratch,TMP:scratch,TEMP:scratch},windowsHide:true};
  if(name==='previews'){execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-threads','2','-i',video,'-frames:v',String(frames),'-threads','1',path.join(out,'preview-%01d.png')],options);['observe','point','explain','reaction','worried-close','surprised-close','point-close','front','three-quarter'].forEach((n,i)=>fs.renameSync(path.join(out,`preview-${i+1}.png`),path.join(out,n+'.png')));}
  else execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-threads','2','-ss','2','-i',video,'-frames:v','1','-threads','1',path.join(out,name+'.png')],options);
 }finally{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}if(path.dirname(scratch)===base&&fs.realpathSync(scratch)===scratch&&JSON.parse(fs.readFileSync(path.join(scratch,'owner.json'))).id===id)fs.rmSync(scratch,{recursive:true,maxRetries:5,retryDelay:100});}
}
async function main(){
 const mode=process.argv[2];if(process.argv.length>3||(mode!==undefined&&!['previews','720','1080','legacy'].includes(mode)))throw new Error('Use previews/720/1080/legacy or no argument');fs.mkdirSync(out,{recursive:true});
 if(!mode||mode==='previews')await runJob('previews','DoctorClinicUniversal',9,1080,1920,{verify:true,previewFrames:[20,60,100,137,20,137,60,60,60],previewViews:['portrait','portrait','portrait','portrait','close','close','point-close','front','quarter']});
 if(!mode||mode==='720')await runJob('universal-720','DoctorClinicUniversal',150,720,1280);
 if(!mode||mode==='1080')await runJob('universal-1080','DoctorClinicUniversal',150,1080,1920);
 if(!mode||mode==='legacy')await runJob('legacy-720','DoctorClinicAnimation',150,720,1280);
}
async function run(){const base=path.join(root,'.remotion-tmp');fs.mkdirSync(base,{recursive:true});if(fs.realpathSync(base)!==base)throw new Error('Redirected scratch');if(fs.existsSync(path.join(base,'active.lock')))throw new Error('A render is active; run serially');const lock=path.join(base,'clinic-validation.lock'),id=crypto.randomUUID(),fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({id,pid:process.pid}));try{await main();}finally{fs.closeSync(fd);if(JSON.parse(fs.readFileSync(lock)).id===id)fs.unlinkSync(lock);}}
run().catch(e=>{console.error(e);process.exitCode=1;});
