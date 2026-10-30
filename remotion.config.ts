import {Config} from '@remotion/cli/config';
import {productionPolicy as policy} from './scripts/render-policy.cjs';

// Use scripts/render.cjs to install workspace temp env BEFORE this config loads.
Config.setChromiumOpenGlRenderer(process.env.TOON_GL === 'swiftshader' ? 'swiftshader' : policy.backend);
Config.setHardwareAcceleration(policy.hardwareAcceleration);
Config.setChromiumHeadlessMode(true);
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCachingEnabled(false);
Config.setConcurrency(1);
Config.setDelayRenderTimeoutInMilliseconds(policy.timeout);
Config.setDisallowParallelEncoding(true);
Config.setOffthreadVideoCacheSizeInBytes(policy.offthreadVideoCacheSizeInBytes);
Config.overrideFfmpegCommand(({args}) => [...args.slice(0, -1), '-threads', '2', args.at(-1)!]);
