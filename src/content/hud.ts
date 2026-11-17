import { createFlowStep, createId, createPresetFlow } from '../shared/constants.ts';
import { computeClampedHudPosition, getViewportBounds } from '../shared/viewport.ts';
import type {
  ClickKind,
  EngineMode,
  FlowRecord,
  FlowStep,
  FlowStepType,
  LocatorMode,
  MouseButtonType,
  PersistedState,
  RuntimeStatus,
  ScrollDirection,
} from '../shared/types.ts';

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

function stepTypeLabel(type: FlowStepType): string {
  switch (type) {
    case 'click':
      return '点击';
    case 'wheel':
      return '滚动';
    case 'drag':
      return '拖拽';
    case 'key':
      return '按键';
    case 'wait':
      return '等待';
  }
}

function formatCdMs(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped >= 1000) {
    return `${(clamped / 1000).toFixed(1)}s`;
  }
  return `${Math.ceil(clamped)}ms`;
}

function formatStepSummary(step: FlowStep): string {
  if (step.name && step.name.trim()) return step.name.trim();
  if (step.type === 'click') {
    if (step.followCursor) return '跟随鼠标实时位置';
    if (step.target) return `${step.target.label ?? '目标'} (${step.target.clientX},${step.target.clientY})`;
    return '视口中心点击';
  }
  if (step.type === 'wheel') {
    if (step.usePageScroll || !step.target) return '页面/光标位置滚动';
    return `${step.target.label ?? '容器'} (${step.target.clientX},${step.target.clientY})`;
  }
  if (step.type === 'drag') {
    const a = step.target ? `(${step.target.clientX},${step.target.clientY})` : '起点未定';
    const b = step.endTarget ? `(${step.endTarget.clientX},${step.endTarget.clientY})` : '终点未定';
    return `${a} → ${b}`;
  }
  if (step.type === 'key') {
    return `按键 [${step.key ?? 'Space'}]`;
  }
  return `等待 ${step.waitMs}ms`;
}

