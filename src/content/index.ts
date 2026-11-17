import { MacroRecorder } from '../engine/recorder.ts';
import { ActionRunner } from '../engine/runner.ts';
import { AUTOCLICK_HOST_ID, DEFAULT_PERSISTED_STATE, STORAGE_KEY, createId } from '../shared/constants.ts';
import { loadPersistedState, savePersistedState } from '../shared/storage.ts';
import type {
  BgRequestMessage,
  ContentMessage,
  DispatchResult,
  MacroRecord,
  MultiPointItem,
  PersistedState,
  RuntimeStatus,
  TargetLocator,
} from '../shared/types.ts';
import { HudPanel } from './hud.ts';
import { OverlayManager } from './overlay.ts';
import { TargetPicker } from './picker.ts';
import { HUD_STYLES } from './styles.ts';

declare global {
  interface Window {
    __AUTOCLICK_ANYWHERE_LOADED__?: boolean;
  }
}

async function sendToBackground(msg: BgRequestMessage): Promise<DispatchResult> {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime.sendMessage) {
    try {
      const res = (await chrome.runtime.sendMessage(msg)) as DispatchResult | undefined;
      return res ?? { ok: false, fallbackToDom: true, reason: '后台未响应' };
    } catch (err) {
      return {
        ok: false,
        fallbackToDom: true,
        reason: err instanceof Error ? err.message : '消息通信失败',
      };
    }
  }
  return {
    ok: false,
    fallbackToDom: true,
    reason: '当前页面未处于扩展消息环境，已使用 DOM 引擎',
  };
}

