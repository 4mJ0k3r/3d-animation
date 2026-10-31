import * as THREE from 'three';
import type {CartoonEngine} from '../engine';
import {createCharacterFactory} from './rig';
import type {CharacterRig} from './rig';
import {freezeData,poseAnchorPosition,validateCompletePose} from './pose';
import {solveContactPose} from './constraints';
import {levelFloor,standOn,sitOn,worldPoint,reachTo} from './targets';
import {characterTarget,standAt,worldMark} from './semantic-targets';
import {TargetResolver,targetPosition,readLevelFrame} from './target-resolver';
import {rootToWorld} from './pose-space';
import {worldToRoot} from './pose-space';
import {inverseQ,rotateQ,sub} from './math';
import {resolveFace,validateFaceConfig} from './face';
import type {ResolvedFace} from './face';
import {solvePointing} from './pointing';
import {solveHeadGaze} from './gaze';
import {castFail,CastEvaluationError} from './cast-error';
import type {AnchorName,CharacterPose} from './types';
import type {ContactRequest,ContactResult,LevelFrame} from './constraint-types';
import type {ActorIntent,ActorTarget,CastActor,CastActorOptions,CastFrameRequest,CastSnapshot,ResolvedGaze,ResolvedPointing} from './cast-types';

export function createCast<T extends Record<string,CastActorOptions>>(engine:CartoonEngine,options:T) {
  if(!options||typeof options!=='object'||Array.isArray(options))castFail('INVALID_CAST_REQUEST','Cast definitions must be a named object.');
  if(engine.signal.aborted)castFail('CAST_DISPOSED','Cast owner is disposed.');
  const names=Object.keys(options).sort(),factory=createCharacterFactory(engine),rigs=new Map<string,CharacterRig>();
  const configs=new Map<string,CastActorOptions>();
  const scope=Object.freeze({});
  const actors={} as {[K in keyof T]:CastActor};
  let disposed=false;
  try {
    for(const name of names) {
      if(!name.trim()||['__proto__','constructor','prototype'].includes(name))castFail('INVALID_CAST_REQUEST','Actor names must be nonempty safe dictionary keys.');
      if(!options[name]||typeof options[name]!=='object'||Array.isArray(options[name])||Object.keys(options[name]).some(k=>!['proportions','colors','stance','scale','parent','face'].includes(k)))castFail('INVALID_CAST_REQUEST','Unknown actor construction fields.',name);
      const config={...options[name]};configs.set(name,config);
      if(config.face!==false){try{validateFaceConfig(config.face??{});}catch(error){castFail('FACE_INVALID',String(error),name);}
        config.face=freezeData({...config.face,blink:config.face?.blink?{...config.face.blink}:undefined});}
      if(config.scale!==undefined&&(typeof config.scale!=='number'||!Number.isFinite(config.scale)||config.scale<.05||config.scale>20))castFail('INVALID_CAST_REQUEST','Invalid default scale.',name);
      if(config.stance!==undefined&&(!config.stance||typeof config.stance!=='object'))castFail('INVALID_CAST_REQUEST','Invalid default stance.',name);
      if(config.parent!==undefined&&!(config.parent instanceof THREE.Object3D))castFail('INVALID_PARENT','Actor parent must be a scene object.',name);
      const parent=config.parent??engine.scene;
      for(let node:THREE.Object3D|null=parent;node;node=node.parent)if(node instanceof THREE.Scene&&node!==engine.scene)castFail('INVALID_PARENT','Actor parent belongs to another engine scene.',name);
      const rig=factory.create({id:name,proportions:config.proportions,colors:config.colors,face:config.face});rigs.set(name,rig);parent.add(rig.root);
      actors[name as keyof T]=Object.freeze({root:rig.root,definition:rig.definition,target:(anchor:AnchorName='head',phase:ActorTarget['phase']='support')=>Object.freeze({...characterTarget(name,anchor,phase),scope})});
    }
  }catch(error){factory.dispose();throw error;}
  Object.freeze(actors);
  const dispose=()=>{if(disposed)return;disposed=true;factory.dispose();};
  engine.registerCleanup(dispose);

  function evaluateFrame(request:CastFrameRequest):CastSnapshot {
    if(disposed||engine.signal.aborted)castFail('CAST_DISPOSED','Cast owner is disposed.');
    if(!request||!Number.isInteger(request.frame)||request.frame<0||!Number.isFinite(request.fps)||request.fps<=0||!Number.isFinite(request.frame/request.fps)||
      Object.keys(request).some(key=>!['frame','fps','poses'].includes(key))||
      (request.poses!==undefined&&(!request.poses||typeof request.poses!=='object'||Array.isArray(request.poses))))castFail('INVALID_CAST_REQUEST','Supply a nonnegative integer frame, positive fps and complete declarative pose inputs.');
    const frame=freezeData({frame:request.frame,fps:request.fps,time:request.frame/request.fps});
    for(const name of Object.keys(request.poses??{}))if(!rigs.has(name))castFail('UNKNOWN_ACTOR',`Unknown actor: ${name}`);
    const intents=new Map<string,ActorIntent>(),parents=new Map<string,LevelFrame>(),parentObjects=new Map<string,THREE.Object3D>();
    const supports=new Map<string,Extract<ContactResult,{ok:true}>>(),contactRequests=new Map<string,ContactRequest>();
    const finals=new Map<string,CharacterPose>(),gazes=new Map<string,ResolvedGaze>(),points=new Map<string,ResolvedPointing|null>();
    const faces=new Map<string,ResolvedFace|null>();
    const supportActive=new Set<string>(),intentActive=new Set<string>(),diagnostics:CastSnapshot['diagnostics'][number][]=[];
    const identify=(name:string,error:unknown):never=>{
      if(error instanceof CastEvaluationError)throw new CastEvaluationError(error.diagnostics.map(d=>({...d,actor:d.actor??name})));
      throw error;
    };
    for(const name of names) {
      const supplied=request.poses?.[name],intent=supplied===undefined?{}:supplied;
      if(!intent||typeof intent!=='object'||Array.isArray(intent)||Object.keys(intent).some(k=>!['stance','gaze','gesture','reaches','scale','visible','expression','blink','eyeGaze'].includes(k)))castFail('INVALID_CAST_REQUEST','Unknown or invalid actor intention fields.',name);
      if((intent.stance!==undefined&&(!intent.stance||typeof intent.stance!=='object'))||
        (intent.scale!==undefined&&(typeof intent.scale!=='number'||!Number.isFinite(intent.scale)))||
        (intent.visible!==undefined&&typeof intent.visible!=='boolean'))castFail('INVALID_CAST_REQUEST','Invalid stance, scale or visibility.',name);
      intents.set(name,intent);
      const parent=rigs.get(name)!.root.parent;
      if(!parent)castFail('INVALID_PARENT','Cast actor was detached from its declared scene parent.',name);
      let attached=false;
      for(let node:THREE.Object3D|null=parent;node;node=node.parent)if(node instanceof THREE.Scene){if(node!==engine.scene)castFail('INVALID_PARENT','Actor parent belongs to another engine scene.',name);attached=true;}
      if(!attached)castFail('INVALID_PARENT','Attach the actor parent to its engine scene before evaluation.',name);
      for(let node:THREE.Object3D|null=parent;node;node=node.parent)if(typeof node.userData.outlineGroup==='string'&&node.userData.outlineGroup.startsWith('character:'))castFail('INVALID_PARENT','Actor parents cannot be controlled character joints.',name);
      try{parents.set(name,readLevelFrame(parent));}catch(error){identify(name,error);}
      parentObjects.set(name,parent);
    }
    const resolver=new TargetResolver(frame,(target,phase)=>{
      if(target.scope!==undefined&&target.scope!==scope)castFail('UNKNOWN_ACTOR','Character target belongs to a different cast.');
      const rig=rigs.get(target.actor);if(!rig)castFail('UNKNOWN_ACTOR',`Unknown character target: ${target.actor}`);
      if(!Object.hasOwn(rig.definition.anchors,target.anchor))castFail('TARGET_MISSING',`Unknown character anchor: ${target.anchor}`,target.actor);
      const pose=target.phase==='final'?resolveIntent(target.actor):resolveSupport(target.actor).pose;
      return rootToWorld(pose,parents.get(target.actor)!,poseAnchorPosition(pose,rig.definition.anchors[target.anchor]));
    },engine.scene);
    function resolveSupport(name:string):Extract<ContactResult,{ok:true}> {
      const cached=supports.get(name);if(cached)return cached;
      if(supportActive.has(name))castFail('TARGET_CYCLE','Circular support placement dependency.',name);
      supportActive.add(name);
      try {
        const config=configs.get(name)!,intent=intents.get(name)!,stance=intent.stance??config.stance??standAt(worldMark([0,0,0]));
        let support:ContactRequest['support'];
        if(stance.kind==='stand-at') {
          const mark=resolver.resolve(stance.target,'support');
          if(mark.kind!=='mark')castFail('TARGET_INVALID','standAt requires a standing mark.',name);
          support=standOn(levelFloor(mark.position[1]),{at:[mark.position[0],mark.position[2]],yaw:mark.yaw,crouch:stance.crouch});
        }else if(stance.kind==='sit-at') {
          const seat=resolver.resolve(stance.target,'support');if(seat.kind!=='seat')castFail('TARGET_INVALID','sitAt requires a seat surface.',name);
          support=sitOn(seat,{floor:stance.floor,feet:stance.feet});
        }else if(stance.kind==='stand'||stance.kind==='sit')support=stance;
        else castFail('INVALID_CAST_REQUEST','Unknown stance.',name);
        const contact:ContactRequest={support,parent:parents.get(name),scale:intent.scale??config.scale??1,visible:intent.visible??true};
        const result=solveContactPose(rigs.get(name)!.definition,contact);
        if(!result.ok)castFail('CONTACT_FAILED','Support constraints failed.',name,result.diagnostics);
        contactRequests.set(name,contact);supports.set(name,result);return result;
      }catch(error){return identify(name,error);}finally{supportActive.delete(name);}
    }
    function resolveIntent(name:string):CharacterPose {
      const cached=finals.get(name);if(cached)return cached;
      if(intentActive.has(name))castFail('TARGET_CYCLE','Circular final-pose target dependency.',name);
      intentActive.add(name);
      try {
        const intent=intents.get(name)!,rig=rigs.get(name)!;resolveSupport(name);
        if(intent.reaches!==undefined&&!Array.isArray(intent.reaches))castFail('INVALID_CAST_REQUEST','Reaches must be an array.',name);
        const reaches=(intent.reaches??[]).map(reach=>{
          if(!reach||!['left','right'].includes(reach.hand))castFail('INVALID_CAST_REQUEST','Invalid hand selection.',name);
          return reachTo(reach.hand,worldPoint(targetPosition(resolver.resolve(reach.target))));
        });
        const contact={...contactRequests.get(name)!,reaches};
        // Reuse this frame's immutable support solve when no physical reaches
        // were requested. Pointing still validates candidates in the same solver.
        let result=reaches.length?solveContactPose(rig.definition,contact):supports.get(name)!,point:ResolvedPointing|null=null;
        if(!result.ok)castFail('CONTACT_FAILED','Reach constraints failed.',name,result.diagnostics);
        if(intent.gesture!==undefined) {
          if(!intent.gesture||intent.gesture.kind!=='point'||!['left','right','auto'].includes(intent.gesture.hand))castFail('INVALID_CAST_REQUEST','Only a valid pointAt intention is supported.',name);
          const solved=solvePointing(rig.definition,result,contact,targetPosition(resolver.resolve(intent.gesture.target)),intent.gesture.hand);
          result=solved.result;point=solved.pointing;
        }
        if(intent.gaze!==undefined&&(!intent.gaze||intent.gaze.kind!=='look'))castFail('INVALID_CAST_REQUEST','Invalid gaze intention.',name);
        const gaze=solveHeadGaze(rig.definition,result.pose,parents.get(name)!,intent.gaze?targetPosition(resolver.resolve(intent.gaze.target)):null);
        let direction=gaze.gaze.eyeLocalDirection;
        if(intent.eyeGaze!==undefined){
          if(!intent.eyeGaze||intent.eyeGaze.kind!=='look')castFail('FACE_INVALID','Invalid eyes-only gaze intention.',name);
          const target=worldToRoot(gaze.pose,parents.get(name)!,targetPosition(resolver.resolve(intent.eyeGaze.target)));
          direction=rotateQ(inverseQ(gaze.pose.head.quaternion),sub(target,poseAnchorPosition(gaze.pose,rig.definition.anchors.head)));
        }
        const faceConfig=configs.get(name)!.face;
        if(faceConfig===false){
          if(intent.expression!==undefined||intent.blink!==undefined||intent.eyeGaze!==undefined)castFail('FACE_INVALID','Facial intentions require an enabled face.',name);
          faces.set(name,null);
        }else try{faces.set(name,resolveFace(faceConfig??{},name,frame.time,intent.expression,intent.blink,direction));}
        catch(error){castFail('FACE_INVALID',String(error),name);}
        validateCompletePose(gaze.pose);
        diagnostics.push(...result.diagnostics,...gaze.diagnostics.map(d=>({...d,actor:name})));
        finals.set(name,gaze.pose);gazes.set(name,gaze.gaze);points.set(name,point);return gaze.pose;
      }catch(error){return identify(name,error);}finally{intentActive.delete(name);}
    }
    // No live character joint reads: supports, stable targets, intention DAG, preflight, commit.
    names.forEach(resolveSupport);names.forEach(resolveIntent);
    for(const name of names) {
      const rig=rigs.get(name)!;
      if(rig.root.parent!==parentObjects.get(name))castFail('INVALID_PARENT','Parent changed during evaluation.',name);
      const current=readLevelFrame(rig.root.parent!);
      if(JSON.stringify(current)!==JSON.stringify(parents.get(name)))castFail('INVALID_PARENT','Parent transform changed during target resolution.',name);
      try{rig.validatePose(finals.get(name)!);}catch(error){castFail('POSE_PREFLIGHT','Cast pose preflight failed.',name,String(error));}
    }
    const data=<V>(map:Map<string,V>)=>Object.fromEntries(names.map(name=>[name,map.get(name)!]));
    const commits=names.map(name=>faces.get(name)?rigs.get(name)!.prepareFace(faces.get(name)!):()=>{});
    const snapshot:CastSnapshot=freezeData({...frame,faces:data(faces),poses:data(finals),gaze:data(gazes),pointing:data(points),contacts:Object.fromEntries(names.map(name=>[name,supports.get(name)!.contacts])),diagnostics});
    names.forEach(name=>rigs.get(name)!.applyPose(snapshot.poses[name]));
    commits.forEach(commit=>commit());
    return snapshot;
  }
  let evaluating=false;
  function evaluate(request:CastFrameRequest):CastSnapshot {
    if(evaluating)castFail('TARGET_CYCLE','A cast cannot recursively evaluate itself from a target callback.');
    evaluating=true;try{return evaluateFrame(request);}finally{evaluating=false;}
  }
  return Object.freeze({actors,evaluate,dispose});
}
