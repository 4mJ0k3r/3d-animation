'use strict';
// Isolated fault injection. No production flag/env override can spoof MemAvailable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const memory = require('../linux-memory.cjs');
const realFactory = memory.createMemoryGuard;
const mode = process.argv[2];
let reads = 0, launches = 0, childPid, grandchildPid;
memory.createMemoryGuard = (policy) => realFactory(policy, {platform:'linux', readText:() => {
  reads++;
  return `MemAvailable: ${mode==='admission' || reads > 1 ? 512*1024 : 3*1024*1024} kB\n`;
}});
const originalSpawn = cp.spawn;
cp.spawn = (executable, args, options) => {
  if (args[0] !== path.resolve(__dirname,'../render-worker.cjs')) return originalSpawn(executable,args,options);
  launches++;
  // Exercise the real launcher, monitor and tree cleanup, without allocating
  // dangerous memory or booting Chrome just to simulate host reclamation.
  const code = `const fs=require('fs'),cp=require('child_process');
    const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
    fs.writeFileSync(process.env.TOON_SCRATCH+'/probe.json',JSON.stringify({pid:process.pid,child:child.pid}));
    setInterval(()=>{},1000);`;
  const child = originalSpawn(executable, ['-e', code], options);
  childPid = child.pid;
  const probe = path.join(options.env.TOON_SCRATCH,'probe.json');
  const poll = setInterval(()=>{try {grandchildPid=JSON.parse(fs.readFileSync(probe)).child;}catch{}},20);
  child.once('exit',()=>clearInterval(poll));
  return child;
};
const {runProductionRender} = require('../render.cjs');
const root = path.resolve(__dirname,'../..');
const report = path.join(root,`out/phase1.3/memory-${mode}-test.json`);
function alive(pid) {
  if(!pid)return false;
  try {
    process.kill(pid,0);
    // A killed Linux process awaiting reaping no longer owns render resources.
    if(process.platform==='linux' && /^State:\s+[ZX]/m.test(fs.readFileSync(`/proc/${pid}/status`,'utf8')))return false;
    return true;
  }catch{return false;}
}
(async()=>{
  assert(['admission','abort'].includes(mode));
  await assert.rejects(runProductionRender({report}),mode==='admission'?/below the 2.50 GiB/:/Low-memory abort/);
  const result=JSON.parse(fs.readFileSync(report));
  if(mode==='admission') {
    assert.equal(launches,0);assert.equal(result.launched,false);assert.equal(result.admission.admitted,false);
  } else {
    assert.equal(launches,1);
    assert.match(result.stats.limitExceeded,/Low-memory abort/);
    assert.equal(result.stats.samples.at(-1).memory.lowSamples,3);
    assert.equal(fs.existsSync(result.scratch),false);
    assert.equal(fs.existsSync(path.join(root,'.remotion-tmp/active.lock')),false);
    assert.equal(alive(childPid),false);
    assert.ok(grandchildPid,'dummy descendant started');
    assert.equal(alive(grandchildPid),false);
  }
  console.log('PASS simulated Linux '+mode+'; '+JSON.stringify({launches,reads,childPid}));
})().catch((error)=>{console.error(error);process.exitCode=1;});
