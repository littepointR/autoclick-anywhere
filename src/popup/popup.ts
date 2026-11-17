import { loadPersistedState, savePersistedState } from '../shared/storage.ts';
import type { EngineMode, PersistedState, RuntimeStatus } from '../shared/types.ts';

async function initPopup(): Promise<void> {
  let state: PersistedState = await loadPersistedState();

  const statusDot = document.getElementById('status-dot') as HTMLElement;
  const statusBadge = document.getElementById('status-badge') as HTMLElement;
  const connHint = document.getElementById('conn-hint') as HTMLElement;

  const btnToggleHud = document.getElementById('btn-toggle-hud') as HTMLButtonElement;
  const btnPauseResume = document.getElementById('btn-pause-resume') as HTMLButtonElement;
  const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
  const btnToggleRecord = document.getElementById('btn-toggle-record') as HTMLButtonElement;
  const btnTogglePins = document.getElementById('btn-toggle-pins') as HTMLButtonElement;

  const engCdp = document.getElementById('eng-cdp') as HTMLInputElement;
  const engDom = document.getElementById('eng-dom') as HTMLInputElement;
  const optRipples = document.getElementById('opt-ripples') as HTMLInputElement;
  const optPins = document.getElementById('opt-pins') as HTMLInputElement;
  const optEsc = document.getElementById('opt-esc') as HTMLInputElement;
  const optDetach = document.getElementById('opt-detach') as HTMLInputElement;

  const renderSettings = () => {
    engCdp.checked = state.settings.engine === 'cdp';
    engDom.checked = state.settings.engine === 'dom';
    optRipples.checked = state.settings.showRipples;
    optPins.checked = state.settings.showPins;
    optEsc.checked = state.settings.emergencyEscStop;
    optDetach.checked = state.settings.autoDetachDebugger;
    btnTogglePins.textContent = state.settings.showPins ? '🙈 隐藏目标点 (Alt+P)' : '👁️ 显示目标点 (Alt+P)';
  };

  const renderStatus = (status: RuntimeStatus | null) => {
    statusDot.classList.remove('is-running', 'is-paused', 'is-recording');
    if (!status) {
      statusBadge.textContent = '受限页面/未连接';
      connHint.textContent = '当前页若为浏览器设置页，请切换到普通网页或打开测试靶场';
      btnToggleHud.textContent = '🎛️ 在当前网页显示悬浮面板 (Alt+H)';
      btnPauseResume.textContent = '▶ 启动流程 (F8)';
      btnStop.disabled = true;
      return;
    }

    btnToggleHud.textContent = status.hudVisible
      ? '🙈 在当前网页隐藏悬浮面板 (Alt+H)'
      : '🎛️ 在当前网页显示悬浮面板 (Alt+H)';

    btnTogglePins.textContent = status.showPins
      ? '🙈 隐藏目标点 (Alt+P)'
      : '👁️ 显示目标点 (Alt+P)';

    btnPauseResume.classList.remove('btn-accent', 'btn-warn');
    if (status.runState === 'running') {
      statusDot.classList.add('is-running');
      statusBadge.textContent = `运行中 (${status.executedCount})`;
      btnPauseResume.classList.add('btn-warn');
      btnPauseResume.textContent = '⏸ 暂停执行 (F8)';
      btnStop.disabled = false;
    } else if (status.runState === 'paused') {
      statusDot.classList.add('is-paused');
      statusBadge.textContent = `已暂停 (${status.executedCount})`;
      btnPauseResume.classList.add('btn-accent');
      btnPauseResume.textContent = '▶ 继续执行 (F8)';
      btnStop.disabled = false;
    } else if (status.isRecording) {
      statusDot.classList.add('is-recording');
      statusBadge.textContent = `录制中 (${status.recordedStepsCount}步)`;
      btnPauseResume.classList.add('btn-accent');
      btnPauseResume.textContent = '▶ 启动流程 (F8)';
      btnStop.disabled = true;
    } else {
      statusBadge.textContent = status.hudVisible ? '本页已开启' : '本页未开启';
      btnPauseResume.classList.add('btn-accent');
      btnPauseResume.textContent = '▶ 启动流程 (F8)';
      btnStop.disabled = true;
    }

    btnToggleRecord.textContent = status.isRecording
      ? `⏹ 完成录制转流程 (${status.recordedStepsCount}步)`
      : '🔴 录制宏转流程 (F9)';

    connHint.textContent = `引擎: ${status.effectiveEngine.toUpperCase()} · ${status.subPhaseLabel || '空闲'}`;
  };

  const refreshStatus = async () => {
    try {
      const status = (await chrome.runtime.sendMessage({ type: 'POPUP_GET_STATUS' })) as RuntimeStatus | null;
      renderStatus(status);
    } catch {
      renderStatus(null);
    }
  };

  const saveSettingsPatch = async (patch: Partial<PersistedState['settings']>) => {
    state = {
      ...state,
      settings: { ...state.settings, ...patch },
    };
    await savePersistedState(state);
    renderSettings();
  };

  renderSettings();
  void refreshStatus();

  engCdp.addEventListener('change', () => void saveSettingsPatch({ engine: 'cdp' as EngineMode }));
  engDom.addEventListener('change', () => void saveSettingsPatch({ engine: 'dom' as EngineMode }));
  optRipples.addEventListener('change', () => void saveSettingsPatch({ showRipples: optRipples.checked }));
  optPins.addEventListener('change', () => void saveSettingsPatch({ showPins: optPins.checked }));
  optEsc.addEventListener('change', () => void saveSettingsPatch({ emergencyEscStop: optEsc.checked }));
  optDetach.addEventListener('change', () => void saveSettingsPatch({ autoDetachDebugger: optDetach.checked }));

  btnToggleHud.addEventListener('click', async () => {
    const status = (await chrome.runtime.sendMessage({ type: 'POPUP_TOGGLE_HUD' })) as RuntimeStatus | null;
    renderStatus(status);
  });

  btnPauseResume.addEventListener('click', async () => {
    const status = (await chrome.runtime.sendMessage({ type: 'POPUP_PAUSE_RESUME' })) as RuntimeStatus | null;
    renderStatus(status);
  });

  btnStop.addEventListener('click', async () => {
    const status = (await chrome.runtime.sendMessage({ type: 'POPUP_STOP' })) as RuntimeStatus | null;
    renderStatus(status);
  });

  btnToggleRecord.addEventListener('click', async () => {
    const status = (await chrome.runtime.sendMessage({ type: 'POPUP_TOGGLE_RECORD' })) as RuntimeStatus | null;
    renderStatus(status);
  });

  btnTogglePins.addEventListener('click', async () => {
    const status = (await chrome.runtime.sendMessage({ type: 'POPUP_TOGGLE_PINS' })) as RuntimeStatus | null;
    if (status) {
      state = { ...state, settings: { ...state.settings, showPins: status.showPins } };
      renderSettings();
    }
    renderStatus(status);
  });

  document.getElementById('btn-open-playground')?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('playground.html');
    void chrome.tabs.create({ url });
  });
}

void initPopup();
