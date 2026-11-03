import React from 'react';
import * as THREE from 'three';
import { Composition, registerRoot } from 'remotion';
import { ThreeCanvas } from '../toon-kit/ThreeCanvas';
import { plane, setupCartoonLighting } from '../toon-kit/lib';
import { createCast, appearancePreset, standAt, worldMark } from '../toon-kit/characters';

const YellowMellowTurnaround: React.FC = () => {
  const castRef = React.useRef<ReturnType<typeof createCast> | null>(null);
  return (
    <ThreeCanvas
      engineOptions={{ quality: 'software-safe' }}
      autoFrame={false}
      initScene={async (engine) => {
        engine.scene.background = new THREE.Color('#e8dfd1');
        setupCartoonLighting(engine.scene);
        const floor = plane({ width: 20, height: 20, rotation: [-Math.PI / 2, 0, 0], color: '#e4d5bf', outlineMode: 'none' });
        engine.scene.add(floor);
        castRef.current = createCast(engine, {
          protagonist: {
            appearance: appearancePreset('yellow-mellow'),
            stance: standAt(worldMark([0, 0, 0], 0))
          }
        });
      }}
      onFrame={({ engine, frame }) => {
        // 4 views: 0 = front (0), 1 = 3/4 (45°), 2 = side profile (90°), 3 = back (180°)
        const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI];
        const angle = angles[frame % 4];
        if (castRef.current) {
          castRef.current.evaluate({
            frame: 0,
            fps: 30,
            poses: {
              protagonist: {
                expression: 'neutral'
              }
            }
          });
        }
        const distance = 6.4;
        engine.camera.position.set(Math.sin(angle) * distance, 1.65, Math.cos(angle) * distance);
        engine.camera.lookAt(0, 1.25, 0);
        engine.camera.updateProjectionMatrix();
      }}
    />
  );
};

registerRoot(() => (
  <Composition
    id="YellowMellowTurnaround"
    component={YellowMellowTurnaround}
    width={720}
    height={1280}
    fps={30}
    durationInFrames={4}
  />
));
