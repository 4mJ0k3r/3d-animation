'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
function bytes(root, errors = []) {
  let total = 0;
  try {for (const item of fs.readdirSync(root, {withFileTypes: true})) {
    const file = path.join(root, item.name);
    if (item.isSymbolicLink()) continue;
    try {total += item.isDirectory() ? bytes(file, errors) : fs.statSync(file).size;} catch (error) {if(error.code!=='ENOENT')errors.push({path:file,code:error.code});}
  }} catch (error) {if(error.code!=='ENOENT')errors.push({path:root,code:error.code});}
  return total;
}
async function processes() {
  if (process.platform === 'win32') return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile','-NonInteractive','-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine | ConvertTo-Json -Compress'], {windowsHide: true, maxBuffer: 4e6}, (error, data) => {
      if (error) return resolve([]);
      try {resolve(JSON.parse(data).map((p) => ({pid:p.ProcessId,ppid:p.ParentProcessId,rss:Number(p.WorkingSetSize),command:p.CommandLine})));} catch {resolve([]);}
    });
  });
  const result = [];
  for (const id of fs.readdirSync('/proc').filter((id) => /^\d+$/.test(id))) try {
    const status = fs.readFileSync(`/proc/${id}/status`, 'utf8');
    result.push({pid:Number(id),ppid:Number(/^PPid:\s+(\d+)/m.exec(status)?.[1]),rss:Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] || 0)*1024,command:fs.readFileSync(`/proc/${id}/cmdline`, 'utf8').replaceAll('\0',' ')});
  } catch {}
  return result;
}
function cgroup() {
  if (process.platform !== 'linux') return null;
  try {
    const group = fs.readFileSync('/proc/self/cgroup','utf8').split('\n').find((line) => line.startsWith('0::')).slice(3);
    const candidate = path.join('/sys/fs/cgroup', group);
    const dir = fs.existsSync(path.join(candidate,'memory.current')) ? candidate : '/sys/fs/cgroup';
    if (!fs.existsSync(path.join(dir,'memory.current'))) return null;
    const read = (name) => {try {return fs.readFileSync(path.join(dir,name),'utf8').trim();} catch {return null;}};
    return {current:Number(read('memory.current')),peak:Number(read('memory.peak')),swapCurrent:Number(read('memory.swap.current')),limit:read('memory.max')};
  } catch {return null;}
}
function monitor(pid, scratch, policy, kill) {
  const stats = {intervalMs:1000,samples:[],peakProcessTreeRSS:0,peakWorkspaceTemporaryBytes:0,peakSystemTmpBytes:process.platform === 'linux' ? 0 : null,peakCgroupBytes:null,commands:[],childTempEnvironments:[],limitExceeded:null};
  const commands = new Set(); let stopped = false; let active = null;
  async function sample() {
    const all = await processes(); const ids = new Set([pid]);
    for (let i = 0; i < all.length; i++) for (const p of all) if (ids.has(p.ppid)) ids.add(p.pid);
    const tree = all.filter((p) => ids.has(p.pid)); const rss = tree.reduce((sum,p) => sum+p.rss,0);
    for (const p of tree) if (p.command && !commands.has(p.command)) {
      commands.add(p.command); stats.commands.push(p.command);
      if (process.platform === 'linux') try {
        const environment = fs.readFileSync(`/proc/${p.pid}/environ`,'utf8').split('\0').filter((v)=>/^(TMPDIR|TMP|TEMP)=/.test(v));
        stats.childTempEnvironments.push({pid:p.pid,environment});
      } catch {}
    }
    const workspaceErrors=[],tmpErrors=[];
    const workspace = bytes(scratch, workspaceErrors), tmp = process.platform === 'linux' ? bytes('/tmp',tmpErrors) : null, cg = cgroup();
    stats.peakProcessTreeRSS = Math.max(stats.peakProcessTreeRSS,rss);
    stats.peakWorkspaceTemporaryBytes = Math.max(stats.peakWorkspaceTemporaryBytes,workspace);
    if (tmp !== null) stats.peakSystemTmpBytes = Math.max(stats.peakSystemTmpBytes,tmp);
    if (cg) stats.peakCgroupBytes = Math.max(stats.peakCgroupBytes || 0,cg.current);
    stats.samples.push({at:Date.now(),processes:tree.length,rss,workspace,tmp,cgroup:cg,workspaceErrors,tmpErrors});
    if (rss > policy.maxProcessBytes || workspace > policy.maxTemporaryBytes || (cg && cg.current > policy.maxProcessBytes) || (tmp !== null && tmp > 440*1024**2)) {
      stats.limitExceeded = 'Conservative process/cgroup/temp budget exceeded; job terminated'; kill();
    }
  }
  function tick() {if (!stopped && !active) active = sample().finally(() => {active=null;});}
  tick(); const timer = setInterval(tick,1000);
  return {async stop() {stopped=true;clearInterval(timer);if(active) await active;return stats;}};
}
module.exports = {monitor, processes};
