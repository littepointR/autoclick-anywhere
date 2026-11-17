import type {
  ExtensionSettings,
  FlowRecord,
  FlowStep,
  FlowStepType,
  PersistedState,
} from './types.ts';

export const AUTOCLICK_HOST_ID = 'autoclick-anywhere-root';
export const STORAGE_KEY = 'autoclick_anywhere_state_v2';
export const LEGACY_STORAGE_KEY_V1 = 'autoclick_anywhere_state_v1';
export const HUD_SESSION_KEY = 'autoclick_anywhere_hud_open';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  engine: 'cdp',
  showRipples: true,
  showPins: true,
  autoDetachDebugger: true,
  emergencyEscStop: true,
  recordWheel: true,
  recordKeyboard: true,
  hotkeyToggleRun: 'F8',
  hotkeyToggleRecord: 'F9',
  hotkeyToggleHud: 'Alt+H',
};

export function createId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createFlowStep(partial: Partial<FlowStep> & { type: FlowStepType }): FlowStep {
  return {
    id: partial.id ?? createId('step'),
    enabled: partial.enabled ?? true,
    type: partial.type,
    name: partial.name,
    followCursor: partial.followCursor ?? false,
    usePageScroll: partial.usePageScroll ?? false,
    target: partial.target ?? null,
    endTarget: partial.endTarget ?? null,
    button: partial.button ?? 'left',
    clickKind: partial.clickKind ?? 'single',
    holdMs: partial.holdMs ?? 25,
    direction: partial.direction ?? 'down',
    deltaX: partial.deltaX ?? 0,
    deltaY: partial.deltaY ?? 320,
    dragDurationMs: partial.dragDurationMs ?? 260,
    key: partial.key,
    code: partial.code,
    keyCode: partial.keyCode,
    modifiers: partial.modifiers,
    waitMs: partial.waitMs ?? 500,
    delayBeforeMs: partial.delayBeforeMs ?? 0,
    repeatCount: partial.repeatCount ?? 1,
    repeatIntervalMs: partial.repeatIntervalMs ?? 200,
    delayAfterMs: partial.delayAfterMs ?? 250,
    jitterMs: partial.jitterMs ?? 10,
    jitterPx: partial.jitterPx ?? 2,
  };
}

export function createPresetFlow(kind: 'single' | 'scroll' | 'combo' | 'empty'): FlowRecord {
  if (kind === 'single') {
    return {
      id: createId('flow'),
      name: '单点连点流程',
      createdAt: Date.now(),
      source: 'preset',
      playbackSpeed: 1,
      loopCount: 0,
      loopDelayMs: 0,
      steps: [
        createFlowStep({
          type: 'click',
          name: '单点连续点击',
          followCursor: false,
          delayAfterMs: 250,
          jitterMs: 15,
          jitterPx: 2,
        }),
      ],
    };
  }

  if (kind === 'scroll') {
    return {
      id: createId('flow'),
      name: '连续自动滚动流程',
      createdAt: Date.now(),
      source: 'preset',
      playbackSpeed: 1,
      loopCount: 0,
      loopDelayMs: 0,
      steps: [
        createFlowStep({
          type: 'wheel',
          name: '页面连续下滑',
          usePageScroll: true,
          direction: 'down',
          deltaX: 0,
          deltaY: 320,
          delayAfterMs: 400,
          jitterMs: 0,
          jitterPx: 0,
        }),
      ],
    };
  }

  if (kind === 'combo') {
    return {
      id: createId('flow'),
      name: '点击 + 滚动组合示例',
      createdAt: Date.now(),
      source: 'preset',
      playbackSpeed: 1,
      loopCount: 3,
      loopDelayMs: 500,
      steps: [
        createFlowStep({
          type: 'click',
          name: '触发点击',
          delayAfterMs: 200,
        }),
        createFlowStep({
          type: 'wheel',
          name: '向下滚动',
          usePageScroll: true,
          direction: 'down',
          deltaY: 320,
          delayAfterMs: 200,
        }),
        createFlowStep({
          type: 'wait',
          name: '等待冷却',
          waitMs: 500,
          delayAfterMs: 0,
        }),
      ],
    };
  }

  return {
    id: createId('flow'),
    name: '自定义空白流程',
    createdAt: Date.now(),
    source: 'manual',
    playbackSpeed: 1,
    loopCount: 1,
    loopDelayMs: 300,
    steps: [],
  };
}

const initialSingleFlow = createPresetFlow('single');

export const DEFAULT_PERSISTED_STATE: PersistedState = {
  hudWide: false,
  hudPosition: null,
  settings: { ...DEFAULT_SETTINGS },
  activeFlowId: initialSingleFlow.id,
  flows: [initialSingleFlow],
};
