import type { AppearancePreset } from '../characters/appearance';
import type { CharacterProportions } from '../characters/types';
import type { ExpressionName } from '../characters/face';
import type { GestureName } from '../characters/acting';
import type { StaticShot } from '../direction/types';
import type { StoryAudioPlan, CompiledAudioClip } from './audio-types';
export type StoryTarget = string | {
  readonly actor: string;
  readonly anchor?: 'head' | 'pelvis' | 'leftWrist' | 'rightWrist';
};
export type StorySupport = {
  readonly type: 'stand';
  readonly at: string;
} | {
  readonly type: 'sit';
  readonly seat: string;
  readonly floor: string;
  readonly feet?: 'auto' | 'floor' | 'dangle';
};
export interface StoryCharacter {
  readonly appearance?: AppearancePreset;
  readonly proportions?: Partial<CharacterProportions>;
  readonly expression?: ExpressionName;
  readonly scale?: number;
}
export type StoryAction = {
  readonly actor: string;
} & (StorySupport | {
  readonly type: 'walk';
  readonly path: string;
  readonly strideScale?: number;
} | {
  readonly type: 'look';
  readonly target: StoryTarget;
  readonly transitionFrames?: number;
} | {
  readonly type: 'point';
  readonly target: StoryTarget;
  readonly hand?: 'auto' | 'left' | 'right';
  readonly intensity?: number;
} | {
  readonly type: 'gesture';
  readonly name: GestureName;
  readonly hand?: 'auto' | 'left' | 'right' | 'both';
  readonly intensity?: number;
} | {
  readonly type: 'expression';
  readonly name: ExpressionName;
  readonly transitionFrames?: number;
} | {
  readonly type: 'react';
  readonly name: 'surprised' | 'worried' | 'sad' | 'excited';
  readonly intensity?: number;
});
export interface StoryBeat {
  readonly id: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly actions: readonly StoryAction[];
}
export interface StoryCue {
  readonly id: string;
  readonly kind: 'dialogue' | 'caption';
  readonly text: string;
  readonly speaker?: string;
  readonly language?: 'hi' | 'en';
  readonly startFrame: number;
  readonly endFrame: number;
  readonly mode?: 'line' | 'words';
  readonly alignmentId?: string;
  /** Required for word captions: supplied timestamps or explicitly estimated fallback. */
  readonly timing?: 'supplied' | 'estimated';
}
/**
 * Phase 6D-A: bounded semantic prop animation. Frames are absolute story frames,
 * half-open; each track (slide / lift / rotate per axis) goes "to" a value and holds.
 */
export type PropAnimation = {
  readonly prop: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly easing?: 'linear' | 'easeInOut';
} & ({
  readonly type: 'slide';
  readonly to: string;
} | {
  readonly type: 'lift';
  readonly height: number;
} | {
  readonly type: 'rotate';
  readonly axis: 'x' | 'y' | 'z';
  readonly degrees: number;
});
export interface StoryScene {
  readonly id: string;
  readonly setting: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly characters: Readonly<Record<string, {
    readonly stance: StorySupport;
    readonly expression?: ExpressionName;
    readonly lookAt?: StoryTarget;
  }>>;
  readonly axis: readonly [string, string];
  readonly beats: readonly StoryBeat[];
  readonly cues?: readonly StoryCue[];
  readonly shots: readonly StaticShot[];
  readonly propAnimations?: readonly PropAnimation[];
}
/** JSON-only; all frame numbers are absolute, intervals half-open. */
export interface StoryPlan {
  readonly version: 1;
  readonly fps: number;
  readonly durationInFrames: number;
  readonly characters: Readonly<Record<string, StoryCharacter>>;
  readonly scenes: readonly StoryScene[];
  readonly audio?: StoryAudioPlan;
}
export interface StoryDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly scene?: string;
  readonly beat?: string;
  readonly actor?: string;
  readonly frame?: number;
  readonly details?: unknown;
}
export class StoryError extends Error {
  constructor(public readonly diagnostic: StoryDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.message}`);
    this.name = 'StoryError';
  }
}
export function storyFail(code: string, message: string, details: Partial<StoryDiagnostic> = {}): never {
  throw new StoryError({
    code,
    message,
    ...details
  });
}
export interface StoryClip {
  readonly scene: string;
  readonly beat: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly action: StoryAction;
  readonly from?: StoryTarget | ExpressionName | null;
}
export interface StoryIntent {
  readonly visible: boolean;
  readonly scene: string;
  readonly stance: StorySupport | StoryClip;
  readonly expression: ExpressionName | StoryClip;
  readonly gaze: StoryTarget | StoryClip | null;
  readonly gesture: StoryClip | null;
}
export interface StoryFrame {
  readonly frame: number;
  readonly scene: StoryScene;
  readonly localFrame: number;
  readonly poses: Readonly<Record<string, StoryIntent>>;
  readonly shot: StaticShot;
  readonly cue: StoryCue | null;
  readonly audio: readonly CompiledAudioClip[];
}
