'use strict';
// Bounded visual verification, always through the guarded production launcher.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'out','phase6b');
async function main(){
  const mode=process.argv[2]??'all';
  if(!['all','garden','stills'].includes(mode))throw Error('Use all, garden or stills');
  fs.mkdirSync(out,{recursive:true});
  if(mode==='all')await require('./story.cjs').runAuthoredStory({command:'render',plan:'examples/custom-school.story.json',output:'out/phase6b/school.mp4',report:'out/phase6b/school-report.json',verify:true});
  if(mode!=='stills')await require('./render.cjs').runProductionRender({entry:'src/index.ts',composition:'AuthoredStory',frames:3,width:720,height:1280,output:'out/phase6b/garden-sample.mp4',report:'out/phase6b/garden-report.json',inputProps:{document:JSON.parse(fs.readFileSync(path.join(root,'examples/custom-garden.story.json'),'utf8')),verify:true}});
  const base=path.join(root,'.remotion-tmp');fs.mkdirSync(base,{recursive:true});
  if(fs.realpathSync(base)!==base||fs.existsSync(path.join(base,'active.lock'))||fs.existsSync(path.join(base,'authoring.lock')))throw Error('Wait for active rendering; use an ordinary workspace temp root');
  const scratch=fs.mkdtempSync(path.join(base,'construction-extract-')),env={...process.env,TMPDIR:scratch,TMP:scratch,TEMP:scratch};
  try{
    const ffmpeg=JSON.parse(fs.readFileSync(path.join(out,'school-report.json'))).worker.ffmpeg.path;
    for(const [video,frames]of [['school',[0,45,75]],['garden-sample',[0]]])for(const frame of frames)cp.execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-threads','1','-ss',String(frame/30),'-i',path.join(out,video+'.mp4'),'-frames:v','1','-threads','1','-y',path.join(out,video+'-'+frame+'.png')],{cwd:root,env,windowsHide:true,stdio:'inherit'});
    const info=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height,nb_frames,duration','-of','json',path.join(out,'school.mp4')],{cwd:root,env,windowsHide:true,encoding:'utf8'}));
    if(info.streams[0].nb_frames!=='90'||Number(info.streams[0].duration)!==3)throw Error('Unexpected school duration/frame count');
    console.log('CONSTRUCTION_VIDEO '+JSON.stringify(info));
  }finally{
    if(path.dirname(scratch)!==base||fs.realpathSync(scratch)!==scratch||!path.basename(scratch).startsWith('construction-extract-'))throw Error('Unsafe owned scratch path');
    fs.rmSync(scratch,{recursive:true,maxRetries:5,retryDelay:100});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
