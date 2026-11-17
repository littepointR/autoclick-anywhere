import { createFlowStep, createId, createPresetFlow } from '../shared/constants.ts';
import {
  SUPPORTED_LOCALES,
  fmt,
  getMessages,
  resolveLocale,
  translateFallbackReason,
  type I18nMessages,
} from '../shared/i18n.ts';
import type {
  ClickKind,
  EngineMode,
  FlowRecord,
  FlowStep,
  FlowStepType,
  LanguageSetting,
  LocatorMode,
  MouseButtonType,
  PersistedState,
  RuntimeStatus,
  ScrollDirection,
} from '../shared/types.ts';
import { computeClampedHudPosition, getViewportBounds } from '../shared/viewport.ts';

export interface HudViewState {
  hudVisible: boolean;
  hudMinimized: boolean;
}

export interface HudActions {
  onStateChange: (next: PersistedState) => void;
  onSetHudVisible: (visible: boolean) => void;
  onSetHudMinimized: (minimized: boolean) => void;
  onSwitchEngine: (engine: EngineMode) => void;
  onTogglePins: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onAddStepPickClick: () => void;
  onAddStepPickWheel: () => void;
  onAddStepPickDrag: () => void;
  onAddStepKey: () => void;
  onAddStepWait: () => void;
  onPickStepTarget: (stepId: string, which: 'start' | 'end') => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stepEmoji(type: FlowStepType): string {
  switch (type) {
    case 'click':
      return '🖱️';
    case 'wheel':
      return '🎡';
    case 'drag':
      return '✥';
    case 'key':
      return '⌨️';
    case 'wait':
      return '⏳';
  }
}

function formatCdMs(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped >= 1000) {
    return `${(clamped / 1000).toFixed(1)}s`;
  }
  return `${Math.ceil(clamped)}ms`;
}

function formatStepSummary(step: FlowStep, t: I18nMessages): string {
  if (step.name && step.name.trim()) return step.name.trim();
  if (step.type === 'click') {
    if (step.followCursor) return t.hud.followCursorSummary;
    if (step.target) {
      return `${step.target.label ?? ''} (${step.target.clientX},${step.target.clientY})`.trim();
    }
    return t.hud.viewportCenterSummary;
  }
  if (step.type === 'wheel') {
    if (step.usePageScroll || !step.target) return t.hud.pageScrollSummary;
    return `${step.target.label ?? ''} (${step.target.clientX},${step.target.clientY})`.trim();
  }
  if (step.type === 'drag') {
    const a = step.target ? `(${step.target.clientX},${step.target.clientY})` : t.hud.dragStartUnset;
    const b = step.endTarget ? `(${step.endTarget.clientX},${step.endTarget.clientY})` : t.hud.dragEndUnset;
    return `${a} → ${b}`;
  }
  if (step.type === 'key') {
    return fmt(t.hud.keySummary, { key: step.key ?? 'Space' });
  }
  return fmt(t.hud.waitSummary, { ms: step.waitMs });
}

function resolveMainChipText(step: FlowStep, t: I18nMessages): string {
  const rep =
    step.repeatCount === 0
      ? t.hud.repInfinite
      : fmt(t.hud.repTimes, { n: Math.max(1, step.repeatCount) });
  if (step.type === 'wait') return fmt(t.hud.chipWait, { ms: step.waitMs });
  if (step.type === 'drag') return fmt(t.hud.chipDrag, { ms: step.dragDurationMs, rep });
  if (step.type === 'wheel') {
    const dir =
      step.direction === 'down'
        ? `↓${Math.abs(step.deltaY) || 320}`
        : step.direction === 'up'
          ? `↑${Math.abs(step.deltaY) || 320}`
          : step.direction === 'left'
            ? `←${Math.abs(step.deltaX) || 240}`
            : step.direction === 'right'
              ? `→${Math.abs(step.deltaX) || 240}`
              : `(${step.deltaX},${step.deltaY})`;
    return fmt(t.hud.chipScroll, { dir, rep });
  }
  if (step.type === 'key') return fmt(t.hud.chipKey, { key: step.key || 'Space', rep });
  const btn =
    step.button === 'right' ? t.hud.btnRight : step.button === 'middle' ? t.hud.btnMiddle : t.hud.btnLeft;
  const kind =
    step.clickKind === 'double'
      ? t.hud.kindDouble
      : step.clickKind === 'hold'
        ? fmt(t.hud.kindHold, { ms: step.holdMs })
        : t.hud.kindSingle;
  return fmt(t.hud.chipClick, { btn, kind, rep });
}

export class HudPanel {
  private readonly root: ShadowRoot;
  private readonly actions: HudActions;
  private readonly container: HTMLDivElement;
  private readonly panelEl: HTMLDivElement;
  private readonly miniEl: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;

