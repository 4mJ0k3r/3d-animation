import * as THREE from 'three';
import {pathThrough} from './walk-path';
import {castFail} from './cast-error';
import type {Vec3} from './types';
/** Snapshot static scene locator positions once in initScene; never bind live actor joints. */
export function pathFromMarks(marks:readonly THREE.Object3D[]) {
  if(!Array.isArray(marks)||marks.some(m=>!(m instanceof THREE.Object3D)))castFail('PATH_INVALID','pathFromMarks requires scene locators.');
  const points=marks.map(mark=>{for(let n:THREE.Object3D|null=mark;n;n=n.parent)if(typeof n.userData.outlineGroup==='string'&&n.userData.outlineGroup.startsWith('character:'))castFail('PATH_INVALID','Bind static prop marks, not live character joints.');return mark.getWorldPosition(new THREE.Vector3()).toArray() as unknown as Vec3;});
  return pathThrough(points);
}
