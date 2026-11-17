import {
  SUPPORTED_LOCALES,
  fmt,
  getMessages,
  resolveLocale,
  toHtmlLang,
  type I18nMessages,
} from '../shared/i18n.ts';
import { loadPersistedState, savePersistedState } from '../shared/storage.ts';
import type { EngineMode, LanguageSetting, PersistedState, RuntimeStatus } from '../shared/types.ts';

async function initPopup(): Promise<void> {
  let state: PersistedState = await loadPersistedState();
  let lastStatus: RuntimeStatus | null = null;

  const statusDot = document.getElementById('status-dot') as HTMLElement;
  const statusBadge = document.getElementById('status-badge') as HTMLElement;
  const connHint = document.getElementById('conn-hint') as HTMLElement;
  const langSelect = document.getElementById('lang-select') as HTMLSelectElement;

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

  const applyPopupI18n = () => {
    const locale = resolveLocale(state.settings.language);
    const t = getMessages(locale);
    document.documentElement.lang = toHtmlLang(locale);

    langSelect.innerHTML = SUPPORTED_LOCALES.map((item) => {
      const label = item.value === 'auto' ? t.autoLangOption : item.nativeLabel;
      return `<option value="${item.value}" ${state.settings.language === item.value ? 'selected' : ''}>${label}</option>`;
    }).join('');

    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n') as keyof I18nMessages['popup'] | null;
      if (key && key in t.popup) {
        el.textContent = t.popup[key];
      }
    });
  };

  const renderSettings = () => {
    const t = getMessages(state.settings.language);
    engCdp.checked = state.settings.engine === 'cdp';
    engDom.checked = state.settings.engine === 'dom';
    optRipples.checked = state.settings.showRipples;
    optPins.checked = state.settings.showPins;
    optEsc.checked = state.settings.emergencyEscStop;
    optDetach.checked = state.settings.autoDetachDebugger;
    btnTogglePins.textContent = state.settings.showPins ? t.popup.hidePins : t.popup.showPins;
  };

  const renderStatus = (status: RuntimeStatus | null) => {
    lastStatus = status;
    const t = getMessages(state.settings.language);
    statusDot.classList.remove('is-running', 'is-paused', 'is-recording');

    if (!status) {
      statusBadge.textContent = t.popup.restrictedStatus;
      connHint.textContent = t.popup.restrictedHint;
      btnToggleHud.textContent = t.popup.showHud;
      btnPauseResume.textContent = t.popup.startFlow;
      btnToggleRecord.textContent = t.popup.recordStart;
      btnStop.textContent = t.popup.stopFlow;
      btnStop.disabled = true;
      return;
    }

    btnToggleHud.textContent = status.hudVisible ? t.popup.hideHud : t.popup.showHud;
    btnTogglePins.textContent = status.showPins ? t.popup.hidePins : t.popup.showPins;
    btnStop.textContent = t.popup.stopFlow;

    btnPauseResume.classList.remove('btn-accent', 'btn-warn');
    if (status.runState === 'running') {
      statusDot.classList.add('is-running');
      statusBadge.textContent = fmt(t.popup.runningBadge, { count: status.executedCount });
      btnPauseResume.classList.add('btn-warn');
      btnPauseResume.textContent = t.popup.pauseFlow;
      btnStop.disabled = false;
    } else if (status.runState === 'paused') {
      statusDot.classList.add('is-paused');
      statusBadge.textContent = fmt(t.popup.pausedBadge, { count: status.executedCount });
      btnPauseResume.classList.add('btn-accent');
      btnPauseResume.textContent = t.popup.resumeFlow;
      btnStop.disabled = false;
    } else if (status.isRecording) {
      statusDot.classList.add('is-recording');
      statusBadge.textContent = fmt(t.popup.recordingBadge, { count: status.recordedStepsCount });
      btnPauseResume.classList.add('btn-accent');
      btnPauseResume.textContent = t.popup.startFlow;
      btnStop.disabled = true;
    } else {
      statusBadge.textContent = status.hudVisible ? t.popup.hudOnBadge : t.popup.hudOffBadge;
      btnPauseResume.classList.add('btn-accent');
      btnPauseResume.textContent = t.popup.startFlow;
      btnStop.disabled = true;
    }

    btnToggleRecord.textContent = status.isRecording
      ? fmt(t.popup.recordFinish, { count: status.recordedStepsCount })
      : t.popup.recordStart;

    const phaseLabel = t.phases[status.subPhase] ?? t.phases.idle;
    connHint.textContent = fmt(t.popup.hintText, {
      engine: status.effectiveEngine.toUpperCase(),
      phase: phaseLabel,
    });
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
    applyPopupI18n();
    renderSettings();
    renderStatus(lastStatus);
  };

  applyPopupI18n();
  renderSettings();
  renderStatus(null);
  void refreshStatus();

  langSelect.addEventListener('change', () => {
    void saveSettingsPatch({ language: langSelect.value as LanguageSetting });
  });

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
