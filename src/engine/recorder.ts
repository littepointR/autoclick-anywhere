import { createFlowStep } from '../shared/constants.ts';
import { createLocatorFromPoint, isExtensionElement } from '../shared/selector.ts';
import { canCoalesceWheel } from '../shared/timing.ts';
import type { FlowStep, MouseButtonType } from '../shared/types.ts';

export interface MacroRecorderOptions {
  recordWheel: boolean;
  recordKeyboard: boolean;
  ignoreHotkeys?: string[];
  win?: Window;
  doc?: Document;
  now?: () => number;
  onStepsChanged?: (steps: FlowStep[]) => void;
}

interface PendingPointerDown {
  timestamp: number;
  x: number;
  y: number;
  button: MouseButtonType;
  delayBeforeMs: number;
}

function mapEventButton(btn: number): MouseButtonType {
  if (btn === 2) return 'right';
  if (btn === 1) return 'middle';
  return 'left';
}

function extractModifierMask(ev: KeyboardEvent): number {
  let mask = 0;
  if (ev.altKey) mask |= 1;
  if (ev.ctrlKey) mask |= 2;
  if (ev.metaKey) mask |= 4;
  if (ev.shiftKey) mask |= 8;
  return mask;
}

function isPureModifierKey(key: string): boolean {
  return key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta';
}

function formatShortcutCombo(ev: KeyboardEvent): string {
  const parts: string[] = [];
  if (ev.ctrlKey) parts.push('Ctrl');
  if (ev.altKey) parts.push('Alt');
  if (ev.shiftKey) parts.push('Shift');
  if (ev.metaKey) parts.push('Meta');
  const k = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
  parts.push(k);
  return parts.join('+');
}

export class MacroRecorder {
  private readonly win: Window;
  private readonly doc: Document;
  private readonly now: () => number;
  private options: MacroRecorderOptions;

  private recording = false;
  private steps: FlowStep[] = [];
  private lastEventTime = 0;
  private pendingDown: PendingPointerDown | null = null;
  private lastWheelMeta: { timestamp: number; x: number; y: number } | null = null;
  private downEventName: 'pointerdown' | 'mousedown' = 'pointerdown';
  private upEventName: 'pointerup' | 'mouseup' = 'pointerup';

  constructor(options: MacroRecorderOptions) {
    this.options = options;
    this.win = options.win ?? window;
    this.doc = options.doc ?? document;
    this.now = options.now ?? (() => Date.now());
  }

  updateOptions(partial: Partial<MacroRecorderOptions>): void {
    this.options = { ...this.options, ...partial };
  }

  isRecording(): boolean {
    return this.recording;
  }

  getSteps(): FlowStep[] {
    return [...this.steps];
  }

  start(): void {
    if (this.recording) return;
    this.recording = true;
    this.steps = [];
    this.lastEventTime = this.now();
    this.pendingDown = null;
    this.lastWheelMeta = null;

    const hasPointer = 'PointerEvent' in this.win;
    this.downEventName = hasPointer ? 'pointerdown' : 'mousedown';
    this.upEventName = hasPointer ? 'pointerup' : 'mouseup';

    this.win.addEventListener(this.downEventName, this.handlePointerDown, true);
    this.win.addEventListener(this.upEventName, this.handlePointerUp, true);
    this.win.addEventListener('wheel', this.handleWheel, { capture: true, passive: true });
    this.win.addEventListener('keydown', this.handleKeyDown, true);
    this.options.onStepsChanged?.(this.getSteps());
  }

  stop(): FlowStep[] {
    if (!this.recording) return this.getSteps();
    this.recording = false;
    this.pendingDown = null;
    this.lastWheelMeta = null;

    this.win.removeEventListener(this.downEventName, this.handlePointerDown, true);
    this.win.removeEventListener(this.upEventName, this.handlePointerUp, true);
    this.win.removeEventListener('wheel', this.handleWheel, true);
    this.win.removeEventListener('keydown', this.handleKeyDown, true);

    const out = this.getSteps();
    this.options.onStepsChanged?.(out);
    return out;
  }

  private isFromExtensionUi(ev: Event): boolean {
    const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
    for (const node of path) {
      if (node && typeof (node as Element).tagName === 'string') {
        if (isExtensionElement(node as Element)) return true;
      }
    }
    if (ev.target && typeof (ev.target as Element).tagName === 'string') {
      return isExtensionElement(ev.target as Element);
    }
    return false;
  }

  private handlePointerDown = (rawEv: Event): void => {
    if (!this.recording) return;
    if (this.isFromExtensionUi(rawEv)) return;

    const ev = rawEv as MouseEvent;
    const t = this.now();
    const delayBeforeMs = this.steps.length === 0 ? 0 : Math.max(0, t - this.lastEventTime);

    this.pendingDown = {
      timestamp: t,
      x: Math.round(ev.clientX),
      y: Math.round(ev.clientY),
      button: mapEventButton(ev.button),
      delayBeforeMs,
    };
  };

