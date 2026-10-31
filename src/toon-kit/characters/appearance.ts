import {freezeData} from './pose';
export type AppearancePreset='doctor'|'patient'|'office'|'casual';
export type HairStyle='none'|'short'|'swept'|'tied-back';
export type ClothingStyle='shirt'|'hoodie'|'lab-coat'|'jacket';
export type Accessory='glasses'|'badge'|'stethoscope';
export interface Appearance {
  readonly preset?:AppearancePreset;
  readonly skin?:string;
  readonly hair?:{readonly style?:HairStyle;readonly color?:string};
  readonly clothing?:{readonly style?:ClothingStyle;readonly color?:string;readonly accent?:string;readonly sleeves?:'none'|'short'|'long'};
  readonly trousers?:{readonly style?:'solid'|'shorts';readonly color?:string};
  readonly shoes?:{readonly style?:'rounded'|'sneakers';readonly color?:string};
  readonly accessories?:readonly Accessory[];
}
export interface ResolvedAppearance {
  readonly skin:string;
  readonly hair:{readonly style:HairStyle;readonly color:string};
  readonly clothing:{readonly style:ClothingStyle;readonly color:string;readonly accent:string;readonly sleeves:'none'|'short'|'long'};
  readonly trousers:{readonly style:'solid'|'shorts';readonly color:string};
  readonly shoes:{readonly style:'rounded'|'sneakers';readonly color:string};
  readonly accessories:readonly Accessory[];
}
const defaults:ResolvedAppearance=freezeData({skin:'#f2c69d',hair:{style:'none',color:'#33251e'},clothing:{style:'shirt',color:'#36a9b0',accent:'#fff4df',sleeves:'short'},trousers:{style:'solid',color:'#263244'},shoes:{style:'rounded',color:'#25222b'},accessories:[]});
const presets:Record<AppearancePreset,Appearance>=freezeData({
  doctor:{skin:'#e4b288',hair:{style:'short',color:'#382a24'},clothing:{style:'lab-coat',color:'#fff9ed',accent:'#319ba4',sleeves:'long'},trousers:{color:'#243443'},shoes:{color:'#3e3028'},accessories:['stethoscope','badge']},
  patient:{skin:'#d3966b',hair:{style:'swept',color:'#593728'},clothing:{style:'hoodie',color:'#249da4',accent:'#e6eadc',sleeves:'long'},trousers:{color:'#33445e'},shoes:{style:'sneakers',color:'#356c83'}},
  office:{skin:'#f2c69d',hair:{style:'swept',color:'#272332'},clothing:{style:'jacket',color:'#344e80',accent:'#f8e9c9',sleeves:'long'},trousers:{color:'#323647'},shoes:{color:'#22202b'},accessories:['glasses','badge']},
  casual:{skin:'#ad7353',hair:{style:'tied-back',color:'#33251e'},clothing:{style:'shirt',color:'#d16b5d',accent:'#ffe3a1',sleeves:'short'},trousers:{color:'#335052'},shoes:{style:'sneakers',color:'#81585d'}},
});
const object=(v:unknown):boolean=>!!v&&typeof v==='object'&&!Array.isArray(v);
const only=(v:object,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
/** Validate before allocation; copy/freeze only plain configuration, never caller objects. */
export function resolveAppearance(input:Appearance={}):ResolvedAppearance {
  if(!object(input)||!only(input,['preset','skin','hair','clothing','trousers','shoes','accessories'])||
    (input.preset!==undefined&&!Object.hasOwn(presets,input.preset)))throw new Error('Invalid appearance/preset');
  for(const [key,keys]of [['hair',['style','color']],['clothing',['style','color','accent','sleeves']],['trousers',['style','color']],['shoes',['style','color']]] as const){
    const value=input[key];if(value!==undefined&&(!object(value)||!only(value as object,[...keys])))throw new Error('Invalid appearance '+key);
  }
  if(input.skin!==undefined&&(typeof input.skin!=='string'||!/^#[0-9a-f]{6}$/i.test(input.skin)))throw new Error('Invalid skin color');
  if(input.accessories!==undefined&&!Array.isArray(input.accessories))throw new Error('Accessories must be an array');
  const base=input.preset?presets[input.preset]:{};
  const style=input.clothing?.style??base.clothing?.style??'shirt';
  const styleColor={shirt:'#36a9b0',hoodie:'#249da4','lab-coat':'#fff9ed',jacket:'#344e80'}[style];
  const result:ResolvedAppearance={skin:input.skin??base.skin??defaults.skin,
    hair:{...defaults.hair,...base.hair,...input.hair},clothing:{...defaults.clothing,color:styleColor,...base.clothing,...input.clothing,
      sleeves:input.clothing?.sleeves??(input.clothing?.style?style==='shirt'?'short':'long':base.clothing?.sleeves??(style==='shirt'?'short':'long'))},
    trousers:{...defaults.trousers,...base.trousers,...input.trousers},shoes:{...defaults.shoes,...base.shoes,...input.shoes},
    accessories:[...(input.accessories??base.accessories??[])].sort()};
  if(!['none','short','swept','tied-back'].includes(result.hair.style)||!['shirt','hoodie','lab-coat','jacket'].includes(result.clothing.style)||
    !['none','short','long'].includes(result.clothing.sleeves)||!['solid','shorts'].includes(result.trousers.style)||!['rounded','sneakers'].includes(result.shoes.style))throw new Error('Unknown appearance style');
  for(const color of [result.skin,result.hair.color,result.clothing.color,result.clothing.accent,result.trousers.color,result.shoes.color])if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Appearance colors must be #rrggbb');
  if((input.accessories!==undefined&&!Array.isArray(input.accessories))||result.accessories.some(a=>!['glasses','badge','stethoscope'].includes(a))||new Set(result.accessories).size!==result.accessories.length)throw new Error('Invalid or duplicate accessory');
  return freezeData(result);
}
export function appearancePreset(preset:AppearancePreset,overrides:Omit<Appearance,'preset'>={}):Appearance {
  if(!object(overrides)||!only(overrides,['skin','hair','clothing','trousers','shoes','accessories']))throw new Error('Invalid appearance preset overrides');
  // Return complete immutable appearance fields, allowing simple property spread/reuse.
  return resolveAppearance({...overrides,preset});
}
export const APPEARANCE_ATTACHMENTS=freezeData({hair:'head',glasses:'head',hood:'torso',badge:'torso',stethoscope:'neckBase'} as const);
