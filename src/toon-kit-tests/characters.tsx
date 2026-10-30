import React from 'react';
import * as THREE from 'three';
import {Composition, getInputProps, registerRoot} from 'remotion';
import {ThreeCanvas} from '../toon-kit/ThreeCanvas';
import {plane, setupCartoonLighting} from '../toon-kit/lib';
import {createCharacterFactory, createRestPose, measureCharacter} from '../toon-kit/characters';
import type {CharacterRig} from '../toon-kit/characters';
import {COMPACT, TALL} from './character-fixture';
import {verifyCharacterGpu} from './character-gpu';

const CharacterValidation: React.FC = () => {
  const props = getInputProps() as {verify?: boolean};
  // References belong to the component's single initScene session, not module state.
  const actors = React.useRef<readonly CharacterRig[]>([]);
  return <ThreeCanvas engineOptions={{quality:'software-safe'}} autoFrame={false}
    initScene={async (engine) => {
      if (props.verify !== false) await verifyCharacterGpu(engine);
      engine.signal.throwIfAborted();
      engine.scene.background = new THREE.Color('#e8dfd1');
      setupCartoonLighting(engine.scene);
      const floor = plane({width:200,height:200,rotation:[-Math.PI/2,0,0],color:'#e4d5bf',outlineMode:'none'});
      engine.scene.add(floor);
      const factory = createCharacterFactory(engine);
      const compact = factory.create({id:'compact',proportions:COMPACT,colors:{torso:'#e5ae40'}});
      const tall = factory.create({id:'tall',proportions:TALL});
      actors.current = [compact,tall];
      engine.scene.add(compact.root,tall.root);
      console.log('AUDIT_CHARACTER_COUNTS:'+JSON.stringify(actors.current.map((actor) => ({id:actor.id,height:actor.definition.height,...measureCharacter(actor)}))));
      const render = engine.renderFrame.bind(engine);
      engine.renderFrame = (frame,fps) => {const start=performance.now();render(frame,fps);console.log('TOON_FRAME:'+JSON.stringify({frame,ms:performance.now()-start}));};
    }}
    onFrame={({engine,frame}) => {
      const angle = [0,Math.PI/4,Math.PI/2][frame % 3];
      actors.current.forEach((actor,index) => {
        const offset = index === 0 ? -.9 : .9;
        actor.applyPose(createRestPose(actor.definition,{position:[Math.cos(angle)*offset,0,-Math.sin(angle)*offset]}));
      });
      // Fixed distance and scale in all views; only layout changes to keep both actors visible.
      const distance = engine.width / engine.height < 1 ? 8.3 : 6.3;
      engine.camera.position.set(Math.sin(angle)*distance,2.65,Math.cos(angle)*distance);
      engine.camera.lookAt(0,1.65,0);
      engine.camera.updateProjectionMatrix();
    }}
  />;
};
registerRoot(() => <Composition id='CharacterValidation' component={CharacterValidation}
  width={1280} height={720} fps={30} durationInFrames={3}/>);
