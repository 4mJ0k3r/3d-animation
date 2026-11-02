export type QASeverity = 'ERROR' | 'WARNING' | 'INFO';

export type QAVerdict = 'PASSED' | 'WARNINGS' | 'FAILED';

export type QACheckStatus = 'PASSED' | 'WARNING' | 'FAILED' | 'NOT_APPLICABLE' | 'NOT_EVALUATED';

export interface QAIssue {
  readonly severity: QASeverity;
  readonly code: string;
  readonly message: string;
  readonly timestamp?: number;
  readonly frame?: number;
  readonly scene?: string;
  readonly shot?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface QACheckResult {
  readonly status: QACheckStatus;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface QAVideoInfo {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frames: number;
  readonly duration: number;
  readonly codec: string;
  readonly pixFmt?: string;
  readonly bitRate?: number;
  readonly isValid: boolean;
}

export interface QAAudioInfo {
  readonly present: boolean;
  readonly expected: boolean;
  readonly codec?: string | null;
  readonly channels?: number;
  readonly sampleRate?: number | null;
  readonly duration?: number | null;
  readonly bitRate?: number | null;
}

export interface QAPlanInfo {
  readonly path?: string;
  readonly evaluated: boolean;
  readonly title?: string;
  readonly totalScenes?: number;
  readonly totalShots?: number;
  readonly expectedFrames?: number;
  readonly expectedFps?: number;
  readonly expectedWidth?: number;
  readonly expectedHeight?: number;
  readonly hasAudio?: boolean;
}

export interface QASampledFrame {
  readonly frame: number;
  readonly timestamp: number;
  readonly label: string;
  readonly type: 'START' | 'CUT' | 'MID' | 'ANOMALY' | 'END';
  readonly sceneId?: string;
  readonly shotId?: string;
}

export interface QAContactSheetInfo {
  readonly path: string;
  readonly totalFramesSampled: number;
  readonly grid: string;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly sampledFrames: readonly QASampledFrame[];
}

export interface QAReport {
  readonly version: '1.0.0';
  readonly timestamp: string;
  readonly verdict: QAVerdict;
  readonly summary: string;
  readonly video: QAVideoInfo;
  readonly audio: QAAudioInfo;
  readonly plan?: QAPlanInfo;
  readonly checks: Readonly<Record<string, QACheckResult>>;
  readonly issues: readonly QAIssue[];
  readonly contactSheet?: QAContactSheetInfo;
  readonly timing: {
    readonly executionTimeMs: number;
  };
}

export interface QAOptions {
  readonly video: string;
  readonly plan?: string;
  readonly report?: string;
  readonly contactSheet?: string;
  readonly output?: string;
  readonly maxFrames?: number;
  readonly freezeThresh?: number;
  readonly blackThresh?: number;
  readonly quiet?: boolean;
  readonly json?: boolean;
}
