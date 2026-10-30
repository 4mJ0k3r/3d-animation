'use strict';
const fs = require('node:fs');
const GiB = 1024 ** 3;

function parseMemAvailable(text) {
  const match = /^MemAvailable:\s+(\d+)\s+kB\s*$/m.exec(text);
  if (!match) throw new Error('/proc/meminfo has no valid MemAvailable (kB)');
  const bytes = Number(match[1]) * 1024;
  if (!Number.isSafeInteger(bytes)) throw new Error('Invalid MemAvailable value');
  return bytes;
}

/** Dependencies are injected only by regression tests, never by render job arguments. */
function createMemoryGuard(policy, {platform = process.platform, readText = () => fs.readFileSync('/proc/meminfo', 'utf8')} = {}) {
  if (!(policy.minAvailableMemoryBytes > policy.lowAvailableMemoryBytes && policy.lowAvailableMemoryBytes > 0) ||
      ![policy.lowMemoryConsecutiveSamples, policy.memoryTelemetryFailureSamples].every((n) => Number.isInteger(n) && n >= 1 && n <= 10)) throw new Error('Invalid Linux memory policy');
  let low = 0, missing = 0;
  function read() {
    if (platform !== 'linux') return {available: false, availableBytes: null, reason: 'Linux /proc/meminfo unavailable on ' + platform};
    try {return {available: true, availableBytes: parseMemAvailable(readText()), source: '/proc/meminfo:MemAvailable'};}
    catch (error) {return {available: false, availableBytes: null, reason: String(error)};}
  }
  function admission() {
    const snapshot = read();
    if (platform !== 'linux') return {...snapshot, admitted: true, enforced: false};
    if (!snapshot.available) return {...snapshot, admitted: false, enforced: true, reason: 'Cannot admit Linux render: ' + snapshot.reason};
    const admitted = snapshot.availableBytes >= policy.minAvailableMemoryBytes;
    return {...snapshot, admitted, enforced: true, requiredBytes: policy.minAvailableMemoryBytes,
      reason: admitted ? null : `Render refused: Linux MemAvailable ${(snapshot.availableBytes / GiB).toFixed(2)} GiB is below the ${(policy.minAvailableMemoryBytes / GiB).toFixed(2)} GiB admission threshold. Wait for VM memory recovery; do not lower safety limits to force a render.`};
  }
  function observe() {
    const snapshot = read();
    if (platform !== 'linux') return {...snapshot, abort: false, lowSamples: 0, missingSamples: 0};
    if (!snapshot.available) {missing++; low = 0;}
    else {missing = 0; low = snapshot.availableBytes < policy.lowAvailableMemoryBytes ? low + 1 : 0;}
    const abort = low >= policy.lowMemoryConsecutiveSamples || missing >= policy.memoryTelemetryFailureSamples;
    return {...snapshot, abort, lowSamples: low, missingSamples: missing,
      reason: abort ? (snapshot.available ? `Low-memory abort: MemAvailable below ${(policy.lowAvailableMemoryBytes / GiB).toFixed(2)} GiB for ${low} consecutive samples` : `Linux memory telemetry unavailable for ${missing} consecutive samples: ${snapshot.reason}`) : snapshot.reason ?? null};
  }
  return {admission, observe};
}
module.exports = {parseMemAvailable, createMemoryGuard};
