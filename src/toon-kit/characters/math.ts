/** Pure tuple mathematics; no scene graph, clocks, caches or GPU resources. */
import type {Quat, Vec3} from './types';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0]*s,a[1]*s,a[2]*s];
export const dot = (a: Vec3, b: Vec3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const length = (a: Vec3): number => Math.hypot(...a);
export const distance = (a: Vec3, b: Vec3): number => length(sub(a,b));
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit = (a: Vec3): Vec3 => {
  // Scale first so even multi-component subnormal hints normalize correctly.
  const maximum=Math.max(...a.map(Math.abs));
  const scaled:Vec3=[a[0]/maximum,a[1]/maximum,a[2]/maximum],n=length(scaled);
  return [scaled[0]/n,scaled[1]/n,scaled[2]/n];
};
export const finiteVector = (value: unknown): value is Vec3 => Array.isArray(value) && value.length===3 &&
  [...value].every((v) => typeof v==='number' && Number.isFinite(v) && Math.abs(v)<=1e6);
export const yawPoint = (a: Vec3, yaw: number): Vec3 => [Math.cos(yaw)*a[0]+Math.sin(yaw)*a[2],a[1],-Math.sin(yaw)*a[0]+Math.cos(yaw)*a[2]];
export const inverseQ = (q: Quat): Quat => [-q[0],-q[1],-q[2],q[3]];
export function canonicalQ(q: Quat): Quat {
  const n=Math.hypot(...q), s=q[3]<0?-1/n:1/n;
  return [q[0]*s,q[1]*s,q[2]*s,q[3]*s];
}
export function multiplyQ(a: Quat,b: Quat): Quat {
  return canonicalQ([a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]);
}
/** Aligns the bone's -Y axis to direction, with deterministic antiparallel roll. */
export function fromDown(direction: Vec3): Quat {
  const d=unit(direction),s=Math.hypot(d[0],d[2]);
  if(s===0)return d[1]>0?[1,0,0,0]:[0,0,0,1];
  const half=Math.atan2(s,-d[1])/2,k=Math.sin(half)/s;
  return canonicalQ([-d[2]*k,0,d[0]*k,Math.cos(half)]);
}

/** Exact center-line distance for two bounded segments, including zero lengths. */
export function segmentDistance(a: Vec3,b: Vec3,c: Vec3,d: Vec3): number {
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),uu=dot(u,u),vv=dot(v,v),uv=dot(u,v),uw=dot(u,w),vw=dot(v,w);
  const clamp=(x:number)=>Math.max(0,Math.min(1,x));
  let s=0,t=0;
  if(uu===0 && vv===0)return distance(a,c);
  if(uu===0)t=clamp(vw/vv);
  else if(vv===0)s=clamp(-uw/uu);
  else {
    const denominator=uu*vv-uv*uv;
    s=denominator>Number.EPSILON*uu*vv?clamp((uv*vw-uw*vv)/denominator):0;
    t=(uv*s+vw)/vv;
    if(t<0){t=0;s=clamp(-uw/uu);}else if(t>1){t=1;s=clamp((uv-uw)/uu);}
  }
  return distance(add(a,mul(u,s)),add(c,mul(v,t)));
}

/** Conservative capsule/slab clearance only; not a scene collision engine. */
export function segmentBox(a: Vec3,b: Vec3,min: Vec3,max: Vec3,radius: number): boolean {
  let lo=0,hi=1;
  for(let axis=0;axis<3;axis++) {
    const delta=b[axis]-a[axis], lower=min[axis]-radius,upper=max[axis]+radius;
    if(Math.abs(delta)<1e-14){if(a[axis]<=lower || a[axis]>=upper)return false;}
    else {
      const x=(lower-a[axis])/delta,y=(upper-a[axis])/delta;
      lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));
      if(hi<=lo)return false;
    }
  }
  return true;
}

export function cylinderMinY(a: Vec3,b: Vec3,radius: number): number {
  const direction=unit(sub(b,a));
  return Math.min(a[1],b[1])-radius*Math.sqrt(Math.max(0,1-direction[1]**2));
}