function resolveMainChipText(step: FlowStep): string {
  const rep = step.repeatCount === 0 ? '∞次' : step.repeatCount > 1 ? `×${step.repeatCount}` : '1次';
  if (step.type === 'wait') return `等待 ${step.waitMs}ms`;
  if (step.type === 'drag') return `拖拽 ${step.dragDurationMs}ms · ${rep}`;
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
    return `滚动 ${dir} · ${rep}`;
  }
  if (step.type === 'key') return `按键 [${step.key || 'Space'}] · ${rep}`;
  const btn = step.button === 'right' ? '右' : step.button === 'middle' ? '中' : '左';
  const kind = step.clickKind === 'double' ? '双击' : step.clickKind === 'hold' ? `长按${step.holdMs}ms` : '单击';
  return `${btn}键${kind} · ${rep}`;
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

    const pill = this.panelEl.querySelector('.ac-status-pill');
    if (pill) {
      pill.innerHTML = this.formatStatusPillHtml();
    }

    const recBtn = this.panelEl.querySelector('#ac-macro-record-btn');
    if (recBtn && this.status.isRecording) {
      recBtn.textContent = `⏹ 完成录制并生成流程 (已录 ${this.status.recordedStepsCount} 步)`;
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

  private formatStatusPillHtml(): string {
    if (this.status.runState === 'running') {
      const loopPart =
        this.status.totalLoops > 0
          ? `轮 ${this.status.currentLoop}/${this.status.totalLoops}`
          : `轮 ${this.status.currentLoop}/∞`;
      return `运行中 · ${loopPart} · <strong>${this.status.executedCount}</strong>次`;
    }
    if (this.status.runState === 'paused') {
      return `<span style="color:#fbbf24;">⏸ 已暂停</span> · <strong>${this.status.executedCount}</strong>次`;
    }
    if (this.status.isRecording) {
      return `<span style="color:#fb7185;">录制中</span> · <strong>${this.status.recordedStepsCount}</strong>步`;
    }
    return '空闲就绪';
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

    // Compute live remaining & ratio for timed phases (Skill CD)
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

    if (this.view.hudMinimized) {
      this.panelEl.classList.add('ac-hidden');
      this.miniEl.classList.remove('ac-hidden');
      this.stopTelemetryLoop();
      this.renderMini();
      this.ensureInViewport(this.miniEl);
      return;
    }

    this.miniEl.classList.add('ac-hidden');
    this.panelEl.classList.remove('ac-hidden');
    this.panelEl.classList.toggle('is-wide', this.state.hudWide);
    this.renderFull();
    this.ensureInViewport(this.panelEl);
    this.applyTelemetryFrame();
    this.syncTelemetryLoop();
  }

  private renderMini(): void {
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
          ? '▶ 继续'
          : '▶';
    const prCls = this.status.runState === 'paused' ? 'ac-btn-warn' : 'ac-btn-primary';
    const pinsOn = this.state.settings.showPins;

    this.miniEl.innerHTML = `
      <span class="ac-brand-dot ${dotCls}"></span>
      <strong style="font-size:11px;">流程 (${this.status.executedCount})</strong>
      <button class="ac-icon-btn ${pinsOn ? 'is-on' : ''}" data-act="toggle-pins" title="显示/隐藏点位 (Alt+P)">${pinsOn ? '👁️' : '🙈'}</button>
      <button class="ac-btn ac-btn-sm ${prCls}" data-act="pause-resume" ${this.status.isRecording ? 'disabled' : ''}>${prText}</button>
      ${this.status.runState !== 'idle' ? `<button class="ac-btn ac-btn-sm ac-btn-danger" data-act="stop">⏹</button>` : ''}
      <button class="ac-icon-btn" data-act="expand" title="展开面板">展开</button>
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

  private renderFull(): void {
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

    const fallbackBanner = this.status.fallbackReason
      ? `<div class="ac-fallback-note">⚠️ ${escapeHtml(this.status.fallbackReason)}</div>`
      : '';

    const primaryBtnHtml = isRunning
      ? `<button class="ac-btn ac-btn-warn" style="flex:1;" id="ac-pause-resume-btn">⏸ 暂停 (F8)</button>
         <button class="ac-btn ac-btn-danger" id="ac-stop-btn">⏹ 停止 (Esc)</button>`
      : isPaused
        ? `<button class="ac-btn ac-btn-primary" style="flex:1;" id="ac-pause-resume-btn">▶ 继续执行 (F8)</button>
           <button class="ac-btn ac-btn-danger" id="ac-stop-btn">⏹ 停止重置</button>`
        : `<button class="ac-btn ac-btn-primary" style="flex:1;" id="ac-pause-resume-btn" ${flow.steps.length === 0 || isRecording ? 'disabled' : ''}>▶ 启动流程 (F8)</button>`;

    const recordBtnHtml = isRecording
      ? `<button class="ac-btn ac-btn-danger" style="flex:1;" id="ac-macro-record-btn">⏹ 完成录制并生成流程 (已录 ${this.status.recordedStepsCount} 步)</button>`
      : `<button class="ac-btn ac-btn-record" id="ac-macro-record-btn" ${isSessionActive ? 'disabled' : ''} title="录制操作并在结束后自动转为流程图">🔴 录制宏转流程 (F9)</button>`;

    const flowOptions = this.state.flows
      .map((f) => {
        const tag = f.source === 'macro' ? '🎬 ' : '';
        return `<option value="${f.id}" ${f.id === flow.id ? 'selected' : ''}>${tag}${escapeHtml(f.name)} (${f.steps.length}步)</option>`;
      })
      .join('');

    this.panelEl.innerHTML = `
      <div class="ac-hud-header" id="ac-drag-handle">
        <div class="ac-brand">
          <span class="ac-brand-dot ${dotCls}"></span>
          <span>AutoClick 流程图控制台</span>
        </div>
        <div class="ac-header-actions">
          <button class="ac-icon-btn ${pinsOn ? 'is-on' : ''}" data-act="toggle-pins" title="一键显示/隐藏放置的目标点 (Alt+P)">${pinsOn ? '👁️ 点位' : '🙈 点位'}</button>
          <button class="ac-icon-btn" data-act="toggle-wide" title="切换宽/窄面板">⇔</button>
          <button class="ac-icon-btn" data-act="minimize" title="最小化为悬浮胶囊">－</button>
          <button class="ac-icon-btn" data-act="hide" title="在本页隐藏面板 (Alt+H)">×</button>
        </div>
      </div>

      <div class="ac-engine-bar">
        <div class="ac-segmented" title="支持运行中实时热切换引擎">
          <button class="ac-seg-btn ${displayedEngine === 'cdp' ? 'is-active' : ''}" data-engine="cdp">⚡ CDP 原生</button>
          <button class="ac-seg-btn ${displayedEngine === 'dom' ? 'is-active' : ''}" data-engine="dom">🔇 DOM 静默</button>
        </div>
        <div class="ac-status-pill">${this.formatStatusPillHtml()}</div>
      </div>

      ${fallbackBanner}

      <div class="ac-transport">
        ${primaryBtnHtml}
        ${recordBtnHtml}
      </div>

      <div class="ac-flow-bar">
        <div class="ac-row">
          <select class="ac-select" id="ac-flow-select" style="flex:1;" ${isSessionActive || isRecording ? 'disabled' : ''}>${flowOptions}</select>
          <button class="ac-icon-btn" id="ac-flow-rename" ${isSessionActive || isRecording ? 'disabled' : ''} title="重命名流程">改名</button>
          <button class="ac-icon-btn" id="ac-flow-del" ${isSessionActive || isRecording || this.state.flows.length <= 1 ? 'disabled' : ''} title="删除流程">删</button>
          <button class="ac-icon-btn" id="ac-flow-export" title="导出 JSON">导出</button>
          <button class="ac-icon-btn" id="ac-flow-import" ${isSessionActive || isRecording ? 'disabled' : ''} title="导入 JSON">导入</button>
        </div>
        <div class="ac-row" style="justify-content:space-between;">
          <div class="ac-row" style="gap:4px;">
            <span style="font-size:10px; color:#94a3b8;">新建:</span>
            <button class="ac-icon-btn" data-preset="single" ${isSessionActive || isRecording ? 'disabled' : ''}>+单点</button>
            <button class="ac-icon-btn" data-preset="scroll" ${isSessionActive || isRecording ? 'disabled' : ''}>+滚动</button>
            <button class="ac-icon-btn" data-preset="empty" ${isSessionActive || isRecording ? 'disabled' : ''}>+空白</button>
          </div>
          <div class="ac-row" style="gap:6px;">
            <label class="ac-check" style="font-size:10px;"><input type="checkbox" id="ac-rec-wheel" ${this.state.settings.recordWheel ? 'checked' : ''} />录滚轮</label>
            <label class="ac-check" style="font-size:10px;"><input type="checkbox" id="ac-rec-key" ${this.state.settings.recordKeyboard ? 'checked' : ''} />录按键</label>
          </div>
        </div>
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>流程倍速</label>
            <select class="ac-select" id="ac-flow-speed" ${isRunning || isRecording ? 'disabled' : ''}>
              <option value="0.5" ${flow.playbackSpeed === 0.5 ? 'selected' : ''}>0.5x</option>
              <option value="1" ${flow.playbackSpeed === 1 ? 'selected' : ''}>1.0x</option>
              <option value="2" ${flow.playbackSpeed === 2 ? 'selected' : ''}>2.0x</option>
              <option value="5" ${flow.playbackSpeed === 5 ? 'selected' : ''}>5.0x</option>
              <option value="10" ${flow.playbackSpeed === 10 ? 'selected' : ''}>10.0x</option>
            </select>
          </div>
          <div class="ac-field">
            <label>循环 (0=无限)</label>
            <input class="ac-input" type="number" min="0" id="ac-flow-loops" value="${flow.loopCount}" ${isRunning || isRecording ? 'disabled' : ''} />
          </div>
          <div class="ac-field">
            <label>轮次CD (ms)</label>
            <input class="ac-input" type="number" min="0" id="ac-flow-loop-delay" value="${flow.loopDelayMs}" ${isRunning || isRecording ? 'disabled' : ''} />
          </div>
        </div>
      </div>

      <div class="ac-palette-bar">
        <span style="font-size:10px; color:#94a3b8; font-weight:700;">添加步骤:</span>
        <button class="ac-btn ac-btn-sm ac-btn-primary" id="ac-add-click" ${structuralLocked ? 'disabled' : ''}>🎯 点击</button>
        <button class="ac-btn ac-btn-sm" id="ac-add-wheel" ${structuralLocked ? 'disabled' : ''}>🎡 滚动</button>
        <button class="ac-btn ac-btn-sm" id="ac-add-drag" ${structuralLocked ? 'disabled' : ''}>✥ 拖拽</button>
        <button class="ac-btn ac-btn-sm" id="ac-add-key" ${structuralLocked ? 'disabled' : ''}>⌨️ 按键</button>
        <button class="ac-btn ac-btn-sm" id="ac-add-wait" ${structuralLocked ? 'disabled' : ''}>⏳ 等待</button>
      </div>

      <div class="ac-body" id="ac-flow-body"></div>

      <div class="ac-footer-hotkeys">
        <span>F8 启停/暂停 · Esc 停止 · F9 录制 · Alt+P 显隐点位</span>
        <span>${displayedEngine === 'cdp' ? '可信输入' : 'DOM 合成'}</span>
      </div>
    `;

    const handle = this.panelEl.querySelector('#ac-drag-handle') as HTMLElement;
    this.attachDragHandler(handle, this.panelEl);

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
        const nextFlow = createPresetFlow(kind);
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
      const nextName = window.prompt('输入流程名称：', flow.name);
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
      a.download = `${flow.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.json`;
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
    this.renderFlowchart(body, flow, structuralLocked);
  }

  private renderFlowchart(body: HTMLElement, flow: FlowRecord, structuralLocked: boolean): void {
    if (flow.steps.length === 0) {
      body.innerHTML = `
        <div class="ac-flowchart">
          <div class="ac-flow-start">● 流程起点</div>
          <div class="ac-flow-arrow">↓</div>
          <div style="text-align:center; color:#64748b; padding:18px 12px; border:1px dashed rgba(148,163,184,0.28); border-radius:10px;">
            暂无步骤节点，点击上方「🎯 点击 / 🎡 滚动 / ✥ 拖拽 / ⌨️ 按键 / ⏳ 等待」或点击「🔴 录制宏转流程」开始编排
          </div>
        </div>
      `;
      return;
    }

    const nodesHtml = flow.steps
      .map((step, idx) => {
        const isCanvas = step.target?.tagName === 'CANVAS';
        const isExpanded = this.expandedStepId === step.id;
        const summary = formatStepSummary(step);
        const beforeChip =
          step.delayBeforeMs > 0
            ? `<span class="ac-phase-chip" data-phase-chip="delayBefore"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">前置 ${step.delayBeforeMs}ms</span></span>`
            : '';
        const mainChip = `<span class="ac-phase-chip" data-phase-chip="main"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">${escapeHtml(resolveMainChipText(step))}</span></span>`;
        const repeatChip =
          step.repeatCount !== 1
            ? `<span class="ac-phase-chip" data-phase-chip="repeatInterval"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">连点间隔 ${step.repeatIntervalMs}ms</span></span>`
            : '';
        const afterChip =
          step.delayAfterMs > 0
            ? `<span class="ac-phase-chip" data-phase-chip="delayAfter"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">后置 ${step.delayAfterMs}ms</span></span>`
            : '';

        const editorHtml = isExpanded ? this.renderStepEditorHtml(step, structuralLocked) : '';

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
                    <span class="ac-badge ${isCanvas ? 'is-canvas' : ''}">${stepTypeLabel(step.type)}${isCanvas ? '·Canvas' : ''}</span>
                    <span class="ac-node-title-text" title="${escapeHtml(summary)}">${escapeHtml(summary)}</span>
                  </div>
                  <div class="ac-row" style="gap:3px;">
                    <button class="ac-icon-btn ${isExpanded ? 'is-on' : ''}" data-act="edit" title="展开/收起节点参数">⚙</button>
                    <button class="ac-icon-btn" data-act="up" ${structuralLocked || idx === 0 ? 'disabled' : ''} title="上移">↑</button>
                    <button class="ac-icon-btn" data-act="down" ${structuralLocked || idx === flow.steps.length - 1 ? 'disabled' : ''} title="下移">↓</button>
                    <button class="ac-icon-btn" data-act="del" ${structuralLocked ? 'disabled' : ''} title="删除节点">✕</button>
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
        ? `无限循环返回起点 · 轮次冷却 ${flow.loopDelayMs}ms`
        : `循环 ${flow.loopCount} 轮返回起点 · 轮次冷却 ${flow.loopDelayMs}ms`;

    body.innerHTML = `
      <div class="ac-flowchart">
        <div class="ac-flow-start">● 流程起点 (${flow.source === 'macro' ? '宏录制转换' : '可视化编排'})</div>
        ${nodesHtml}
        <div class="ac-flow-arrow" data-arrow-for="__loop__">↓</div>
        <div class="ac-flow-loop-node" data-step-id="__loop__">
          <div class="ac-skill-box" style="width:36px; height:36px; flex:0 0 36px;" data-skill-box="__loop__">
            <span class="ac-skill-emoji" style="font-size:14px;">🔄</span>
            <div class="ac-skill-cd-mask"><span class="ac-skill-cd-text"></span></div>
          </div>
          <div style="flex:1;">
            <div style="font-weight:700; color:#cbd5e1;">流程循环控制节点</div>
            <div class="ac-phase-pipeline" style="margin-top:3px;">
              <span class="ac-phase-chip" data-phase-chip="loopCooldown"><span class="ac-phase-cd-fill"></span><span class="ac-phase-label">${loopText}</span></span>
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

  private renderStepEditorHtml(step: FlowStep, locked: boolean): string {
    const dis = locked ? 'disabled' : '';

    let typeSpecific = '';
    if (step.type === 'click') {
      typeSpecific = `
        <div class="ac-row" style="justify-content:space-between;">
          <label class="ac-check"><input type="checkbox" data-ef="followCursor" ${step.followCursor ? 'checked' : ''} ${dis} />跟随鼠标实时位置</label>
          <button class="ac-btn ac-btn-sm ac-btn-primary" data-act="pick-start" ${locked || step.followCursor ? 'disabled' : ''}>🎯 重选坐标</button>
        </div>
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>定位方式</label>
            <select class="ac-select" data-ef="locMode" ${dis || !step.target || step.followCursor ? 'disabled' : ''}>
              <option value="auto" ${step.target?.mode === 'auto' ? 'selected' : ''}>自动识别</option>
              <option value="canvas-relative" ${step.target?.mode === 'canvas-relative' ? 'selected' : ''}>Canvas比例</option>
              <option value="dom" ${step.target?.mode === 'dom' ? 'selected' : ''}>DOM选择器</option>
              <option value="viewport" ${step.target?.mode === 'viewport' ? 'selected' : ''}>固定坐标</option>
            </select>
          </div>
          <div class="ac-field">
            <label>按键</label>
            <select class="ac-select" data-ef="button" ${dis}>
              <option value="left" ${step.button === 'left' ? 'selected' : ''}>左键</option>
              <option value="right" ${step.button === 'right' ? 'selected' : ''}>右键</option>
              <option value="middle" ${step.button === 'middle' ? 'selected' : ''}>中键</option>
            </select>
          </div>
          <div class="ac-field">
            <label>方式</label>
            <select class="ac-select" data-ef="clickKind" ${dis}>
              <option value="single" ${step.clickKind === 'single' ? 'selected' : ''}>单击</option>
              <option value="double" ${step.clickKind === 'double' ? 'selected' : ''}>双击</option>
              <option value="hold" ${step.clickKind === 'hold' ? 'selected' : ''}>长按</option>
            </select>
          </div>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field"><label>按住时长 (ms)</label><input class="ac-input" type="number" min="0" data-ef="holdMs" value="${step.holdMs}" ${dis} /></div>
          <div class="ac-field"><label>坐标偏移 ±px</label><input class="ac-input" type="number" min="0" data-ef="jitterPx" value="${step.jitterPx}" ${dis} /></div>
        </div>
      `;
    } else if (step.type === 'wheel') {
      typeSpecific = `
        <div class="ac-row" style="justify-content:space-between;">
          <label class="ac-check"><input type="checkbox" data-ef="usePageScroll" ${step.usePageScroll ? 'checked' : ''} ${dis} />整页/鼠标位置滚动</label>
          <button class="ac-btn ac-btn-sm ac-btn-primary" data-act="pick-start" ${locked || step.usePageScroll ? 'disabled' : ''}>🎯 拾取容器/画布</button>
        </div>
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>方向</label>
            <select class="ac-select" data-ef="direction" ${dis}>
              <option value="down" ${step.direction === 'down' ? 'selected' : ''}>向下</option>
              <option value="up" ${step.direction === 'up' ? 'selected' : ''}>向上</option>
              <option value="left" ${step.direction === 'left' ? 'selected' : ''}>向左</option>
              <option value="right" ${step.direction === 'right' ? 'selected' : ''}>向右</option>
              <option value="custom" ${step.direction === 'custom' ? 'selected' : ''}>自定义</option>
            </select>
          </div>
          <div class="ac-field"><label>ΔX (px)</label><input class="ac-input" type="number" data-ef="deltaX" value="${step.deltaX}" ${dis} /></div>
          <div class="ac-field"><label>ΔY (px)</label><input class="ac-input" type="number" data-ef="deltaY" value="${step.deltaY}" ${dis} /></div>
        </div>
      `;
    } else if (step.type === 'drag') {
      typeSpecific = `
        <div class="ac-grid-2">
          <button class="ac-btn ac-btn-sm" data-act="pick-start" ${dis}>🎯 重选起点 A</button>
          <button class="ac-btn ac-btn-sm" data-act="pick-end" ${dis}>🎯 重选终点 B</button>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field"><label>拖拽耗时 (ms)</label><input class="ac-input" type="number" min="40" data-ef="dragDurationMs" value="${step.dragDurationMs}" ${dis} /></div>
          <div class="ac-field"><label>坐标偏移 ±px</label><input class="ac-input" type="number" min="0" data-ef="jitterPx" value="${step.jitterPx}" ${dis} /></div>
        </div>
      `;
    } else if (step.type === 'key') {
      typeSpecific = `
        <div class="ac-field">
          <label>按键捕获（点击输入框后直接按下目标按键）</label>
          <input class="ac-input" type="text" data-ef="keyCapture" value="${escapeHtml(step.key ?? 'Space')}" readonly ${dis} />
        </div>
      `;
    } else {
      typeSpecific = `
        <div class="ac-field">
          <label>等待时长 (ms)</label>
          <input class="ac-input" type="number" min="10" data-ef="waitMs" value="${step.waitMs}" ${dis} />
        </div>
      `;
    }

    return `
      <div class="ac-node-editor">
        <div class="ac-field">
          <label>步骤备注名称</label>
          <input class="ac-input" type="text" data-ef="name" placeholder="可选，如：点击攻击按钮" value="${escapeHtml(step.name ?? '')}" ${dis} />
        </div>
        ${typeSpecific}
        <div class="ac-grid-3">
          <div class="ac-field"><label>前置等待 ms</label><input class="ac-input" type="number" min="0" data-ef="delayBeforeMs" value="${step.delayBeforeMs}" ${dis} /></div>
          <div class="ac-field"><label>重复 (0=无限)</label><input class="ac-input" type="number" min="0" data-ef="repeatCount" value="${step.repeatCount}" ${dis} /></div>
          <div class="ac-field"><label>连点间隔 ms</label><input class="ac-input" type="number" min="10" data-ef="repeatIntervalMs" value="${step.repeatIntervalMs}" ${dis} /></div>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field"><label>后置冷却 ms</label><input class="ac-input" type="number" min="0" data-ef="delayAfterMs" value="${step.delayAfterMs}" ${dis} /></div>
          <div class="ac-field"><label>时间随机抖动 ±ms</label><input class="ac-input" type="number" min="0" data-ef="jitterMs" value="${step.jitterMs}" ${dis} /></div>
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
        name: typeof parsed.name === 'string' && parsed.name ? `${parsed.name} (导入)` : '导入流程',
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
