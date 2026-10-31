import React from 'react';
import {OfficeCinematicValidation} from './toon-kit-tests/office';
import {CameraMotionValidation} from './toon-kit-tests/motion';
import { Composition } from 'remotion';
import { DoctorClinicScene } from './DoctorClinicScene';
import {DoctorClinicUniversal} from './DoctorClinicUniversal';
import {DoctorClinicCinematic,DoctorClinicVisible,DoctorClinicIntegrated} from './DoctorClinicCinematic';

export const Root: React.FC = () => {
  return (
    <>
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
