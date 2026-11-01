import { createPrimitiveFactory, setupCartoonLighting } from '../lib';
import type { CartoonEngine } from '../engine';
import type { StorySettingBinding } from '../story/player';
import type { CompiledStoryDocument } from './document';
import { buildOffice, buildClinic } from './environment-builders';
import type { EnvironmentBuilder } from './environment-builders';
import { buildStreet } from './street';
import { placeProps } from './prefabs';
import type { EnvironmentPreset } from './environment-registry';
import { storyFail } from '../story/types';
const BUILDERS: Readonly<Record<EnvironmentPreset, EnvironmentBuilder>> = Object.freeze({
  office: buildOffice,
  clinic: buildClinic,
  street: buildStreet
});
/** Stable compatibility entry point; registry construction happens once per engine. */
export function createStoryEnvironments(engine: CartoonEngine, compiled: CompiledStoryDocument, layoutOrder: readonly string[] = Object.keys(compiled.document.layouts)) {
  setupCartoonLighting(engine.scene);
  const p = createPrimitiveFactory(engine),
    settings: Record<string, StorySettingBinding> = {};
  for (const [name, layout] of Object.entries(compiled.document.layouts)) {
    const index = layoutOrder.indexOf(name);
    if (index < 0) storyFail('INVALID_LAYOUT_ORDER', 'Missing canonical layout order for ' + name);
    const binding = BUILDERS[layout.preset](engine, p, name, index, layout);
    settings[name] = placeProps(p, binding, layout);
    engine.track(binding.root);
  }
  return settings;
}
