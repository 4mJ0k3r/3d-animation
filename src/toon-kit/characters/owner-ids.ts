import type {CharacterResourceOwner} from './rig';

// Only an immutable key is module-scoped. The registry is data on one owner;
// there is no global Map/WeakMap, GPU cache or link between live engines.
const characterIds = Symbol('toon-kit.characterIds');
type IdOwner = CharacterResourceOwner & {[characterIds]?: Set<string>};

export function ownerCharacterIds(owner: CharacterResourceOwner): Set<string> {
  const scoped = owner as IdOwner;
  if (scoped[characterIds]) return scoped[characterIds];
  const ids = new Set<string>();
  Object.defineProperty(scoped, characterIds, {value: ids, configurable: true});
  owner.registerCleanup(() => {ids.clear(); delete scoped[characterIds];});
  return ids;
}
