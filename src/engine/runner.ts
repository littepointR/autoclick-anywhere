import { DEFAULT_SETTINGS } from '../shared/constants.ts';
import { resolveTargetLocator } from '../shared/selector.ts';
import { applyPointJitter, applyTimeJitter } from '../shared/timing.ts';
import type {
  BgRequestMessage,
  ClickKind,
  DispatchResult,
  EngineMode,
  ExtensionSettings,
  FlowRecord,
  FlowStep,
  FlowSubPhase,
  MouseButtonType,
  PhaseTimingState,
  RunLifecycleState,
  RuntimeStatus,
  VisualEffect,
} from '../shared/types.ts';
import { DomDispatcher } from './dom-dispatcher.ts';

export type CdpBridgeSender = (message: BgRequestMessage) => Promise<DispatchResult>;

export interface ActionRunnerHooks {
  domDispatcher?: DomDispatcher;
  sendToBackground?: CdpBridgeSender;
  getCursorPosition?: () => { x: number; y: number };
  getViewportSize?: () => { width: number; height: number };
  onBeforeDispatch?: (x: number, y: number) => void;
  onAfterDispatch?: () => void;
  onVisualEffect?: (effect: VisualEffect) => void;
  onStatusChange?: (status: RuntimeStatus) => void;
  doc?: Document;
  now?: () => number;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function resolveWheelDelta(step: FlowStep): { dx: number; dy: number } {
  const magX = Math.abs(step.deltaX) || 240;
  const magY = Math.abs(step.deltaY) || 320;
  switch (step.direction) {
    case 'down':
      return { dx: 0, dy: magY };
    case 'up':
      return { dx: 0, dy: -magY };
    case 'right':
      return { dx: magX, dy: 0 };
    case 'left':
      return { dx: -magX, dy: 0 };
    case 'custom':
    default:
      return { dx: step.deltaX, dy: step.deltaY };
  }
}

export class ActionRunner {
  private readonly dom: DomDispatcher;
  private readonly sendBg: CdpBridgeSender;
  private readonly hooks: ActionRunnerHooks;
  private readonly now: () => number;

  private runToken = 0;
  private abortController: AbortController | null = null;
  private runState: RunLifecycleState = 'idle';
  private activeEngine: EngineMode = 'cdp';
  private fallbackReason: string | undefined;
  private executedCount = 0;
  private currentLoop = 0;
  private totalLoops = 1;
  private currentStepIndex = -1;
  private currentStepId: string | null = null;
  private currentRepeat = 0;
  private totalRepeats = 1;
  private subPhase: FlowSubPhase = 'idle';
  private subPhaseLabel = '空闲';
  private phaseTiming: PhaseTimingState | null = null;
  private autoDetachDebugger = true;
  private liveSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };

  private pauseInterrupt: (() => void) | null = null;
  private resumeWaiters: Array<() => void> = [];

