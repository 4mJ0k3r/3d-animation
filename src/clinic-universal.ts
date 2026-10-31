import type {CartoonEngine} from './toon-kit/engine';
import {setupCartoonLighting} from './toon-kit/lib';
import {createCast,appearancePreset,standAt,sitAt,levelFloor} from './toon-kit/characters';
import {ClinicEnvironment} from './ClinicEnvironment';
import {createClinicActing} from './clinic-universal-story';

export function createUniversalClinic(engine:CartoonEngine,environment=new ClinicEnvironment()){
  setupCartoonLighting(engine.scene,{ambientColor:0xfffcf7,ambientIntensity:.98,keyLightColor:0xffffff,keyLightIntensity:.65,keyLightPosition:[3.5,9,6],fillLightColor:0xeef4fa,fillLightIntensity:.42,fillLightPosition:[-4,5,2]});
  environment.stageUniversalPortrait();engine.scene.add(environment.group);
  // All attached room/rig resources belong to this engine; do not call the
  // legacy environment's texture-only dispose in addition to owner disposal.
  engine.track(environment.group);const targets=environment.semanticTargets();
  const cast=createCast(engine,{
    doctor:{appearance:appearancePreset('doctor'),proportions:{torsoRadius:.22,torsoLength:.72,headRadius:.46,neckRadius:.065,neckLength:.10,upperArmLength:.42,lowerArmLength:.38,armRadius:.03,handRadius:.06,upperLegLength:.62,lowerLegLength:.60,legRadius:.035,shoeWidth:.14,shoeHeight:.12,shoeLength:.27,hipSpread:.62},stance:standAt(targets.mark('doctor'))},
    patient:{appearance:appearancePreset('patient'),proportions:{torsoRadius:.28,torsoLength:.60,headRadius:.56,neckLength:.10,upperLegLength:.45,lowerLegLength:.48,shoeLength:.27,hipSpread:.66},stance:sitAt(targets.seat('examSeat'),{floor:levelFloor(0),feet:'auto'})},
  });
  const acting=createClinicActing(cast.actors.doctor,cast.actors.patient,targets.target('diagram'));
  function evaluate(frame:number,fps=30,solo?:'doctor'|'patient'){
    if(!Number.isFinite(frame)||frame<0||frame>=150)throw new RangeError('Clinic source frame must be within [0, 150)');
    // Absolute-time authored standing mark; no previous pose or joint mutation.
    const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*t*(10+t*(-15+6*t));};
    environment.doctorMark.rotation.y=.6*(ease((frame-30)/13)-ease((frame-66)/15));
    environment.group.updateWorldMatrix(true,true);
    const poses=acting(frame);
    return cast.evaluate({frame,fps,poses:{doctor:{...poses.doctor,visible:!solo||solo==='doctor'},patient:{...poses.patient,visible:!solo||solo==='patient',stance:sitAt(targets.seat('examSeat'),{floor:environment.floorTarget(),feet:'auto'})}}});
  }
  function camera(view:'portrait'|'front'|'quarter'|'close'|'point-close'='portrait'){
    if(view==='front'){engine.camera.position.set(-.3,2.6,8.0);engine.camera.lookAt(-.3,1.65,-1.3);}
    else if(view==='quarter'){engine.camera.position.set(4.5,3.0,8.1);engine.camera.lookAt(-.3,1.65,-1.3);}
    else if(view==='close'){engine.camera.position.set(-.3,3.1,2.5);engine.camera.lookAt(.55,2.9,-1.0);}
    else if(view==='point-close'){engine.camera.position.set(2.95,3.3,0);engine.camera.lookAt(-1.15,2.65,-1.2);}
    else {engine.camera.position.set(2.26,2.65,6.9);engine.camera.lookAt(-.45,1.55,-1.3);}
    engine.camera.updateMatrixWorld(true);engine.camera.updateProjectionMatrix();
  }
  return {environment,targets,cast,evaluate,camera,framingSubjects:[cast.actors.doctor.root,cast.actors.patient.root,environment.medicalChart],patientGazeTarget:cast.actors.patient.target('head'),dispose:cast.dispose};
}
