import {solveContactPoseWithPoles} from './constraints';
import {poseAnchorPosition,freezeData} from './pose';
import {rootToWorld,worldToRoot} from './pose-space';
import {sub,add,mul} from './math';
import {reachTo,worldPoint} from './targets';
import type {CharacterDefinition,Vec3} from './types';
import type {ContactRequest,ContactResult,Side} from './constraint-types';
import type {ResolvedPointing} from './cast-types';
import type {WalkState} from './walking';
/** Reserve explicit actions first; the same IK/clearance pipeline may reduce/yield swing. */
export function applyWalkArms(def:CharacterDefinition,base:Extract<ContactResult,{ok:true}>,request:ContactRequest,state:WalkState,point:ResolvedPointing|null){
  const parent=request.parent??{position:[0,0,0] as Vec3,yaw:0,scale:1},reaches=[...(request.reaches??[])],poles:Partial<Record<Side,Vec3>>={};
  const arms:Record<Side,'reach'|'point'|'swing'|'rest'>={left:'rest',right:'rest'};
  for(const reach of reaches)arms[reach.hand]='reach';
  if(point){arms[point.hand]='point';reaches.push(reachTo(point.hand,worldPoint(point.handWorld)));poles[point.hand]=sub(worldToRoot(base.pose,parent,point.elbowWorld),poseAnchorPosition(base.pose,def.anchors[`${point.hand}Shoulder`]));}
  const free=(['left','right'] as const).filter(s=>arms[s]==='rest');
  if(state.activity>1e-12&&free.length)for(const weight of [1,.6,.3]){
    const candidates=free.map(side=>{
      const shoulder=poseAnchorPosition(base.pose,def.anchors[`${side}Shoulder`]),rest=sub(poseAnchorPosition(def.restPose,def.anchors[`${side}Wrist`]),poseAnchorPosition(def.restPose,def.anchors[`${side}Shoulder`]));
      const angle=(side==='left'?1:-1)*state.swing*weight,vector:Vec3=[rest[0],rest[1]*Math.cos(angle),rest[1]*Math.sin(angle)];
      return reachTo(side,worldPoint(rootToWorld(base.pose,parent,add(shoulder,mul(vector,1-.025*state.activity*weight)))));
    });
    const result=solveContactPoseWithPoles(def,{...request,reaches:[...reaches,...candidates]},poles);
    if(result.ok){free.forEach(s=>arms[s]='swing');return freezeData({result,state:{...state,arms,swingWeight:weight}});}
  }
  return freezeData({result:base,state:{...state,arms,swingWeight:0}});
}
