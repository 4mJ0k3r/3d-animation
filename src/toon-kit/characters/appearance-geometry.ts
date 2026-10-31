import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {HairStyle} from './appearance';
function closeNormals(g:THREE.BufferGeometry,width:number,height:number):void {
  const n=g.attributes.normal;
  for(let j=0;j<=height;j++){const first=j*(width+1),last=first+width,v=new THREE.Vector3().fromBufferAttribute(n,first).add(new THREE.Vector3().fromBufferAttribute(n,last)).normalize();n.setXYZ(first,v.x,v.y,v.z);n.setXYZ(last,v.x,v.y,v.z);}
}

/** No forehead ink seam: one coherent shell with an inset lip and a shaped hairline. */
export function hairGeometry(style:Exclude<HairStyle,'none'>):THREE.BufferGeometry {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],w=40,h=14;
  for(let j=0;j<=h;j++)for(let i=0;i<=w;i++){
    const yaw=i===w?0:(i/w)*Math.PI*2,angle=Math.acos(Math.cos(yaw)),signed=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const t=Math.min(1,Math.max(0,(angle-.65)/.85)),blend=t*t*(3-2*t);
    const front=style==='swept'?Math.max(.55,.66+.16*Math.sin(signed*1.9)):.65-.065*Math.exp(-Math.pow(angle/.26,2));
    const line=front*(1-blend)+(style==='tied-back'?-.38:-.22)*blend;
    const v=Math.max(0,(j-1)/(h-1)),lat=line+(Math.PI/2-line)*v;
    // Inset below the minimum radius of the existing 24×18 faceted head, so
    // the lip meets real triangles rather than floating above an ideal sphere.
    const radius=j===0?.97:1.028+Math.sin(v*Math.PI)*(style==='swept'?.055*(.6+.4*Math.sin(yaw)):.016);
    positions.push(radius*Math.sin(yaw)*Math.cos(lat),radius*Math.sin(lat),radius*Math.cos(yaw)*Math.cos(lat));uvs.push(i/w,v);
  }
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const a=j*(w+1)+i;indices.push(a,a+1,a+w+2);if(j<h-1)indices.push(a,a+w+2,a+w+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();closeNormals(g,w,h);return g;
}
export function tailGeometry():THREE.BufferGeometry {
  const path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.08,-.96),new THREE.Vector3(0,.02,-1.23),new THREE.Vector3(0,-.35,-1.35),new THREE.Vector3(0,-.78,-1.21)]);
  const g=new THREE.TubeGeometry(path,14,.22,8,false),p=g.attributes.position;
  for(let j=0;j<=14;j++){const center=path.getPointAt(j/14),factor=j===14?0:.65+.35*Math.sin((j/14)*Math.PI);for(let i=0;i<=8;i++){const k=j*9+i,v=new THREE.Vector3().fromBufferAttribute(p,k).sub(center).multiplyScalar(factor).add(center);p.setXYZ(k,v.x,v.y,v.z);}}
  g.computeVertexNormals();closeNormals(g,8,14);return g;
}
export function glassesGeometry():THREE.BufferGeometry {
  const curves:THREE.BufferGeometry[]=[];
  const surface=(x:number,y:number)=>{const yaw=(x/256-.5)*2,lat=(.5-y/256)*1.5;return new THREE.Vector3(Math.sin(yaw)*Math.cos(lat),Math.sin(lat),Math.cos(yaw)*Math.cos(lat)).multiplyScalar(1.043);};
  for(const x of [89,167]){const pts=[];for(let i=0;i<32;i++){const a=i/32*Math.PI*2;pts.push(surface(x+31*Math.cos(a),103+36*Math.sin(a)));}curves.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true),40,.012,6,true));}
  curves.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([surface(120,99),surface(128,94),surface(136,99)]),8,.012,6,false));
  for(const sign of [-1,1]){const pts=[];for(let i=0;i<=8;i++){const yaw=sign*(.55+i/8*.85);pts.push(new THREE.Vector3(Math.sin(yaw),.15,Math.cos(yaw)).normalize().multiplyScalar(1.043));}curves.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),12,.012,6,false));}
  const merged=mergeGeometries(curves)!;curves.forEach(g=>g.dispose());return merged;
}
export function hoodGeometry(radius:number,length:number):THREE.BufferGeometry {
  // The supported neck radius is at most .4R; this tube's inner opening is .44R.
  const points=[];for(let i=0;i<=20;i++){const a=-.85*Math.PI+i/20*1.7*Math.PI,x=Math.sin(a)*radius*.70,z=-Math.cos(a)*radius*.55;
    points.push(new THREE.Vector3(x,length/2+Math.sqrt(radius*radius-x*x-z*z)+radius*.018,z));}
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,radius*.11,6,false);
}
