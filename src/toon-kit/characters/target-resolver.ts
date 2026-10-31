import * as THREE from 'three';
import {freezeData} from './pose';
import {finiteVector,yawPoint,add,mul} from './math';
import {seatTarget} from './targets';
import {castFail,CastEvaluationError} from './cast-error';
import type {LevelFrame} from './constraint-types';
import type {Vec3} from './types';
import type {ActorTarget,FrameInput,ResolvedTarget,TargetDefinition,TargetLibrary,TargetReference} from './cast-types';

export function readLevelFrame(object:THREE.Object3D):LevelFrame {
  object.updateWorldMatrix(true,false);
  return matrixLevelFrame(object.matrixWorld);
}
function matrixLevelFrame(matrix:THREE.Matrix4):LevelFrame {
  const e=matrix.elements,s=Math.hypot(e[0],e[1],e[2]);
  const expected=[s,s,s],lengths=[s,Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10])];
  if(!e.every(Number.isFinite)||s<.05||s>20||lengths.some((v,i)=>Math.abs(v-expected[i])>1e-7*s)||
    Math.abs(e[1])+Math.abs(e[4])+Math.abs(e[6])+Math.abs(e[9])>1e-7*s||Math.abs(e[5]-s)>1e-7*s||
    Math.abs(e[0]*e[8]+e[2]*e[10])>1e-7*s*s||e[0]*e[10]-e[2]*e[8]<=0||
    e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1) {
    castFail('INVALID_PARENT','Only current level, positive uniform world frames (scale 0.05..20) are supported.');
  }
  return freezeData({position:[e[12],e[13],e[14]] as Vec3,yaw:Math.atan2(e[8],e[10]),scale:s});
}
export const framePoint=(frame:LevelFrame,local:Vec3):Vec3=>add(frame.position,mul(yawPoint(local,frame.yaw),frame.scale));

