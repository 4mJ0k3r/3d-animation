'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {parseMemAvailable,createMemoryGuard} = require('../linux-memory.cjs');
const {productionPolicy:policy} = require('../render-policy.cjs');
const GiB=1024**3;
const guard = (values) => {let i=0;return createMemoryGuard(policy,{platform:'linux',readText:()=>{
  const value=values[Math.min(i++,values.length-1)];
  if(value instanceof Error)throw value;
  return `MemTotal: 9000000 kB\nMemAvailable: ${value/1024} kB\n`;
}});};
test('strict meminfo parsing; never use MemFree as MemAvailable',()=>{
  assert.equal(parseMemAvailable('MemFree: 1 kB\nMemAvailable: 2621440 kB\n'),2.5*GiB);
  assert.equal(parseMemAvailable('MemAvailable: 0 kB\n'),0);
  for(const value of ['MemFree: 9999999 kB','MemAvailable: -1 kB','MemAvailable: 5 MB'])assert.throws(()=>parseMemAvailable(value));
});
test('admission refuses below threshold, accepts equality, fails closed on telemetry loss',()=>{
  assert.equal(guard([2*GiB]).admission().admitted,false);
  assert.equal(guard([2.5*GiB]).admission().admitted,true);
  assert.equal(guard([new Error('unreadable')]).admission().admitted,false);
});
test('three consecutive low samples; recovery resets count',()=>{
  const g=guard([.5*GiB,2*GiB,.5*GiB,.5*GiB,.5*GiB]);
  assert.deepEqual(Array.from({length:5},()=>g.observe()).map((s)=>[s.lowSamples,s.abort]),[[1,false],[0,false],[1,false],[2,false],[3,true]]);
});
test('missing telemetry is explicit, does not fabricate zero, aborts after two failures',()=>{
  const g=guard([new Error('gone'),new Error('gone')]);
  const first=g.observe();assert.equal(first.availableBytes,null);assert.equal(first.abort,false);
  assert.equal(g.observe().abort,true);
});
test('non-Linux telemetry is explicitly unavailable',()=>{
  const g=createMemoryGuard(policy,{platform:'win32'});
  assert.equal(g.admission().enforced,false);assert.equal(g.observe().availableBytes,null);
});
for(const mode of ['admission','abort'])test('launcher '+mode+' integration with simulated Linux telemetry',()=>{
  const result=spawnSync(process.execPath,[path.join(__dirname,'memory-process.cjs'),mode],{cwd:path.resolve(__dirname,'../..'),windowsHide:true,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
