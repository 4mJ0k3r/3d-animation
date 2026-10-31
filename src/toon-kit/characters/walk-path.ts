import {freezeData} from './pose';
import {castFail} from './cast-error';
import type {Vec3} from './types';
type V=readonly[number,number];
type Segment={a:V;b:V;m:V;n:V};
type Node={distance:number;segment:number;t:number;yaw:number};
const norm=(v:V)=>Math.hypot(...v);
const unit=(v:V):V=>[v[0]/norm(v),v[1]/norm(v)];
const wrap=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
function curve(s:Segment,t:number,derivative=false):V {
  const a=derivative?6*t*t-6*t:2*t*t*t-3*t*t+1,b=derivative?-6*t*t+6*t:-2*t*t*t+3*t*t,
    m=derivative?3*t*t-4*t+1:t*t*t-2*t*t+t,n=derivative?3*t*t-2*t:t*t*t-t*t;
  return [a*s.a[0]+b*s.b[0]+m*s.m[0]+n*s.n[0],a*s.a[1]+b*s.b[1]+m*s.m[1]+n*s.n[1]];
}
/** Opaque immutable static path; no mutable sample cache or scene references. */
class StaticPath {
  readonly kind='walk-path';readonly length:number;readonly floor:number;
  readonly #segments:readonly Segment[];readonly #nodes:readonly Node[];
  constructor(points:readonly Vec3[]) {
    if(!Array.isArray(points)||points.length<2||points.length>32||points.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e6)))castFail('PATH_INVALID','Paths require 2..32 finite world-space waypoints.');
    this.floor=points[0][1];if(points.some(p=>Math.abs(p[1]-this.floor)>1e-8))castFail('PATH_INVALID','Walking supports one level floor; sloped paths are unsupported.');
    const p:V[]=points.map(v=>[v[0],v[2]]),delta=p.slice(1).map((v,i):V=>[v[0]-p[i][0],v[1]-p[i][1]]);
    if(delta.some(v=>norm(v)<1e-5))castFail('PATH_INVALID','Zero-length or duplicate neighboring waypoints are invalid.');
    const tangents=p.map((_,i):V=>{
      if(i===0)return delta[0];if(i===p.length-1)return delta.at(-1)!;
      const a=unit(delta[i-1]),b=unit(delta[i]);if(a[0]*b[0]+a[1]*b[1]<-.866)castFail('PATH_INVALID','Hairpin/reversing corners require a separate walk; maximum waypoint turn is 150 degrees.');
      const v=unit([a[0]+b[0],a[1]+b[1]]),size=Math.min(norm(delta[i-1]),norm(delta[i]))*.8;return [v[0]*size,v[1]*size];
    });
    const segments=p.slice(1).map((b,i)=>({a:p[i],b,m:tangents[i],n:tangents[i+1]})),nodes:Node[]=[];
    let distance=0,previous=p[0],heading=Math.atan2(delta[0][0],delta[0][1]);
    for(let i=0;i<segments.length;i++)for(let j=i===0?0:1;j<=64;j++){
      const t=j/64,position=curve(segments[i],t),d=curve(segments[i],t,true);
      if(norm(d)<1e-8)castFail('PATH_INVALID','Path has a degenerate tangent.');
      distance+=Math.hypot(position[0]-previous[0],position[1]-previous[1]);heading+=wrap(Math.atan2(d[0],d[1])-heading);
      nodes.push({distance,segment:i,t,yaw:heading});previous=position;
    }
    if(distance>10000)castFail('PATH_INVALID','Static walking paths are limited to 10,000 scene units.');
    this.length=distance;this.#segments=freezeData(segments);this.#nodes=freezeData(nodes);Object.freeze(this);
  }
  sample(distance:number):{position:Vec3;yaw:number} {
    if(!Number.isFinite(distance))castFail('PATH_INVALID','Path distance must be finite.');
    const d=Math.max(0,Math.min(this.length,distance)),nodes=this.#nodes;
    let lo=0,hi=nodes.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(nodes[mid].distance<=d)lo=mid;else hi=mid;}
    const a=nodes[lo],b=nodes[hi],f=(d-a.distance)/(b.distance-a.distance),segment=b.segment;
    const t=a.segment===b.segment?a.t+(b.t-a.t)*f:b.t*f;
    const position=curve(this.#segments[segment],t),derivative=curve(this.#segments[segment],t,true),reference=a.yaw+(b.yaw-a.yaw)*f;
    return freezeData({position:[position[0],this.floor,position[1]] as Vec3,yaw:reference+wrap(Math.atan2(derivative[0],derivative[1])-reference)});
  }
}
export type WalkingPath=StaticPath;
export interface NamedWalkingPath {readonly kind:'named-walk-path';readonly library:WalkingPaths;readonly name:string}
export type WalkingPathReference=WalkingPath|NamedWalkingPath;
export interface WalkingPaths {readonly entries:Readonly<Record<string,WalkingPath>>;path(name:string):NamedWalkingPath}
export const pathThrough=(points:readonly Vec3[]):WalkingPath=>new StaticPath(points);
export function createPaths(entries:Readonly<Record<string,WalkingPath>>):WalkingPaths {
  if(!entries||typeof entries!=='object'||Array.isArray(entries)||Object.values(entries).some(p=>!(p instanceof StaticPath)))castFail('PATH_INVALID','Named paths must be built with pathThrough/pathFromMarks.');
  const library:WalkingPaths={entries:Object.freeze({...entries}),path:name=>Object.freeze({kind:'named-walk-path',library,name})};return Object.freeze(library);
}
export function resolveWalkingPath(reference:WalkingPathReference):WalkingPath {
  if(reference instanceof StaticPath)return reference;
  if(reference?.kind==='named-walk-path'&&reference.library?.entries){const path=reference.library.entries[reference.name];if(path instanceof StaticPath)return path;}
  castFail('PATH_INVALID','Missing or invalid static walking path.');
}
