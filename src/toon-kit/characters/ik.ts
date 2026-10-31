import {add,sub,mul,dot,length,unit,finiteVector,fromDown} from './math';
import {freezeData} from './pose';
import type {Vec3} from './types';
import type {ConstraintDiagnostic,TwoBoneInput,TwoBoneResult} from './constraint-types';

export function solveTwoBoneIK(input: TwoBoneInput): TwoBoneResult {
  if(!input || !finiteVector(input.origin) || !finiteVector(input.target) || !finiteVector(input.pole) ||
    ![input.upperLength,input.lowerLength].every((v)=>Number.isFinite(v)&&v>=1e-6&&v<=1e6) ||
    (input.fallbackDirection!==undefined&&!finiteVector(input.fallbackDirection)) ||
    (input.fallbackPole!==undefined&&!finiteVector(input.fallbackPole))) {
    return freezeData({ok:false,diagnostics:[{code:'INVALID_IK_INPUT',severity:'error',message:'IK requires finite vectors and segment lengths in 0.000001..1000000 scene units.'}]});
  }
  const {origin,target,upperLength:l1,lowerLength:l2}=input;
  const diagnostics: ConstraintDiagnostic[]=[];
  const delta=sub(target,origin), requested=length(delta),minimum=Math.abs(l1-l2),maximum=l1+l2;
  const tolerance=maximum*1e-10;
  const d=Math.max(minimum,Math.min(maximum,requested));
  const reachable=requested>=minimum-tolerance&&requested<=maximum+tolerance;
  if(requested>maximum+tolerance || requested<minimum-tolerance)diagnostics.push({
    code:requested>maximum?'IK_TARGET_TOO_FAR':'IK_TARGET_TOO_CLOSE',severity:'error',
    message:'Target is outside the fixed-length reach interval; endpoint was limited, never stretched.',requested:[...target],
  });
  const fallback=input.fallbackDirection&&length(input.fallbackDirection)>0?input.fallbackDirection:[0,-1,0] as Vec3;
  const u=requested>0?unit(delta):unit(fallback);
  if(requested===0)diagnostics.push({code:'IK_ZERO_DISTANCE',severity:'info',message:'Zero-distance target uses the explicit anatomical fallback direction.'});
  let projected=sub(input.pole,mul(u,dot(input.pole,u)));
  if(length(projected)<1e-10*Math.max(1,length(input.pole))) {
    const alternate=input.fallbackPole??[0,1,0];
    projected=sub(alternate,mul(u,dot(alternate,u)));
    if(length(projected)<1e-10) {
      // Least-aligned canonical axis, fixed tie order. No prior-frame pole.
      const axes:Vec3[]=[[1,0,0],[0,1,0],[0,0,1]];
      const axis=axes.reduce((best,axis)=>Math.abs(dot(axis,u))<Math.abs(dot(best,u))?axis:best);
      projected=sub(axis,mul(u,dot(axis,u)));
    }
    diagnostics.push({code:'IK_BEND_PLANE_FALLBACK',severity:'info',message:'Degenerate bend plane uses a deterministic fallback pole.'});
  }
  const v=unit(projected);
  // Factored form avoids subtracting nearly equal squared limb lengths.
  const a=d===0?0:Math.max(-l1,Math.min(l1,(d+(l1-l2)*(l1+l2)/d)/2));
  const h=Math.sqrt(Math.max(0,(l1-a)*(l1+a)));
  const joint=add(origin,add(mul(u,a),mul(v,h))),end=add(origin,mul(u,d));
  const singularity=requested===0?'zero':d===maximum?'extended':d===minimum?'folded':null;
  return freezeData({ok:true,reachable,joint,end,upperOrientation:fromDown(sub(joint,origin)),
    lowerOrientation:fromDown(sub(end,joint)),singularity,diagnostics});
}
