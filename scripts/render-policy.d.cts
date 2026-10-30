export const productionPolicy: Readonly<{
  backend: 'swangle'; concurrency: number; timeout: number;
  disallowParallelEncoding: boolean; hardwareAcceleration: 'disable';
  mediaCacheSizeInBytes: number; offthreadVideoCacheSizeInBytes: number;
  maxProcessBytes: number; maxTemporaryBytes: number; nodeHeapMB: number;
}>;
