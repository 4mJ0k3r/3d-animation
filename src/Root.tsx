import React from 'react';
import { Composition } from 'remotion';
import { DoctorClinicScene } from './DoctorClinicScene';
import {DoctorClinicUniversal} from './DoctorClinicUniversal';
import {DoctorClinicCinematic} from './DoctorClinicCinematic';

export const Root: React.FC = () => {
  return (
    <>
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
