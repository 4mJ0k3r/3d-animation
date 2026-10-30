import React from 'react';
import { Composition } from 'remotion';
import { DoctorClinicScene } from './DoctorClinicScene';

export const Root: React.FC = () => {
  return (
    <>
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
