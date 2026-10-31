import {levelFloor,reachTo,seatTarget,sitOn,standOn,worldPoint} from '../toon-kit/characters';
import type {ContactRequest} from '../toon-kit/characters';

/** Explicit snapshots for tests, not a gesture/timeline evaluator. */
export function contactRequest(frame:number,at:readonly[number,number]=[0,0],right=false):ContactRequest {
  const floor=levelFloor();
  if(frame===20)return {support:sitOn(seatTarget({center:[at[0],.45,at[1]],width:1,depth:.9,thickness:.1}),{floor})};
  if(frame===80)return {support:standOn(floor,{at,crouch:.5}),reaches:[reachTo(right?'right':'left',worldPoint([at[0]+(right?-.55:.55),1.68,at[1]+.3]))]};
  return {support:standOn(floor,{at})};
}