  constructor(hooks: ActionRunnerHooks = {}) {
    this.hooks = hooks;
    this.dom = hooks.domDispatcher ?? new DomDispatcher();
    this.sendBg = hooks.sendToBackground ?? (async () => ({ ok: false, fallbackToDom: true, reason: '无后台桥接' }));
    this.now =
      hooks.now ??
      (() => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()));
  }

  getRunState(): RunLifecycleState {
    return this.runState;
  }

  getIsRunning(): boolean {
    return this.runState === 'running';
  }

  getIsPaused(): boolean {
    return this.runState === 'paused';
  }

  isActiveSession(): boolean {
    return this.runState !== 'idle';
  }

  getStatusSnapshot(extra?: Partial<RuntimeStatus>): RuntimeStatus {
    return {
      hudVisible: true,
      showPins: this.liveSettings.showPins,
      runState: this.runState,
      isRunning: this.runState === 'running',
      isPaused: this.runState === 'paused',
      isRecording: false,
      isPicking: false,
      effectiveEngine: this.activeEngine,
      fallbackReason: this.fallbackReason,
      executedCount: this.executedCount,
      currentLoop: this.currentLoop,
      totalLoops: this.totalLoops,
      currentStepIndex: this.currentStepIndex,
      currentStepId: this.currentStepId,
      currentRepeat: this.currentRepeat,
      totalRepeats: this.totalRepeats,
      subPhase: this.subPhase,
      subPhaseLabel: this.subPhaseLabel,
      phaseTiming: this.phaseTiming ? { ...this.phaseTiming } : null,
      recordedStepsCount: 0,
      ...extra,
    };
  }

  private emitStatus(): void {
    this.hooks.onStatusChange?.(this.getStatusSnapshot());
  }

  private flushResumeWaiters(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const fn of waiters) fn();
  }

  private beginRun(totalLoops: number, settings: ExtensionSettings): { token: number; signal: AbortSignal } {
    this.stop(false);
    this.runToken += 1;
    const token = this.runToken;
    this.abortController = new AbortController();
    this.liveSettings = { ...settings };
    this.activeEngine = settings.engine;
    this.fallbackReason = undefined;
    this.autoDetachDebugger = settings.autoDetachDebugger;
    this.runState = 'running';
    this.executedCount = 0;
    this.currentLoop = 0;
    this.totalLoops = totalLoops;
    this.currentStepIndex = -1;
    this.currentStepId = null;
    this.currentRepeat = 0;
    this.totalRepeats = 1;
    this.subPhase = 'idle';
    this.subPhaseLabel = '准备执行';
    this.phaseTiming = null;
    this.emitStatus();
    return { token, signal: this.abortController.signal };
  }

  private finishRun(token: number): void {
    if (token !== this.runToken) return;
    const wasActive = this.runState !== 'idle';
    this.runState = 'idle';
    this.abortController = null;
    this.pauseInterrupt = null;
    this.currentStepIndex = -1;
    this.currentStepId = null;
    this.currentRepeat = 0;
    this.subPhase = 'idle';
    this.subPhaseLabel = '空闲';
    this.phaseTiming = null;
    this.flushResumeWaiters();
    this.emitStatus();
    if (wasActive && this.autoDetachDebugger) {
      void this.sendBg({ type: 'DETACH_DEBUGGER' }).catch(() => undefined);
    }
  }

  pause(): void {
    if (this.runState !== 'running') return;
    this.runState = 'paused';
    if (this.phaseTiming?.isTimed) {
      const elapsed = Math.max(0, this.now() - this.phaseTiming.startedAtPerf);
      const rem = Math.max(0, Math.round(this.phaseTiming.remainingMs - elapsed));
      this.phaseTiming = {
        ...this.phaseTiming,
        remainingMs: rem,
        startedAtPerf: this.now(),
      };
    }
    this.pauseInterrupt?.();
    this.hooks.onAfterDispatch?.();
    this.emitStatus();
    if (this.activeEngine === 'cdp' && this.autoDetachDebugger) {
      void this.sendBg({ type: 'DETACH_DEBUGGER' }).catch(() => undefined);
    }
  }

  resume(): void {
    if (this.runState !== 'paused') return;
    this.runState = 'running';
    this.flushResumeWaiters();
    this.emitStatus();
  }

  togglePauseResume(): void {
    if (this.runState === 'running') {
      this.pause();
    } else if (this.runState === 'paused') {
      this.resume();
    }
  }

  stop(detachNow = true): void {
    const wasActive = this.runState !== 'idle';
    this.runToken += 1;
    this.runState = 'idle';
    this.currentStepIndex = -1;
    this.currentStepId = null;
    this.currentRepeat = 0;
    this.subPhase = 'idle';
    this.subPhaseLabel = '空闲';
    this.phaseTiming = null;
    this.pauseInterrupt = null;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.flushResumeWaiters();
    this.hooks.onAfterDispatch?.();
    if (wasActive) {
      this.emitStatus();
    }
    if (detachNow && this.autoDetachDebugger) {
      void this.sendBg({ type: 'DETACH_DEBUGGER' }).catch(() => undefined);
    }
  }

  updateSettings(nextSettings: ExtensionSettings, forceRetryCdp = false): void {
    const prevEngine = this.activeEngine;
    this.liveSettings = { ...nextSettings };
    this.autoDetachDebugger = nextSettings.autoDetachDebugger;

    if (this.runState === 'idle') {
      this.activeEngine = nextSettings.engine;
      this.fallbackReason = undefined;
      return;
    }

    if (nextSettings.engine === 'dom') {
      this.activeEngine = 'dom';
      this.fallbackReason = undefined;
      if (prevEngine === 'cdp' && this.autoDetachDebugger) {
        void this.sendBg({ type: 'DETACH_DEBUGGER' }).catch(() => undefined);
      }
      this.emitStatus();
      return;
    }

    if (prevEngine !== 'cdp' || forceRetryCdp) {
      this.activeEngine = 'cdp';
      this.fallbackReason = undefined;
      this.emitStatus();

      const expectedToken = this.runToken;
      void this.sendBg({ type: 'PREFLIGHT_CDP' })
        .then((res) => {
          if (this.runState === 'idle' || this.runToken !== expectedToken || this.liveSettings.engine !== 'cdp') return;
          if (!res.ok && res.fallbackToDom) {
            this.activeEngine = 'dom';
            this.fallbackReason = res.reason ?? 'CDP 不可用，已切换为 DOM 引擎';
            this.emitStatus();
          }
        })
        .catch(() => undefined);
    }
  }

  private ensureAlive(token: number, signal: AbortSignal): void {
    if (this.runState === 'idle' || token !== this.runToken || signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  }

  private async waitIfPaused(token: number, signal: AbortSignal): Promise<void> {
    this.ensureAlive(token, signal);
    while (this.runState === 'paused') {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted || token !== this.runToken || this.runState === 'idle') {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const onAbort = () => {
          signal.removeEventListener('abort', onAbort);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        this.resumeWaiters.push(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        });
      });
      this.ensureAlive(token, signal);
    }
  }

  private async pausableTimedSleep(
    token: number,
    signal: AbortSignal,
    fullDurationMs: number,
    phase: FlowSubPhase,
    label: string,
  ): Promise<void> {
    let remaining = Math.max(0, Math.round(fullDurationMs));
    this.subPhase = phase;
    this.subPhaseLabel = label;

    if (remaining === 0) {
      this.phaseTiming = null;
      return;
    }

    while (remaining > 0) {
      await this.waitIfPaused(token, signal);
      const segStart = this.now();
      this.phaseTiming = {
        isTimed: true,
        totalDurationMs: fullDurationMs,
        remainingMs: remaining,
        startedAtPerf: segStart,
      };
      this.emitStatus();

      const outcome = await new Promise<'done' | 'paused'>((resolve, reject) => {
        if (signal.aborted || token !== this.runToken || this.runState === 'idle') {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const onAbort = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          this.pauseInterrupt = null;
          reject(new DOMException('Aborted', 'AbortError'));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          this.pauseInterrupt = null;
          resolve('done');
        }, remaining);

        this.pauseInterrupt = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          this.pauseInterrupt = null;
          resolve('paused');
        };

        signal.addEventListener('abort', onAbort, { once: true });
      });

      this.ensureAlive(token, signal);
      if (outcome === 'done') {
        remaining = 0;
        break;
      }

      if (this.phaseTiming?.isTimed) {
        remaining = this.phaseTiming.remainingMs;
      } else {
        const elapsed = Math.max(0, this.now() - segStart);
        remaining = Math.max(0, Math.round(remaining - elapsed));
      }
    }

    this.phaseTiming = null;
  }

  private async sleepPreservingPhase(token: number, signal: AbortSignal, ms: number): Promise<void> {
    await this.waitIfPaused(token, signal);
    if (ms <= 0) return;

    await new Promise<void>((resolve, reject) => {
      if (signal.aborted || token !== this.runToken || this.runState === 'idle') {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });

    await this.waitIfPaused(token, signal);
  }

  private getDoc(): Document | undefined {
    return this.hooks.doc ?? (typeof document !== 'undefined' ? document : undefined);
  }

  private getBounds(): { width: number; height: number } {
    if (this.hooks.getViewportSize) return this.hooks.getViewportSize();
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1280, height: 720 };
  }

  private async runClickAction(
    token: number,
    signal: AbortSignal,
    opts: {
      x: number;
      y: number;
      element?: Element | null;
      isCanvas: boolean;
      button: MouseButtonType;
      clickKind: ClickKind;
      holdMs: number;
      showRipples: boolean;
    },
  ): Promise<void> {
    await this.waitIfPaused(token, signal);

    this.hooks.onBeforeDispatch?.(opts.x, opts.y);
    try {
      if (opts.showRipples) {
        this.hooks.onVisualEffect?.({
          kind: 'click',
          x: opts.x,
          y: opts.y,
          button: opts.button,
          isCanvas: opts.isCanvas,
        });
      }

      if (this.activeEngine === 'cdp') {
        const res = await this.sendBg({
          type: 'CDP_CLICK',
          x: opts.x,
          y: opts.y,
          button: opts.button,
          clickKind: opts.clickKind,
          holdMs: opts.holdMs,
        });
        this.ensureAlive(token, signal);
        if (res.ok) return;
        if (res.fallbackToDom) {
          this.activeEngine = 'dom';
          this.fallbackReason = res.reason ?? 'CDP 不可用，已切换为 DOM 引擎';
          this.emitStatus();
        }
      }

      const sleepFn = (ms: number) =>
        opts.clickKind === 'hold' || ms >= 60
          ? this.pausableTimedSleep(token, signal, ms, 'holding', '长按蓄力')
          : this.sleepPreservingPhase(token, signal, ms);

      await this.dom.dispatchClick({
        x: opts.x,
        y: opts.y,
        element: opts.element,
        button: opts.button,
        clickKind: opts.clickKind,
        holdMs: opts.holdMs,
        sleep: sleepFn,
        doc: this.getDoc(),
      });
    } finally {
      this.hooks.onAfterDispatch?.();
    }
  }

  private async runDragAction(
    token: number,
    signal: AbortSignal,
    opts: {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      durationMs: number;
      button: MouseButtonType;
      showRipples: boolean;
    },
  ): Promise<void> {
    await this.waitIfPaused(token, signal);

    this.hooks.onBeforeDispatch?.(opts.startX, opts.startY);
    try {
      if (opts.showRipples) {
        this.hooks.onVisualEffect?.({
          kind: 'drag',
          startX: opts.startX,
          startY: opts.startY,
          endX: opts.endX,
          endY: opts.endY,
        });
      }

      if (this.activeEngine === 'cdp') {
        const res = await this.sendBg({
          type: 'CDP_DRAG',
          startX: opts.startX,
          startY: opts.startY,
          endX: opts.endX,
          endY: opts.endY,
          durationMs: opts.durationMs,
          button: opts.button,
        });
        this.ensureAlive(token, signal);
        if (res.ok) return;
        if (res.fallbackToDom) {
          this.activeEngine = 'dom';
          this.fallbackReason = res.reason ?? 'CDP 不可用，已切换为 DOM 引擎';
          this.emitStatus();
        }
      }

      await this.dom.dispatchDrag({
        startX: opts.startX,
        startY: opts.startY,
        endX: opts.endX,
        endY: opts.endY,
        durationMs: opts.durationMs,
        button: opts.button,
        sleep: (ms) => this.sleepPreservingPhase(token, signal, ms),
        doc: this.getDoc(),
      });
    } finally {
      this.hooks.onAfterDispatch?.();
    }
  }

  private async runWheelAction(
    token: number,
    signal: AbortSignal,
    opts: {
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
      showRipples: boolean;
    },
  ): Promise<void> {
    await this.waitIfPaused(token, signal);

    this.hooks.onBeforeDispatch?.(opts.x, opts.y);
    try {
      if (opts.showRipples) {
        this.hooks.onVisualEffect?.({
          kind: 'wheel',
          x: opts.x,
          y: opts.y,
          deltaX: opts.deltaX,
          deltaY: opts.deltaY,
        });
      }

      if (this.activeEngine === 'cdp') {
        const res = await this.sendBg({
          type: 'CDP_WHEEL',
          x: opts.x,
          y: opts.y,
          deltaX: opts.deltaX,
          deltaY: opts.deltaY,
        });
        this.ensureAlive(token, signal);
        if (res.ok) return;
        if (res.fallbackToDom) {
          this.activeEngine = 'dom';
          this.fallbackReason = res.reason ?? 'CDP 不可用，已切换为 DOM 引擎';
          this.emitStatus();
        }
      }

      await this.dom.dispatchWheel({
        x: opts.x,
        y: opts.y,
        deltaX: opts.deltaX,
        deltaY: opts.deltaY,
        doc: this.getDoc(),
      });
    } finally {
      this.hooks.onAfterDispatch?.();
    }
  }

  private async runKeyAction(
    token: number,
    signal: AbortSignal,
    opts: { key: string; code: string; keyCode: number; modifiers: number },
  ): Promise<void> {
    await this.waitIfPaused(token, signal);

    if (this.activeEngine === 'cdp') {
      const res = await this.sendBg({
        type: 'CDP_KEY',
        key: opts.key,
        code: opts.code,
        keyCode: opts.keyCode,
        modifiers: opts.modifiers,
      });
      this.ensureAlive(token, signal);
      if (res.ok) return;
      if (res.fallbackToDom) {
        this.activeEngine = 'dom';
        this.fallbackReason = res.reason ?? 'CDP 不可用，已切换为 DOM 引擎';
        this.emitStatus();
      }
    }

    await this.dom.dispatchKey({
      key: opts.key,
      code: opts.code,
      keyCode: opts.keyCode,
      modifiers: opts.modifiers,
      doc: this.getDoc(),
    });
  }

  async runFlow(flow: FlowRecord, settings: ExtensionSettings): Promise<void> {
    const enabledSteps = flow.steps.filter((s) => s.enabled);
    if (enabledSteps.length === 0) return;

    const { token, signal } = this.beginRun(flow.loopCount, settings);
    const doc = this.getDoc();
    const bounds = this.getBounds();
    const speed = Math.max(0.1, flow.playbackSpeed || 1);

    try {
      let loop = 0;
      while (flow.loopCount <= 0 || loop < flow.loopCount) {
        loop += 1;
        this.currentLoop = loop;
        this.totalLoops = flow.loopCount;
        let cycleSleptMs = 0;

        for (let idx = 0; idx < enabledSteps.length; idx++) {
          await this.waitIfPaused(token, signal);
          const step = enabledSteps[idx];
          this.currentStepIndex = idx;
          this.currentStepId = step.id;
          this.currentRepeat = 1;
          this.totalRepeats = step.repeatCount;

          if (step.delayBeforeMs > 0) {
            const beforeMs = Math.max(
              0,
              Math.round(applyTimeJitter(step.delayBeforeMs, step.jitterMs) / speed),
            );
            if (beforeMs > 0) {
              cycleSleptMs += beforeMs;
              await this.pausableTimedSleep(token, signal, beforeMs, 'delayBefore', '前置等待');
            }
          }

          let repeatIdx = 1;
          while (step.repeatCount === 0 || repeatIdx <= Math.max(1, step.repeatCount)) {
            await this.waitIfPaused(token, signal);
            this.currentRepeat = repeatIdx;
            this.totalRepeats = step.repeatCount;

            if (step.type === 'wait') {
              const w = Math.max(
                0,
                Math.round(applyTimeJitter(step.waitMs, step.jitterMs) / speed),
              );
              cycleSleptMs += w;
              await this.pausableTimedSleep(token, signal, w, 'waiting', '等待冷却');
            } else if (step.type === 'click') {
              let baseX = Math.round(bounds.width / 2);
              let baseY = Math.round(bounds.height / 2);
              let targetEl: Element | null = null;
              let isCanvas = false;

              if (step.followCursor && this.hooks.getCursorPosition) {
                const pos = this.hooks.getCursorPosition();
                baseX = pos.x;
                baseY = pos.y;
              } else if (step.target && doc) {
                const resolved = resolveTargetLocator(step.target, doc, true);
                baseX = resolved.x;
                baseY = resolved.y;
                targetEl = resolved.element;
                isCanvas = resolved.isCanvas;
              } else if (step.target) {
                baseX = step.target.clientX;
                baseY = step.target.clientY;
              }

              const pt = applyPointJitter(baseX, baseY, step.jitterPx, Math.random, bounds);
              const hold = Math.max(
                0,
                Math.round(
                  (step.clickKind === 'hold' ? Math.max(120, step.holdMs) : step.holdMs) / speed,
                ),
              );

              if (step.clickKind === 'hold' || hold >= 60) {
                this.subPhase = 'holding';
                this.subPhaseLabel = '长按蓄力';
                this.phaseTiming = {
                  isTimed: true,
                  totalDurationMs: hold,
                  remainingMs: hold,
                  startedAtPerf: this.now(),
                };
                cycleSleptMs += hold;
              } else {
                this.subPhase = 'acting';
                this.subPhaseLabel = '触发点击';
                this.phaseTiming = null;
              }
              this.emitStatus();

              await this.runClickAction(token, signal, {
                x: pt.x,
                y: pt.y,
                element: pt.x === baseX && pt.y === baseY ? targetEl : undefined,
                isCanvas,
                button: step.button,
                clickKind: step.clickKind,
                holdMs: hold,
                showRipples: this.liveSettings.showRipples,
              });
            } else if (step.type === 'drag') {
              const startLoc = step.target;
              const endLoc = step.endTarget ?? step.target;
              const resolvedStart =
                startLoc && doc
                  ? resolveTargetLocator(startLoc, doc, true)
                  : {
                      x: startLoc?.clientX ?? Math.round(bounds.width * 0.3),
                      y: startLoc?.clientY ?? Math.round(bounds.height * 0.5),
                      element: null,
                      isCanvas: false,
                    };
              const resolvedEnd =
                endLoc && doc
                  ? resolveTargetLocator(endLoc, doc, true)
                  : {
                      x: endLoc?.clientX ?? Math.round(bounds.width * 0.7),
                      y: endLoc?.clientY ?? Math.round(bounds.height * 0.5),
                      element: null,
                      isCanvas: false,
                    };

              const startPt = applyPointJitter(
                resolvedStart.x,
                resolvedStart.y,
                step.jitterPx,
                Math.random,
                bounds,
              );
              const endPt = applyPointJitter(
                resolvedEnd.x,
                resolvedEnd.y,
                step.jitterPx,
                Math.random,
                bounds,
              );
              const dur = Math.max(40, Math.round(step.dragDurationMs / speed));

              this.subPhase = 'dragging';
              this.subPhaseLabel = '轨迹拖拽';
              this.phaseTiming = {
                isTimed: true,
                totalDurationMs: dur,
                remainingMs: dur,
                startedAtPerf: this.now(),
              };
              cycleSleptMs += dur;
              this.emitStatus();

              await this.runDragAction(token, signal, {
                startX: startPt.x,
                startY: startPt.y,
                endX: endPt.x,
                endY: endPt.y,
                durationMs: dur,
                button: step.button,
                showRipples: this.liveSettings.showRipples,
              });
            } else if (step.type === 'wheel') {
              let wx = Math.round(bounds.width / 2);
              let wy = Math.round(bounds.height / 2);

              if (!step.usePageScroll && step.target && doc) {
                const resolved = resolveTargetLocator(step.target, doc, true);
                wx = resolved.x;
                wy = resolved.y;
              } else if (!step.usePageScroll && step.target) {
                wx = step.target.clientX;
                wy = step.target.clientY;
              } else if (this.hooks.getCursorPosition) {
                const cur = this.hooks.getCursorPosition();
                if (cur.x > 0 || cur.y > 0) {
                  wx = cur.x;
                  wy = cur.y;
                }
              }

              const { dx, dy } = resolveWheelDelta(step);
              this.subPhase = 'acting';
              this.subPhaseLabel = '触发滚动';
              this.phaseTiming = null;
              this.emitStatus();

              await this.runWheelAction(token, signal, {
                x: wx,
                y: wy,
                deltaX: dx,
                deltaY: dy,
                showRipples: this.liveSettings.showRipples,
              });
            } else if (step.type === 'key' && step.key) {
              this.subPhase = 'acting';
              this.subPhaseLabel = '触发按键';
              this.phaseTiming = null;
              this.emitStatus();

              await this.runKeyAction(token, signal, {
                key: step.key,
                code: step.code ?? step.key,
                keyCode: step.keyCode ?? 0,
                modifiers: step.modifiers ?? 0,
              });
            }

            this.executedCount += 1;
            this.phaseTiming = null;
            this.emitStatus();

            if (step.repeatCount === 0 || repeatIdx < Math.max(1, step.repeatCount)) {
              const repDelay = Math.max(
                10,
                Math.round(applyTimeJitter(step.repeatIntervalMs, step.jitterMs) / speed),
              );
              cycleSleptMs += repDelay;
              await this.pausableTimedSleep(token, signal, repDelay, 'repeatInterval', '连点间隔');
            }

            repeatIdx += 1;
          }

          if (step.delayAfterMs > 0) {
            const after = Math.max(
              0,
              Math.round(applyTimeJitter(step.delayAfterMs, step.jitterMs) / speed),
            );
            if (after > 0) {
              cycleSleptMs += after;
              await this.pausableTimedSleep(token, signal, after, 'delayAfter', '后置冷却');
            }
          }
        }

        if (flow.loopCount > 0 && loop >= flow.loopCount) {
          break;
        }

        const loopWait = Math.max(
          cycleSleptMs === 0 ? 16 : 0,
          Math.round(flow.loopDelayMs / speed),
        );
        if (loopWait > 0) {
          this.currentStepId = '__loop__';
          this.currentStepIndex = enabledSteps.length;
          await this.pausableTimedSleep(token, signal, loopWait, 'loopCooldown', '轮次冷却');
        }
      }
    } catch (err) {
      if (!isAbortError(err)) throw err;
    } finally {
      this.finishRun(token);
    }
  }
}
