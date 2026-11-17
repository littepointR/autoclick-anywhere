import { DEFAULT_PERSISTED_STATE, STORAGE_KEY } from './constants.ts';
import type { PersistedState } from './types.ts';

let memoryFallback: PersistedState | null = null;

function mergePersistedState(raw: Partial<PersistedState> | null | undefined): PersistedState {
  if (!raw) {
    return structuredClone(DEFAULT_PERSISTED_STATE);
  }
  return {
    activeMode: raw.activeMode ?? DEFAULT_PERSISTED_STATE.activeMode,
    hudVisible: raw.hudVisible ?? DEFAULT_PERSISTED_STATE.hudVisible,
    hudMinimized: raw.hudMinimized ?? DEFAULT_PERSISTED_STATE.hudMinimized,
    hudPosition: raw.hudPosition ?? null,
    settings: { ...DEFAULT_PERSISTED_STATE.settings, ...(raw.settings ?? {}) },
    single: { ...DEFAULT_PERSISTED_STATE.single, ...(raw.single ?? {}) },
    multi: { ...DEFAULT_PERSISTED_STATE.multi, ...(raw.multi ?? {}) },
    scroll: { ...DEFAULT_PERSISTED_STATE.scroll, ...(raw.scroll ?? {}) },
    macro: { ...DEFAULT_PERSISTED_STATE.macro, ...(raw.macro ?? {}) },
  };
}

export async function loadPersistedState(): Promise<PersistedState> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return mergePersistedState(result?.[STORAGE_KEY] as Partial<PersistedState> | undefined);
    } catch {
      // Fallback below
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return mergePersistedState(JSON.parse(raw) as Partial<PersistedState>);
      }
    } catch {
      // Ignore malformed storage
    }
  }

  return mergePersistedState(memoryFallback);
}

export async function savePersistedState(state: PersistedState): Promise<void> {
  memoryFallback = structuredClone(state);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
      return;
    } catch {
      // Fallback below
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }
}
