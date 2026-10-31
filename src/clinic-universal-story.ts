import {blendExpression,explain,gestureDuring,lookAt,pointAt,surprise,turnTo} from './toon-kit/characters';
import type {ActorIntent,CastActor,TargetReference} from './toon-kit/characters';
import type {CaptionWord} from './toon-kit/captions';

export const UNIVERSAL_CLINIC_CAPTIONS:readonly CaptionWord[]=Object.freeze([
  {text:'THE',startFrame:0,endFrame:10},{text:'DOCTOR',startFrame:10,endFrame:35},
  {text:'CHECKS',startFrame:35,endFrame:49},{text:'THE',startFrame:49,endFrame:60},
  {text:'CHART',startFrame:60,endFrame:77},{text:'THEN',startFrame:77,endFrame:88},
  {text:'EXPLAINS',startFrame:88,endFrame:115},{text:'WHY',startFrame:115,endFrame:150},
].map(w=>Object.freeze(w)));
export function createClinicActing(doctor:CastActor,patient:CastActor,chart:TargetReference){
  const pointing=gestureDuring(pointAt(chart,{hand:'left'}),{startFrame:32,endFrame:77});
  const explaining=explain({startFrame:77,endFrame:119,intensity:.85,hand:'left'});
  const reacting=surprise({startFrame:114,endFrame:164,intensity:.85,hand:'right'});
  const reaction=blendExpression('worried','surprised',{startFrame:115,endFrame:127});
  const observe=lookAt(patient.target('head'));
  const toChart=turnTo(chart,{from:patient.target('head'),startFrame:30,endFrame:43});
  const toPatient=turnTo(patient.target('head'),{from:chart,startFrame:66,endFrame:81});
  return (frame:number):Readonly<Record<'doctor'|'patient',ActorIntent>>=>({
    doctor:{gesture:frame<77?pointing:explaining,gaze:frame<30?observe:frame<66?toChart:toPatient,
      expression:frame<77?'neutral':undefined},
    patient:{gesture:reacting,gaze:lookAt(doctor.target('head')),expression:frame<115?'worried':reaction},
  });
}
