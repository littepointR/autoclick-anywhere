import { MacroRecorder } from '../engine/recorder.ts';
import { ActionRunner } from '../engine/runner.ts';
import {
  AUTOCLICK_HOST_ID,
  DEFAULT_PERSISTED_STATE,
  HUD_SESSION_KEY,
  STORAGE_KEY,
  createFlowStep,
  createId,
} from '../shared/constants.ts';
import { loadPersistedState, savePersistedState } from '../shared/storage.ts';
import type {
  BgRequestMessage,
  ContentMessage,
  DispatchResult,
  FlowRecord,
  FlowStep,
  PersistedState,
  RuntimeStatus,
  TargetLocator,
} from '../shared/types.ts';
import { HudPanel, type HudViewState } from './hud.ts';
import { OverlayManager } from './overlay.ts';
import { TargetPicker } from './picker.ts';
import { HUD_STYLES } from './styles.ts';

declare global {
  interface Window {
    __AUTOCLICK_ANYWHERE_LOADED__?: boolean;
  }
}

function readSessionHudVisible(): boolean {
  try {
    return window.sessionStorage.getItem(HUD_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSessionHudVisible(visible: boolean): void {
  try {
    if (visible) {
      window.sessionStorage.setItem(HUD_SESSION_KEY, '1');
    } else {
      window.sessionStorage.removeItem(HUD_SESSION_KEY);
    }
  } catch {
    // Ignore restricted sessionStorage
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

  // Per-tab visibility: only visible on pages where user explicitly opened it
  let hudVisible = readSessionHudVisible();
  let hudMinimized = false;

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

  const getActiveFlow = (): FlowRecord =>
    state.flows.find((f) => f.id === state.activeFlowId) ?? state.flows[0];

  const getViewState = (): HudViewState => ({ hudVisible, hudMinimized });

  const getCompositeStatus = (): RuntimeStatus => {
    const base = runner.getStatusSnapshot({
      hudVisible,
      showPins: state.settings.showPins,
      isRecording: recorder.isRecording(),
      isPicking: picker.isPicking(),
      recordedStepsCount: recorder.getSteps().length,
    });
    if (!runner.isActiveSession() && !base.fallbackReason) {
      base.effectiveEngine = state.settings.engine;
    }
    return base;
  };

  const syncPins = () => {
    const activeFlow = getActiveFlow();
    const shouldShowPins = (hudVisible || runner.isActiveSession()) && state.settings.showPins;
    overlay.renderPins({
      steps: activeFlow.steps,
      showPins: shouldShowPins,
      isRunning: runner.getIsRunning(),
      activeStepId: runner.getStatusSnapshot().currentStepId,
    });
  };

  const persistState = (next: PersistedState) => {
    state = next;
    void savePersistedState(state);
    runner.updateSettings(state.settings);
    recorder.updateOptions({
      recordWheel: state.settings.recordWheel,
      recordKeyboard: state.settings.recordKeyboard,
    });
    hud.update(state, getViewState(), getCompositeStatus());
    syncPins();
  };

  const setHudVisible = (visible: boolean) => {
    hudVisible = visible;
    writeSessionHudVisible(visible);
    if (!visible && picker.isPicking()) {
      picker.cancel();
    }
    hud.update(state, getViewState(), getCompositeStatus());
    syncPins();
  };

  const setHudMinimized = (minimized: boolean) => {
    hudMinimized = minimized;
    hud.update(state, getViewState(), getCompositeStatus());
  };

  const recorder = new MacroRecorder({
    recordWheel: state.settings.recordWheel,
    recordKeyboard: state.settings.recordKeyboard,
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
      syncPins();
    },
  });

  overlay = new OverlayManager(shadow, {
    onUpdateStepTarget: (stepId: string, which: 'start' | 'end', locator: TargetLocator) => {
      const activeFlow = getActiveFlow();
      const flows = state.flows.map((f) => {
        if (f.id !== activeFlow.id) return f;
        return {
          ...f,
          steps: f.steps.map((s) => {
            if (s.id !== stepId) return s;
            return which === 'start' ? { ...s, target: locator } : { ...s, endTarget: locator };
          }),
        };
      });
      persistState({ ...state, flows });
    },
  });

  const pauseOrResumeRun = () => {
    if (recorder.isRecording()) {
      stopRecordingAndConvertToFlow();
      return;
    }

    const runState = runner.getRunState();
    if (runState === 'running') {
      runner.pause();
      return;
    }
    if (runState === 'paused') {
      runner.resume();
      return;
    }

    const activeFlow = getActiveFlow();
    if (activeFlow.steps.some((s) => s.enabled)) {
      void runner.runFlow(activeFlow, state.settings);
    }
  };

  const stopRun = () => {
    runner.stop(true);
    host.classList.remove('is-running');
    hud.update(state, getViewState(), getCompositeStatus());
    syncPins();
  };

  const stopRecordingAndConvertToFlow = () => {
    const steps = recorder.stop();
    if (steps.length > 0) {
      const flow: FlowRecord = {
        id: createId('flow'),
        name: `录制流程 #${state.flows.length + 1}`,
        createdAt: Date.now(),
        source: 'macro',
        playbackSpeed: 1,
        loopCount: 1,
        loopDelayMs: 500,
        steps,
      };
      persistState({
        ...state,
        flows: [flow, ...state.flows],
        activeFlowId: flow.id,
      });
    } else {
      hud.update(state, getViewState(), getCompositeStatus());
    }
  };

  const toggleRecord = () => {
    if (runner.isActiveSession()) {
      runner.stop(true);
    }
    if (recorder.isRecording()) {
      stopRecordingAndConvertToFlow();
    } else {
      if (!hudVisible) {
        setHudVisible(true);
      }
      recorder.updateOptions({
        recordWheel: state.settings.recordWheel,
        recordKeyboard: state.settings.recordKeyboard,
      });
      recorder.start();
      hud.update(state, getViewState(), getCompositeStatus());
    }
  };

  const togglePins = () => {
    persistState({
      ...state,
      settings: { ...state.settings, showPins: !state.settings.showPins },
    });
  };

  const appendStepToActiveFlow = (step: FlowStep) => {
    const active = getActiveFlow();
    const flows = state.flows.map((f) =>
      f.id === active.id ? { ...f, steps: [...f.steps, step] } : f,
    );
    persistState({ ...state, flows });
  };

  hud = new HudPanel(shadow, state, getViewState(), getCompositeStatus(), {
    onStateChange: (next) => persistState(next),
    onSetHudVisible: (visible) => setHudVisible(visible),
    onSetHudMinimized: (minimized) => setHudMinimized(minimized),
    onSwitchEngine: (nextEngine) => {
      state = { ...state, settings: { ...state.settings, engine: nextEngine } };
      void savePersistedState(state);
      runner.updateSettings(state.settings, true);
      hud.update(state, getViewState(), getCompositeStatus());
    },
    onTogglePins: togglePins,
    onPauseResume: pauseOrResumeRun,
    onStop: stopRun,
    onToggleRecord: toggleRecord,
    onAddStepPickClick: async () => {
      const loc = await picker.pickPoint('点击任意 DOM 元素或 Canvas/WebGL 位置添加「点击步骤」');
      if (loc) {
        appendStepToActiveFlow(createFlowStep({ type: 'click', target: loc }));
      }
    },
    onAddStepPickWheel: async () => {
      const loc = await picker.pickPoint('点击要滚动的容器或 Canvas/WebGL 位置添加「滚动步骤」（也可随后切为整页滚动）');
      if (loc) {
        appendStepToActiveFlow(
          createFlowStep({
            type: 'wheel',
            usePageScroll: false,
            target: loc,
            direction: 'down',
            deltaY: 320,
          }),
        );
      }
    },
    onAddStepPickDrag: async () => {
      const drag = await picker.pickDrag('按住左键从起点拖拽到终点添加「拖拽步骤」（Esc 取消）');
      if (drag) {
        appendStepToActiveFlow(
          createFlowStep({
            type: 'drag',
            target: drag.start,
            endTarget: drag.end,
            dragDurationMs: 280,
          }),
        );
      }
    },
    onAddStepKey: () => {
      appendStepToActiveFlow(
        createFlowStep({
          type: 'key',
          key: 'Space',
          code: 'Space',
          keyCode: 32,
          modifiers: 0,
          delayAfterMs: 200,
        }),
      );
    },
    onAddStepWait: () => {
      appendStepToActiveFlow(
        createFlowStep({
          type: 'wait',
          waitMs: 500,
          delayAfterMs: 0,
        }),
      );
    },
    onPickStepTarget: async (stepId: string, which: 'start' | 'end') => {
      const loc = await picker.pickPoint(
        which === 'end' ? '点击设置该拖拽步骤的终点 B（Esc 取消）' : '点击设置该步骤的新目标位置（Esc 取消）',
      );
      if (!loc) return;
      const active = getActiveFlow();
      const flows = state.flows.map((f) => {
        if (f.id !== active.id) return f;
        return {
          ...f,
          steps: f.steps.map((s) => {
            if (s.id !== stepId) return s;
            return which === 'end' ? { ...s, endTarget: loc } : { ...s, target: loc, followCursor: false, usePageScroll: false };
          }),
        };
      });
      persistState({ ...state, flows });
    },
  });

  syncPins();

  // Explicit page trigger (used by built-in playground button)
  window.addEventListener('autoclick:toggle-hud', () => {
    setHudVisible(!hudVisible);
  });

  // Global hotkeys
  window.addEventListener(
    'keydown',
    (ev) => {
      if ((ev.altKey && !ev.ctrlKey && ev.code === 'KeyH') || (ev.altKey && ev.shiftKey && ev.code === 'KeyH')) {
        ev.preventDefault();
        setHudVisible(!hudVisible);
        return;
      }

      const extensionActiveOnPage =
        hudVisible || runner.isActiveSession() || recorder.isRecording() || picker.isPicking();
      if (!extensionActiveOnPage) return;

      if (ev.key === 'Escape' && state.settings.emergencyEscStop) {
        if (picker.isPicking()) {
          picker.cancel();
          return;
        }
        if (runner.isActiveSession()) {
          ev.preventDefault();
          stopRun();
          return;
        }
        if (recorder.isRecording()) {
          ev.preventDefault();
          stopRecordingAndConvertToFlow();
          return;
        }
      }

      if (ev.altKey && !ev.ctrlKey && !ev.shiftKey && ev.code === 'KeyP') {
        ev.preventDefault();
        togglePins();
        return;
      }

      if (ev.shiftKey && ev.key === 'F8') {
        ev.preventDefault();
        stopRun();
        return;
      }

      if (ev.key === 'F8' || (ev.altKey && ev.shiftKey && ev.code === 'KeyS')) {
        ev.preventDefault();
        pauseOrResumeRun();
        return;
      }

      if (ev.key === 'F9' || (ev.altKey && ev.shiftKey && ev.code === 'KeyR')) {
        ev.preventDefault();
        toggleRecord();
      }
    },
    true,
  );

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
      const incoming = changes[STORAGE_KEY].newValue as PersistedState;
      const settingsChanged = JSON.stringify(incoming.settings) !== JSON.stringify(state.settings);
      if (settingsChanged) {
        state = {
          ...state,
          settings: incoming.settings,
        };
        runner.updateSettings(state.settings, true);
        recorder.updateOptions({
          recordWheel: state.settings.recordWheel,
          recordKeyboard: state.settings.recordKeyboard,
        });
        hud.update(state, getViewState(), getCompositeStatus());
        syncPins();
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse) => {
      if (msg.type === 'TOGGLE_HUD') {
        hudMinimized = false;
        setHudVisible(!hudVisible);
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'SHOW_HUD') {
        hudMinimized = false;
        setHudVisible(true);
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'PAUSE_RESUME_RUN') {
        pauseOrResumeRun();
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'STOP_RUN') {
        stopRun();
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'TOGGLE_RECORD') {
        toggleRecord();
        sendResponse(getCompositeStatus());
        return;
      }
      if (msg.type === 'TOGGLE_PINS') {
        togglePins();
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
