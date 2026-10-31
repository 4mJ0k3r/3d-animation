import {poseAnchorPosition} from './pose';
import {add,sub,mul,rotateQ,inverseQ,yawPoint,unit} from './math';
import type {AnchorName,CharacterDefinition,CharacterPose,Vec3} from './types';
import type {LevelFrame} from './constraint-types';

export function rootToWorld(pose:CharacterPose,parent:LevelFrame,point:Vec3):Vec3 {
  const local=add(pose.root.position,rotateQ(pose.root.quaternion,mul(point,pose.root.scale[0])));
  return add(parent.position,mul(yawPoint(local,parent.yaw),parent.scale));
}
export function worldToRoot(pose:CharacterPose,parent:LevelFrame,point:Vec3):Vec3 {
  const local=sub(mul(yawPoint(sub(point,parent.position),-parent.yaw),1/parent.scale),pose.root.position);
  return mul(rotateQ(inverseQ(pose.root.quaternion),local),1/pose.root.scale[0]);
}
export const directionToWorld=(pose:CharacterPose,parent:LevelFrame,direction:Vec3):Vec3=>unit(yawPoint(rotateQ(pose.root.quaternion,direction),parent.yaw));
export const anchorWorld=(definition:CharacterDefinition,pose:CharacterPose,parent:LevelFrame,anchor:AnchorName):Vec3=>
  rootToWorld(pose,parent,poseAnchorPosition(pose,definition.anchors[anchor]));
