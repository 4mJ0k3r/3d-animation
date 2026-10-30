import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas, ToonCaptions } from './ThreeCanvas';
import { setupCartoonLighting } from './lib';
import { DoctorCharacter } from './Doctor';
import { PatientCharacter } from './Patient';
import { ClinicEnvironment } from './ClinicEnvironment';
import { CartoonEngine } from './engine';

export const DoctorClinicScene: React.FC = () => {
  const sceneState = useMemo(() => {
    let doctor: DoctorCharacter | null = null;
    let patient: PatientCharacter | null = null;
    let env: ClinicEnvironment | null = null;

    return {
      init: (engine: CartoonEngine) => {
        const { scene } = engine;

        // 1. Bright anime lighting with 2-step flat cel-shading (no muddy shadows)
        setupCartoonLighting(scene, {
          ambientColor: 0xfffcf7,
          ambientIntensity: 0.98,
          keyLightColor: 0xffffff,
          keyLightIntensity: 0.65,
          keyLightPosition: [3.5, 9.0, 6.0],
          fillLightColor: 0xeef4fa,
          fillLightIntensity: 0.42,
          fillLightPosition: [-4.0, 5.0, 2.0],
        });

        // 2. Clinic Environment
        env = new ClinicEnvironment();
        scene.add(env.group);

        // 3. Doctor Character (White lab coat with teal front strip, pointing arm horizontally along +X)
        doctor = new DoctorCharacter();
        doctor.group.position.set(-0.95, 0, -1.05);
        scene.add(doctor.group);

        // 4. Patient Character
        // Table front face is at z = -0.625. Leg cylinders are placed at z = -0.505 (tableFrontFaceZ + 0.12).
        // Patient sits directly ON TOP of the mattress (y = 1.12), legs hanging down to y = 0.26 above the floor.
        patient = new PatientCharacter();
        patient.group.position.set(1.15, 1.82, -0.605);
        scene.add(patient.group);
      },

      onFrame: ({
        frame,
        time,
      }: {
        frame: number;
        time: number;
        engine: CartoonEngine;
      }) => {
        // 1. Camera framing matching reference anime scene
        // Slow subtle dolly-in
        const progress = Math.min(1, Math.max(0, frame / 150));
        const camZ = THREE.MathUtils.lerp(7.4, 7.1, progress);
        const camY = 2.15;
        const camX = 0.05;

        // Update camera in engine
        // (engine.camera is manipulated by ThreeCanvas, or directly here)
        if (doctor) {
          doctor.update(time, frame);
        }
        if (patient) {
          patient.update(time, frame);
        }
      },
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ThreeCanvas
        engineOptions={{
          supersample: 2,
          outlineThickness: 2.8,
          depthThreshold: 0.015,
          normalThreshold: 0.46,
          bokehAperture: 0.00002,
          bokehMaxBlur: 0.002,
          saturation: 1.14,
          warmth: 0.04,
        }}
        initScene={sceneState.init}
        onFrame={({ frame, time, engine }) => {
          const progress = Math.min(1, Math.max(0, frame / 150));
          const camZ = THREE.MathUtils.lerp(7.4, 7.1, progress);
          const camY = 2.18;
          const camX = 0.05;
          engine.camera.position.set(camX, camY, camZ);
          engine.camera.lookAt(0.05, 2.08, -1.2);

          sceneState.onFrame({ frame, time, engine });
        }}
      />
      <ToonCaptions
        words={[
          { text: 'THE', startFrame: 0, endFrame: 18 },
          { text: 'DOCTOR', startFrame: 18, endFrame: 44 },
          { text: 'EXPLAINS', startFrame: 44, endFrame: 72 },
          { text: 'THE', startFrame: 72, endFrame: 92 },
          { text: 'DIAGNOSIS', startFrame: 92, endFrame: 122 },
          { text: 'CLEARLY', startFrame: 122, endFrame: 150 },
        ]}
        fontSize={66}
        bottom={100}
        strokeWidth={5}
        scalePunch={true}
      />
    </div>
  );
};
