import {createRestPose,freezeData,poseAnchorPosition,validateCompletePose} from './pose';
import {solveTwoBoneIK} from './ik';
import {torsoDistance} from './proportions';
import {NODE_PARENTS} from './types';
import type {CharacterDefinition,CharacterPose,JointName,NodeName,NodeTransform,Quat,Vec3} from './types';
import type {ArmReach,ContactRequest,ContactResult,ConstraintDiagnostic,DiagnosticCode,LevelFrame,Side} from './constraint-types';
import {add,sub,mul,dot,length,distance,finiteVector,inverseQ,multiplyQ,yawPoint,segmentDistance,segmentBox,cylinderMinY} from './math';

class RejectedContact extends Error {
  constructor(readonly diagnostic:ConstraintDiagnostic){super(diagnostic.message);}
}
function fail(code:DiagnosticCode,message:string,limb?:ConstraintDiagnostic['limb']):never {
  throw new RejectedContact({code,severity:'error',message,...(limb?{limb}:{})});
}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e6;
const onlyKeys=(value:object,keys:readonly string[])=>Object.keys(value).every((key)=>keys.includes(key));
const validFrame=(frame:LevelFrame):boolean=>!!frame&&finiteVector(frame.position)&&finite(frame.yaw)&&
  finite(frame.scale)&&frame.scale>=.05&&frame.scale<=20&&onlyKeys(frame,['position','yaw','scale']);
const identityFrame:LevelFrame=freezeData({position:[0,0,0],yaw:0,scale:1});

/** Complete pure snapshot. Rejected constraints return pose:null, never a broken fallback. */
export function solveContactPose(definition:CharacterDefinition,request:ContactRequest):ContactResult {
  return solveContactPoseWithPoles(definition,request,{});
}

