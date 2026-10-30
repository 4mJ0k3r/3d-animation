import type {CharacterProportions} from '../toon-kit/characters';

/** Shared by the visual fixture and software-rendering assertions. */
export const COMPACT: Readonly<CharacterProportions> = Object.freeze({
  torsoRadius:.30,torsoLength:.48,headRadius:.62,neckRadius:.08,neckLength:.10,
  upperArmLength:.34,lowerArmLength:.30,armRadius:.038,handRadius:.072,
  upperLegLength:.35,lowerLegLength:.33,legRadius:.045,shoeWidth:.17,shoeHeight:.14,shoeLength:.30,hipSpread:.66,
});
export const TALL: Readonly<CharacterProportions> = Object.freeze({
  torsoRadius:.22,torsoLength:.72,headRadius:.46,neckRadius:.065,neckLength:.10,
  upperArmLength:.42,lowerArmLength:.38,armRadius:.03,handRadius:.06,
  upperLegLength:.62,lowerLegLength:.60,legRadius:.035,shoeWidth:.14,shoeHeight:.12,shoeLength:.27,hipSpread:.62,
});
