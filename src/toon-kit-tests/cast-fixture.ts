import * as THREE from 'three';
import type {CartoonEngine} from '../toon-kit/engine';
import {createPrimitiveFactory,createStudioRoom,setupCartoonLighting} from '../toon-kit/lib';
import type {BoxOptions,CylinderOptions,PlaneOptions,SphereOptions} from '../toon-kit/lib';
import {createCast,createTargets,scenePoint,sceneMark,sceneSeat,standAt,sitAt,lookAt,pointAt} from '../toon-kit/characters';
import type {CastSnapshot} from '../toon-kit/characters';
import {COMPACT,TALL} from './character-fixture';

/** Separate clinic-like validation props; the original clinic is never imported. */
export function createCastFixture(engine:CartoonEngine,options:{environment?:boolean;debug?:boolean;reverse?:boolean}={}) {
  const props:{box:(o:BoxOptions)=>THREE.Mesh;sphere:(o:SphereOptions)=>THREE.Mesh;plane:(o:PlaneOptions)=>THREE.Mesh;cylinder:(o:CylinderOptions)=>THREE.Mesh}=createPrimitiveFactory(engine);
  setupCartoonLighting(engine.scene);
  if(options.environment)engine.scene.add(createStudioRoom({width:12,depth:9,height:6,sideWalls:false}));
  else engine.scene.add(props.plane({width:30,height:30,color:'#dfc9aa',rotation:[-Math.PI/2,0,0],outlineMode:'none'}));
  const doctorMark=new THREE.Object3D(),observerMark=new THREE.Object3D();engine.scene.add(doctorMark,observerMark);
  const bench=new THREE.Group(),board=props.box({width:1,height:.1,depth:.9,color:'#bb7950',position:[0,.4,0]});bench.add(board);
  for(const x of [-.43,.43])for(const z of [-.35,.35])bench.add(props.box({width:.07,height:.35,depth:.07,color:'#60442f',position:[x,.175,z]}));
  engine.scene.add(bench);
  const chart=new THREE.Group();chart.add(props.box({width:1.05,height:1.25,depth:.06,color:'#fff6e5'}));
  chart.add(props.box({width:.07,height:1.95,depth:.07,color:'#60442f',position:[0,-.975,-.04]}));
  const diagram=props.sphere({radius:.14,widthSegments:16,heightSegments:12,color:'#397cce',scale:[1,1,.2],outlineMode:'none',position:[0,.15,.05]});chart.add(diagram);
  chart.add(props.cylinder({radiusTop:.012,radiusBottom:.012,height:.5,radialSegments:8,color:'#397cce',position:[0,-.23,.05],outlineMode:'none'}));
  chart.add(props.cylinder({radiusTop:.012,radiusBottom:.012,height:.35,radialSegments:8,color:'#397cce',position:[.12,-.1,.05],rotation:[0,0,-1],outlineMode:'none'}));
  engine.scene.add(chart);
  const clock=new THREE.Group();clock.add(props.sphere({radius:.23,widthSegments:20,heightSegments:12,scale:[1,1,.15],color:'#fff6e5'}));
  clock.add(props.cylinder({radiusTop:.012,radiusBottom:.012,height:.15,color:'#16131a',position:[0,.06,.05],outlineMode:'none'}));
  clock.add(props.cylinder({radiusTop:.012,radiusBottom:.012,height:.13,color:'#16131a',position:[.05,0,.05],rotation:[0,0,-Math.PI/2],outlineMode:'none'}));engine.scene.add(clock);
  const targets=createTargets({doctorMark:sceneMark(doctorMark),observerMark:sceneMark(observerMark),seat:sceneSeat(board),diagram:scenePoint(diagram),clock:scenePoint(clock)});
  const definitions={doctor:{proportions:TALL,colors:{torso:'#36a9b0'},stance:standAt(targets.mark('doctorMark'))},
    patient:{proportions:COMPACT,colors:{torso:'#e5ae40'},stance:sitAt(targets.seat('seat'))},
    observer:{scale:.8,colors:{torso:'#c56763'},stance:standAt(targets.mark('observerMark'))}};
  const cast=createCast(engine,options.reverse?{observer:definitions.observer,patient:definitions.patient,doctor:definitions.doctor}:definitions);
  const arrows=new Map<string,THREE.Group>();
  if(options.debug) {
    const material=new THREE.MeshBasicMaterial({color:'#3c63d7'});
    for(const [name,actor]of Object.entries(cast.actors)) {
      const r=actor.definition.proportions.headRadius,group=new THREE.Group();group.name='validation-gaze-'+name;
      group.add(props.cylinder({radiusTop:.012,radiusBottom:.012,height:.2,radialSegments:6,material,outlineMode:'none',castShadow:false,position:[0,r+.10,0]}));
      group.add(props.cylinder({radiusTop:0,radiusBottom:.045,height:.10,radialSegments:8,material,outlineMode:'none',castShadow:false,position:[0,r+.25,0]}));
      engine.scene.add(group);arrows.set(name,group);
    }
  }
  function updateInputs(state:number):void {
    const variant=state===80?1:state===20?-.5:0;
    doctorMark.position.set(-1.4,0,.1*variant);doctorMark.rotation.y=1.35;
    observerMark.position.set(-3.5,0,-3.4);observerMark.rotation.y=.9;
    bench.position.set(.5+.1*variant,0,-1.3);bench.rotation.y=-Math.PI/6+.06*variant;board.position.y=.4+.04*variant;
    chart.position.set(4+.1*variant,1.95,.8);diagram.position.y=.15+.1*variant;
    clock.position.set(1.9+.2*variant,2.7-.2*variant,-.5);
  }
  const poses=()=>({doctor:{gaze:lookAt(cast.actors.patient.target('head')),gesture:pointAt(targets.target('diagram'))},
    patient:{gaze:lookAt(cast.actors.doctor.target('head'))},observer:{gaze:lookAt(targets.target('clock'))}});
  function updateDebug(snapshot:CastSnapshot):void {
    for(const [name,group]of arrows) {
      const actor=cast.actors[name as keyof typeof cast.actors],head=actor.root.getObjectByName(`${name}:head`)!;
      head.getWorldPosition(group.position);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...snapshot.gaze[name].headWorldDirection));
      group.scale.setScalar(snapshot.poses[name].root.scale[0]);
      group.visible=snapshot.poses[name].root.visible;
    }
  }
  function evaluate(state:number,frame=state,fps=30,portrait=false):CastSnapshot {
    updateInputs(state);const intentions=poses();
    const snapshot=cast.evaluate({frame,fps,poses:portrait?{...intentions,observer:{...intentions.observer,visible:false}}:intentions});
    chart.visible=clock.visible=!portrait;updateDebug(snapshot);return snapshot;
  }
  const first=evaluate(0);
  return {cast,targets,doctorMark,observerMark,bench,board,chart,diagram,clock,arrows,updateInputs,poses,evaluate,first};
}
