import { loadPersistedState, savePersistedState } from '../shared/storage.ts';
import type { EngineMode, PersistedState, RuntimeStatus } from '../shared/types.ts';

async function initPopup(): Promise<void> {
  let state: PersistedState = await loadPersistedState();

  const statusDot = document.getElementById('status-dot') as HTMLElement;
  const statusBadge = document.getElementById('status-badge') as HTMLElement;
  const connHint = document.getElementById('conn-hint') as HTMLElement;

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
  };

  const renderStatus = (status: RuntimeStatus | null) => {
    statusDot.classList.remove('is-running', 'is-recording');
    if (!status) {
      statusBadge.textContent = '受限页面/未注入';
      connHint.textContent = '当前页若为浏览器设置页，请切换到普通网页或打开测试靶场';
      return;
    }

    if (status.isRunning) {
      statusDot.classList.add('is-running');
      statusBadge.textContent = `运行中 (${status.executedCount})`;
    } else if (status.isRecording) {
      statusDot.classList.add('is-recording');
      statusBadge.textContent = `录制中 (${status.recordedStepsCount}步)`;
    } else {
      statusBadge.textContent = '已连接 · 就绪';
    }
    connHint.textContent = `当前模式: ${status.activeMode.toUpperCase()} · 引擎: ${status.effectiveEngine.toUpperCase()}`;
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

  document.getElementById('btn-toggle-hud')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'POPUP_TOGGLE_HUD' });
    void refreshStatus();
  });

  document.getElementById('btn-toggle-run')?.addEventListener('click', async () => {
    const status = (await chrome.runtime.sendMessage({ type: 'POPUP_TOGGLE_RUN' })) as RuntimeStatus | null;
    renderStatus(status);
  });

  document.getElementById('btn-toggle-record')?.addEventListener('click', async () => {
    const status = (await chrome.runtime.sendMessage({ type: 'POPUP_TOGGLE_RECORD' })) as RuntimeStatus | null;
    renderStatus(status);
  });

  document.getElementById('btn-open-playground')?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('playground.html');
    void chrome.tabs.create({ url });
  });
}

void initPopup();
