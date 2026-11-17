import { DEFAULT_SETTINGS } from '../shared/constants.ts';
import { resolveTargetLocator } from '../shared/selector.ts';
import { abortableSleep, applyPointJitter, applyTimeJitter } from '../shared/timing.ts';
import type {
  ActiveTabMode,
  BgRequestMessage,
  ClickKind,
  DispatchResult,
  EngineMode,
  ExtensionSettings,
  MacroConfig,
  MacroRecord,
  MouseButtonType,
  MultiPointConfig,
  RuntimeStatus,
  ScrollModeConfig,
  SingleClickConfig,
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
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export class ActionRunner {
  private readonly dom: DomDispatcher;
  private readonly sendBg: CdpBridgeSender;
  private readonly hooks: ActionRunnerHooks;

  private runToken = 0;
  private abortController: AbortController | null = null;
  private activeEngine: EngineMode = 'cdp';
  private fallbackReason: string | undefined;
  private activeMode: ActiveTabMode = 'single';
  private isRunning = false;
  private executedCount = 0;
  private currentLoop = 0;
  private currentStepIndex = -1;
  private autoDetachDebugger = true;
  private liveSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };

  constructor(hooks: ActionRunnerHooks = {}) {
    this.hooks = hooks;
    this.dom = hooks.domDispatcher ?? new DomDispatcher();
    this.sendBg = hooks.sendToBackground ?? (async () => ({ ok: false, fallbackToDom: true, reason: '无后台桥接' }));
  }

  getStatusSnapshot(extra?: Partial<RuntimeStatus>): RuntimeStatus {
    return {
      isRunning: this.isRunning,
      isRecording: false,
      isPicking: false,
      activeMode: this.activeMode,
      effectiveEngine: this.activeEngine,
      fallbackReason: this.fallbackReason,
      executedCount: this.executedCount,
      currentLoop: this.currentLoop,
      currentStepIndex: this.currentStepIndex,
      recordedStepsCount: 0,
      ...extra,
    };
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  private emitStatus(): void {
    this.hooks.onStatusChange?.(this.getStatusSnapshot());
  }

  private beginRun(mode: ActiveTabMode, settings: ExtensionSettings): { token: number; signal: AbortSignal } {
    this.stop(false);
    this.runToken += 1;
    const token = this.runToken;
    this.abortController = new AbortController();
    this.activeMode = mode;
    this.liveSettings = { ...settings };
    this.activeEngine = settings.engine;
    this.fallbackReason = undefined;
    this.autoDetachDebugger = settings.autoDetachDebugger;
    this.isRunning = true;
    this.executedCount = 0;
    this.currentLoop = 0;
    this.currentStepIndex = -1;
    this.emitStatus();
    return { token, signal: this.abortController.signal };
  }

  updateSettings(nextSettings: ExtensionSettings, forceRetryCdp = false): void {
    const prevEngine = this.activeEngine;
    this.liveSettings = { ...nextSettings };
    this.autoDetachDebugger = nextSettings.autoDetachDebugger;

    if (!this.isRunning) {
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
          if (!this.isRunning || this.runToken !== expectedToken || this.liveSettings.engine !== 'cdp') return;
          if (!res.ok && res.fallbackToDom) {
            this.activeEngine = 'dom';
            this.fallbackReason = res.reason ?? 'CDP 不可用，已切换为 DOM 引擎';
            this.emitStatus();
          }
        })
        .catch(() => undefined);
    }
  }

  private finishRun(token: number): void {
    if (token !== this.runToken) return;
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.abortController = null;
    this.currentStepIndex = -1;
    this.emitStatus();
    if (wasRunning && this.autoDetachDebugger) {
      void this.sendBg({ type: 'DETACH_DEBUGGER' }).catch(() => undefined);
    }
  }

  stop(detachNow = true): void {
    const wasRunning = this.isRunning;
    this.runToken += 1;
    this.isRunning = false;
    this.currentStepIndex = -1;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.hooks.onAfterDispatch?.();
    if (wasRunning) {
      this.emitStatus();
    }
    if (detachNow && this.autoDetachDebugger) {
      void this.sendBg({ type: 'DETACH_DEBUGGER' }).catch(() => undefined);
    }
  }

  private ensureActive(token: number, signal: AbortSignal): void {
    if (!this.isRunning || token !== this.runToken || signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  }

  private async sleep(token: number, signal: AbortSignal, ms: number): Promise<void> {
    this.ensureActive(token, signal);
    if (ms <= 0) return;
    await abortableSleep(ms, signal);
    this.ensureActive(token, signal);
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
    this.ensureActive(token, signal);
    const sleepFn = (ms: number) => this.sleep(token, signal, ms);

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
        this.ensureActive(token, signal);
        if (res.ok) return;
        if (res.fallbackToDom) {
          this.activeEngine = 'dom';
          this.fallbackReason = res.reason ?? 'CDP 不可用，已切换为 DOM 引擎';
          this.emitStatus();
        }
      }

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
    this.ensureActive(token, signal);
    const sleepFn = (ms: number) => this.sleep(token, signal, ms);

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
        this.ensureActive(token, signal);
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
        sleep: sleepFn,
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
    this.ensureActive(token, signal);

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
        this.ensureActive(token, signal);
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
    this.ensureActive(token, signal);

    if (this.activeEngine === 'cdp') {
      const res = await this.sendBg({
        type: 'CDP_KEY',
        key: opts.key,
        code: opts.code,
        keyCode: opts.keyCode,
        modifiers: opts.modifiers,
      });
      this.ensureActive(token, signal);
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

  async runSingle(config: SingleClickConfig, settings: ExtensionSettings): Promise<void> {
    const { token, signal } = this.beginRun('single', settings);
    const doc = this.getDoc();
    const bounds = this.getBounds();

    try {
      while (config.maxCount <= 0 || this.executedCount < config.maxCount) {
        this.ensureActive(token, signal);

        let baseX = Math.round(bounds.width / 2);
        let baseY = Math.round(bounds.height / 2);
        let targetEl: Element | null = null;
        let isCanvas = false;

        if (config.followCursor && this.hooks.getCursorPosition) {
          const pos = this.hooks.getCursorPosition();
          baseX = pos.x;
          baseY = pos.y;
        } else if (config.target && doc) {
          const resolved = resolveTargetLocator(config.target, doc, true);
          baseX = resolved.x;
          baseY = resolved.y;
          targetEl = resolved.element;
          isCanvas = resolved.isCanvas;
        }

        const jittered = applyPointJitter(baseX, baseY, config.jitterPx, Math.random, bounds);
        const sameSpot = jittered.x === baseX && jittered.y === baseY;

        await this.runClickAction(token, signal, {
          x: jittered.x,
          y: jittered.y,
          element: sameSpot ? targetEl : undefined,
          isCanvas,
          button: config.button,
          clickKind: config.clickKind,
          holdMs: config.holdMs,
          showRipples: this.liveSettings.showRipples,
        });

        this.executedCount += 1;
        this.currentLoop = this.executedCount;
        this.emitStatus();

        if (config.maxCount > 0 && this.executedCount >= config.maxCount) {
          break;
        }

        const waitMs = applyTimeJitter(config.intervalMs, config.jitterMs);
        await this.sleep(token, signal, Math.max(10, waitMs));
      }
    } catch (err) {
      if (!isAbortError(err)) throw err;
    } finally {
      this.finishRun(token);
    }
  }

  async runMulti(config: MultiPointConfig, settings: ExtensionSettings): Promise<void> {
    const enabledItems = config.items.filter((it) => it.enabled);
    if (enabledItems.length === 0) return;

    const { token, signal } = this.beginRun('multi', settings);
    const doc = this.getDoc();
    const bounds = this.getBounds();

    try {
      let loop = 0;
      while (config.loopCount <= 0 || loop < config.loopCount) {
        loop += 1;
        this.currentLoop = loop;
        this.emitStatus();

        for (let idx = 0; idx < enabledItems.length; idx++) {
          this.ensureActive(token, signal);
          const item = enabledItems[idx];
          this.currentStepIndex = idx;
          this.emitStatus();

          const repeats = Math.max(1, item.repeatCount || 1);
          for (let r = 0; r < repeats; r++) {
            this.ensureActive(token, signal);

            if (item.type === 'wait') {
              await this.sleep(token, signal, applyTimeJitter(item.delayAfterMs, config.jitterMs));
              this.executedCount += 1;
              this.emitStatus();
              continue;
            }

            const resolvedStart = doc
              ? resolveTargetLocator(item.target, doc, true)
              : { x: item.target.clientX, y: item.target.clientY, element: null, isCanvas: false };
            const pt = applyPointJitter(
              resolvedStart.x,
              resolvedStart.y,
              config.jitterPx,
              Math.random,
              bounds,
            );

            if (item.type === 'click') {
              await this.runClickAction(token, signal, {
                x: pt.x,
                y: pt.y,
                element: pt.x === resolvedStart.x && pt.y === resolvedStart.y ? resolvedStart.element : undefined,
                isCanvas: resolvedStart.isCanvas,
                button: item.button,
                clickKind: item.clickKind,
                holdMs: item.holdMs,
                showRipples: this.liveSettings.showRipples,
              });
            } else if (item.type === 'scroll') {
              await this.runWheelAction(token, signal, {
                x: pt.x,
                y: pt.y,
                deltaX: item.deltaX,
                deltaY: item.deltaY,
                showRipples: this.liveSettings.showRipples,
              });
            } else if (item.type === 'drag') {
              const endLocator = item.endTarget ?? item.target;
              const resolvedEnd = doc
                ? resolveTargetLocator(endLocator, doc, true)
                : { x: endLocator.clientX, y: endLocator.clientY, element: null, isCanvas: false };
              const endPt = applyPointJitter(
                resolvedEnd.x,
                resolvedEnd.y,
                config.jitterPx,
                Math.random,
                bounds,
              );

              await this.runDragAction(token, signal, {
                startX: pt.x,
                startY: pt.y,
                endX: endPt.x,
                endY: endPt.y,
                durationMs: item.dragDurationMs,
                button: item.button,
                showRipples: this.liveSettings.showRipples,
              });
            }

            this.executedCount += 1;
            this.emitStatus();

            if (item.delayAfterMs > 0) {
              await this.sleep(token, signal, applyTimeJitter(item.delayAfterMs, config.jitterMs));
            }
          }
        }

        if (config.loopCount > 0 && loop >= config.loopCount) {
          break;
        }
        if (config.loopDelayMs > 0) {
          await this.sleep(token, signal, applyTimeJitter(config.loopDelayMs, config.jitterMs));
        }
      }
    } catch (err) {
      if (!isAbortError(err)) throw err;
    } finally {
      this.finishRun(token);
    }
  }

  async runScroll(config: ScrollModeConfig, settings: ExtensionSettings): Promise<void> {
    const { token, signal } = this.beginRun('scroll', settings);
    const doc = this.getDoc();
    const bounds = this.getBounds();

    const resolveDelta = () => {
      const magX = Math.abs(config.deltaX) || 240;
      const magY = Math.abs(config.deltaY) || 320;
      switch (config.direction) {
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
          return { dx: config.deltaX, dy: config.deltaY };
      }
    };

    try {
      while (config.maxCount <= 0 || this.executedCount < config.maxCount) {
        this.ensureActive(token, signal);

        let x = Math.round(bounds.width / 2);
        let y = Math.round(bounds.height / 2);

        if (config.useTarget && config.target && doc) {
          const resolved = resolveTargetLocator(config.target, doc, true);
          x = resolved.x;
          y = resolved.y;
        } else if (this.hooks.getCursorPosition) {
          const cur = this.hooks.getCursorPosition();
          if (cur.x > 0 || cur.y > 0) {
            x = cur.x;
            y = cur.y;
          }
        }

        const { dx, dy } = resolveDelta();
        await this.runWheelAction(token, signal, {
          x,
          y,
          deltaX: dx,
          deltaY: dy,
          showRipples: this.liveSettings.showRipples,
        });

        this.executedCount += 1;
        this.currentLoop = this.executedCount;
        this.emitStatus();

        if (config.maxCount > 0 && this.executedCount >= config.maxCount) {
          break;
        }

        await this.sleep(token, signal, Math.max(16, config.intervalMs));
      }
    } catch (err) {
      if (!isAbortError(err)) throw err;
    } finally {
      this.finishRun(token);
    }
  }

  async runMacro(
    macro: MacroRecord,
    macroConfig: MacroConfig,
    settings: ExtensionSettings,
  ): Promise<void> {
    if (macro.steps.length === 0) return;

    const { token, signal } = this.beginRun('macro', settings);
    const doc = this.getDoc();
    const speed = Math.max(0.1, macroConfig.playbackSpeed || 1);

    try {
      let loop = 0;
      while (macroConfig.loopCount <= 0 || loop < macroConfig.loopCount) {
        loop += 1;
        this.currentLoop = loop;
        this.emitStatus();

        for (let idx = 0; idx < macro.steps.length; idx++) {
          this.ensureActive(token, signal);
          const step = macro.steps[idx];
          this.currentStepIndex = idx;
          this.emitStatus();

          const scaledDelay = Math.max(0, Math.round((step.delayBeforeMs || 0) / speed));
          if (scaledDelay > 0) {
            await this.sleep(token, signal, scaledDelay);
          }

          if (step.type === 'wait') {
            this.executedCount += 1;
            this.emitStatus();
            continue;
          }

          if (step.type === 'click' && step.target) {
            const resolved = doc
              ? resolveTargetLocator(step.target, doc, true)
              : { x: step.target.clientX, y: step.target.clientY, element: null, isCanvas: false };
            await this.runClickAction(token, signal, {
              x: resolved.x,
              y: resolved.y,
              element: resolved.element,
              isCanvas: resolved.isCanvas,
              button: step.button ?? 'left',
              clickKind: step.clickKind ?? 'single',
              holdMs: Math.round((step.holdMs ?? 20) / speed),
              showRipples: this.liveSettings.showRipples,
            });
          } else if (step.type === 'drag' && step.target && step.endTarget) {
            const start = doc
              ? resolveTargetLocator(step.target, doc, true)
              : { x: step.target.clientX, y: step.target.clientY, element: null, isCanvas: false };
            const end = doc
              ? resolveTargetLocator(step.endTarget, doc, true)
              : { x: step.endTarget.clientX, y: step.endTarget.clientY, element: null, isCanvas: false };
            await this.runDragAction(token, signal, {
              startX: start.x,
              startY: start.y,
              endX: end.x,
              endY: end.y,
              durationMs: Math.max(40, Math.round((step.durationMs ?? 250) / speed)),
              button: step.button ?? 'left',
              showRipples: this.liveSettings.showRipples,
            });
          } else if (step.type === 'wheel' && step.target) {
            const resolved = doc
              ? resolveTargetLocator(step.target, doc, true)
              : { x: step.target.clientX, y: step.target.clientY, element: null, isCanvas: false };
            await this.runWheelAction(token, signal, {
              x: resolved.x,
              y: resolved.y,
              deltaX: step.deltaX ?? 0,
              deltaY: step.deltaY ?? 0,
              showRipples: this.liveSettings.showRipples,
            });
          } else if (step.type === 'key' && step.key) {
            await this.runKeyAction(token, signal, {
              key: step.key,
              code: step.code ?? step.key,
              keyCode: step.keyCode ?? 0,
              modifiers: step.modifiers ?? 0,
            });
          }

          this.executedCount += 1;
          this.emitStatus();
        }

        if (macroConfig.loopCount > 0 && loop >= macroConfig.loopCount) {
          break;
        }
        if (macroConfig.loopDelayMs > 0) {
          await this.sleep(token, signal, Math.round(macroConfig.loopDelayMs / speed));
        }
      }
    } catch (err) {
      if (!isAbortError(err)) throw err;
    } finally {
      this.finishRun(token);
    }
  }
}
