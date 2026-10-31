import React from 'react';
import { Composition } from 'remotion';
import { DoctorClinicScene } from './DoctorClinicScene';
import {DoctorClinicUniversal} from './DoctorClinicUniversal';

export const Root: React.FC = () => {
  return (
    <>
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
