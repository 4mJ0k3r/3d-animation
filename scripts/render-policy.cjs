'use strict';
module.exports.productionPolicy = Object.freeze({
  backend: 'swangle', concurrency: 1, timeout: 120000,
  disallowParallelEncoding: true, hardwareAcceleration: 'disable',
  mediaCacheSizeInBytes: 32 * 1024 ** 2,
  offthreadVideoCacheSizeInBytes: 32 * 1024 ** 2,
  maxProcessBytes: 5.5 * 1024 ** 3,
  maxTemporaryBytes: 8 * 1024 ** 3,
  nodeHeapMB: 1536,
  minAvailableMemoryBytes: 2.5 * 1024 ** 3,
  lowAvailableMemoryBytes: 1 * 1024 ** 3,
  lowMemoryConsecutiveSamples: 3,
  memoryTelemetryFailureSamples: 2,
});