async function bootstrapContent(): Promise<void> {
  if (window.__AUTOCLICK_ANYWHERE_LOADED__) return;
  if (document.getElementById(AUTOCLICK_HOST_ID)) return;
  window.__AUTOCLICK_ANYWHERE_LOADED__ = true;

  let state: PersistedState = await loadPersistedState().catch(() =>
    structuredClone(DEFAULT_PERSISTED_STATE),
  );

  const host = document.createElement('div');
  host.id = AUTOCLICK_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = HUD_STYLES;
  shadow.appendChild(styleEl);
  (document.documentElement ?? document.body).appendChild(host);

  let lastCursor = {
    x: Math.round(window.innerWidth / 2),
    y: Math.round(window.innerHeight / 2),
  };

  window.addEventListener(
    'pointermove',
    (ev) => {
      lastCursor = { x: Math.round(ev.clientX), y: Math.round(ev.clientY) };
    },
    { capture: true, passive: true },
  );

  const picker = new TargetPicker(shadow);
  let hud: HudPanel;
  let overlay: OverlayManager;

  const getCompositeStatus = (): RuntimeStatus => {
    const base = runner.getStatusSnapshot({
      activeMode: state.activeMode,
      isRecording: recorder.isRecording(),
      isPicking: picker.isPicking(),
      recordedStepsCount: recorder.getSteps().length,
    });
    if (!base.isRunning && !base.fallbackReason) {
      base.effectiveEngine = state.settings.engine;
    }
    return base;
  };

  const syncPins = () => {
    overlay.renderPins({
      activeMode: state.activeMode,
      showPins: state.settings.showPins,
      isRunning: runner.getIsRunning(),
      singleTarget: state.single.target,
      followCursor: state.single.followCursor,
      multiItems: state.multi.items,
      scrollTarget: state.scroll.target,
      scrollUseTarget: state.scroll.useTarget,
    });
  };

  const persistState = (next: PersistedState) => {
    state = next;
    void savePersistedState(state);
    recorder.updateOptions({
      recordWheel: state.macro.recordWheel,
      recordKeyboard: state.macro.recordKeyboard,
    });
    hud.update(state, getCompositeStatus());
    syncPins();
  };

  const recorder = new MacroRecorder({
    recordWheel: state.macro.recordWheel,
    recordKeyboard: state.macro.recordKeyboard,
    onStepsChanged: () => {
      hud.updateStatus(getCompositeStatus());
    },
  });

  const runner = new ActionRunner({
    sendToBackground,
    getCursorPosition: () => lastCursor,
    getViewportSize: () => ({ width: window.innerWidth, height: window.innerHeight }),
    onBeforeDispatch: (x, y) => {
      hud.temporarilyPassThroughAt(x, y);
    },
    onAfterDispatch: () => {
      hud.restorePointerEvents();
    },
    onVisualEffect: (fx) => {
      overlay.spawnEffect(fx);
    },
    onStatusChange: () => {
      host.classList.toggle('is-running', runner.getIsRunning());
      hud.updateStatus(getCompositeStatus());
    },
  });

  overlay = new OverlayManager(shadow, {
    onUpdateSingleTarget: (loc: TargetLocator) => {
      persistState({ ...state, single: { ...state.single, target: loc } });
    },
    onUpdateScrollTarget: (loc: TargetLocator) => {
      persistState({ ...state, scroll: { ...state.scroll, target: loc } });
    },
    onUpdateMultiItemTarget: (itemId, which, loc) => {
      const items = state.multi.items.map((it) => {
        if (it.id !== itemId) return it;
        return which === 'start' ? { ...it, target: loc } : { ...it, endTarget: loc };
      });
      persistState({ ...state, multi: { ...state.multi, items } });
    },
  });

  const toggleRun = () => {
    if (runner.getIsRunning()) {
      runner.stop(true);
      host.classList.remove('is-running');
      hud.update(state, getCompositeStatus());
      return;
    }

    if (recorder.isRecording()) {
      stopRecordingAndSave();
    }

    if (state.activeMode === 'single') {
      void runner.runSingle(state.single, state.settings);
    } else if (state.activeMode === 'multi') {
      void runner.runMulti(state.multi, state.settings);
    } else if (state.activeMode === 'scroll') {
      void runner.runScroll(state.scroll, state.settings);
    } else if (state.activeMode === 'macro') {
      const activeMacro =
        state.macro.macros.find((m) => m.id === state.macro.activeMacroId) ??
        state.macro.macros[0];
      if (activeMacro) {
        void runner.runMacro(activeMacro, state.macro, state.settings);
      }
    }
  };

  const stopRecordingAndSave = () => {
    const steps = recorder.stop();
    if (steps.length > 0) {
      const macro: MacroRecord = {
        id: createId('macro'),
        name: `宏脚本 ${state.macro.macros.length + 1}`,
        createdAt: Date.now(),
        originHost: window.location.host || 'local',
        steps,
      };
      const macros = [macro, ...state.macro.macros];
      persistState({
        ...state,
        activeMode: 'macro',
        macro: { ...state.macro, macros, activeMacroId: macro.id },
      });
    } else {
      hud.update(state, getCompositeStatus());
    }
  };

  const toggleRecord = () => {
    if (runner.getIsRunning()) {
      runner.stop(true);
    }
    if (recorder.isRecording()) {
      stopRecordingAndSave();
    } else {
      if (state.activeMode !== 'macro') {
        state = { ...state, activeMode: 'macro' };
      }
      recorder.updateOptions({
        recordWheel: state.macro.recordWheel,
        recordKeyboard: state.macro.recordKeyboard,
      });
      recorder.start();
      hud.update(state, getCompositeStatus());
    }
  };

  const addMultiItem = (partial: Partial<MultiPointItem> & Pick<MultiPointItem, 'type' | 'target'>) => {
    const item: MultiPointItem = {
      id: createId('mp'),
      enabled: true,
      button: 'left',
      clickKind: 'single',
      holdMs: 25,
      deltaX: 0,
      deltaY: 320,
      dragDurationMs: 260,
      repeatCount: 1,
      delayAfterMs: 300,
      ...partial,
    };
    persistState({
      ...state,
      multi: { ...state.multi, items: [...state.multi.items, item] },
    });
  };

  hud = new HudPanel(shadow, state, getCompositeStatus(), {
    onStateChange: (next) => persistState(next),
    onToggleRun: toggleRun,
    onToggleRecord: toggleRecord,
    onPickSingleTarget: async () => {
      const loc = await picker.pickPoint('点击任意 DOM 元素或 Canvas/WebGL 区域以设为单点目标');
      if (loc) {
        persistState({
          ...state,
          single: { ...state.single, followCursor: false, target: loc },
        });
      }
    },
    onPickScrollTarget: async () => {
      const loc = await picker.pickPoint('点击要滚动的容器或 Canvas/WebGL 区域');
      if (loc) {
        persistState({
          ...state,
          scroll: { ...state.scroll, useTarget: true, target: loc },
        });
      }
    },
    onPickMultiClick: async () => {
      const loc = await picker.pickPoint('点击任意位置添加「点击节点」（Esc 取消）');
      if (loc) {
        addMultiItem({ type: 'click', target: loc });
      }
    },
    onPickMultiScroll: async () => {
      const loc = await picker.pickPoint('点击任意位置添加「滚动节点」（Esc 取消）');
      if (loc) {
        addMultiItem({ type: 'scroll', target: loc, deltaY: 320 });
      }
    },
    onPickMultiDrag: async () => {
      const drag = await picker.pickDrag();
      if (drag) {
        addMultiItem({ type: 'drag', target: drag.start, endTarget: drag.end, dragDurationMs: 280 });
      }
    },
  });

  syncPins();

  // Global keyboard hotkeys (F8 toggle run, F9 toggle record, Alt+H toggle HUD, Esc emergency stop)
  window.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key === 'Escape' && state.settings.emergencyEscStop) {
        if (picker.isPicking()) {
          picker.cancel();
          return;
        }
        if (runner.getIsRunning()) {
          ev.preventDefault();
          runner.stop(true);
          host.classList.remove('is-running');
          hud.update(state, getCompositeStatus());
          return;
        }
        if (recorder.isRecording()) {
          ev.preventDefault();
          stopRecordingAndSave();
          return;
        }
      }

      if (ev.key === 'F8' || (ev.altKey && ev.shiftKey && ev.code === 'KeyS')) {
        ev.preventDefault();
        toggleRun();
        return;
      }

      if (ev.key === 'F9' || (ev.altKey && ev.shiftKey && ev.code === 'KeyR')) {
        ev.preventDefault();
        toggleRecord();
        return;
      }

      if ((ev.altKey && !ev.ctrlKey && ev.code === 'KeyH') || (ev.altKey && ev.shiftKey && ev.code === 'KeyH')) {
        ev.preventDefault();
        persistState({ ...state, hudVisible: !state.hudVisible });
      }
    },
    true,
  );

  // Sync changes coming from popup via chrome.storage
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
      const incoming = changes[STORAGE_KEY].newValue as PersistedState;
      // Avoid feedback loop if only settings or hud visibility changed from popup
      const settingsChanged = JSON.stringify(incoming.settings) !== JSON.stringify(state.settings);
      const hudChanged = incoming.hudVisible !== state.hudVisible;
      if (settingsChanged || hudChanged) {
        state = {
          ...state,
          hudVisible: incoming.hudVisible,
          settings: incoming.settings,
        };
        hud.update(state, getCompositeStatus());
        syncPins();
      }
    });
  }

  // Handle commands from service worker / popup
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse) => {
      if (msg.type === 'TOGGLE_HUD') {
        persistState({ ...state, hudVisible: !state.hudVisible, hudMinimized: false });
        sendResponse({ ok: true, hudVisible: state.hudVisible });
        return;
      }
      if (msg.type === 'TOGGLE_RUN') {
        toggleRun();
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'TOGGLE_RECORD') {
        toggleRecord();
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'STOP_ALL') {
        runner.stop(true);
        if (recorder.isRecording()) stopRecordingAndSave();
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'GET_STATUS') {
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'SYNC_SETTINGS') {
        persistState({ ...state, settings: msg.settings });
        sendResponse({ ok: true });
      }
    });
  }
}

void bootstrapContent();