  private handlePointerUp = (rawEv: Event): void => {
    if (!this.recording || !this.pendingDown) return;
    const down = this.pendingDown;
    this.pendingDown = null;

    const ev = rawEv as MouseEvent;
    const t = this.now();
    const endX = Math.round(ev.clientX);
    const endY = Math.round(ev.clientY);
    const dist = Math.hypot(endX - down.x, endY - down.y);
    const durationMs = Math.max(16, t - down.timestamp);

    this.lastWheelMeta = null;

    if (dist >= 8) {
      const startLocator = createLocatorFromPoint(down.x, down.y, 'auto', this.doc);
      const endLocator = createLocatorFromPoint(endX, endY, 'auto', this.doc);
      this.steps.push(
        createFlowStep({
          type: 'drag',
          delayBeforeMs: down.delayBeforeMs,
          target: startLocator,
          endTarget: endLocator,
          button: down.button,
          dragDurationMs: durationMs,
          delayAfterMs: 0,
          jitterMs: 0,
          jitterPx: 0,
        }),
      );
      this.lastEventTime = t;
      this.options.onStepsChanged?.(this.getSteps());
      return;
    }

    // Upgrade consecutive quick left clicks at same spot into a single double-click step
    const prev = this.steps[this.steps.length - 1];
    if (
      prev &&
      prev.type === 'click' &&
      prev.button === 'left' &&
      prev.clickKind === 'single' &&
      down.button === 'left' &&
      down.delayBeforeMs <= 280 &&
      prev.target &&
      Math.hypot(down.x - prev.target.clientX, down.y - prev.target.clientY) <= 6
    ) {
      prev.clickKind = 'double';
      this.lastEventTime = t;
      this.options.onStepsChanged?.(this.getSteps());
      return;
    }

    const locator = createLocatorFromPoint(down.x, down.y, 'auto', this.doc);
    this.steps.push(
      createFlowStep({
        type: 'click',
        delayBeforeMs: down.delayBeforeMs,
        target: locator,
        button: down.button,
        clickKind: durationMs >= 350 ? 'hold' : 'single',
        holdMs: durationMs >= 350 ? durationMs : 25,
        delayAfterMs: 0,
        jitterMs: 0,
        jitterPx: 0,
      }),
    );
    this.lastEventTime = t;
    this.options.onStepsChanged?.(this.getSteps());
  };

  private handleWheel = (rawEv: Event): void => {
    if (!this.recording || !this.options.recordWheel) return;
    if (this.isFromExtensionUi(rawEv)) return;

    const ev = rawEv as WheelEvent;
    const t = this.now();
    const x = Math.round(ev.clientX);
    const y = Math.round(ev.clientY);
    const dx = Math.round(ev.deltaX);
    const dy = Math.round(ev.deltaY);
    if (dx === 0 && dy === 0) return;

    const lastStep = this.steps[this.steps.length - 1];
    if (
      lastStep &&
      lastStep.type === 'wheel' &&
      this.lastWheelMeta &&
      canCoalesceWheel(
        {
          timestamp: this.lastWheelMeta.timestamp,
          x: this.lastWheelMeta.x,
          y: this.lastWheelMeta.y,
          deltaX: lastStep.deltaX ?? 0,
          deltaY: lastStep.deltaY ?? 0,
        },
        { timestamp: t, x, y, deltaX: dx, deltaY: dy },
      )
    ) {
      lastStep.deltaX += dx;
      lastStep.deltaY += dy;
      this.lastWheelMeta = { timestamp: t, x, y };
      this.lastEventTime = t;
      this.options.onStepsChanged?.(this.getSteps());
      return;
    }

    const delayBeforeMs = this.steps.length === 0 ? 0 : Math.max(0, t - this.lastEventTime);
    const target = createLocatorFromPoint(x, y, 'auto', this.doc);
    this.steps.push(
      createFlowStep({
        type: 'wheel',
        delayBeforeMs,
        usePageScroll: false,
        target,
        direction: 'custom',
        deltaX: dx,
        deltaY: dy,
        delayAfterMs: 0,
        jitterMs: 0,
        jitterPx: 0,
      }),
    );
    this.lastWheelMeta = { timestamp: t, x, y };
    this.lastEventTime = t;
    this.options.onStepsChanged?.(this.getSteps());
  };

  private handleKeyDown = (rawEv: Event): void => {
    if (!this.recording || !this.options.recordKeyboard) return;
    if (this.isFromExtensionUi(rawEv)) return;

    const ev = rawEv as KeyboardEvent;
    if (ev.repeat || isPureModifierKey(ev.key)) return;

    const combo = formatShortcutCombo(ev);
    const ignored = new Set([
      'F8',
      'Shift+F8',
      'F9',
      'Escape',
      'Alt+H',
      'Alt+P',
      'Alt+Shift+S',
      'Alt+Shift+R',
      'Alt+Shift+H',
      ...(this.options.ignoreHotkeys ?? []),
    ]);
    if (ignored.has(ev.key) || ignored.has(combo)) return;

    const t = this.now();
    const delayBeforeMs = this.steps.length === 0 ? 0 : Math.max(0, t - this.lastEventTime);
    this.lastWheelMeta = null;

    this.steps.push(
      createFlowStep({
        type: 'key',
        delayBeforeMs,
        key: ev.key,
        code: ev.code,
        keyCode: ev.keyCode || 0,
        modifiers: extractModifierMask(ev),
        delayAfterMs: 0,
        jitterMs: 0,
        jitterPx: 0,
      }),
    );
    this.lastEventTime = t;
    this.options.onStepsChanged?.(this.getSteps());
  };
}
