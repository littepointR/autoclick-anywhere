import {
  DEFAULT_PERSISTED_STATE,
  LEGACY_STORAGE_KEY_V1,
  STORAGE_KEY,
  createFlowStep,
  createId,
  createPresetFlow,
} from './constants.ts';
import type {
  ExtensionSettings,
  FlowRecord,
  FlowStep,
  PersistedState,
  TargetLocator,
} from './types.ts';

let memoryFallback: PersistedState | null = null;

interface LegacyV1State {
  hudPosition?: { x: number; y: number } | null;
  settings?: Partial<ExtensionSettings>;
  multi?: {
    items?: Array<{
      id?: string;
      enabled?: boolean;
      type?: 'click' | 'scroll' | 'drag' | 'wait';
      target?: TargetLocator;
      endTarget?: TargetLocator;
      button?: 'left' | 'right' | 'middle';
      clickKind?: 'single' | 'double' | 'hold';
      holdMs?: number;
      deltaX?: number;
      deltaY?: number;
      dragDurationMs?: number;
      repeatCount?: number;
      delayAfterMs?: number;
    }>;
    loopCount?: number;
    loopDelayMs?: number;
    jitterMs?: number;
    jitterPx?: number;
  };
  macro?: {
    macros?: Array<{
      id?: string;
      name?: string;
      createdAt?: number;
      steps?: Array<{
        id?: string;
        type?: 'click' | 'drag' | 'wheel' | 'key' | 'wait';
        delayBeforeMs?: number;
        target?: TargetLocator;
        endTarget?: TargetLocator;
        button?: 'left' | 'right' | 'middle';
        clickKind?: 'single' | 'double' | 'hold';
        holdMs?: number;
        durationMs?: number;
        deltaX?: number;
        deltaY?: number;
        key?: string;
        code?: string;
        keyCode?: number;
        modifiers?: number;
      }>;
    }>;
    playbackSpeed?: number;
    loopCount?: number;
    loopDelayMs?: number;
    recordKeyboard?: boolean;
    recordWheel?: boolean;
  };
}

function migrateLegacyV1(v1: LegacyV1State): PersistedState {
  const flows: FlowRecord[] = [];

  if (v1.multi?.items && v1.multi.items.length > 0) {
    const steps: FlowStep[] = v1.multi.items.map((it) =>
      createFlowStep({
        id: it.id ?? createId('step'),
        enabled: it.enabled ?? true,
        type: it.type === 'scroll' ? 'wheel' : (it.type ?? 'click'),
        target: it.target ?? null,
        endTarget: it.endTarget ?? null,
        button: it.button ?? 'left',
        clickKind: it.clickKind ?? 'single',
        holdMs: it.holdMs ?? 25,
        direction: 'custom',
        deltaX: it.deltaX ?? 0,
        deltaY: it.deltaY ?? 320,
        dragDurationMs: it.dragDurationMs ?? 260,
        repeatCount: it.repeatCount ?? 1,
        delayAfterMs: it.type === 'wait' ? 0 : (it.delayAfterMs ?? 250),
        waitMs: it.type === 'wait' ? (it.delayAfterMs ?? 500) : 500,
        jitterMs: v1.multi?.jitterMs ?? 10,
        jitterPx: v1.multi?.jitterPx ?? 2,
      }),
    );
    flows.push({
      id: createId('flow'),
      name: '迁移的多点序列',
      createdAt: Date.now(),
      source: 'manual',
      playbackSpeed: 1,
      loopCount: v1.multi.loopCount ?? 1,
      loopDelayMs: v1.multi.loopDelayMs ?? 400,
      steps,
    });
  }

  if (v1.macro?.macros) {
    for (const m of v1.macro.macros) {
      const steps: FlowStep[] = (m.steps ?? []).map((st) =>
        createFlowStep({
          id: st.id ?? createId('step'),
          type: st.type ?? 'click',
          delayBeforeMs: st.delayBeforeMs ?? 0,
          target: st.target ?? null,
          endTarget: st.endTarget ?? null,
          button: st.button ?? 'left',
          clickKind: st.clickKind ?? 'single',
          holdMs: st.holdMs ?? 25,
          dragDurationMs: st.durationMs ?? 260,
          direction: 'custom',
          deltaX: st.deltaX ?? 0,
          deltaY: st.deltaY ?? 0,
          key: st.key,
          code: st.code,
          keyCode: st.keyCode,
          modifiers: st.modifiers,
          delayAfterMs: 0,
          jitterMs: 0,
          jitterPx: 0,
        }),
      );
      flows.push({
        id: m.id ?? createId('flow'),
        name: m.name ?? '迁移宏流程',
        createdAt: m.createdAt ?? Date.now(),
        source: 'macro',
        playbackSpeed: v1.macro?.playbackSpeed ?? 1,
        loopCount: v1.macro?.loopCount ?? 1,
        loopDelayMs: v1.macro?.loopDelayMs ?? 500,
        steps,
      });
    }
  }

  if (flows.length === 0) {
    flows.push(createPresetFlow('single'));
  }

  return {
    hudWide: false,
    hudPosition: v1.hudPosition ?? null,
    settings: {
      ...DEFAULT_PERSISTED_STATE.settings,
      ...(v1.settings ?? {}),
      recordWheel: v1.macro?.recordWheel ?? true,
      recordKeyboard: v1.macro?.recordKeyboard ?? true,
    },
    activeFlowId: flows[0].id,
    flows,
  };
}

function normalizePersistedState(raw: Partial<PersistedState> | null | undefined): PersistedState {
  if (!raw || !Array.isArray(raw.flows)) {
    return structuredClone(DEFAULT_PERSISTED_STATE);
  }
  const flows = raw.flows.length > 0 ? raw.flows : [createPresetFlow('single')];
  const activeFlowId =
    raw.activeFlowId && flows.some((f) => f.id === raw.activeFlowId)
      ? raw.activeFlowId
      : flows[0].id;

  return {
    hudWide: raw.hudWide ?? false,
    hudPosition: raw.hudPosition ?? null,
    settings: { ...DEFAULT_PERSISTED_STATE.settings, ...(raw.settings ?? {}) },
    activeFlowId,
    flows,
  };
}

export async function loadPersistedState(): Promise<PersistedState> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY_V1]);
      if (result?.[STORAGE_KEY]) {
        return normalizePersistedState(result[STORAGE_KEY] as Partial<PersistedState>);
      }
      if (result?.[LEGACY_STORAGE_KEY_V1]) {
        const migrated = migrateLegacyV1(result[LEGACY_STORAGE_KEY_V1] as LegacyV1State);
        await savePersistedState(migrated);
        return migrated;
      }
    } catch {
      // Fallback below
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        return normalizePersistedState(JSON.parse(rawV2) as Partial<PersistedState>);
      }
      const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
      if (rawV1) {
        const migrated = migrateLegacyV1(JSON.parse(rawV1) as LegacyV1State);
        await savePersistedState(migrated);
        return migrated;
      }
    } catch {
      // Ignore malformed storage
    }
  }

  return normalizePersistedState(memoryFallback);
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
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('autoclick:state-saved', { detail: state }));
      }
    } catch {
      // Ignore quota errors
    }
  }
}
