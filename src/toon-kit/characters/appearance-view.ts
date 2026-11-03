import * as THREE from 'three';
import {createToonGradientMap} from '../lib';
import type {CharacterResourceOwner} from './rig';
import type {CharacterDefinition,NodeName,PartName} from './types';
import type {ResolvedAppearance} from './appearance';
import {APPEARANCE_ATTACHMENTS} from './appearance';
import {hairGeometry,tailGeometry,glassesGeometry,hoodGeometry,cowlGeometry} from './appearance-geometry';
import {paintAppearance,sleeveColor} from './appearance-paint';
import type {FabricRole} from './appearance-paint';

/** Immutable, factory/owner-scoped resources only; appearance is construction-time. */
export function createAppearancePool(owner:CharacterResourceOwner){
  const geometries=new Map<string,THREE.BufferGeometry>(),materials=new Map<string,THREE.MeshToonMaterial>();
  let gradient:THREE.DataTexture|undefined;
  owner.registerCleanup(()=>{geometries.clear();materials.clear();});
  function material(a:ResolvedAppearance,color:string,role?:FabricRole){
    // Skin/hair identity must not duplicate an otherwise identical fabric map.
    const recipe=role==='torso'?[a.clothing,a.accessories.filter(v=>v!=='glasses')]:role==='hair'?a.hair:role==='shoe'?a.shoes:role==='thigh'||role==='shin'?a.trousers:a.clothing;
    const key=role?JSON.stringify([role,recipe]):color;
    const cached=materials.get(key);if(cached)return cached;
    let map:THREE.CanvasTexture|undefined;
    if(role&&typeof document!=='undefined'){
      // Only the detailed torso atlas needs 512; its visible front is a quarter
      // of the UV width. This is a one-time, bounded allocation, never per-frame.
      const size=role==='torso'?512:256,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Appearance Canvas2D unavailable');ctx.scale(size/256,size/256);paintAppearance(ctx,a,role);
      map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.generateMipmaps=false;map.minFilter=map.magFilter=THREE.LinearFilter;
      owner.registerCleanup(()=>{canvas.width=canvas.height=1;});
    }
    const value=new THREE.MeshToonMaterial({color:map?'#ffffff':color,map:map??null,gradientMap:gradient??=createToonGradientMap(3)});materials.set(key,value);
    // Register immediately even before attachment or a later construction failure.
    owner.track(Object.assign(new THREE.Object3D(),{material:value}));return value;
  }
  function partMaterial(part:PartName,a:ResolvedAppearance):THREE.Material {
    const limb='#16131a',c=a.clothing,isYM=a.preset==='yellow-mellow';
    if(part==='torsoShape')return material(a,c.color,'torso');
    if(part==='headShape'||part.endsWith('Hand'))return material(a,a.skin);
    if(part==='neckShape')return isYM?material(a,c.color):material(a,a.skin);
    if(part.endsWith('UpperArm'))return c.sleeves==='none'?material(a,limb):material(a,isYM?c.color:sleeveColor(c.color),c.sleeves==='short'?'upperSleeve':undefined);
    if(part.endsWith('Forearm'))return c.sleeves==='long'?material(a,isYM?c.color:sleeveColor(c.color),'lowerSleeve'):material(a,limb);
    if(part.endsWith('ElbowShape'))return material(a,c.sleeves==='long'?(isYM?c.color:sleeveColor(c.color)):limb);
    if(part.endsWith('Shoe'))return material(a,a.shoes.color,a.shoes.style==='sneakers'?'shoe':undefined);
    if(part.endsWith('Thigh')&&a.trousers.style==='shorts')return material(a,a.trousers.color,'thigh');
    return material(a,a.trousers.style==='shorts'&&(part.endsWith('Shin')||part.endsWith('KneeShape'))?limb:a.trousers.color);
  }
  function attach(nodes:Record<NodeName,THREE.Object3D>,definition:CharacterDefinition,a:ResolvedAppearance){
    const controlled:{mesh:THREE.Mesh;scale:number}[]=[];
    const add=(name:string,parent:NodeName,scale:number,key:string,build:()=>THREE.BufferGeometry,mat:THREE.Material)=>{
      let geometry=geometries.get(key);if(!geometry){geometry=build();geometries.set(key,geometry);}
      const mesh=new THREE.Mesh(geometry,mat);mesh.name='appearance:'+name;mesh.userData.outlineMode='silhouette-only';
      mesh.userData.attachmentAnchor=APPEARANCE_ATTACHMENTS[name as keyof typeof APPEARANCE_ATTACHMENTS]??'head';
      mesh.castShadow=name!=='glasses';mesh.receiveShadow=true;nodes[parent].add(mesh);owner.track(mesh);controlled.push({mesh,scale});
    };
    const r=definition.proportions.headRadius;
    if(a.hair.style!=='none'){
      const style=a.hair.style;
      add('hair','head',r,'hair:'+style,()=>hairGeometry(style),material(a,a.hair.color,(style==='swept'||style==='beanie')?'hair':undefined));
      if(style==='tied-back')add('hair-tail','head',r,'tail',tailGeometry,material(a,a.hair.color));
    }
    if(a.accessories.includes('glasses'))add('glasses','head',r,'glasses',glassesGeometry,material(a,'#292532'));
    if(a.clothing.style==='hoodie'){
      const p=definition.proportions;add('hood','torso',1,`hood:${p.torsoRadius}:${p.torsoLength}`,()=>hoodGeometry(p.torsoRadius,p.torsoLength),material(a,a.clothing.color));
    }
    if((a.hair.style==='beanie'||a.preset==='yellow-mellow')&&a.clothing.style==='hoodie'){
      add('cowl','head',r,'cowl',cowlGeometry,material(a,a.clothing.color));
    }
    const reset=()=>{for(const {mesh,scale}of controlled){mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.setScalar(scale);mesh.visible=true;mesh.matrixAutoUpdate=mesh.matrixWorldAutoUpdate=true;}};
    reset();return {reset};
  }
  return {partMaterial,attach};
}
