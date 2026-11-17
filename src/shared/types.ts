export type EngineMode = 'cdp' | 'dom';
export type ActiveTabMode = 'single' | 'multi' | 'scroll' | 'macro';
export type MouseButtonType = 'left' | 'right' | 'middle';
export type ClickKind = 'single' | 'double' | 'hold';
export type LocatorMode = 'auto' | 'dom' | 'canvas-relative' | 'viewport';

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

export interface SingleClickConfig {
  followCursor: boolean;
  target: TargetLocator | null;
  button: MouseButtonType;
  clickKind: ClickKind;
  holdMs: number;
  intervalMs: number;
  jitterMs: number;
  jitterPx: number;
  maxCount: number; // 0 = infinite
}

export type MultiPointActionType = 'click' | 'scroll' | 'drag' | 'wait';

export interface MultiPointItem {
  id: string;
  enabled: boolean;
  type: MultiPointActionType;
  target: TargetLocator;
  endTarget?: TargetLocator;
  button: MouseButtonType;
  clickKind: ClickKind;
  holdMs: number;
  deltaX: number;
  deltaY: number;
  dragDurationMs: number;
  repeatCount: number;
  delayAfterMs: number;
}

export interface MultiPointConfig {
  items: MultiPointItem[];
  loopCount: number; // 0 = infinite
  loopDelayMs: number;
  jitterMs: number;
  jitterPx: number;
}

export type ScrollDirection = 'down' | 'up' | 'right' | 'left' | 'custom';

export interface ScrollModeConfig {
  useTarget: boolean;
  target: TargetLocator | null;
  direction: ScrollDirection;
  deltaX: number;
  deltaY: number;
  intervalMs: number;
  smooth: boolean;
  maxCount: number; // 0 = infinite
}

export type MacroStepType = 'click' | 'drag' | 'wheel' | 'key' | 'wait';

export interface MacroStep {
  id: string;
  type: MacroStepType;
  delayBeforeMs: number;
  target?: TargetLocator;
  endTarget?: TargetLocator;
  button?: MouseButtonType;
  clickKind?: ClickKind;
  holdMs?: number;
  durationMs?: number;
  deltaX?: number;
  deltaY?: number;
  key?: string;
  code?: string;
  keyCode?: number;
  modifiers?: number; // bitmask: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
}

export interface MacroRecord {
  id: string;
  name: string;
  createdAt: number;
  originHost?: string;
  steps: MacroStep[];
}

export interface MacroConfig {
  activeMacroId: string | null;
  macros: MacroRecord[];
  playbackSpeed: number;
  loopCount: number; // 0 = infinite
  loopDelayMs: number;
  recordMouseMove?: boolean;
  recordKeyboard: boolean;
  recordWheel: boolean;
}

export interface ExtensionSettings {
  engine: EngineMode;
  showRipples: boolean;
  showPins: boolean;
  autoDetachDebugger: boolean;
  emergencyEscStop: boolean;
  hotkeyToggleRun: string;
  hotkeyToggleRecord: string;
  hotkeyToggleHud: string;
}

export interface PersistedState {
  activeMode: ActiveTabMode;
  hudVisible: boolean;
  hudMinimized: boolean;
  hudPosition: { x: number; y: number } | null;
  settings: ExtensionSettings;
  single: SingleClickConfig;
  multi: MultiPointConfig;
  scroll: ScrollModeConfig;
  macro: MacroConfig;
}

export interface RuntimeStatus {
  isRunning: boolean;
  isRecording: boolean;
  isPicking: boolean;
  activeMode: ActiveTabMode;
  effectiveEngine: EngineMode;
  fallbackReason?: string;
  executedCount: number;
  currentLoop: number;
  currentStepIndex: number;
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
  | { type: 'POPUP_TOGGLE_RUN' }
  | { type: 'POPUP_TOGGLE_RECORD' }
  | { type: 'POPUP_GET_STATUS' };

export type ContentMessage =
  | { type: 'TOGGLE_HUD' }
  | { type: 'TOGGLE_RUN' }
  | { type: 'TOGGLE_RECORD' }
  | { type: 'STOP_ALL' }
  | { type: 'GET_STATUS' }
  | { type: 'SYNC_SETTINGS'; settings: ExtensionSettings };
