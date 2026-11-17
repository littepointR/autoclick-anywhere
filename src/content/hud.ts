import { createId } from '../shared/constants.ts';
import type {
  ActiveTabMode,
  ClickKind,
  EngineMode,
  LocatorMode,
  MacroRecord,
  MacroStep,
  MouseButtonType,
  MultiPointItem,
  PersistedState,
  RuntimeStatus,
  ScrollDirection,
} from '../shared/types.ts';

export interface HudActions {
  onStateChange: (next: PersistedState) => void;
  onToggleRun: () => void;
  onToggleRecord: () => void;
  onPickSingleTarget: () => void;
  onPickScrollTarget: () => void;
  onPickMultiClick: () => void;
  onPickMultiScroll: () => void;
  onPickMultiDrag: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStepSummary(step: MacroStep): string {
  if (step.type === 'click') {
    const pos = step.target ? `(${step.target.clientX}, ${step.target.clientY})` : '';
    const kind = step.clickKind === 'double' ? '双击' : step.clickKind === 'hold' ? '长按' : '点击';
    const btn = step.button === 'right' ? '右键' : step.button === 'middle' ? '中键' : '左键';
    return `${btn}${kind} ${pos} ${step.target?.label ?? ''}`.trim();
  }
  if (step.type === 'drag') {
    const a = step.target ? `(${step.target.clientX},${step.target.clientY})` : '';
    const b = step.endTarget ? `(${step.endTarget.clientX},${step.endTarget.clientY})` : '';
    return `拖拽 ${a} → ${b}`;
  }
  if (step.type === 'wheel') {
    return `滚轮 Δ(${step.deltaX ?? 0}, ${step.deltaY ?? 0})`;
  }
  if (step.type === 'key') {
    return `按键 [${step.key ?? ''}]`;
  }
  return '等待';
}

export class HudPanel {
  private readonly root: ShadowRoot;
  private readonly actions: HudActions;
  private readonly container: HTMLDivElement;
  private readonly panelEl: HTMLDivElement;
  private readonly miniEl: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;

  private state: PersistedState;
  private status: RuntimeStatus;
  private passThroughEl: HTMLElement | null = null;

  constructor(shadowRoot: ShadowRoot, initialState: PersistedState, initialStatus: RuntimeStatus, actions: HudActions) {
    this.root = shadowRoot;
    this.state = initialState;
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

    // Block keyboard leakage to host games/Canvas when user types inside HUD inputs
    this.container.addEventListener('keydown', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
        if (ev.key !== 'Escape' && ev.key !== 'F8' && ev.key !== 'F9') {
          ev.stopPropagation();
        }
      }
    });