/** Internal extension: directional pointing supplies bend hints to the SAME IK/clearance pipeline. */
export function solveContactPoseWithPoles(definition:CharacterDefinition,request:ContactRequest,armPoles:Partial<Record<Side,Vec3>>):ContactResult {
  const diagnostics:ConstraintDiagnostic[]=[];
  try {
    if(!request||!request.support||!onlyKeys(request,['support','parent','scale','visible','reaches']))fail('INVALID_REQUEST','A standing or sitting support descriptor is required; unknown request fields are not supported.');
    if(Object.entries(armPoles).some(([side,pole])=>!['left','right'].includes(side)||!finiteVector(pole)))fail('INVALID_REQUEST','Invalid internal arm pole.');
    const support=request.support,parent=request.parent??identityFrame,scale=request.scale??1;
    if(!validFrame(parent)||!finite(scale)||scale<.05||scale>20)fail('INVALID_FRAME','Parent must be level yaw/translation with uniform scale 0.05..20; root scale must be 0.05..20.');
    if(request.visible!==undefined&&typeof request.visible!=='boolean')fail('INVALID_REQUEST','Visibility must be boolean.');
    const floor=support.floor;
    if(!floor||floor.kind!=='floor'||!finite(floor.height)||!onlyKeys(floor,['kind','height']))fail('INVALID_TARGET','A finite level floor height is required; slopes are not supported.');
    const worldScale=parent.scale*scale,p=definition.proportions;
    let heading=0,worldOrigin:Vec3=[0,floor.height,0],seatBox:{min:Vec3;max:Vec3}|null=null;
    let seated=false,footState:'floor'|'dangling'='floor';
    let seatedPelvisY=0;
    const ankleHeight=.6*p.shoeHeight,clearance=Math.max(.01,p.legRadius*.25),epsilon=1e-8;
    if(support.kind==='stand') {
      if(!Array.isArray(support.at)||support.at.length!==2||![...support.at].every(finite)||!finite(support.yaw)||
        !finite(support.crouch)||support.crouch<0||support.crouch>1||!onlyKeys(support,['kind','floor','at','yaw','crouch']))fail('INVALID_TARGET','Standing requires finite X/Z, yaw and crouch in 0..1.');
      heading=support.yaw;worldOrigin=[support.at[0],floor.height,support.at[1]];
    }else if(support.kind==='sit') {
      seated=true;
      const seat=support.seat;
      if(!seat||seat.kind!=='seat'||!finiteVector(seat.center)||!finite(seat.yaw)||
        ![seat.width,seat.depth,seat.thickness].every((v)=>finite(v)&&v>0)||!['auto','floor','dangle'].includes(support.feet)||
        !onlyKeys(seat,['kind','center','yaw','width','depth','thickness'])||!onlyKeys(support,['kind','seat','floor','feet'])) {
        fail('INVALID_TARGET','Seat requires a finite level surface center/yaw, positive width/depth/thickness and a valid foot policy.');
      }
      if(seat.center[1]-seat.thickness<floor.height-epsilon)fail('INVALID_TARGET','The seat slab cannot extend below its floor.');
      heading=seat.yaw;
      const halfWidth=seat.width/worldScale/2,halfDepth=seat.depth/worldScale/2;
      if(halfWidth<p.torsoRadius+clearance)fail('SEAT_TOO_NARROW','Usable seat width must support the torso and both hip attachments.');
      // Knee center is just beyond the front edge; no manually authored joint positions.
      const pelvisZ=halfDepth-p.upperLegLength+p.legRadius+clearance;
      const contactPatch=p.torsoRadius*.25;
      if(pelvisZ-contactPatch < -halfDepth+clearance || pelvisZ+contactPatch > halfDepth-clearance) {
        fail('SEAT_TOO_SHALLOW','Seat depth cannot support the body contact patch while keeping knees beyond its front edge.');
      }
      const horizontalOffset=yawPoint([0,0,pelvisZ*worldScale],heading);
      worldOrigin=[seat.center[0]+horizontalOffset[0],floor.height,seat.center[2]+horizontalOffset[2]];
      const restTorso=poseAnchorPosition(definition.restPose,definition.anchors.torso);
      const restBottom=restTorso[1]-p.torsoLength/2-p.torsoRadius;
      const hipAboveBodyBottom=definition.restPose.pelvis.position[1]-restBottom;
      const surfaceY=(seat.center[1]-floor.height)/worldScale;
      seatedPelvisY=surfaceY+hipAboveBodyBottom;
      const drop=seatedPelvisY-ankleHeight;
      if(drop<0)fail('SEAT_TOO_LOW','Seat puts the hips below the supported floor ankle height.');
      if(support.feet==='floor'&&drop>p.lowerLegLength+epsilon)fail('FLOOR_UNREACHABLE','Seat is too high for floor contact with clear, horizontal thighs; use auto or dangle.');
      footState=support.feet==='dangle'||drop>p.lowerLegLength+epsilon?'dangling':'floor';
      if(footState==='dangling')diagnostics.push({code:'FEET_DANGLING',severity:'info',message:'Feet hang below the seat without stretching shins toward the floor.'});
      seatBox={min:[-halfWidth,surfaceY-seat.thickness/worldScale,-pelvisZ-halfDepth],max:[halfWidth,surfaceY,-pelvisZ+halfDepth]};
    }else fail('INVALID_REQUEST','Unknown contact support kind.');

    const parentPosition=mul(yawPoint(sub(worldOrigin,parent.position),-parent.yaw),1/parent.scale);
    let pose:Record<NodeName,NodeTransform>;
    try {pose={...createRestPose(definition,{position:parentPosition,yaw:heading-parent.yaw,scale,visible:request.visible??true})};}
    catch {fail('PLACEMENT_OUT_OF_RANGE','Contact placement exceeds the supported complete-pose coordinate range.');}
    const set=(name:JointName,patch:Partial<NodeTransform>)=>{pose[name]={...pose[name],...patch};};
    const anchor=(name:JointName):Vec3=>poseAnchorPosition(pose,definition.anchors[name]);
    const toRoot=(world:Vec3):Vec3=>mul(yawPoint(sub(world,worldOrigin),-heading),1/worldScale);
    const orientation=(name:JointName):Quat=>{
      const chain:JointName[]=[];
      let node:JointName|null=name;
      while(node&&node!=='root'){chain.unshift(node);node=NODE_PARENTS[node];}
      return chain.reduce<Quat>((q,key)=>multiplyQ(q,pose[key].quaternion),[0,0,0,1]);
    };
    function solveChain(side:Side,kind:'arm'|'leg',goal:Vec3):void {
      const names:readonly[JointName,JointName,JointName]=kind==='arm'
        ?[`${side}Shoulder`,`${side}Elbow`,`${side}Wrist`]:[`${side}Hip`,`${side}Knee`,`${side}Ankle`];
      const limb=`${side}${kind==='arm'?'Arm':'Leg'}` as ConstraintDiagnostic['limb'];
      const sign=side==='left'?1:-1;
      const ik=solveTwoBoneIK({origin:anchor(names[0]),target:goal,
        upperLength:kind==='arm'?p.upperArmLength:p.upperLegLength,
        lowerLength:kind==='arm'?p.lowerArmLength:p.lowerLegLength,
        pole:kind==='arm'?(armPoles[side]??[sign,-.35,-.25]):[0,0,1],fallbackPole:kind==='arm'?[0,-1,0]:[0,1,0]});
      if(!ik.ok||!ik.reachable)fail(kind==='arm'?'REACH_UNREACHABLE':'STANCE_UNREACHABLE',
        'Target cannot be reached with these fixed limb lengths.',limb);
      diagnostics.push(...ik.diagnostics.filter((d)=>d.severity==='info').map((d)=>({...d,limb})));
      const parentName=NODE_PARENTS[names[0]]!;
      set(names[0],{quaternion:multiplyQ(inverseQ(orientation(parentName)),ik.upperOrientation)});
      set(names[1],{quaternion:multiplyQ(inverseQ(ik.upperOrientation),ik.lowerOrientation)});
      // Shoes stay level and forward, independent of the shin's bend.
      set(names[2],{quaternion:inverseQ(ik.lowerOrientation)});
    }
    set('pelvis',{position:[0,seated?seatedPelvisY:ankleHeight+(p.upperLegLength+p.lowerLegLength)*(1-.35*(support.kind==='stand'?support.crouch:0)),0]});
    for(const side of ['left','right'] as const) {
      const hip=anchor(`${side}Hip`);
      let goal:Vec3=[hip[0],ankleHeight,0];
      if(seated) {
        const drop=hip[1]-ankleHeight;
        const forward=footState==='floor'?Math.sqrt(Math.max(0,(p.lowerLegLength-drop)*(p.lowerLegLength+drop))):0;
        goal=[hip[0],footState==='floor'?ankleHeight:hip[1]-p.lowerLegLength,p.upperLegLength+forward];
      }
      solveChain(side,'leg',goal);
    }

    if(request.reaches!==undefined&&!Array.isArray(request.reaches))fail('INVALID_REQUEST','Reaches must be an array of hand/point descriptors.');
    const reaches=new Map<Side,ArmReach>();
    for(const reach of request.reaches??[]) {
      if(!reach||!['left','right'].includes(reach.hand)||!reach.target||reach.target.space!=='world'||!finiteVector(reach.target.position)||
        !onlyKeys(reach,['hand','target'])||!onlyKeys(reach.target,['space','position'])) {
        fail('INVALID_TARGET','Arm reaches require left/right hand and a finite world-space hand-center target.');
      }
      if(reaches.has(reach.hand))fail('DUPLICATE_REACH','Only one target per hand is supported.');
      reaches.set(reach.hand,reach);
    }
    // Canonical ordering makes simultaneous reaches independent of declaration order.
    for(const side of ['left','right'] as const) {
      const reach=reaches.get(side);if(reach)solveChain(side,'arm',toRoot(reach.target.position));
    }

    const torso=anchor('torso'),head=anchor('head');
    const bodyA=add(torso,[0,-p.torsoLength/2,0]),bodyB=add(torso,[0,p.torsoLength/2,0]);
    if(torso[1]-p.torsoLength/2-p.torsoRadius < -epsilon)fail('FLOOR_CLEARANCE','Body would penetrate the floor.');
    const armSegments:Array<readonly[Vec3,Vec3]>=[],legSegments:Array<readonly[Vec3,Vec3]>=[];
    for(const side of ['left','right'] as const) {
      const shoulder=anchor(`${side}Shoulder`),elbow=anchor(`${side}Elbow`),hand=anchor(`${side}Wrist`);
      const hip=anchor(`${side}Hip`),knee=anchor(`${side}Knee`),ankle=anchor(`${side}Ankle`);
      const armLimb=`${side}Arm` as const,legLimb=`${side}Leg` as const;
      const upper=sub(elbow,shoulder),lower=sub(hand,elbow),sign=side==='left'?1:-1;
      const flex=Math.acos(Math.max(-1,Math.min(1,dot(upper,lower)/(p.upperArmLength*p.lowerArmLength))));
      if(sign*upper[0]<-epsilon || flex>Math.PI*5/6+epsilon)fail('JOINT_LIMIT','Arm must exit its shoulder outward and elbow flexion cannot exceed 150 degrees.',armLimb);
      if(torsoDistance(sub(elbow,torso),p)<p.armRadius-epsilon || torsoDistance(sub(hand,torso),p)<p.handRadius-epsilon ||
        segmentDistance(elbow,hand,bodyA,bodyB)<p.torsoRadius+p.armRadius-epsilon ||
        segmentDistance(shoulder,elbow,head,head)<p.headRadius+p.armRadius-epsilon ||
        segmentDistance(elbow,hand,head,head)<p.headRadius+p.armRadius-epsilon || distance(hand,head)<p.headRadius+p.handRadius-epsilon) {
        fail('BODY_CLEARANCE','Reach intersects the torso or head outside its intended shoulder socket.',armLimb);
      }
      if(segmentDistance(hand,hand,shoulder,elbow)<p.handRadius+p.armRadius-epsilon)fail('LIMB_CLEARANCE','Hand intersects its own upper arm.',armLimb);
      if(torsoDistance(sub(knee,torso),p)<p.legRadius-epsilon || segmentDistance(knee,ankle,bodyA,bodyB)<p.torsoRadius+p.legRadius-epsilon) {
        fail('BODY_CLEARANCE','Leg cannot clear the body with this contact.',legLimb);
      }
      const sole=poseAnchorPosition(pose,definition.anchors[`${side}Sole`]);
      if(sole[1]<-epsilon || (footState==='floor'&&Math.abs(sole[1])>epsilon) || knee[1]-p.legRadius < -epsilon ||
        cylinderMinY(hip,knee,p.legRadius)<-epsilon || cylinderMinY(knee,ankle,p.legRadius)<-epsilon) {
        fail('FLOOR_CLEARANCE','Required foot contact or leg clearance cannot be satisfied without floor penetration.',legLimb);
      }
      if(hand[1]-p.handRadius < -epsilon || elbow[1]-p.armRadius < -epsilon ||
        cylinderMinY(shoulder,elbow,p.armRadius)<-epsilon || cylinderMinY(elbow,hand,p.armRadius)<-epsilon)fail('FLOOR_CLEARANCE','Arm would penetrate the floor.',armLimb);
      const arms:readonly[Vec3,Vec3][]=[[shoulder,elbow],[elbow,hand]],legs:readonly[Vec3,Vec3][]=[[hip,knee],[knee,ankle]];
      armSegments.push(...arms);legSegments.push(...legs);
      if(seatBox) {
        const {min,max}=seatBox;
        if(arms.some(([a,b])=>segmentBox(a,b,min,max,p.armRadius)) || segmentBox(hand,hand,min,max,p.handRadius) ||
          legs.some(([a,b])=>segmentBox(a,b,min,max,p.legRadius)))fail('SEAT_CLEARANCE','Limb intersects the seat slab; pose was rejected.');
        const center=add(ankle,[0,-.1*p.shoeHeight,.15*p.shoeLength]),radii:Vec3=[p.shoeWidth/2,p.shoeHeight/2,p.shoeLength/2];
        if(center.every((v,i)=>v+radii[i]>min[i]+epsilon&&v-radii[i]<max[i]-epsilon))fail('SEAT_CLEARANCE','Shoe conflicts with the seat underside/front edge.',legLimb);
      }
    }
    for(const a of armSegments)for(const b of legSegments)if(segmentDistance(...a,...b)<p.armRadius+p.legRadius-epsilon)fail('LIMB_CLEARANCE','Arm intersects a leg.');
    for(const a of armSegments.slice(0,2))for(const b of armSegments.slice(2))if(segmentDistance(...a,...b)<2*p.armRadius-epsilon)fail('LIMB_CLEARANCE','Arms intersect one another.');
    if(distance(anchor('leftWrist'),anchor('rightWrist'))<2*p.handRadius-epsilon)fail('LIMB_CLEARANCE','Hands intersect one another.');
    validateCompletePose(pose);
    return freezeData({ok:true,pose:pose as CharacterPose,contacts:{support:seated?'seated':'standing',feet:{left:footState,right:footState}},diagnostics});
  }catch(error) {
    if(!(error instanceof RejectedContact))throw error;
    return freezeData({ok:false,pose:null,diagnostics:[...diagnostics,error.diagnostic]});
  }
}
