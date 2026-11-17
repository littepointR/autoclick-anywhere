export type EngineMode = 'cdp' | 'dom';
export type MouseButtonType = 'left' | 'right' | 'middle';
export type ClickKind = 'single' | 'double' | 'hold';
export type LocatorMode = 'auto' | 'dom' | 'canvas-relative' | 'viewport';
export type ScrollDirection = 'down' | 'up' | 'right' | 'left' | 'custom';
export type LocaleCode = 'zh_CN' | 'zh_TW' | 'en' | 'ja' | 'ko';
export type LanguageSetting = 'auto' | LocaleCode;

export interface TargetLocator {
  mode: LocatorMode;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  selector?: string;
  tagName?: string;
  label?: string;
  relX?: number;
  relY?: number;
  scrollIntoView?: boolean;
}

export type FlowStepType = 'click' | 'wheel' | 'drag' | 'key' | 'wait';

export interface FlowStep {
  id: string;
  enabled: boolean;
  type: FlowStepType;
  name?: string;

  // Spatial targeting
  followCursor?: boolean;
  usePageScroll?: boolean;
  target?: TargetLocator | null;
  endTarget?: TargetLocator | null;

  // Click / Drag options
  button: MouseButtonType;
  clickKind: ClickKind;
  holdMs: number;

  // Wheel options
  direction: ScrollDirection;
  deltaX: number;
  deltaY: number;

  // Drag duration
  dragDurationMs: number;

  // Keyboard options
  key?: string;
  code?: string;
  keyCode?: number;
  modifiers?: number; // bitmask: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift

  // Timing & Repetition sub-phases
  waitMs: number;
  delayBeforeMs: number;
  repeatCount: number; // >= 1, or 0 for infinite repeats on this step
  repeatIntervalMs: number;
  delayAfterMs: number;
  jitterMs: number;
  jitterPx: number;
}

export interface FlowRecord {
  id: string;
  name: string;
  createdAt: number;
  source?: 'manual' | 'macro' | 'preset';
  playbackSpeed: number;
  loopCount: number; // 0 = infinite
  loopDelayMs: number;
  steps: FlowStep[];
}

export type RunLifecycleState = 'idle' | 'running' | 'paused';

export type FlowSubPhase =
  | 'idle'
  | 'delayBefore'
  | 'acting'
  | 'holding'
  | 'dragging'
  | 'waiting'
  | 'repeatInterval'
  | 'delayAfter'
  | 'loopCooldown';

export interface PhaseTimingState {
  isTimed: boolean;
  totalDurationMs: number;
  remainingMs: number;
  startedAtPerf: number;
}

export interface ExtensionSettings {
  language: LanguageSetting;
  engine: EngineMode;
  showRipples: boolean;
  showPins: boolean;
  autoDetachDebugger: boolean;
  emergencyEscStop: boolean;
  recordWheel: boolean;
  recordKeyboard: boolean;
  hotkeyToggleRun: string;
  hotkeyToggleRecord: string;
  hotkeyToggleHud: string;
}

export interface PersistedState {
  hudWide: boolean;
  hudPosition: { x: number; y: number } | null;
  settings: ExtensionSettings;
  activeFlowId: string | null;
  flows: FlowRecord[];
}

export interface RuntimeStatus {
  hudVisible: boolean;
  showPins: boolean;
  runState: RunLifecycleState;
  isRunning: boolean;
  isPaused: boolean;
  isRecording: boolean;
  isPicking: boolean;
  effectiveEngine: EngineMode;
  fallbackReason?: string;
  executedCount: number;
  currentLoop: number;
  totalLoops: number;
  currentStepIndex: number;
  currentStepId: string | null;
  currentRepeat: number;
  totalRepeats: number;
  subPhase: FlowSubPhase;
  subPhaseLabel: string;
  phaseTiming: PhaseTimingState | null;
  recordedStepsCount: number;
}

export type VisualEffect =
  | { kind: 'click'; x: number; y: number; button: MouseButtonType; isCanvas: boolean }
  | { kind: 'wheel'; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: 'drag'; startX: number; startY: number; endX: number; endY: number };

export interface DispatchResult {
  ok: boolean;
  fallbackToDom?: boolean;
  reason?: string;
}

export type BgRequestMessage =
  | {
      type: 'CDP_CLICK';
      x: number;
      y: number;
      button: MouseButtonType;
      clickKind: ClickKind;
      holdMs: number;
    }
  | {
      type: 'CDP_DRAG';
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      durationMs: number;
      button: MouseButtonType;
    }
  | {
      type: 'CDP_WHEEL';
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
    }
  | {
      type: 'CDP_KEY';
      key: string;
      code: string;
      keyCode: number;
      modifiers: number;
    }
  | { type: 'DETACH_DEBUGGER' }
  | { type: 'PREFLIGHT_CDP' }
  | { type: 'POPUP_TOGGLE_HUD' }
  | { type: 'POPUP_SHOW_HUD' }
  | { type: 'POPUP_PAUSE_RESUME' }
  | { type: 'POPUP_STOP' }
  | { type: 'POPUP_TOGGLE_RECORD' }
  | { type: 'POPUP_TOGGLE_PINS' }
  | { type: 'POPUP_GET_STATUS' };

export type ContentMessage =
  | { type: 'TOGGLE_HUD' }
  | { type: 'SHOW_HUD' }
  | { type: 'PAUSE_RESUME_RUN' }
  | { type: 'STOP_RUN' }
  | { type: 'TOGGLE_RECORD' }
  | { type: 'TOGGLE_PINS' }
  | { type: 'GET_STATUS' }
  | { type: 'SYNC_SETTINGS'; settings: ExtensionSettings };