  private state: PersistedState;
  private view: HudViewState;
  private status: RuntimeStatus;
  private passThroughEl: HTMLElement | null = null;
  private expandedStepId: string | null = null;
  private cdRafId: number | null = null;
  private lastScrolledStepId: string | null = null;
  private isDraggingHud = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    shadowRoot: ShadowRoot,
    initialState: PersistedState,
    initialView: HudViewState,
    initialStatus: RuntimeStatus,
    actions: HudActions,
  ) {
    this.root = shadowRoot;
    this.state = initialState;
    this.view = initialView;
    this.status = initialStatus;
    this.actions = actions;

    this.container = document.createElement('div');
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'ac-hud';

    this.miniEl = document.createElement('div');
    this.miniEl.className = 'ac-hud-mini ac-hidden';
    this.attachDragHandler(this.miniEl, this.miniEl);

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,application/json';
    this.fileInput.className = 'ac-hidden';
    this.fileInput.addEventListener('change', this.handleImportFile);

    this.container.append(this.panelEl, this.miniEl, this.fileInput);
    this.root.appendChild(this.container);

    this.container.addEventListener('keydown', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
        if (ev.key !== 'Escape' && ev.key !== 'F8' && ev.key !== 'F9') {
          ev.stopPropagation();
        }
      }
    });

    window.addEventListener('resize', () => this.ensureActiveInViewport(), { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.ensureActiveInViewport());
      this.resizeObserver.observe(this.panelEl);
      this.resizeObserver.observe(this.miniEl);
    }

    this.render();
  }

  private getMessages(): I18nMessages {
    return getMessages(this.state.settings.language);
  }

  private getActiveFlow(): FlowRecord {
    return (
      this.state.flows.find((f) => f.id === this.state.activeFlowId) ??
      this.state.flows[0]
    );
  }

  update(state: PersistedState, view: HudViewState, status: RuntimeStatus): void {
    this.state = state;
    this.view = view;
    this.status = status;
    this.render();
  }

  updateStatus(status: RuntimeStatus): void {
    const structuralChanged =
      this.status.runState !== status.runState ||
      this.status.isRecording !== status.isRecording ||
      this.status.fallbackReason !== status.fallbackReason ||
      this.status.effectiveEngine !== status.effectiveEngine ||
      this.status.showPins !== status.showPins ||
      this.status.hudVisible !== status.hudVisible;

    this.status = status;

    if (structuralChanged) {
      this.render();
      return;
    }

    const t = this.getMessages();
    const pill = this.panelEl.querySelector('.ac-status-pill');
    if (pill) {
      pill.innerHTML = this.formatStatusPillHtml(t);
    }

    const recBtn = this.panelEl.querySelector('#ac-macro-record-btn');
    if (recBtn && this.status.isRecording) {
      recBtn.textContent = fmt(t.hud.recordFinishBtn, { count: this.status.recordedStepsCount });
    }

    this.applyTelemetryFrame();
    this.syncTelemetryLoop();
  }

  temporarilyPassThroughAt(x: number, y: number): void {
    this.restorePointerEvents();
    const activeEl = this.view.hudVisible
      ? this.view.hudMinimized
        ? this.miniEl
        : this.panelEl
      : null;
    if (!activeEl) return;

    const rect = activeEl.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      activeEl.style.pointerEvents = 'none';
      this.passThroughEl = activeEl;
    }
  }

  restorePointerEvents(): void {
    if (this.passThroughEl) {
      this.passThroughEl.style.pointerEvents = 'auto';
      this.passThroughEl = null;
    }
  }

  private formatStatusPillHtml(t: I18nMessages): string {
    if (this.status.runState === 'running') {
      const total = this.status.totalLoops > 0 ? String(this.status.totalLoops) : '∞';
      return fmt(t.hud.statusRunning, {
        loop: this.status.currentLoop,
        total,
        count: this.status.executedCount,
      });
    }
    if (this.status.runState === 'paused') {
      return fmt(t.hud.statusPaused, { count: this.status.executedCount });
    }
    if (this.status.isRecording) {
      return fmt(t.hud.statusRecording, { count: this.status.recordedStepsCount });
    }
    return t.hud.statusIdle;
  }

  private ensureActiveInViewport(): void {
    if (!this.view.hudVisible || this.isDraggingHud) return;
    this.ensureInViewport(this.view.hudMinimized ? this.miniEl : this.panelEl);
  }

  private ensureInViewport(el: HTMLElement): void {
    const vp = getViewportBounds(window, document);
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const { x, y } = computeClampedHudPosition({
      preferred: this.state.hudPosition,
      boxWidth: rect.width,
      boxHeight: rect.height,
      viewportWidth: vp.width,
      viewportHeight: vp.height,
      margin: 10,
    });

    const curLeft = parseFloat(el.style.left);
    const curTop = parseFloat(el.style.top);
    const needsUpdate =
      el.style.right !== 'auto' ||
      !Number.isFinite(curLeft) ||
      !Number.isFinite(curTop) ||
      Math.abs(curLeft - x) >= 1 ||
      Math.abs(curTop - y) >= 1;

    if (needsUpdate) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.right = 'auto';
    }
  }

  private attachDragHandler(handle: HTMLElement, targetBox: HTMLElement): void {
    handle.addEventListener('dragstart', (ev) => ev.preventDefault());
    handle.addEventListener('pointerdown', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest('button, input, select')) return;
      if (ev.button !== 0) return;

      ev.preventDefault();
      this.isDraggingHud = true;
      const rect = targetBox.getBoundingClientRect();
      const offsetX = ev.clientX - rect.left;
      const offsetY = ev.clientY - rect.top;

      const shield = document.createElement('div');
      shield.className = 'ac-drag-shield';
      this.root.appendChild(shield);
      try {
        shield.setPointerCapture(ev.pointerId);
      } catch {
        // Ignore if unsupported
      }

      const onMove = (moveEv: PointerEvent) => {
        moveEv.preventDefault();
        const vp = getViewportBounds(window, document);
        const { x, y } = computeClampedHudPosition({
          preferred: { x: moveEv.clientX - offsetX, y: moveEv.clientY - offsetY },
          boxWidth: rect.width,
          boxHeight: rect.height,
          viewportWidth: vp.width,
          viewportHeight: vp.height,
          margin: 8,
        });
        targetBox.style.left = `${x}px`;
        targetBox.style.top = `${y}px`;
        targetBox.style.right = 'auto';
      };

      const finish = (upEv: PointerEvent, commit: boolean) => {
        shield.removeEventListener('pointermove', onMove);
        shield.removeEventListener('pointerup', onUp);
        shield.removeEventListener('pointercancel', onCancel);
        try {
          if (shield.hasPointerCapture?.(upEv.pointerId)) {
            shield.releasePointerCapture(upEv.pointerId);
          }
        } catch {
          // Ignore
        }
        shield.remove();
        this.isDraggingHud = false;

        if (commit) {
          const finalRect = targetBox.getBoundingClientRect();
          this.commitState({
            hudPosition: { x: Math.round(finalRect.left), y: Math.round(finalRect.top) },
          });
        }
      };

      const onUp = (upEv: PointerEvent) => finish(upEv, true);
      const onCancel = (cEv: PointerEvent) => finish(cEv, false);

      shield.addEventListener('pointermove', onMove);
      shield.addEventListener('pointerup', onUp);
      shield.addEventListener('pointercancel', onCancel);
    });
  }

  private commitState(patch: Partial<PersistedState>): void {
    this.state = { ...this.state, ...patch };
    this.actions.onStateChange(this.state);
    this.render();
  }

  private updateActiveFlow(updater: (flow: FlowRecord) => FlowRecord): void {
    const active = this.getActiveFlow();
    const flows = this.state.flows.map((f) => (f.id === active.id ? updater(f) : f));
    this.commitState({ flows });
  }

  private updateFlowStep(stepId: string, updater: (step: FlowStep) => FlowStep): void {
    this.updateActiveFlow((flow) => ({
      ...flow,
      steps: flow.steps.map((s) => (s.id === stepId ? updater(s) : s)),
    }));
  }

  private stopTelemetryLoop(): void {
    if (this.cdRafId !== null) {
      cancelAnimationFrame(this.cdRafId);
      this.cdRafId = null;
    }
  }

  private syncTelemetryLoop(): void {
    const active =
      this.view.hudVisible &&
      !this.view.hudMinimized &&
      (this.status.runState === 'running' || this.status.runState === 'paused');

    if (!active) {
      this.stopTelemetryLoop();
      this.lastScrolledStepId = null;
      return;
    }

    if (this.status.runState === 'paused') {
      this.stopTelemetryLoop();
      this.applyTelemetryFrame();
      return;
    }

    if (this.cdRafId !== null) return;
    const tick = () => {
      if (!this.view.hudVisible || this.view.hudMinimized || this.status.runState !== 'running') {
        this.cdRafId = null;
        return;
      }
      this.applyTelemetryFrame();
      this.cdRafId = requestAnimationFrame(tick);
    };
    this.cdRafId = requestAnimationFrame(tick);
  }

  private applyTelemetryFrame(): void {
    const activeId = this.status.runState !== 'idle' ? this.status.currentStepId : null;
    const isPaused = this.status.runState === 'paused';

    const timing = this.status.phaseTiming;
    let cdRatio = 0;
    let remMs = 0;
    if (timing?.isTimed && timing.totalDurationMs > 0) {
      const nowPerf =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      const elapsed = isPaused ? 0 : Math.max(0, nowPerf - timing.startedAtPerf);
      remMs = Math.max(0, timing.remainingMs - elapsed);
      cdRatio = Math.max(0, Math.min(1, remMs / timing.totalDurationMs));
    }

    const activePhaseKey =
      this.status.subPhase === 'delayBefore'
        ? 'delayBefore'
        : this.status.subPhase === 'repeatInterval'
          ? 'repeatInterval'
          : this.status.subPhase === 'delayAfter'
            ? 'delayAfter'
            : this.status.subPhase === 'loopCooldown'
              ? 'loopCooldown'
              : this.status.subPhase === 'idle'
                ? ''
                : 'main';

    this.panelEl.querySelectorAll<HTMLElement>('.ac-flow-node, .ac-flow-loop-node').forEach((nodeEl) => {
      const sid = nodeEl.getAttribute('data-step-id');
      const isActive = Boolean(activeId && sid === activeId);

      nodeEl.classList.toggle('is-active-node', isActive && !isPaused);
      nodeEl.classList.toggle('is-paused-node', isActive && isPaused);

      const arrow = sid ? this.panelEl.querySelector(`.ac-flow-arrow[data-arrow-for="${sid}"]`) : null;
      arrow?.classList.toggle('is-flowing', isActive);

      const skillBox = nodeEl.querySelector<HTMLElement>('.ac-skill-box');
      const cdText = nodeEl.querySelector<HTMLElement>('.ac-skill-cd-text');
      if (skillBox) {
        if (isActive && timing?.isTimed && timing.totalDurationMs > 0) {
          skillBox.style.setProperty('--cd-ratio', cdRatio.toFixed(4));
          skillBox.style.setProperty('--cd-visible', '1');
          if (cdText) cdText.textContent = formatCdMs(remMs);
        } else {
          skillBox.style.setProperty('--cd-ratio', '0');
          skillBox.style.setProperty('--cd-visible', '0');
          if (cdText) cdText.textContent = '';
        }
      }

      nodeEl.querySelectorAll<HTMLElement>('.ac-phase-chip').forEach((chip) => {
        const key = chip.getAttribute('data-phase-chip');
        const chipActive = isActive && key === activePhaseKey;
        chip.classList.toggle('is-active-phase', chipActive);
        if (chipActive && timing?.isTimed && timing.totalDurationMs > 0) {
          chip.style.setProperty('--phase-cd', cdRatio.toFixed(4));
        } else {
          chip.style.setProperty('--phase-cd', '0');
        }
      });

      if (isActive && sid && sid !== this.lastScrolledStepId) {
        this.lastScrolledStepId = sid;
        if (typeof nodeEl.scrollIntoView === 'function') {
          nodeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    });
  }

  private render(): void {
    if (!this.view.hudVisible) {
      this.panelEl.classList.add('ac-hidden');
      this.miniEl.classList.add('ac-hidden');
      this.stopTelemetryLoop();
      return;
    }

    const t = this.getMessages();

    if (this.view.hudMinimized) {
      this.panelEl.classList.add('ac-hidden');
      this.miniEl.classList.remove('ac-hidden');
      this.stopTelemetryLoop();
      this.renderMini(t);
      this.ensureInViewport(this.miniEl);
      return;
    }

    this.miniEl.classList.add('ac-hidden');
    this.panelEl.classList.remove('ac-hidden');
    this.panelEl.classList.toggle('is-wide', this.state.hudWide);
    this.renderFull(t);
    this.ensureInViewport(this.panelEl);
    this.applyTelemetryFrame();
    this.syncTelemetryLoop();
  }

  private renderMini(t: I18nMessages): void {
    const dotCls =
      this.status.runState === 'running'
        ? 'is-running'
        : this.status.runState === 'paused'
          ? 'is-paused'
          : this.status.isRecording
            ? 'is-recording'
            : '';

    const prText =
      this.status.runState === 'running'
        ? '⏸'
        : this.status.runState === 'paused'
          ? t.hud.resumeShort
          : '▶';
    const prCls = this.status.runState === 'paused' ? 'ac-btn-warn' : 'ac-btn-primary';
    const pinsOn = this.state.settings.showPins;

    this.miniEl.innerHTML = `
      <span class="ac-brand-dot ${dotCls}"></span>
      <strong style="font-size:11px;">${escapeHtml(fmt(t.hud.miniTitle, { count: this.status.executedCount }))}</strong>
      <button class="ac-icon-btn ${pinsOn ? 'is-on' : ''}" data-act="toggle-pins" title="${escapeHtml(t.hud.pinsToggleTitle)}">${pinsOn ? '👁️' : '🙈'}</button>
      <button class="ac-btn ac-btn-sm ${prCls}" data-act="pause-resume" ${this.status.isRecording ? 'disabled' : ''}>${escapeHtml(prText)}</button>
      ${this.status.runState !== 'idle' ? `<button class="ac-btn ac-btn-sm ac-btn-danger" data-act="stop">⏹</button>` : ''}
      <button class="ac-icon-btn" data-act="expand" title="${escapeHtml(t.hud.expandBtn)}">${escapeHtml(t.hud.expandBtn)}</button>
    `;

    this.miniEl.querySelector('[data-act="toggle-pins"]')?.addEventListener('click', () => {
      this.actions.onTogglePins();
    });
    this.miniEl.querySelector('[data-act="pause-resume"]')?.addEventListener('click', () => {
      this.actions.onPauseResume();
    });
    this.miniEl.querySelector('[data-act="stop"]')?.addEventListener('click', () => {
      this.actions.onStop();
    });
    this.miniEl.querySelector('[data-act="expand"]')?.addEventListener('click', () => {
      this.actions.onSetHudMinimized(false);
    });
  }

  private renderFull(t: I18nMessages): void {
    const flow = this.getActiveFlow();
    const isRunning = this.status.runState === 'running';
    const isPaused = this.status.runState === 'paused';
    const isSessionActive = this.status.runState !== 'idle';
    const isRecording = this.status.isRecording;
    const structuralLocked = isRunning || isRecording;

    const dotCls = isRunning
      ? 'is-running'
      : isPaused
        ? 'is-paused'
        : isRecording
          ? 'is-recording'
          : '';

    const displayedEngine = isSessionActive ? this.status.effectiveEngine : this.state.settings.engine;
    const pinsOn = this.state.settings.showPins;

    const translatedFallback = translateFallbackReason(this.status.fallbackReason, t);
    const fallbackBanner = translatedFallback
      ? `<div class="ac-fallback-note">⚠️ ${escapeHtml(translatedFallback)}</div>`
      : '';

    const primaryBtnHtml = isRunning
      ? `<button class="ac-btn ac-btn-warn" style="flex:1;" id="ac-pause-resume-btn">${escapeHtml(t.hud.pauseBtn)}</button>
         <button class="ac-btn ac-btn-danger" id="ac-stop-btn">${escapeHtml(t.hud.stopBtn)}</button>`
      : isPaused
        ? `<button class="ac-btn ac-btn-primary" style="flex:1;" id="ac-pause-resume-btn">${escapeHtml(t.hud.resumeBtn)}</button>
           <button class="ac-btn ac-btn-danger" id="ac-stop-btn">${escapeHtml(t.hud.stopResetBtn)}</button>`
        : `<button class="ac-btn ac-btn-primary" style="flex:1;" id="ac-pause-resume-btn" ${flow.steps.length === 0 || isRecording ? 'disabled' : ''}>${escapeHtml(t.hud.startBtn)}</button>`;

    const recordBtnHtml = isRecording
      ? `<button class="ac-btn ac-btn-danger" style="flex:1;" id="ac-macro-record-btn">${escapeHtml(fmt(t.hud.recordFinishBtn, { count: this.status.recordedStepsCount }))}</button>`
      : `<button class="ac-btn ac-btn-record" id="ac-macro-record-btn" ${isSessionActive ? 'disabled' : ''} title="${escapeHtml(t.hud.recordBtnTitle)}">${escapeHtml(t.hud.recordStartBtn)}</button>`;

    const flowOptions = this.state.flows
      .map((f) => {
        const tag = f.source === 'macro' ? '🎬 ' : '';
        return `<option value="${f.id}" ${f.id === flow.id ? 'selected' : ''}>${tag}${escapeHtml(f.name)} (${f.steps.length})</option>`;
      })
      .join('');

    const langOptions = SUPPORTED_LOCALES.map((item) => {
      const label = item.value === 'auto' ? t.autoLangOption : item.nativeLabel;
      return `<option value="${item.value}" ${this.state.settings.language === item.value ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    this.panelEl.innerHTML = `
      <div class="ac-hud-header" id="ac-drag-handle">
        <div class="ac-brand">
          <span class="ac-brand-dot ${dotCls}"></span>
          <span>${escapeHtml(t.hud.title)}</span>
        </div>
        <div class="ac-header-actions">
          <select class="ac-lang-select" data-act="lang-select" title="Language">${langOptions}</select>
          <button class="ac-icon-btn ${pinsOn ? 'is-on' : ''}" data-act="toggle-pins" title="${escapeHtml(t.hud.pinsToggleTitle)}">${escapeHtml(pinsOn ? t.hud.pinsOnBtn : t.hud.pinsOffBtn)}</button>
          <button class="ac-icon-btn" data-act="toggle-wide" title="${escapeHtml(t.hud.toggleWideTitle)}">⇔</button>
          <button class="ac-icon-btn" data-act="minimize" title="${escapeHtml(t.hud.minimizeTitle)}">－</button>
          <button class="ac-icon-btn" data-act="hide" title="${escapeHtml(t.hud.hideTitle)}">×</button>
        </div>
      </div>

      <div class="ac-engine-bar">
        <div class="ac-segmented" title="${escapeHtml(t.hud.engineSwitchTitle)}">
          <button class="ac-seg-btn ${displayedEngine === 'cdp' ? 'is-active' : ''}" data-engine="cdp">${escapeHtml(t.hud.engineCdp)}</button>
          <button class="ac-seg-btn ${displayedEngine === 'dom' ? 'is-active' : ''}" data-engine="dom">${escapeHtml(t.hud.engineDom)}</button>
        </div>
        <div class="ac-status-pill">${this.formatStatusPillHtml(t)}</div>
      </div>

      ${fallbackBanner}

      <div class="ac-transport">
        ${primaryBtnHtml}
        ${recordBtnHtml}
      </div>

      <div class="ac-flow-bar">
        <div class="ac-row">
          <select class="ac-select" id="ac-flow-select" style="flex:1;" ${isSessionActive || isRecording ? 'disabled' : ''}>${flowOptions}</select>
          <button class="ac-icon-btn" id="ac-flow-rename" ${isSessionActive || isRecording ? 'disabled' : ''} title="${escapeHtml(t.hud.renameTitle)}">${escapeHtml(t.hud.renameBtn)}</button>
          <button class="ac-icon-btn" id="ac-flow-del" ${isSessionActive || isRecording || this.state.flows.length <= 1 ? 'disabled' : ''} title="${escapeHtml(t.hud.deleteTitle)}">${escapeHtml(t.hud.deleteBtn)}</button>
          <button class="ac-icon-btn" id="ac-flow-export" title="${escapeHtml(t.hud.exportTitle)}">${escapeHtml(t.hud.exportBtn)}</button>
          <button class="ac-icon-btn" id="ac-flow-import" ${isSessionActive || isRecording ? 'disabled' : ''} title="${escapeHtml(t.hud.importTitle)}">${escapeHtml(t.hud.importBtn)}</button>
        </div>
        <div class="ac-row" style="justify-content:space-between;">
          <div class="ac-row" style="gap:4px;">
            <span style="font-size:10px; color:#94a3b8;">${escapeHtml(t.hud.newPrefix)}</span>
            <button class="ac-icon-btn" data-preset="single" ${isSessionActive || isRecording ? 'disabled' : ''}>${escapeHtml(t.hud.presetSingle)}</button>
            <button class="ac-icon-btn" data-preset="scroll" ${isSessionActive || isRecording ? 'disabled' : ''}>${escapeHtml(t.hud.presetScroll)}</button>
            <button class="ac-icon-btn" data-preset="empty" ${isSessionActive || isRecording ? 'disabled' : ''}>${escapeHtml(t.hud.presetEmpty)}</button>
          </div>
          <div class="ac-row" style="gap:6px;">
            <label class="ac-check" style="font-size:10px;"><input type="checkbox" id="ac-rec-wheel" ${this.state.settings.recordWheel ? 'checked' : ''} />${escapeHtml(t.hud.recWheelLabel)}</label>
            <label class="ac-check" style="font-size:10px;"><input type="checkbox" id="ac-rec-key" ${this.state.settings.recordKeyboard ? 'checked' : ''} />${escapeHtml(t.hud.recKeyLabel)}</label>
          </div>
        </div>
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>${escapeHtml(t.hud.speedLabel)}</label>
            <select class="ac-select" id="ac-flow-speed" ${isRunning || isRecording ? 'disabled' : ''}>
              <option value="0.5" ${flow.playbackSpeed === 0.5 ? 'selected' : ''}>0.5x</option>
              <option value="1" ${flow.playbackSpeed === 1 ? 'selected' : ''}>1.0x</option>
              <option value="2" ${flow.playbackSpeed === 2 ? 'selected' : ''}>2.0x</option>
              <option value="5" ${flow.playbackSpeed === 5 ? 'selected' : ''}>5.0x</option>
              <option value="10" ${flow.playbackSpeed === 10 ? 'selected' : ''}>10.0x</option>
            </select>
          </div>
          <div class="ac-field">
            <label>${escapeHtml(t.hud.loopsLabel)}</label>
            <input class="ac-input" type="number" min="0" id="ac-flow-loops" value="${flow.loopCount}" ${isRunning || isRecording ? 'disabled' : ''} />
          </div>
          <div class="ac-field">
            <label>${escapeHtml(t.hud.loopCdLabel)}</label>
            <input class="ac-input" type="number" min="0" id="ac-flow-loop-delay" value="${flow.loopDelayMs}" ${isRunning || isRecording ? 'disabled' : ''} />
          </div>
        </div>
      </div>

      <div class="ac-palette-bar">
        <span style="font-size:10px; color:#94a3b8; font-weight:700;">${escapeHtml(t.hud.addStepLabel)}</span>
        <button class="ac-btn ac-btn-sm ac-btn-primary" id="ac-add-click" ${structuralLocked ? 'disabled' : ''}>${escapeHtml(t.hud.addClick)}</button>
        <button class="ac-btn ac-btn-sm" id="ac-add-wheel" ${structuralLocked ? 'disabled' : ''}>${escapeHtml(t.hud.addWheel)}</button>
        <button class="ac-btn ac-btn-sm" id="ac-add-drag" ${structuralLocked ? 'disabled' : ''}>${escapeHtml(t.hud.addDrag)}</button>
        <button class="ac-btn ac-btn-sm" id="ac-add-key" ${structuralLocked ? 'disabled' : ''}>${escapeHtml(t.hud.addKey)}</button>
        <button class="ac-btn ac-btn-sm" id="ac-add-wait" ${structuralLocked ? 'disabled' : ''}>${escapeHtml(t.hud.addWait)}</button>
      </div>

      <div class="ac-body" id="ac-flow-body"></div>

      <div class="ac-footer-hotkeys">
        <span>${escapeHtml(t.hud.hotkeysFooter)}</span>
        <span>${escapeHtml(displayedEngine === 'cdp' ? t.hud.trustedFooter : t.hud.domFooter)}</span>
      </div>
    `;

    const handle = this.panelEl.querySelector('#ac-drag-handle') as HTMLElement;
    this.attachDragHandler(handle, this.panelEl);

    this.panelEl.querySelector('[data-act="lang-select"]')?.addEventListener('change', (ev) => {
      const nextLang = (ev.target as HTMLSelectElement).value as LanguageSetting;
      this.commitState({
        settings: { ...this.state.settings, language: nextLang },
      });
    });

    this.panelEl.querySelector('[data-act="toggle-pins"]')?.addEventListener('click', () => {
      this.actions.onTogglePins();
    });
    this.panelEl.querySelector('[data-act="toggle-wide"]')?.addEventListener('click', () => {
      this.commitState({ hudWide: !this.state.hudWide });
    });
    this.panelEl.querySelector('[data-act="minimize"]')?.addEventListener('click', () => {
      this.actions.onSetHudMinimized(true);
    });
    this.panelEl.querySelector('[data-act="hide"]')?.addEventListener('click', () => {
      this.actions.onSetHudVisible(false);
    });

    this.panelEl.querySelectorAll('[data-engine]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextEngine = btn.getAttribute('data-engine') as EngineMode;
        this.actions.onSwitchEngine(nextEngine);
      });
    });

    this.panelEl.querySelector('#ac-pause-resume-btn')?.addEventListener('click', () => {
      this.actions.onPauseResume();
    });
    this.panelEl.querySelector('#ac-stop-btn')?.addEventListener('click', () => {
      this.actions.onStop();
    });
    this.panelEl.querySelector('#ac-macro-record-btn')?.addEventListener('click', () => {
      this.actions.onToggleRecord();
    });

    this.panelEl.querySelector('#ac-flow-select')?.addEventListener('change', (ev) => {
      this.expandedStepId = null;
      this.commitState({ activeFlowId: (ev.target as HTMLSelectElement).value });
    });

    this.panelEl.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-preset') as 'single' | 'scroll' | 'empty';
        const locale = resolveLocale(this.state.settings.language);
        const nextFlow = createPresetFlow(kind, locale);
        this.expandedStepId = nextFlow.steps[0]?.id ?? null;
        this.commitState({
          flows: [nextFlow, ...this.state.flows],
          activeFlowId: nextFlow.id,
        });
      });
    });

    this.panelEl.querySelector('#ac-rec-wheel')?.addEventListener('change', (ev) => {
      this.commitState({
        settings: { ...this.state.settings, recordWheel: (ev.target as HTMLInputElement).checked },
      });
    });
    this.panelEl.querySelector('#ac-rec-key')?.addEventListener('change', (ev) => {
      this.commitState({
        settings: { ...this.state.settings, recordKeyboard: (ev.target as HTMLInputElement).checked },
      });
    });

    this.panelEl.querySelector('#ac-flow-speed')?.addEventListener('change', (ev) => {
      const val = Number((ev.target as HTMLSelectElement).value) || 1;
      this.updateActiveFlow((f) => ({ ...f, playbackSpeed: val }));
    });
    this.panelEl.querySelector('#ac-flow-loops')?.addEventListener('change', (ev) => {
      const val = Math.max(0, Number((ev.target as HTMLInputElement).value) || 0);
      this.updateActiveFlow((f) => ({ ...f, loopCount: val }));
    });
    this.panelEl.querySelector('#ac-flow-loop-delay')?.addEventListener('change', (ev) => {
      const val = Math.max(0, Number((ev.target as HTMLInputElement).value) || 0);
      this.updateActiveFlow((f) => ({ ...f, loopDelayMs: val }));
    });

    this.panelEl.querySelector('#ac-flow-rename')?.addEventListener('click', () => {
      const nextName = window.prompt(t.hud.renamePrompt, flow.name);
      if (nextName && nextName.trim()) {
        this.updateActiveFlow((f) => ({ ...f, name: nextName.trim() }));
      }
    });

    this.panelEl.querySelector('#ac-flow-del')?.addEventListener('click', () => {
      if (this.state.flows.length <= 1) return;
      const flows = this.state.flows.filter((f) => f.id !== flow.id);
      this.expandedStepId = null;
      this.commitState({ flows, activeFlowId: flows[0].id });
    });

    this.panelEl.querySelector('#ac-flow-export')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${flow.name.replace(/[^\w\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af-]+/g, '_')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    this.panelEl.querySelector('#ac-flow-import')?.addEventListener('click', () => {
      this.fileInput.value = '';
      this.fileInput.click();
    });

    this.panelEl.querySelector('#ac-add-click')?.addEventListener('click', () => this.actions.onAddStepPickClick());
    this.panelEl.querySelector('#ac-add-wheel')?.addEventListener('click', () => this.actions.onAddStepPickWheel());
    this.panelEl.querySelector('#ac-add-drag')?.addEventListener('click', () => this.actions.onAddStepPickDrag());
    this.panelEl.querySelector('#ac-add-key')?.addEventListener('click', () => this.actions.onAddStepKey());
    this.panelEl.querySelector('#ac-add-wait')?.addEventListener('click', () => this.actions.onAddStepWait());

    const body = this.panelEl.querySelector('#ac-flow-body') as HTMLElement;
    this.renderFlowchart(body, flow, structuralLocked, t);
  }

  private renderFlowchart(
    body: HTMLElement,
    flow: FlowRecord,
    structuralLocked: boolean,
    t: I18nMessages,
  ): void {
    const startLabel = flow.source === 'macro' ? t.hud.flowStartMacro : t.hud.flowStartManual;

    if (flow.steps.length === 0) {
      body.innerHTML = `
        <div class="ac-flowchart">
          <div class="ac-flow-start">${escapeHtml(startLabel)}</div>
          <div class="ac-flow-arrow">↓</div>
          <div style="text-align:center; color:#64748b; padding:18px 12px; border:1px dashed rgba(148,163,184,0.28); border-radius:10px;">
            ${escapeHtml(t.hud.emptyFlowHint)}
          </div>
        </div>
      `;
      return;
    }

    const nodesHtml = flow.steps
      .map((step, idx) => {
        const isCanvas = step.target?.tagName === 'CANVAS';
        const isExpanded = this.expandedStepId === step.id;
        const summary = formatStepSummary(step, t);
        const beforeChip =
          step.delayBeforeMs > 0
            ? `<span class="ac-phase-chip" data-phase-chip="delayBefore"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">${escapeHtml(fmt(t.hud.chipPreDelay, { ms: step.delayBeforeMs }))}</span></span>`
            : '';
        const mainChip = `<span class="ac-phase-chip" data-phase-chip="main"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">${escapeHtml(resolveMainChipText(step, t))}</span></span>`;
        const repeatChip =
          step.repeatCount !== 1
            ? `<span class="ac-phase-chip" data-phase-chip="repeatInterval"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">${escapeHtml(fmt(t.hud.chipRepeatGap, { ms: step.repeatIntervalMs }))}</span></span>`
            : '';
        const afterChip =
          step.delayAfterMs > 0
            ? `<span class="ac-phase-chip" data-phase-chip="delayAfter"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">${escapeHtml(fmt(t.hud.chipPostDelay, { ms: step.delayAfterMs }))}</span></span>`
            : '';

        const editorHtml = isExpanded ? this.renderStepEditorHtml(step, structuralLocked, t) : '';

        return `
          <div class="ac-flow-arrow" data-arrow-for="${step.id}">↓</div>
          <div class="ac-flow-node ${step.enabled ? '' : 'is-disabled-node'}" data-step-id="${step.id}">
            <div class="ac-node-main">
              <div class="ac-skill-box ${isCanvas ? 'is-canvas' : ''}" data-skill-box="${step.id}">
                <span class="ac-skill-emoji">${stepEmoji(step.type)}</span>
                <span class="ac-skill-num">#${idx + 1}</span>
                <div class="ac-skill-cd-mask"><span class="ac-skill-cd-text"></span></div>
              </div>
              <div class="ac-node-info">
                <div class="ac-node-head">
                  <div class="ac-node-title">
                    <input type="checkbox" data-act="toggle-step" ${step.enabled ? 'checked' : ''} ${structuralLocked ? 'disabled' : ''} />
                    <span class="ac-badge ${isCanvas ? 'is-canvas' : ''}">${escapeHtml(t.stepTypes[step.type])}${isCanvas ? '·Canvas' : ''}</span>
                    <span class="ac-node-title-text" title="${escapeHtml(summary)}">${escapeHtml(summary)}</span>
                  </div>
                  <div class="ac-row" style="gap:3px;">
                    <button class="ac-icon-btn ${isExpanded ? 'is-on' : ''}" data-act="edit" title="${escapeHtml(t.hud.editTitle)}">⚙</button>
                    <button class="ac-icon-btn" data-act="up" ${structuralLocked || idx === 0 ? 'disabled' : ''} title="${escapeHtml(t.hud.moveUpTitle)}">↑</button>
                    <button class="ac-icon-btn" data-act="down" ${structuralLocked || idx === flow.steps.length - 1 ? 'disabled' : ''} title="${escapeHtml(t.hud.moveDownTitle)}">↓</button>
                    <button class="ac-icon-btn" data-act="del" ${structuralLocked ? 'disabled' : ''} title="${escapeHtml(t.hud.deleteStepTitle)}">✕</button>
                  </div>
                </div>
                <div class="ac-phase-pipeline">
                  ${beforeChip}${mainChip}${repeatChip}${afterChip}
                </div>
              </div>
            </div>
            ${editorHtml}
          </div>
        `;
      })
      .join('');

    const loopText =
      flow.loopCount === 0
        ? fmt(t.hud.loopInfiniteText, { ms: flow.loopDelayMs })
        : fmt(t.hud.loopFiniteText, { count: flow.loopCount, ms: flow.loopDelayMs });

    body.innerHTML = `
      <div class="ac-flowchart">
        <div class="ac-flow-start">${escapeHtml(startLabel)}</div>
        ${nodesHtml}
        <div class="ac-flow-arrow" data-arrow-for="__loop__">↓</div>
        <div class="ac-flow-loop-node" data-step-id="__loop__">
          <div class="ac-skill-box" style="width:36px; height:36px; flex:0 0 36px;" data-skill-box="__loop__">
            <span class="ac-skill-emoji" style="font-size:14px;">🔄</span>
            <div class="ac-skill-cd-mask"><span class="ac-skill-cd-text"></span></div>
          </div>
          <div style="flex:1;">
            <div style="font-weight:700; color:#cbd5e1;">${escapeHtml(t.hud.loopControlTitle)}</div>
            <div class="ac-phase-pipeline" style="margin-top:3px;">
              <span class="ac-phase-chip" data-phase-chip="loopCooldown"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">${escapeHtml(loopText)}</span></span>
            </div>
          </div>
        </div>
      </div>
    `;

    body.querySelectorAll('.ac-flow-node').forEach((nodeEl) => {
      const stepId = nodeEl.getAttribute('data-step-id');
      if (!stepId) return;

      nodeEl.querySelector('[data-act="toggle-step"]')?.addEventListener('change', (ev) => {
        const enabled = (ev.target as HTMLInputElement).checked;
        this.updateFlowStep(stepId, (s) => ({ ...s, enabled }));
      });

      nodeEl.querySelector('[data-act="edit"]')?.addEventListener('click', () => {
        this.expandedStepId = this.expandedStepId === stepId ? null : stepId;
        this.render();
      });

      nodeEl.querySelector('[data-act="up"]')?.addEventListener('click', () => {
        this.updateActiveFlow((f) => {
          const steps = [...f.steps];
          const i = steps.findIndex((s) => s.id === stepId);
          if (i > 0) [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
          return { ...f, steps };
        });
      });

      nodeEl.querySelector('[data-act="down"]')?.addEventListener('click', () => {
        this.updateActiveFlow((f) => {
          const steps = [...f.steps];
          const i = steps.findIndex((s) => s.id === stepId);
          if (i >= 0 && i < steps.length - 1) [steps[i], steps[i + 1]] = [steps[i + 1], steps[i]];
          return { ...f, steps };
        });
      });

      nodeEl.querySelector('[data-act="del"]')?.addEventListener('click', () => {
        if (this.expandedStepId === stepId) this.expandedStepId = null;
        this.updateActiveFlow((f) => ({
          ...f,
          steps: f.steps.filter((s) => s.id !== stepId),
        }));
      });

      this.bindStepEditorListeners(nodeEl as HTMLElement, stepId);
    });
  }

  private renderStepEditorHtml(step: FlowStep, locked: boolean, t: I18nMessages): string {
    const dis = locked ? 'disabled' : '';

    let typeSpecific = '';
    if (step.type === 'click') {
      typeSpecific = `
        <div class="ac-row" style="justify-content:space-between;">
          <label class="ac-check"><input type="checkbox" data-ef="followCursor" ${step.followCursor ? 'checked' : ''} ${dis} />${escapeHtml(t.hud.editorFollowCursor)}</label>
          <button class="ac-btn ac-btn-sm ac-btn-primary" data-act="pick-start" ${locked || step.followCursor ? 'disabled' : ''}>${escapeHtml(t.hud.editorRepickTarget)}</button>
        </div>
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>${escapeHtml(t.hud.editorLocMode)}</label>
            <select class="ac-select" data-ef="locMode" ${dis || !step.target || step.followCursor ? 'disabled' : ''}>
              <option value="auto" ${step.target?.mode === 'auto' ? 'selected' : ''}>${escapeHtml(t.hud.locAuto)}</option>
              <option value="canvas-relative" ${step.target?.mode === 'canvas-relative' ? 'selected' : ''}>${escapeHtml(t.hud.locCanvas)}</option>
              <option value="dom" ${step.target?.mode === 'dom' ? 'selected' : ''}>${escapeHtml(t.hud.locDom)}</option>
              <option value="viewport" ${step.target?.mode === 'viewport' ? 'selected' : ''}>${escapeHtml(t.hud.locViewport)}</option>
            </select>
          </div>
          <div class="ac-field">
            <label>${escapeHtml(t.hud.editorMouseBtn)}</label>
            <select class="ac-select" data-ef="button" ${dis}>
              <option value="left" ${step.button === 'left' ? 'selected' : ''}>${escapeHtml(t.hud.editorBtnLeft)}</option>
              <option value="right" ${step.button === 'right' ? 'selected' : ''}>${escapeHtml(t.hud.editorBtnRight)}</option>
              <option value="middle" ${step.button === 'middle' ? 'selected' : ''}>${escapeHtml(t.hud.editorBtnMiddle)}</option>
            </select>
          </div>
          <div class="ac-field">
            <label>${escapeHtml(t.hud.editorClickKind)}</label>
            <select class="ac-select" data-ef="clickKind" ${dis}>
              <option value="single" ${step.clickKind === 'single' ? 'selected' : ''}>${escapeHtml(t.hud.editorKindSingle)}</option>
              <option value="double" ${step.clickKind === 'double' ? 'selected' : ''}>${escapeHtml(t.hud.editorKindDouble)}</option>
              <option value="hold" ${step.clickKind === 'hold' ? 'selected' : ''}>${escapeHtml(t.hud.editorKindHold)}</option>
            </select>
          </div>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field"><label>${escapeHtml(t.hud.editorHoldMs)}</label><input class="ac-input" type="number" min="0" data-ef="holdMs" value="${step.holdMs}" ${dis} /></div>
          <div class="ac-field"><label>${escapeHtml(t.hud.editorJitterPx)}</label><input class="ac-input" type="number" min="0" data-ef="jitterPx" value="${step.jitterPx}" ${dis} /></div>
        </div>
      `;
    } else if (step.type === 'wheel') {
      typeSpecific = `
        <div class="ac-row" style="justify-content:space-between;">
          <label class="ac-check"><input type="checkbox" data-ef="usePageScroll" ${step.usePageScroll ? 'checked' : ''} ${dis} />${escapeHtml(t.hud.editorPageScroll)}</label>
          <button class="ac-btn ac-btn-sm ac-btn-primary" data-act="pick-start" ${locked || step.usePageScroll ? 'disabled' : ''}>${escapeHtml(t.hud.editorPickContainer)}</button>
        </div>
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>${escapeHtml(t.hud.editorScrollDir)}</label>
            <select class="ac-select" data-ef="direction" ${dis}>
              <option value="down" ${step.direction === 'down' ? 'selected' : ''}>${escapeHtml(t.hud.dirDown)}</option>
              <option value="up" ${step.direction === 'up' ? 'selected' : ''}>${escapeHtml(t.hud.dirUp)}</option>
              <option value="left" ${step.direction === 'left' ? 'selected' : ''}>${escapeHtml(t.hud.dirLeft)}</option>
              <option value="right" ${step.direction === 'right' ? 'selected' : ''}>${escapeHtml(t.hud.dirRight)}</option>
              <option value="custom" ${step.direction === 'custom' ? 'selected' : ''}>${escapeHtml(t.hud.dirCustom)}</option>
            </select>
          </div>
          <div class="ac-field"><label>ΔX (px)</label><input class="ac-input" type="number" data-ef="deltaX" value="${step.deltaX}" ${dis} /></div>
          <div class="ac-field"><label>ΔY (px)</label><input class="ac-input" type="number" data-ef="deltaY" value="${step.deltaY}" ${dis} /></div>
        </div>
      `;
    } else if (step.type === 'drag') {
      typeSpecific = `
        <div class="ac-grid-2">
          <button class="ac-btn ac-btn-sm" data-act="pick-start" ${dis}>${escapeHtml(t.hud.editorPickStartA)}</button>
          <button class="ac-btn ac-btn-sm" data-act="pick-end" ${dis}>${escapeHtml(t.hud.editorPickEndB)}</button>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field"><label>${escapeHtml(t.hud.editorDragMs)}</label><input class="ac-input" type="number" min="40" data-ef="dragDurationMs" value="${step.dragDurationMs}" ${dis} /></div>
          <div class="ac-field"><label>${escapeHtml(t.hud.editorJitterPx)}</label><input class="ac-input" type="number" min="0" data-ef="jitterPx" value="${step.jitterPx}" ${dis} /></div>
        </div>
      `;
    } else if (step.type === 'key') {
      typeSpecific = `
        <div class="ac-field">
          <label>${escapeHtml(t.hud.editorKeyCapture)}</label>
          <input class="ac-input" type="text" data-ef="keyCapture" value="${escapeHtml(step.key ?? 'Space')}" readonly ${dis} />
        </div>
      `;
    } else {
      typeSpecific = `
        <div class="ac-field">
          <label>${escapeHtml(t.hud.editorWaitMs)}</label>
          <input class="ac-input" type="number" min="10" data-ef="waitMs" value="${step.waitMs}" ${dis} />
        </div>
      `;
    }

    return `
      <div class="ac-node-editor">
        <div class="ac-field">
          <label>${escapeHtml(t.hud.editorNameLabel)}</label>
          <input class="ac-input" type="text" data-ef="name" placeholder="${escapeHtml(t.hud.editorNamePlaceholder)}" value="${escapeHtml(step.name ?? '')}" ${dis} />
        </div>
        ${typeSpecific}
        <div class="ac-grid-3">
          <div class="ac-field"><label>${escapeHtml(t.hud.editorPreWaitMs)}</label><input class="ac-input" type="number" min="0" data-ef="delayBeforeMs" value="${step.delayBeforeMs}" ${dis} /></div>
          <div class="ac-field"><label>${escapeHtml(t.hud.editorRepeatCount)}</label><input class="ac-input" type="number" min="0" data-ef="repeatCount" value="${step.repeatCount}" ${dis} /></div>
          <div class="ac-field"><label>${escapeHtml(t.hud.editorRepeatGapMs)}</label><input class="ac-input" type="number" min="10" data-ef="repeatIntervalMs" value="${step.repeatIntervalMs}" ${dis} /></div>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field"><label>${escapeHtml(t.hud.editorPostWaitMs)}</label><input class="ac-input" type="number" min="0" data-ef="delayAfterMs" value="${step.delayAfterMs}" ${dis} /></div>
          <div class="ac-field"><label>${escapeHtml(t.hud.editorJitterMs)}</label><input class="ac-input" type="number" min="0" data-ef="jitterMs" value="${step.jitterMs}" ${dis} /></div>
        </div>
      </div>
    `;
  }

  private bindStepEditorListeners(nodeEl: HTMLElement, stepId: string): void {
    nodeEl.querySelector('[data-act="pick-start"]')?.addEventListener('click', () => {
      this.actions.onPickStepTarget(stepId, 'start');
    });
    nodeEl.querySelector('[data-act="pick-end"]')?.addEventListener('click', () => {
      this.actions.onPickStepTarget(stepId, 'end');
    });

    const keyInput = nodeEl.querySelector<HTMLInputElement>('[data-ef="keyCapture"]');
    keyInput?.addEventListener('keydown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta') return;
      let modifiers = 0;
      if (ev.altKey) modifiers |= 1;
      if (ev.ctrlKey) modifiers |= 2;
      if (ev.metaKey) modifiers |= 4;
      if (ev.shiftKey) modifiers |= 8;
      this.updateFlowStep(stepId, (s) => ({
        ...s,
        key: ev.key,
        code: ev.code,
        keyCode: ev.keyCode || 0,
        modifiers,
      }));
    });

    nodeEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-ef]').forEach((el) => {
      const field = el.getAttribute('data-ef');
      if (!field || field === 'keyCapture') return;

      el.addEventListener('change', () => {
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          const checked = el.checked;
          this.updateFlowStep(stepId, (s) => {
            if (field === 'followCursor') return { ...s, followCursor: checked };
            if (field === 'usePageScroll') return { ...s, usePageScroll: checked };
            return s;
          });
          return;
        }

        const val = el.value;
        this.updateFlowStep(stepId, (s) => {
          switch (field) {
            case 'name':
              return { ...s, name: val };
            case 'locMode':
              return s.target ? { ...s, target: { ...s.target, mode: val as LocatorMode } } : s;
            case 'button':
              return { ...s, button: val as MouseButtonType };
            case 'clickKind':
              return { ...s, clickKind: val as ClickKind };
            case 'holdMs':
              return { ...s, holdMs: Math.max(0, Number(val) || 0) };
            case 'jitterPx':
              return { ...s, jitterPx: Math.max(0, Number(val) || 0) };
            case 'direction':
              return { ...s, direction: val as ScrollDirection };
            case 'deltaX':
              return { ...s, deltaX: Number(val) || 0 };
            case 'deltaY':
              return { ...s, deltaY: Number(val) || 0 };
            case 'dragDurationMs':
              return { ...s, dragDurationMs: Math.max(40, Number(val) || 40) };
            case 'waitMs':
              return { ...s, waitMs: Math.max(10, Number(val) || 10) };
            case 'delayBeforeMs':
              return { ...s, delayBeforeMs: Math.max(0, Number(val) || 0) };
            case 'repeatCount':
              return { ...s, repeatCount: Math.max(0, Number(val) || 0) };
            case 'repeatIntervalMs':
              return { ...s, repeatIntervalMs: Math.max(10, Number(val) || 10) };
            case 'delayAfterMs':
              return { ...s, delayAfterMs: Math.max(0, Number(val) || 0) };
            case 'jitterMs':
              return { ...s, jitterMs: Math.max(0, Number(val) || 0) };
            default:
              return s;
          }
        });
      });
    });
  }

  private handleImportFile = async (): Promise<void> => {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    const t = this.getMessages();
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<FlowRecord>;
      if (!Array.isArray(parsed.steps)) return;
      const steps = parsed.steps.map((st) =>
        createFlowStep({
          ...st,
          id: createId('step'),
          type: st.type ?? 'click',
        }),
      );
      const imported: FlowRecord = {
        id: createId('flow'),
        name:
          typeof parsed.name === 'string' && parsed.name
            ? `${parsed.name}${t.importedFlowSuffix}`
            : t.importedFlowDefaultName,
        createdAt: Date.now(),
        source: parsed.source ?? 'manual',
        playbackSpeed: typeof parsed.playbackSpeed === 'number' ? parsed.playbackSpeed : 1,
        loopCount: typeof parsed.loopCount === 'number' ? parsed.loopCount : 1,
        loopDelayMs: typeof parsed.loopDelayMs === 'number' ? parsed.loopDelayMs : 300,
        steps,
      };
      this.commitState({
        flows: [imported, ...this.state.flows],
        activeFlowId: imported.id,
      });
    } catch {
      // Ignore malformed JSON
    }
  };
}
