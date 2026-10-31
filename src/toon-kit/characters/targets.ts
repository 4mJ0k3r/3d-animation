import {freezeData} from './pose';
import type {Vec3} from './types';
import type {ArmReach,FloorTarget,LevelFrame,PointTarget,SeatTarget,Side,SittingContact,StandingContact} from './constraint-types';

/** Descriptors are data, not commands. Runtime validation happens in the solver. */
export const levelFloor=(height=0):FloorTarget=>freezeData({kind:'floor',height});
export function levelFrame(options: Partial<LevelFrame> = {}): LevelFrame {
  return freezeData({...options,position:[...(options.position??[0,0,0])] as unknown as Vec3,yaw:options.yaw??0,scale:options.scale??1});
}
export function seatTarget(options: Omit<SeatTarget,'kind'|'yaw'> & {yaw?:number}): SeatTarget {
  return freezeData({...options,kind:'seat',center:[...options.center] as unknown as Vec3,yaw:options.yaw??0});
}
export const worldPoint=(position:Vec3):PointTarget=>freezeData({space:'world',position:[...position] as unknown as Vec3});
export function standOn(floor:FloorTarget, options: {at?:readonly[number,number];yaw?:number;crouch?:number} = {}): StandingContact {
  return freezeData({...options,kind:'stand',floor:{...floor},at:[...(options.at??[0,0])] as [number,number],yaw:options.yaw??0,crouch:options.crouch??0});
}
export const sitOn=(seat:SeatTarget,options:{floor:FloorTarget;feet?:SittingContact['feet']}):SittingContact=>
  freezeData({...options,kind:'sit',seat:{...seat,center:[...seat.center] as unknown as Vec3},floor:{...options.floor},feet:options.feet??'auto'});
export const reachTo=(hand:Side,target:PointTarget):ArmReach=>freezeData({hand,target:{...target,position:[...target.position] as unknown as Vec3}});
