export type ProductionStatus = 'SUCCESS' | 'WARNINGS' | 'FAILED';

export interface ProductionOptions {
  readonly plan: string;
  readonly output?: string;
  readonly report?: string;
  readonly contactSheet?: string;
  readonly verify?: boolean;
  readonly maxFrames?: number;
  readonly freezeThresh?: number;
  readonly blackThresh?: number;
  readonly skipQA?: boolean;
  readonly quiet?: boolean;
  readonly json?: boolean;
}

export interface ProductionReport {
  readonly version: '1.0.0';
  readonly timestamp: string;
  readonly status: ProductionStatus;
  readonly plan: {
    readonly path: string;
    readonly title?: string;
    readonly scenes?: number;
    readonly frames?: number;
    readonly fps?: number;
    readonly video?: { readonly width: number; readonly height: number };
  };
  readonly output: {
    readonly path: string;
    readonly sizeBytes: number;
    readonly frames?: number;
    readonly duration?: number;
    readonly codec?: string;
  };
  readonly render: {
    readonly segmented?: boolean;
    readonly manifest?: string;
    readonly segments?: readonly unknown[];
    readonly reportPath: string;
  };
  readonly qa?: {
    readonly verdict: string;
    readonly reportPath: string;
    readonly checks: Readonly<Record<string, { readonly status: string; readonly message: string }>>;
    readonly issues: readonly unknown[];
  };
  readonly contactSheet?: {
    readonly path: string;
    readonly totalFramesSampled: number;
    readonly grid: string;
  };
  readonly timing: {
    readonly validationMs: number;
    readonly renderMs: number;
    readonly qaMs?: number;
    readonly totalMs: number;
  };
  readonly guidance: {
    readonly technicalIntegrity: string;
    readonly narrativeContinuity: string;
    readonly visualReviewRequired: string;
  };
}
