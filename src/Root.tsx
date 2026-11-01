import React from 'react';
import {AuthoredStory} from './toon-kit/authoring/view';
import OFFICE_IDEA from '../examples/office-idea.story.json';
import {compileStoryDocument,compileStorySegment} from './toon-kit/authoring';
import {StoryAudioValidation} from './toon-kit-tests/story-audio';
import {StoryTimelineValidation,DeclarativeStoryExample} from './toon-kit-tests/story';
import {OfficeCinematicValidation} from './toon-kit-tests/office';
import {CameraMotionValidation} from './toon-kit-tests/motion';
import { Composition } from 'remotion';
import { DoctorClinicScene } from './DoctorClinicScene';
import {DoctorClinicUniversal} from './DoctorClinicUniversal';
import {DoctorClinicCinematic,DoctorClinicVisible,DoctorClinicIntegrated} from './DoctorClinicCinematic';

export const Root: React.FC = () => {
  return (
    <>
      <Composition id="AuthoredStory" component={AuthoredStory} durationInFrames={240} fps={30} width={720} height={1280} defaultProps={{document:OFFICE_IDEA,segmentIndex:undefined as number|undefined}} calculateMetadata={({props})=>{const source=compileStoryDocument(props.document);const c=props.segmentIndex===undefined?source:compileStorySegment(source,props.segmentIndex);return {durationInFrames:c.timeline.plan.durationInFrames,fps:c.timeline.plan.fps,...c.document.video};}}/>
      <Composition id="StoryAudioValidation" component={StoryAudioValidation} durationInFrames={288} fps={30} width={720} height={1280}/>
      <Composition id="DeclarativeStoryExample" component={DeclarativeStoryExample} durationInFrames={300} fps={30} width={720} height={1280}/>
      <Composition id="StoryTimelineValidation" component={StoryTimelineValidation} durationInFrames={60} fps={30} width={720} height={1280}/>
      <Composition id="DoctorClinicIntegrated" component={DoctorClinicIntegrated} durationInFrames={150} fps={30} width={720} height={1280}/>
      <Composition id="OfficeCinematicValidation" component={OfficeCinematicValidation} durationInFrames={90} fps={30} width={720} height={1280}/>
      <Composition id="CameraMotionValidation" component={CameraMotionValidation} durationInFrames={90} fps={30} width={720} height={1280}/>
      <Composition id="DoctorClinicVisible" component={DoctorClinicVisible} durationInFrames={150} fps={30} width={1080} height={1920}/>
      <Composition id="DoctorClinicCinematic" component={DoctorClinicCinematic} durationInFrames={150} fps={30} width={1080} height={1920}/>
      <Composition id="DoctorClinicUniversal" component={DoctorClinicUniversal} durationInFrames={150} fps={30} width={1080} height={1920}/>
      <Composition
        id="DoctorClinicAnimation"
        component={DoctorClinicScene}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
