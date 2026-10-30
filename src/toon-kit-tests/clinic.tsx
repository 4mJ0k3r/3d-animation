/** Original scene, extended only for certification; production Root remains 150 frames. */
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {DoctorClinicScene} from '../DoctorClinicScene';

registerRoot(() => <Composition id="DoctorClinicAnimation" component={DoctorClinicScene}
  width={1080} height={1920} fps={30} durationInFrames={300} />);
