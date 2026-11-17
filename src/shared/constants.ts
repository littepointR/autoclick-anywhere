import type {
  ExtensionSettings,
  MacroConfig,
  MultiPointConfig,
  PersistedState,
  ScrollModeConfig,
  SingleClickConfig,
} from './types.ts';

export const AUTOCLICK_HOST_ID = 'autoclick-anywhere-root';
export const STORAGE_KEY = 'autoclick_anywhere_state_v1';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  engine: 'cdp',
  showRipples: true,
  showPins: true,
  autoDetachDebugger: true,
  emergencyEscStop: true,
  hotkeyToggleRun: 'F8',
  hotkeyToggleRecord: 'F9',
  hotkeyToggleHud: 'Alt+H',
};

export const DEFAULT_SINGLE_CONFIG: SingleClickConfig = {
  followCursor: false,
  target: null,
  button: 'left',
  clickKind: 'single',
  holdMs: 30,
  intervalMs: 250,
  jitterMs: 15,
  jitterPx: 2,
  maxCount: 0,
};

export const DEFAULT_MULTI_CONFIG: MultiPointConfig = {
  items: [],
  loopCount: 1,
  loopDelayMs: 400,
  jitterMs: 15,
  jitterPx: 2,
};

export const DEFAULT_SCROLL_CONFIG: ScrollModeConfig = {
  useTarget: false,
  target: null,
  direction: 'down',
  deltaX: 0,
  deltaY: 320,
  intervalMs: 400,
  smooth: true,
  maxCount: 0,
};

export const DEFAULT_MACRO_CONFIG: MacroConfig = {
  activeMacroId: null,
  macros: [],
  playbackSpeed: 1,
  loopCount: 1,
  loopDelayMs: 500,
  recordMouseMove: false,
  recordKeyboard: true,
  recordWheel: true,
};

export const DEFAULT_PERSISTED_STATE: PersistedState = {
  activeMode: 'single',
  hudVisible: true,
  hudMinimized: false,
  hudPosition: null,
  settings: { ...DEFAULT_SETTINGS },
  single: { ...DEFAULT_SINGLE_CONFIG },
  multi: { ...DEFAULT_MULTI_CONFIG },
  scroll: { ...DEFAULT_SCROLL_CONFIG },
  macro: { ...DEFAULT_MACRO_CONFIG },
};

export function createId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