/** One resolver per evaluate call; all caches are current-frame snapshots. */
export class TargetResolver {
  private readonly frames=new Map<THREE.Object3D,LevelFrame>();
  private readonly matrices=new Map<THREE.Object3D,THREE.Matrix4>();
  private readonly values=new Map<object,ResolvedTarget>();
  private readonly named=new Map<TargetLibrary,Map<string,ResolvedTarget>>();
  private readonly visiting=new Map<TargetLibrary,Set<string>>();
  private readonly active=new Set<object>();
  constructor(private readonly frame:FrameInput,private readonly actor:(target:ActorTarget,phase:'support'|'intent')=>Vec3,private readonly ownerScene?:THREE.Scene) {}
  private matrix(object:THREE.Object3D):THREE.Matrix4 {
    for(let node:THREE.Object3D|null=object;node;node=node.parent)if(typeof node.userData.outlineGroup==='string'&&node.userData.outlineGroup.startsWith('character:')) {
      castFail('ACTOR_SCENE_TARGET','Use character.target() instead of reading a live character node.');
    }
    for(let node:THREE.Object3D|null=object;node;node=node.parent)if(node instanceof THREE.Scene&&this.ownerScene&&node!==this.ownerScene)castFail('TARGET_INVALID','Scene target belongs to another scene owner.');
    let matrix=this.matrices.get(object);
    if(!matrix){object.updateWorldMatrix(true,false);matrix=object.matrixWorld.clone();this.matrices.set(object,matrix);}
    if(!matrix.elements.every(Number.isFinite))castFail('TARGET_INVALID','Scene target has a non-finite world matrix.');
    return matrix;
  }
  readFrame(object:THREE.Object3D):LevelFrame {
    let result=this.frames.get(object);
    if(!result){result=matrixLevelFrame(this.matrix(object));this.frames.set(object,result);}return result;
  }
  resolve(reference:TargetReference,phase:'support'|'intent'='intent',depth=0):ResolvedTarget {
    if(depth>64)castFail('TARGET_DEPTH','Target graph exceeds the bounded depth of 64.');
    if(!reference||typeof reference!=='object')castFail('TARGET_INVALID','A semantic target reference is required.');
    // Actor anchors must not be cached across support/final phases.
    if('kind'in reference&&reference.kind==='actor') {
      if(reference.phase!=='support'&&reference.phase!=='final')castFail('TARGET_PHASE','Unknown actor target phase.');
      if(phase==='support'&&reference.phase==='final')castFail('TARGET_PHASE','Support placement cannot depend on a final intention pose.');
      return freezeData({kind:'point',position:this.actor(reference,phase)});
    }
    if('kind'in reference&&reference.kind==='named')return this.resolveNamed(reference.library,reference.name,phase,depth+1);
    const cached=this.values.get(reference);if(cached)return cached;
    if(this.active.has(reference))castFail('TARGET_CYCLE','Circular target definition.');
    this.active.add(reference);
    let result:ResolvedTarget;
    try {
      if('space'in reference&&reference.space==='world')result={kind:'point',position:reference.position};
      else {
        if(!('kind'in reference))castFail('TARGET_INVALID','Unknown semantic target kind.');
        switch(reference.kind) {
        case 'mark':
          if(Object.keys(reference).some(k=>!['kind','position','yaw'].includes(k)))castFail('TARGET_INVALID','Unknown fixed mark fields.');
          result=reference;break;
        case 'seat':
          if(Object.keys(reference).some(k=>!['kind','center','yaw','width','depth','thickness'].includes(k)))castFail('TARGET_INVALID','Unknown fixed seat fields.');
          result=reference;break;
        case 'scene-point':case 'scene-mark': {
          if(!finiteVector(reference.local)||!(reference.object instanceof THREE.Object3D))castFail('TARGET_INVALID','Invalid local scene target.');
          if(reference.kind==='scene-point')result={kind:'point',position:new THREE.Vector3(...reference.local).applyMatrix4(this.matrix(reference.object)).toArray()};
          else {const frame=this.readFrame(reference.object);result={kind:'mark',position:framePoint(frame,reference.local),yaw:frame.yaw+reference.yaw};}break;
        }
        case 'scene-seat': {
          if(!finiteVector(reference.surface)||!(reference.object instanceof THREE.Object3D))castFail('TARGET_INVALID','Invalid scene seat.');
          const frame=this.readFrame(reference.object);
          result=seatTarget({center:framePoint(frame,reference.surface),yaw:frame.yaw,width:reference.width*frame.scale,depth:reference.depth*frame.scale,thickness:reference.thickness*frame.scale});break;
        }
        case 'derived-mark': {
          const point=this.resolve(reference.target,phase,depth+1);result={kind:'mark',position:targetPosition(point),yaw:reference.yaw};break;
        }
        case 'frame-target': {
          let value:TargetDefinition;
          try{value=reference.resolve(this.frame);}catch(error){if(error instanceof CastEvaluationError)throw error;castFail('TARGET_CALLBACK_FAILED','Frame target callback failed.',undefined,String(error));}
          if(value&&typeof value==='object'&&'then'in value)castFail('TARGET_INVALID','Frame target callbacks must be synchronous.');
          if(value&&typeof value==='object'&&'kind'in value&&value.kind==='alias')castFail('TARGET_INVALID','Aliases belong in named target libraries.');
          result=this.resolve(value as TargetReference,phase,depth+1);break;
        }
        default:castFail('TARGET_INVALID','Unknown semantic target kind.');
        }
      }
      const position=targetPosition(result);
      if(!finiteVector(position)||((result.kind==='mark'||result.kind==='seat')&&(!Number.isFinite(result.yaw)||Math.abs(result.yaw)>1e6))||
        (result.kind==='seat'&&![result.width,result.depth,result.thickness].every(v=>Number.isFinite(v)&&v>0&&v<=1e6)))castFail('TARGET_INVALID','Resolved target has invalid coordinates or dimensions.');
      // Copy data; never freeze a caller's mutable point or a Three.js object.
      result=result.kind==='seat'?{kind:'seat',center:[...result.center],yaw:result.yaw,width:result.width,depth:result.depth,thickness:result.thickness}:
        result.kind==='mark'?{kind:'mark',position:[...position],yaw:result.yaw}:{kind:'point',position:[...position]};
      result=freezeData(result);this.values.set(reference,result);return result;
    }finally{this.active.delete(reference);}
  }
  private resolveNamed(library:TargetLibrary,name:string,phase:'support'|'intent',depth:number):ResolvedTarget {
    if(depth>64)castFail('TARGET_DEPTH','Target graph exceeds the bounded depth of 64.');
    if(!library||!library.entries||!Object.hasOwn(library.entries,name))castFail('TARGET_MISSING',`Missing named target: ${name}`);
    let cache=this.named.get(library);if(!cache){cache=new Map();this.named.set(library,cache);}
    const key=phase+':'+name,cached=cache.get(key);if(cached)return cached;
    let active=this.visiting.get(library);if(!active){active=new Set();this.visiting.set(library,active);}
    if(active.has(key))castFail('TARGET_CYCLE',`Circular named target dependency: ${name}`);
    active.add(key);
    try {
      const definition=library.entries[name];
      const value=definition&&typeof definition==='object'&&'kind'in definition&&definition.kind==='alias'
        ?this.resolveNamed(library,definition.name,phase,depth+1):this.resolve(definition as TargetReference,phase,depth+1);
      cache.set(key,value);return value;
    }finally{active.delete(key);}
  }
}
export function targetPosition(target:ResolvedTarget):Vec3 {return target.kind==='seat'?target.center:target.position;}
