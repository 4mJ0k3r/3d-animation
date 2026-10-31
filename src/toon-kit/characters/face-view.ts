import * as THREE from 'three';
import type {CharacterResourceOwner} from './rig';
import type {FaceConfig,ResolvedFace} from './face';
import {paintFace} from './face-paint';

/** Unit spherical patch: +Z forward, invisible boundary, shared within one factory. */
function patchGeometry():THREE.BufferGeometry {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],w=24,h=16;
  for(let y=0;y<=h;y++)for(let x=0;x<=w;x++) {
    const u=x/w,v=y/h,yaw=(u-.5)*2,lat=(v-.5)*1.5;
    positions.push(Math.sin(yaw)*Math.cos(lat),Math.sin(lat),Math.cos(yaw)*Math.cos(lat));uvs.push(u,v);
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*(w+1)+x;indices.push(i,i+1,i+w+2,i,i+w+2,i+w+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function createFacePool(owner:CharacterResourceOwner) {
  let geometry:THREE.BufferGeometry|undefined;
  return (head:THREE.Object3D,radius:number,config:FaceConfig)=>{
    // Pure Node evaluations don't allocate graphics. Browser rendering always has a canvas.
    if(typeof document==='undefined')return {prepare:(_state:ResolvedFace)=>(()=>{})};
    const size=config.textureSize??256;
    const front=document.createElement('canvas'),back=document.createElement('canvas');front.width=front.height=back.width=back.height=size;
    const context=back.getContext('2d');if(!context)throw new Error('Facial Canvas2D unavailable');
    const texture=new THREE.CanvasTexture(front);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
    texture.minFilter=texture.magFilter=THREE.LinearFilter;
    // The head supplies opaque depth. Blending preserves antialiasing and soft blush;
    // alphaTest also carries the cutout into the existing normal/depth policy passes.
    const material=new THREE.MeshBasicMaterial({map:texture,alphaTest:.05,transparent:true,depthWrite:false,depthTest:true,toneMapped:false});
    const mesh=new THREE.Mesh(geometry??=patchGeometry(),material);mesh.name='face';mesh.scale.setScalar(radius*1.012);
    mesh.userData.outlineMode='none';mesh.castShadow=false;mesh.receiveShadow=false;head.add(mesh);owner.track(mesh);
    let current=front,staging=back,key='',dead=false;
    const reset=()=>{mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.setScalar(radius*1.012);mesh.visible=true;mesh.matrixAutoUpdate=mesh.matrixWorldAutoUpdate=true;};
    owner.registerCleanup(()=>{dead=true;front.width=front.height=back.width=back.height=1;});
    return {prepare(state:ResolvedFace):()=>void {
      if(dead||owner.signal.aborted)throw new Error('Facial owner disposed');
      const next=JSON.stringify(state);if(next===key)return reset;
      const ctx=staging.getContext('2d');if(!ctx)throw new Error('Facial Canvas2D unavailable');paintFace(ctx,state,size);
      // Publish only after every cast actor has passed validation/raster preparation.
      return ()=>{reset();const old=current;current=staging;staging=old;texture.image=current;texture.needsUpdate=true;key=next;};
    }};
  };
}