    this.render();
  }

  update(state: PersistedState, status: RuntimeStatus): void {
    this.state = state;
    this.status = status;
    this.render();
  }

  updateStatus(status: RuntimeStatus): void {
    const modeChanged =
      this.status.isRunning !== status.isRunning ||
      this.status.isRecording !== status.isRecording ||
      this.status.fallbackReason !== status.fallbackReason ||
      this.status.effectiveEngine !== status.effectiveEngine;
    this.status = status;

    if (modeChanged) {
      this.render();
      return;
    }

    const pill = this.panelEl.querySelector('.ac-status-pill');
    if (pill) {
      pill.innerHTML = this.status.isRunning
        ? `运行中 · <strong>${this.status.executedCount}</strong> 次`
        : this.status.isRecording
          ? `录制中 · <strong>${this.status.recordedStepsCount}</strong> 步`
          : '空闲就绪';
    }

    const recBtn = this.panelEl.querySelector('#ac-macro-record-btn');
    if (recBtn && this.status.isRecording) {
      recBtn.textContent = `⏹ 停止录制 (已录 ${this.status.recordedStepsCount} 步)`;
    }

    const stepCards = this.panelEl.querySelectorAll('.ac-list-item');
    stepCards.forEach((el, idx) => {
      el.classList.toggle('is-active-step', this.status.isRunning && this.status.currentStepIndex === idx);
    });
  }

  temporarilyPassThroughAt(x: number, y: number): void {
    this.restorePointerEvents();
    const activeEl = this.state.hudVisible
      ? this.state.hudMinimized
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

  private applyPosition(el: HTMLElement): void {
    if (!this.state.hudPosition) {
      el.style.left = '';
      el.style.top = '18px';
      el.style.right = '18px';
      return;
    }
    const maxX = Math.max(12, window.innerWidth - 120);
    const maxY = Math.max(12, window.innerHeight - 60);
    const x = Math.max(8, Math.min(maxX, this.state.hudPosition.x));
    const y = Math.max(8, Math.min(maxY, this.state.hudPosition.y));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
  }

  private attachDragHandler(handle: HTMLElement, targetBox: HTMLElement): void {
    handle.addEventListener('pointerdown', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest('button, input, select')) return;
      if (ev.button !== 0) return;

      ev.preventDefault();
      const rect = targetBox.getBoundingClientRect();
      const offsetX = ev.clientX - rect.left;
      const offsetY = ev.clientY - rect.top;

      const onMove = (moveEv: PointerEvent) => {
        const nx = Math.max(8, Math.min(window.innerWidth - rect.width - 8, moveEv.clientX - offsetX));
        const ny = Math.max(8, Math.min(window.innerHeight - 48, moveEv.clientY - offsetY));
        targetBox.style.left = `${Math.round(nx)}px`;
        targetBox.style.top = `${Math.round(ny)}px`;
        targetBox.style.right = 'auto';
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        const finalRect = targetBox.getBoundingClientRect();
        this.commitState({
          hudPosition: { x: Math.round(finalRect.left), y: Math.round(finalRect.top) },
        });
      };

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    });
  }

  private commitState(patch: Partial<PersistedState>): void {
    this.state = { ...this.state, ...patch };
    this.actions.onStateChange(this.state);
    this.render();
  }

  private render(): void {
    if (!this.state.hudVisible) {
      this.panelEl.classList.add('ac-hidden');
      this.miniEl.classList.add('ac-hidden');
      return;
    }

    if (this.state.hudMinimized) {
      this.panelEl.classList.add('ac-hidden');
      this.miniEl.classList.remove('ac-hidden');
      this.applyPosition(this.miniEl);
      this.renderMini();
      return;
    }

    this.miniEl.classList.add('ac-hidden');
    this.panelEl.classList.remove('ac-hidden');
    this.applyPosition(this.panelEl);
    this.renderFull();
  }

  private renderMini(): void {
    const dotCls = this.status.isRunning
      ? 'is-running'
      : this.status.isRecording
        ? 'is-recording'
        : '';
    const runLabel = this.status.isRunning ? '⏹ 停止' : '▶ 开始';
    const runCls = this.status.isRunning ? 'ac-btn-danger' : 'ac-btn-primary';

    this.miniEl.innerHTML = `
      <span class="ac-brand-dot ${dotCls}"></span>
      <strong style="font-size:12px;">AutoClick</strong>
      <button class="ac-btn ac-btn-sm ${runCls}" data-act="toggle-run">${runLabel}</button>
      <button class="ac-icon-btn" data-act="expand" title="展开面板">展开</button>
    `;

    this.miniEl.querySelector('[data-act="toggle-run"]')?.addEventListener('click', () => {
      this.actions.onToggleRun();
    });
    this.miniEl.querySelector('[data-act="expand"]')?.addEventListener('click', () => {
      this.commitState({ hudMinimized: false });
    });
  }

  private renderFull(): void {
    const dotCls = this.status.isRunning
      ? 'is-running'
      : this.status.isRecording
        ? 'is-recording'
        : '';
    const statusText = this.status.isRunning
      ? `运行中 · <strong>${this.status.executedCount}</strong> 次`
      : this.status.isRecording
        ? `录制中 · <strong>${this.status.recordedStepsCount}</strong> 步`
        : '空闲就绪';

    const engine = this.state.settings.engine;
    const mode = this.state.activeMode;

    const fallbackBanner = this.status.fallbackReason
      ? `<div class="ac-fallback-note">⚠️ ${escapeHtml(this.status.fallbackReason)}</div>`
      : '';

    this.panelEl.innerHTML = `
      <div class="ac-hud-header" id="ac-drag-handle">
        <div class="ac-brand">
          <span class="ac-brand-dot ${dotCls}"></span>
          <span>AutoClick Anywhere</span>
        </div>
        <div class="ac-header-actions">
          <button class="ac-icon-btn" data-act="minimize" title="最小化">－</button>
          <button class="ac-icon-btn" data-act="hide" title="隐藏面板 (Alt+H)">×</button>
        </div>
      </div>

      <div class="ac-engine-bar">
        <div class="ac-segmented" title="CDP 原生事件可穿透 Canvas/WebGL；DOM 模式无调试横幅">
          <button class="ac-seg-btn ${engine === 'cdp' ? 'is-active' : ''}" data-engine="cdp">⚡ CDP 原生</button>
          <button class="ac-seg-btn ${engine === 'dom' ? 'is-active' : ''}" data-engine="dom">🔇 DOM 静默</button>
        </div>
        <div class="ac-status-pill">${statusText}</div>
      </div>

      ${fallbackBanner}

      <div class="ac-tabs">
        <button class="ac-tab ${mode === 'single' ? 'is-active' : ''}" data-tab="single">单点</button>
        <button class="ac-tab ${mode === 'multi' ? 'is-active' : ''}" data-tab="multi">多点</button>
        <button class="ac-tab ${mode === 'scroll' ? 'is-active' : ''}" data-tab="scroll">滚动</button>
        <button class="ac-tab ${mode === 'macro' ? 'is-active' : ''}" data-tab="macro">宏录制</button>
      </div>

      <div class="ac-body" id="ac-tab-body"></div>

      <div class="ac-footer-hotkeys">
        <span>F8 启停 · F9 录制 · Esc 急停</span>
        <span>${this.status.effectiveEngine === 'cdp' ? '可信输入' : 'DOM 合成'}</span>
      </div>
    `;

    const handle = this.panelEl.querySelector('#ac-drag-handle') as HTMLElement;
    this.attachDragHandler(handle, this.panelEl);

    this.panelEl.querySelector('[data-act="minimize"]')?.addEventListener('click', () => {
      this.commitState({ hudMinimized: true });
    });
    this.panelEl.querySelector('[data-act="hide"]')?.addEventListener('click', () => {
      this.commitState({ hudVisible: false });
    });

    this.panelEl.querySelectorAll('[data-engine]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextEngine = btn.getAttribute('data-engine') as EngineMode;
        this.commitState({
          settings: { ...this.state.settings, engine: nextEngine },
        });
      });
    });

    this.panelEl.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.getAttribute('data-tab') as ActiveTabMode;
        this.commitState({ activeMode: nextMode });
      });
    });

    const body = this.panelEl.querySelector('#ac-tab-body') as HTMLElement;
    if (mode === 'single') this.renderSingleTab(body);
    else if (mode === 'multi') this.renderMultiTab(body);
    else if (mode === 'scroll') this.renderScrollTab(body);
    else this.renderMacroTab(body);
  }

  private renderSingleTab(body: HTMLElement): void {
    const s = this.state.single;
    const t = s.target;
    const isCanvas = t?.tagName === 'CANVAS';
    const targetDesc = s.followCursor
      ? '跟随鼠标当前位置实时点击'
      : t
        ? `${t.label ?? '目标'} (${t.clientX}, ${t.clientY})`
        : '尚未拾取目标（默认点击视口中心）';

    const runBtnCls = this.status.isRunning ? 'ac-btn-danger' : 'ac-btn-primary';
    const runBtnText = this.status.isRunning ? '⏹ 停止执行 (F8 / Esc)' : '▶ 开始单点执行 (F8)';

    body.innerHTML = `
      <div class="ac-card">
        <div class="ac-card-title">
          <span>目标定位</span>
          ${t ? `<span class="ac-badge ${isCanvas ? 'is-canvas' : ''}">${isCanvas ? 'CANVAS/WebGL' : 'DOM'}</span>` : ''}
        </div>
        <div style="font-size:11px; color:#cbd5e1; word-break:break-all;">${escapeHtml(targetDesc)}</div>
        <div class="ac-row">
          <button class="ac-btn ac-btn-sm ac-btn-primary" id="ac-pick-single" ${s.followCursor ? 'disabled' : ''}>🎯 拾取目标</button>
          <select class="ac-select" id="ac-single-loc-mode" ${!t || s.followCursor ? 'disabled' : ''}>
            <option value="auto" ${t?.mode === 'auto' ? 'selected' : ''}>自动识别定位</option>
            <option value="canvas-relative" ${t?.mode === 'canvas-relative' ? 'selected' : ''}>Canvas 相对比例</option>
            <option value="dom" ${t?.mode === 'dom' ? 'selected' : ''}>DOM 选择器</option>
            <option value="viewport" ${t?.mode === 'viewport' ? 'selected' : ''}>固定视口坐标</option>
          </select>
        </div>
        <label class="ac-check">
          <input type="checkbox" id="ac-follow-cursor" ${s.followCursor ? 'checked' : ''} />
          跟随鼠标实时位置
        </label>
      </div>

      <div class="ac-card">
        <div class="ac-card-title">点击参数</div>
        <div class="ac-grid-2">
          <div class="ac-field">
            <label>鼠标按键</label>
            <select class="ac-select" id="ac-single-btn">
              <option value="left" ${s.button === 'left' ? 'selected' : ''}>左键</option>
              <option value="right" ${s.button === 'right' ? 'selected' : ''}>右键</option>
              <option value="middle" ${s.button === 'middle' ? 'selected' : ''}>中键</option>
            </select>
          </div>
          <div class="ac-field">
            <label>触发方式</label>
            <select class="ac-select" id="ac-single-kind">
              <option value="single" ${s.clickKind === 'single' ? 'selected' : ''}>单击</option>
              <option value="double" ${s.clickKind === 'double' ? 'selected' : ''}>双击</option>
              <option value="hold" ${s.clickKind === 'hold' ? 'selected' : ''}>长按</option>
            </select>
          </div>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field">
            <label>间隔 (ms)</label>
            <input class="ac-input" type="number" min="10" step="10" id="ac-single-interval" value="${s.intervalMs}" />
          </div>
          <div class="ac-field">
            <label>按住时长 (ms)</label>
            <input class="ac-input" type="number" min="0" step="10" id="ac-single-hold" value="${s.holdMs}" />
          </div>
        </div>
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>时间抖动 ±ms</label>
            <input class="ac-input" type="number" min="0" id="ac-single-jtime" value="${s.jitterMs}" />
          </div>
          <div class="ac-field">
            <label>坐标偏移 ±px</label>
            <input class="ac-input" type="number" min="0" id="ac-single-jpx" value="${s.jitterPx}" />
          </div>
          <div class="ac-field">
            <label>次数 (0=无限)</label>
            <input class="ac-input" type="number" min="0" id="ac-single-max" value="${s.maxCount}" />
          </div>
        </div>
      </div>

      <button class="ac-btn ${runBtnCls}" id="ac-run-btn">${runBtnText}</button>
    `;

    body.querySelector('#ac-pick-single')?.addEventListener('click', () => this.actions.onPickSingleTarget());
    body.querySelector('#ac-run-btn')?.addEventListener('click', () => this.actions.onToggleRun());

    body.querySelector('#ac-follow-cursor')?.addEventListener('change', (ev) => {
      const checked = (ev.target as HTMLInputElement).checked;
      this.commitState({ single: { ...this.state.single, followCursor: checked } });
    });

    body.querySelector('#ac-single-loc-mode')?.addEventListener('change', (ev) => {
      if (!this.state.single.target) return;
      const mode = (ev.target as HTMLSelectElement).value as LocatorMode;
      this.commitState({
        single: { ...this.state.single, target: { ...this.state.single.target, mode } },
      });
    });

    const bindSingleField = (id: string, fn: (val: string) => void) => {
      body.querySelector(id)?.addEventListener('change', (ev) => {
        fn((ev.target as HTMLInputElement | HTMLSelectElement).value);
      });
    };

    bindSingleField('#ac-single-btn', (v) =>
      this.commitState({ single: { ...this.state.single, button: v as MouseButtonType } }),
    );
    bindSingleField('#ac-single-kind', (v) =>
      this.commitState({ single: { ...this.state.single, clickKind: v as ClickKind } }),
    );
    bindSingleField('#ac-single-interval', (v) =>
      this.commitState({ single: { ...this.state.single, intervalMs: Math.max(10, Number(v) || 250) } }),
    );
    bindSingleField('#ac-single-hold', (v) =>
      this.commitState({ single: { ...this.state.single, holdMs: Math.max(0, Number(v) || 0) } }),
    );
    bindSingleField('#ac-single-jtime', (v) =>
      this.commitState({ single: { ...this.state.single, jitterMs: Math.max(0, Number(v) || 0) } }),
    );
    bindSingleField('#ac-single-jpx', (v) =>
      this.commitState({ single: { ...this.state.single, jitterPx: Math.max(0, Number(v) || 0) } }),
    );
    bindSingleField('#ac-single-max', (v) =>
      this.commitState({ single: { ...this.state.single, maxCount: Math.max(0, Number(v) || 0) } }),
    );
  }

  private renderMultiTab(body: HTMLElement): void {
    const m = this.state.multi;
    const runBtnCls = this.status.isRunning ? 'ac-btn-danger' : 'ac-btn-primary';
    const runBtnText = this.status.isRunning ? '⏹ 停止序列 (F8 / Esc)' : '▶ 开始多点序列 (F8)';

    const listHtml =
      m.items.length === 0
        ? `<div style="text-align:center; color:#64748b; padding:12px 0;">暂无节点，点击上方按钮在页面拾取坐标</div>`
        : m.items
            .map((item, idx) => {
              const typeBadge =
                item.type === 'click'
                  ? '点击'
                  : item.type === 'scroll'
                    ? '滚动'
                    : item.type === 'drag'
                      ? '拖拽'
                      : '等待';
              const isCanvas = item.target.tagName === 'CANVAS';
              const isActive = this.status.isRunning && this.status.currentStepIndex === idx;
              const coordText =
                item.type === 'wait'
                  ? `延迟 ${item.delayAfterMs}ms`
                  : item.type === 'drag' && item.endTarget
                    ? `(${item.target.clientX},${item.target.clientY}) → (${item.endTarget.clientX},${item.endTarget.clientY})`
                    : `(${item.target.clientX}, ${item.target.clientY}) ${item.target.label ?? ''}`;

              return `
                <div class="ac-list-item ${isActive ? 'is-active-step' : ''}" data-item-id="${item.id}">
                  <div class="ac-item-head">
                    <div class="ac-item-title">
                      <input type="checkbox" data-act="toggle-item" ${item.enabled ? 'checked' : ''} />
                      <span class="ac-badge ${isCanvas ? 'is-canvas' : ''}">#${idx + 1} ${typeBadge}</span>
                      <span title="${escapeHtml(coordText)}">${escapeHtml(coordText)}</span>
                    </div>
                    <div class="ac-row" style="gap:3px;">
                      <button class="ac-icon-btn" data-act="up" title="上移">↑</button>
                      <button class="ac-icon-btn" data-act="down" title="下移">↓</button>
                      <button class="ac-icon-btn" data-act="del" title="删除">✕</button>
                    </div>
                  </div>
                  <div class="ac-grid-3">
                    <div class="ac-field">
                      <label>后置延迟 ms</label>
                      <input class="ac-input" type="number" min="0" data-field="delayAfterMs" value="${item.delayAfterMs}" />
                    </div>
                    <div class="ac-field">
                      <label>重复次数</label>
                      <input class="ac-input" type="number" min="1" data-field="repeatCount" value="${item.repeatCount}" />
                    </div>
                    ${
                      item.type === 'scroll'
                        ? `<div class="ac-field"><label>滚动 ΔY</label><input class="ac-input" type="number" data-field="deltaY" value="${item.deltaY}" /></div>`
                        : item.type === 'drag'
                          ? `<div class="ac-field"><label>耗时 ms</label><input class="ac-input" type="number" min="40" data-field="dragDurationMs" value="${item.dragDurationMs}" /></div>`
                          : `<div class="ac-field"><label>按键</label><select class="ac-select" data-field="button"><option value="left" ${item.button === 'left' ? 'selected' : ''}>左键</option><option value="right" ${item.button === 'right' ? 'selected' : ''}>右键</option></select></div>`
                    }
                  </div>
                </div>
              `;
            })
            .join('');

    body.innerHTML = `
      <div class="ac-card">
        <div class="ac-card-title">
          <span>添加动作节点</span>
          <button class="ac-icon-btn" id="ac-multi-clear">清空</button>
        </div>
        <div class="ac-grid-2">
          <button class="ac-btn ac-btn-sm ac-btn-primary" id="ac-add-click">+ 拾取点击</button>
          <button class="ac-btn ac-btn-sm" id="ac-add-scroll">+ 拾取滚动</button>
          <button class="ac-btn ac-btn-sm" id="ac-add-drag">+ 拾取拖拽</button>
          <button class="ac-btn ac-btn-sm" id="ac-add-wait">+ 纯等待步骤</button>
        </div>
      </div>

      <div class="ac-list" id="ac-multi-list">${listHtml}</div>

      <div class="ac-card">
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>循环 (0=无限)</label>
            <input class="ac-input" type="number" min="0" id="ac-multi-loops" value="${m.loopCount}" />
          </div>
          <div class="ac-field">
            <label>轮次间隔 ms</label>
            <input class="ac-input" type="number" min="0" id="ac-multi-loop-delay" value="${m.loopDelayMs}" />
          </div>
          <div class="ac-field">
            <label>偏移 ±px</label>
            <input class="ac-input" type="number" min="0" id="ac-multi-jpx" value="${m.jitterPx}" />
          </div>
        </div>
      </div>

      <button class="ac-btn ${runBtnCls}" id="ac-run-btn" ${m.items.length === 0 ? 'disabled' : ''}>${runBtnText}</button>
    `;

    body.querySelector('#ac-add-click')?.addEventListener('click', () => this.actions.onPickMultiClick());
    body.querySelector('#ac-add-scroll')?.addEventListener('click', () => this.actions.onPickMultiScroll());
    body.querySelector('#ac-add-drag')?.addEventListener('click', () => this.actions.onPickMultiDrag());
    body.querySelector('#ac-add-wait')?.addEventListener('click', () => {
      const waitItem: MultiPointItem = {
        id: createId('mp'),
        enabled: true,
        type: 'wait',
        target: { mode: 'viewport', clientX: 0, clientY: 0, pageX: 0, pageY: 0, label: '等待' },
        button: 'left',
        clickKind: 'single',
        holdMs: 25,
        deltaX: 0,
        deltaY: 0,
        dragDurationMs: 250,
        repeatCount: 1,
        delayAfterMs: 500,
      };
      this.commitState({ multi: { ...this.state.multi, items: [...this.state.multi.items, waitItem] } });
    });

    body.querySelector('#ac-multi-clear')?.addEventListener('click', () => {
      this.commitState({ multi: { ...this.state.multi, items: [] } });
    });

    body.querySelector('#ac-run-btn')?.addEventListener('click', () => this.actions.onToggleRun());

    body.querySelector('#ac-multi-loops')?.addEventListener('change', (ev) => {
      this.commitState({
        multi: { ...this.state.multi, loopCount: Math.max(0, Number((ev.target as HTMLInputElement).value) || 0) },
      });
    });
    body.querySelector('#ac-multi-loop-delay')?.addEventListener('change', (ev) => {
      this.commitState({
        multi: { ...this.state.multi, loopDelayMs: Math.max(0, Number((ev.target as HTMLInputElement).value) || 0) },
      });
    });
    body.querySelector('#ac-multi-jpx')?.addEventListener('change', (ev) => {
      this.commitState({
        multi: { ...this.state.multi, jitterPx: Math.max(0, Number((ev.target as HTMLInputElement).value) || 0) },
      });
    });

    body.querySelectorAll('.ac-list-item').forEach((row) => {
      const id = row.getAttribute('data-item-id');
      if (!id) return;

      row.querySelector('[data-act="toggle-item"]')?.addEventListener('change', (ev) => {
        const enabled = (ev.target as HTMLInputElement).checked;
        const items = this.state.multi.items.map((it) => (it.id === id ? { ...it, enabled } : it));
        this.commitState({ multi: { ...this.state.multi, items } });
      });

      row.querySelector('[data-act="del"]')?.addEventListener('click', () => {
        const items = this.state.multi.items.filter((it) => it.id !== id);
        this.commitState({ multi: { ...this.state.multi, items } });
      });

      row.querySelector('[data-act="up"]')?.addEventListener('click', () => {
        const items = [...this.state.multi.items];
        const i = items.findIndex((it) => it.id === id);
        if (i > 0) {
          [items[i - 1], items[i]] = [items[i], items[i - 1]];
          this.commitState({ multi: { ...this.state.multi, items } });
        }
      });

      row.querySelector('[data-act="down"]')?.addEventListener('click', () => {
        const items = [...this.state.multi.items];
        const i = items.findIndex((it) => it.id === id);
        if (i >= 0 && i < items.length - 1) {
          [items[i], items[i + 1]] = [items[i + 1], items[i]];
          this.commitState({ multi: { ...this.state.multi, items } });
        }
      });

      row.querySelectorAll('[data-field]').forEach((input) => {
        input.addEventListener('change', (ev) => {
          const field = input.getAttribute('data-field');
          const val = (ev.target as HTMLInputElement | HTMLSelectElement).value;
          const items = this.state.multi.items.map((it) => {
            if (it.id !== id) return it;
            if (field === 'delayAfterMs') return { ...it, delayAfterMs: Math.max(0, Number(val) || 0) };
            if (field === 'repeatCount') return { ...it, repeatCount: Math.max(1, Number(val) || 1) };
            if (field === 'deltaY') return { ...it, deltaY: Number(val) || 0 };
            if (field === 'dragDurationMs') return { ...it, dragDurationMs: Math.max(40, Number(val) || 200) };
            if (field === 'button') return { ...it, button: val as MouseButtonType };
            return it;
          });
          this.commitState({ multi: { ...this.state.multi, items } });
        });
      });
    });
  }

  private renderScrollTab(body: HTMLElement): void {
    const sc = this.state.scroll;
    const t = sc.target;
    const isCanvas = t?.tagName === 'CANVAS';
    const runBtnCls = this.status.isRunning ? 'ac-btn-danger' : 'ac-btn-primary';
    const runBtnText = this.status.isRunning ? '⏹ 停止滚动 (F8 / Esc)' : '▶ 开始自动滚动 (F8)';

    body.innerHTML = `
      <div class="ac-card">
        <div class="ac-card-title">
          <span>滚动作用位置</span>
          ${sc.useTarget && t ? `<span class="ac-badge ${isCanvas ? 'is-canvas' : ''}">${isCanvas ? 'CANVAS' : 'DOM'}</span>` : ''}
        </div>
        <label class="ac-check">
          <input type="checkbox" id="ac-scroll-use-target" ${sc.useTarget ? 'checked' : ''} />
          指定局部容器 / Canvas 坐标（不勾选则作用于当前页面）
        </label>
        <div class="ac-row">
          <button class="ac-btn ac-btn-sm ac-btn-primary" id="ac-pick-scroll" ${!sc.useTarget ? 'disabled' : ''}>🎯 拾取滚动目标</button>
          <span style="font-size:11px; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${sc.useTarget ? (t ? `${escapeHtml(t.label ?? '')} (${t.clientX},${t.clientY})` : '未拾取') : '视口中心 / 鼠标位置'}
          </span>
        </div>
      </div>

      <div class="ac-card">
        <div class="ac-card-title">滚动方向与步长</div>
        <div class="ac-field">
          <label>方向预设</label>
          <select class="ac-select" id="ac-scroll-dir">
            <option value="down" ${sc.direction === 'down' ? 'selected' : ''}>向下滚动 (阅读/列表)</option>
            <option value="up" ${sc.direction === 'up' ? 'selected' : ''}>向上滚动 / Canvas 放大</option>
            <option value="right" ${sc.direction === 'right' ? 'selected' : ''}>向右滚动</option>
            <option value="left" ${sc.direction === 'left' ? 'selected' : ''}>向左滚动</option>
            <option value="custom" ${sc.direction === 'custom' ? 'selected' : ''}>自定义 ΔX / ΔY</option>
          </select>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field">
            <label>水平步长 ΔX (px)</label>
            <input class="ac-input" type="number" id="ac-scroll-dx" value="${sc.deltaX}" />
          </div>
          <div class="ac-field">
            <label>垂直步长 ΔY (px)</label>
            <input class="ac-input" type="number" id="ac-scroll-dy" value="${sc.deltaY}" />
          </div>
        </div>
        <div class="ac-grid-2">
          <div class="ac-field">
            <label>间隔 (ms)</label>
            <input class="ac-input" type="number" min="16" id="ac-scroll-interval" value="${sc.intervalMs}" />
          </div>
          <div class="ac-field">
            <label>次数 (0=无限)</label>
            <input class="ac-input" type="number" min="0" id="ac-scroll-max" value="${sc.maxCount}" />
          </div>
        </div>
      </div>

      <button class="ac-btn ${runBtnCls}" id="ac-run-btn">${runBtnText}</button>
    `;

    body.querySelector('#ac-pick-scroll')?.addEventListener('click', () => this.actions.onPickScrollTarget());
    body.querySelector('#ac-run-btn')?.addEventListener('click', () => this.actions.onToggleRun());

    body.querySelector('#ac-scroll-use-target')?.addEventListener('change', (ev) => {
      const useTarget = (ev.target as HTMLInputElement).checked;
      this.commitState({ scroll: { ...this.state.scroll, useTarget } });
    });

    body.querySelector('#ac-scroll-dir')?.addEventListener('change', (ev) => {
      const direction = (ev.target as HTMLSelectElement).value as ScrollDirection;
      this.commitState({ scroll: { ...this.state.scroll, direction } });
    });

    body.querySelector('#ac-scroll-dx')?.addEventListener('change', (ev) => {
      this.commitState({ scroll: { ...this.state.scroll, deltaX: Number((ev.target as HTMLInputElement).value) || 0 } });
    });
    body.querySelector('#ac-scroll-dy')?.addEventListener('change', (ev) => {
      this.commitState({ scroll: { ...this.state.scroll, deltaY: Number((ev.target as HTMLInputElement).value) || 0 } });
    });
    body.querySelector('#ac-scroll-interval')?.addEventListener('change', (ev) => {
      this.commitState({
        scroll: { ...this.state.scroll, intervalMs: Math.max(16, Number((ev.target as HTMLInputElement).value) || 400) },
      });
    });
    body.querySelector('#ac-scroll-max')?.addEventListener('change', (ev) => {
      this.commitState({
        scroll: { ...this.state.scroll, maxCount: Math.max(0, Number((ev.target as HTMLInputElement).value) || 0) },
      });
    });
  }

  private renderMacroTab(body: HTMLElement): void {
    const mc = this.state.macro;
    const activeMacro = mc.macros.find((m) => m.id === mc.activeMacroId) ?? mc.macros[0] ?? null;

    const recBtnCls = this.status.isRecording ? 'ac-btn-danger' : 'ac-btn-record';
    const recBtnText = this.status.isRecording
      ? `⏹ 停止录制 (已录 ${this.status.recordedStepsCount} 步)`
      : '🔴 开始录制新宏 (F9)';

    const runBtnCls = this.status.isRunning ? 'ac-btn-danger' : 'ac-btn-primary';
    const runBtnText = this.status.isRunning ? '⏹ 停止回放 (F8 / Esc)' : '▶ 回放当前宏 (F8)';

    const macroOptions = mc.macros.length
      ? mc.macros
          .map(
            (m) =>
              `<option value="${m.id}" ${activeMacro?.id === m.id ? 'selected' : ''}>${escapeHtml(m.name)} (${m.steps.length}步)</option>`,
          )
          .join('')
      : '<option value="">暂无已录制宏</option>';

    const stepsHtml = !activeMacro || activeMacro.steps.length === 0
      ? `<div style="text-align:center; color:#64748b; padding:10px 0;">点击「开始录制」并在页面上点击、拖拽、滚动或按键</div>`
      : activeMacro.steps
          .map((step, idx) => {
            const isActive = this.status.isRunning && this.status.currentStepIndex === idx;
            return `
              <div class="ac-list-item ${isActive ? 'is-active-step' : ''}" data-step-id="${step.id}">
                <div class="ac-item-head">
                  <div class="ac-item-title">
                    <span class="ac-badge">#${idx + 1}</span>
                    <span title="${escapeHtml(formatStepSummary(step))}">${escapeHtml(formatStepSummary(step))}</span>
                  </div>
                  <button class="ac-icon-btn" data-act="del-step" title="删除步骤">✕</button>
                </div>
                <div class="ac-row">
                  <span style="font-size:11px; color:#94a3b8;">前置延迟 (ms)</span>
                  <input class="ac-input" style="width:90px;" type="number" min="0" data-field="delayBeforeMs" value="${step.delayBeforeMs}" />
                </div>
              </div>
            `;
          })
          .join('');

    body.innerHTML = `
      <div class="ac-card">
        <button class="ac-btn ${recBtnCls}" id="ac-macro-record-btn">${recBtnText}</button>
        <div class="ac-row" style="justify-content:space-between;">
          <label class="ac-check">
            <input type="checkbox" id="ac-rec-wheel" ${mc.recordWheel ? 'checked' : ''} />
            录制滚轮
          </label>
          <label class="ac-check">
            <input type="checkbox" id="ac-rec-key" ${mc.recordKeyboard ? 'checked' : ''} />
            录制键盘
          </label>
        </div>
      </div>

      <div class="ac-card">
        <div class="ac-card-title">
          <span>宏脚本管理</span>
          <div class="ac-row" style="gap:4px;">
            <button class="ac-icon-btn" id="ac-macro-rename" ${!activeMacro ? 'disabled' : ''}>重命名</button>
            <button class="ac-icon-btn" id="ac-macro-del" ${!activeMacro ? 'disabled' : ''}>删除</button>
            <button class="ac-icon-btn" id="ac-macro-export" ${!activeMacro ? 'disabled' : ''}>导出</button>
            <button class="ac-icon-btn" id="ac-macro-import">导入</button>
          </div>
        </div>
        <select class="ac-select" id="ac-macro-select">${macroOptions}</select>
        <div class="ac-grid-3">
          <div class="ac-field">
            <label>回放倍速</label>
            <select class="ac-select" id="ac-macro-speed">
              <option value="0.5" ${mc.playbackSpeed === 0.5 ? 'selected' : ''}>0.5x</option>
              <option value="1" ${mc.playbackSpeed === 1 ? 'selected' : ''}>1.0x</option>
              <option value="2" ${mc.playbackSpeed === 2 ? 'selected' : ''}>2.0x</option>
              <option value="5" ${mc.playbackSpeed === 5 ? 'selected' : ''}>5.0x</option>
              <option value="10" ${mc.playbackSpeed === 10 ? 'selected' : ''}>10.0x</option>
            </select>
          </div>
          <div class="ac-field">
            <label>循环 (0=无限)</label>
            <input class="ac-input" type="number" min="0" id="ac-macro-loops" value="${mc.loopCount}" />
          </div>
          <div class="ac-field">
            <label>轮次间隔 ms</label>
            <input class="ac-input" type="number" min="0" id="ac-macro-loop-delay" value="${mc.loopDelayMs}" />
          </div>
        </div>
      </div>

      <div class="ac-list" id="ac-macro-steps">${stepsHtml}</div>

      <button class="ac-btn ${runBtnCls}" id="ac-run-btn" ${!activeMacro || activeMacro.steps.length === 0 ? 'disabled' : ''}>${runBtnText}</button>
    `;

    body.querySelector('#ac-macro-record-btn')?.addEventListener('click', () => this.actions.onToggleRecord());
    body.querySelector('#ac-run-btn')?.addEventListener('click', () => this.actions.onToggleRun());

    body.querySelector('#ac-rec-wheel')?.addEventListener('change', (ev) => {
      this.commitState({
        macro: { ...this.state.macro, recordWheel: (ev.target as HTMLInputElement).checked },
      });
    });
    body.querySelector('#ac-rec-key')?.addEventListener('change', (ev) => {
      this.commitState({
        macro: { ...this.state.macro, recordKeyboard: (ev.target as HTMLInputElement).checked },
      });
    });

    body.querySelector('#ac-macro-select')?.addEventListener('change', (ev) => {
      const id = (ev.target as HTMLSelectElement).value || null;
      this.commitState({ macro: { ...this.state.macro, activeMacroId: id } });
    });

    body.querySelector('#ac-macro-speed')?.addEventListener('change', (ev) => {
      this.commitState({
        macro: { ...this.state.macro, playbackSpeed: Number((ev.target as HTMLSelectElement).value) || 1 },
      });
    });
    body.querySelector('#ac-macro-loops')?.addEventListener('change', (ev) => {
      this.commitState({
        macro: { ...this.state.macro, loopCount: Math.max(0, Number((ev.target as HTMLInputElement).value) || 0) },
      });
    });
    body.querySelector('#ac-macro-loop-delay')?.addEventListener('change', (ev) => {
      this.commitState({
        macro: { ...this.state.macro, loopDelayMs: Math.max(0, Number((ev.target as HTMLInputElement).value) || 0) },
      });
    });

    body.querySelector('#ac-macro-rename')?.addEventListener('click', () => {
      if (!activeMacro) return;
      const nextName = window.prompt('输入新的宏名称：', activeMacro.name);
      if (!nextName || !nextName.trim()) return;
      const macros = this.state.macro.macros.map((m) =>
        m.id === activeMacro.id ? { ...m, name: nextName.trim() } : m,
      );
      this.commitState({ macro: { ...this.state.macro, macros } });
    });

    body.querySelector('#ac-macro-del')?.addEventListener('click', () => {
      if (!activeMacro) return;
      const macros = this.state.macro.macros.filter((m) => m.id !== activeMacro.id);
      this.commitState({
        macro: { ...this.state.macro, macros, activeMacroId: macros[0]?.id ?? null },
      });
    });

    body.querySelector('#ac-macro-export')?.addEventListener('click', () => {
      if (!activeMacro) return;
      const blob = new Blob([JSON.stringify(activeMacro, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeMacro.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    body.querySelector('#ac-macro-import')?.addEventListener('click', () => {
      this.fileInput.value = '';
      this.fileInput.click();
    });

    if (activeMacro) {
      body.querySelectorAll('[data-step-id]').forEach((row) => {
        const stepId = row.getAttribute('data-step-id');
        if (!stepId) return;

        row.querySelector('[data-act="del-step"]')?.addEventListener('click', () => {
          const steps = activeMacro.steps.filter((s) => s.id !== stepId);
          const macros = this.state.macro.macros.map((m) =>
            m.id === activeMacro.id ? { ...m, steps } : m,
          );
          this.commitState({ macro: { ...this.state.macro, macros } });
        });

        row.querySelector('[data-field="delayBeforeMs"]')?.addEventListener('change', (ev) => {
          const val = Math.max(0, Number((ev.target as HTMLInputElement).value) || 0);
          const steps = activeMacro.steps.map((s) =>
            s.id === stepId ? { ...s, delayBeforeMs: val } : s,
          );
          const macros = this.state.macro.macros.map((m) =>
            m.id === activeMacro.id ? { ...m, steps } : m,
          );
          this.commitState({ macro: { ...this.state.macro, macros } });
        });
      });
    }
  }

  private handleImportFile = async (): Promise<void> => {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<MacroRecord>;
      if (!Array.isArray(parsed.steps)) return;
      const imported: MacroRecord = {
        id: createId('macro'),
        name: typeof parsed.name === 'string' && parsed.name ? `${parsed.name} (导入)` : '导入宏脚本',
        createdAt: Date.now(),
        originHost: parsed.originHost,
        steps: parsed.steps,
      };
      const macros = [imported, ...this.state.macro.macros];
      this.commitState({
        macro: { ...this.state.macro, macros, activeMacroId: imported.id },
      });
    } catch {
      // Ignore malformed JSON
    }
  };
}
