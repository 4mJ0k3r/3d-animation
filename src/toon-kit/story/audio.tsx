import React from 'react';
import { Html5Audio, Sequence, useVideoConfig, cancelRender } from 'remotion';
import type { PreparedStoryAudio } from './audio-assets';
import { storyFail } from './types';
/** Media is placed on the composition's existing absolute-frame clock. */
export const StoryAudio: React.FC<{
  prepared: PreparedStoryAudio;
}> = ({
  prepared
}) => {
  prepared.assertReady();
  const config = useVideoConfig(),
    timeline = prepared.timeline;
  if (config.fps !== timeline.plan.fps || config.durationInFrames !== timeline.plan.durationInFrames) storyFail('AUDIO_TIMEBASE_MISMATCH', 'Composition fps/duration must match the story; do not offset the audio clock');
  return React.useMemo(() => <>{timeline.audio.clips.map(clip => <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.endFrame - clip.startFrame} layout="none" name={clip.id}>
    <Html5Audio src={prepared.assets[clip.asset].src} trimBefore={clip.trimBeforeFrames} durationInFrames={clip.endFrame - clip.startFrame} volume={clip.volume} onError={cancelRender} />
  </Sequence>)}</>, [prepared, timeline]);
};
