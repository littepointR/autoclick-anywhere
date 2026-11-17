import { deepElementFromPoint } from '../shared/selector.ts';
import { interpolateDragSteps } from '../shared/timing.ts';
import type { ClickKind, MouseButtonType } from '../shared/types.ts';

export interface ClickDispatchOptions {
  x: number;
  y: number;
  element?: Element | null;
  button: MouseButtonType;
  clickKind: ClickKind;
  holdMs: number;
  sleep: (ms: number) => Promise<void>;
  doc?: Document;
}

export interface DragDispatchOptions {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
  button: MouseButtonType;
  sleep: (ms: number) => Promise<void>;
  doc?: Document;
}

export interface WheelDispatchOptions {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  doc?: Document;
}

export interface KeyDispatchOptions {
  key: string;
  code: string;
  keyCode: number;
  modifiers: number;
  doc?: Document;
}

function mapMouseButton(button: MouseButtonType): { buttonCode: number; buttonsMask: number } {
  switch (button) {
    case 'right':
      return { buttonCode: 2, buttonsMask: 2 };
    case 'middle':
      return { buttonCode: 1, buttonsMask: 4 };
    case 'left':
    default:
      return { buttonCode: 0, buttonsMask: 1 };
  }
}

interface WindowEventCtors {
  PointerEvent?: typeof MouseEvent;
  MouseEvent?: typeof MouseEvent;
  WheelEvent?: typeof WheelEvent;
  KeyboardEvent?: typeof KeyboardEvent;
}

function getPointerCtor(win: Window): typeof MouseEvent {
  const ctors = win as unknown as WindowEventCtors;
  if (typeof ctors.PointerEvent === 'function') return ctors.PointerEvent;
  if (typeof PointerEvent === 'function') return PointerEvent as unknown as typeof MouseEvent;
  return ctors.MouseEvent ?? MouseEvent;
}

function getMouseCtor(win: Window): typeof MouseEvent {
  const ctors = win as unknown as WindowEventCtors;
  return ctors.MouseEvent ?? MouseEvent;
}

function createPointerOrMouse(
  type: string,
  win: Window,
  init: MouseEventInit & { pointerId?: number; pointerType?: string; isPrimary?: boolean },
  usePointer: boolean,
): MouseEvent {
  const Ctor = usePointer ? getPointerCtor(win) : getMouseCtor(win);
  return new Ctor(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: win,
    ...init,
  });
}

function buildBaseCoords(x: number, y: number, win: Window) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  return {
    clientX: rx,
    clientY: ry,
    screenX: Math.round((win.screenX ?? 0) + rx),
    screenY: Math.round((win.screenY ?? 0) + ry),
  };
}

function focusIfFocusable(el: Element): void {
  if (typeof (el as HTMLElement).focus === 'function') {
    const tag = el.tagName.toUpperCase();
    const isInteractive =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      tag === 'BUTTON' ||
      tag === 'A' ||
      tag === 'CANVAS' ||
      (el as HTMLElement).isContentEditable ||
      el.hasAttribute('tabindex');
    if (isInteractive) {
      try {
        (el as HTMLElement).focus({ preventScroll: true });
      } catch {
        // Ignore focus errors in detached/restricted contexts
      }
    }
  }
}

function scrollElementOrAncestor(
  startEl: Element | null,
  deltaX: number,
  deltaY: number,
  doc: Document,
): void {
  const win = doc.defaultView ?? window;
  let curr: Element | null = startEl;

  while (curr && curr !== doc.documentElement) {
    const style = win.getComputedStyle ? win.getComputedStyle(curr) : null;
    const overflowY = style?.overflowY ?? '';
    const overflowX = style?.overflowX ?? '';

    const canScrollY =
      deltaY !== 0 &&
      curr.scrollHeight > curr.clientHeight &&
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay' || !style);
    const canScrollX =
      deltaX !== 0 &&
      curr.scrollWidth > curr.clientWidth &&
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay' || !style);

    if (canScrollY || canScrollX) {
      if (typeof curr.scrollBy === 'function') {
        curr.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
      } else {
        curr.scrollLeft += deltaX;
        curr.scrollTop += deltaY;
      }
      return;
    }

    curr = curr.parentElement;
  }

  const rootScroller = doc.scrollingElement ?? doc.documentElement ?? doc.body;
  if (typeof win.scrollBy === 'function') {
    try {
      win.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
      return;
    } catch {
      // jsdom does not implement window.scrollBy; fall through to scrollTop/scrollLeft
    }
  }
  if (rootScroller) {
    rootScroller.scrollLeft += deltaX;
    rootScroller.scrollTop += deltaY;
  }
}

export class DomDispatcher {
  private async fireSinglePressRelease(
    target: Element,
    x: number,
    y: number,
    button: MouseButtonType,
    detail: number,
    holdMs: number,
    sleep: (ms: number) => Promise<void>,
    win: Window,
  ): Promise<void> {
    const coords = buildBaseCoords(x, y, win);
    const { buttonCode, buttonsMask } = mapMouseButton(button);
    const pointerExtra = { pointerId: 1, pointerType: 'mouse', isPrimary: true };

    target.dispatchEvent(
      createPointerOrMouse('pointerover', win, { ...coords, ...pointerExtra, button: 0, buttons: 0 }, true),
    );
    target.dispatchEvent(
      createPointerOrMouse('mouseover', win, { ...coords, button: 0, buttons: 0 }, false),
    );
    target.dispatchEvent(
      createPointerOrMouse('pointermove', win, { ...coords, ...pointerExtra, button: 0, buttons: 0 }, true),
    );
    target.dispatchEvent(
      createPointerOrMouse('mousemove', win, { ...coords, button: 0, buttons: 0 }, false),
    );

    target.dispatchEvent(
      createPointerOrMouse(
        'pointerdown',
        win,
        { ...coords, ...pointerExtra, button: buttonCode, buttons: buttonsMask, detail },
        true,
      ),
    );
    target.dispatchEvent(
      createPointerOrMouse(
        'mousedown',
        win,
        { ...coords, button: buttonCode, buttons: buttonsMask, detail },
        false,
      ),
    );

    focusIfFocusable(target);

    if (holdMs > 0) {
      await sleep(holdMs);
    }

    target.dispatchEvent(
      createPointerOrMouse(
        'pointerup',
        win,
        { ...coords, ...pointerExtra, button: buttonCode, buttons: 0, detail },
        true,
      ),
    );
    target.dispatchEvent(
      createPointerOrMouse(
        'mouseup',
        win,
        { ...coords, button: buttonCode, buttons: 0, detail },
        false,
      ),
    );

    if (button === 'left') {
      // Only dispatch synthetic click once (never also call target.click() to avoid duplicate handlers)
      target.dispatchEvent(
        createPointerOrMouse('click', win, { ...coords, button: 0, buttons: 0, detail }, false),
      );
    } else if (button === 'right') {
      target.dispatchEvent(
        createPointerOrMouse('contextmenu', win, { ...coords, button: 2, buttons: 0, detail }, false),
      );
    } else if (button === 'middle') {
      target.dispatchEvent(
        createPointerOrMouse('auxclick', win, { ...coords, button: 1, buttons: 0, detail }, false),
      );
    }
  }

  async dispatchClick(opts: ClickDispatchOptions): Promise<void> {
    const doc = opts.doc ?? document;
    const win = doc.defaultView ?? window;
    const target =
      opts.element ?? deepElementFromPoint(opts.x, opts.y, doc) ?? doc.body ?? doc.documentElement;
    if (!target) return;

    const holdMs = opts.clickKind === 'hold' ? Math.max(100, opts.holdMs) : Math.max(0, opts.holdMs);

    await this.fireSinglePressRelease(
      target,
      opts.x,
      opts.y,
      opts.button,
      1,
      holdMs,
      opts.sleep,
      win,
    );

    if (opts.clickKind === 'double') {
      await opts.sleep(36);
      await this.fireSinglePressRelease(
        target,
        opts.x,
        opts.y,
        opts.button,
        2,
        Math.min(40, holdMs),
        opts.sleep,
        win,
      );
      const coords = buildBaseCoords(opts.x, opts.y, win);
      const { buttonCode } = mapMouseButton(opts.button);
      target.dispatchEvent(
        createPointerOrMouse(
          'dblclick',
          win,
          { ...coords, button: buttonCode, buttons: 0, detail: 2 },
          false,
        ),
      );
    }
  }

  async dispatchDrag(opts: DragDispatchOptions): Promise<void> {
    const doc = opts.doc ?? document;
    const win = doc.defaultView ?? window;
    const startTarget =
      deepElementFromPoint(opts.startX, opts.startY, doc) ?? doc.body ?? doc.documentElement;
    if (!startTarget) return;

    const { buttonCode, buttonsMask } = mapMouseButton(opts.button);
    const pointerExtra = { pointerId: 1, pointerType: 'mouse', isPrimary: true };
    const startCoords = buildBaseCoords(opts.startX, opts.startY, win);

    startTarget.dispatchEvent(
      createPointerOrMouse('pointermove', win, { ...startCoords, ...pointerExtra, button: 0, buttons: 0 }, true),
    );
    startTarget.dispatchEvent(
      createPointerOrMouse(
        'pointerdown',
        win,
        { ...startCoords, ...pointerExtra, button: buttonCode, buttons: buttonsMask, detail: 1 },
        true,
      ),
    );
    startTarget.dispatchEvent(
      createPointerOrMouse(
        'mousedown',
        win,
        { ...startCoords, button: buttonCode, buttons: buttonsMask, detail: 1 },
        false,
      ),
    );

    const steps = interpolateDragSteps(opts.startX, opts.startY, opts.endX, opts.endY, opts.durationMs);
    for (const step of steps) {
      await opts.sleep(step.waitMs);
      const moveTarget = deepElementFromPoint(step.x, step.y, doc) ?? startTarget;
      const moveCoords = buildBaseCoords(step.x, step.y, win);
      moveTarget.dispatchEvent(
        createPointerOrMouse(
          'pointermove',
          win,
          { ...moveCoords, ...pointerExtra, button: buttonCode, buttons: buttonsMask },
          true,
        ),
      );
      moveTarget.dispatchEvent(
        createPointerOrMouse(
          'mousemove',
          win,
          { ...moveCoords, button: buttonCode, buttons: buttonsMask },
          false,
        ),
      );
    }

    const endTarget = deepElementFromPoint(opts.endX, opts.endY, doc) ?? startTarget;
    const endCoords = buildBaseCoords(opts.endX, opts.endY, win);
    endTarget.dispatchEvent(
      createPointerOrMouse(
        'pointerup',
        win,
        { ...endCoords, ...pointerExtra, button: buttonCode, buttons: 0, detail: 1 },
        true,
      ),
    );
    endTarget.dispatchEvent(
      createPointerOrMouse(
        'mouseup',
        win,
        { ...endCoords, button: buttonCode, buttons: 0, detail: 1 },
        false,
      ),
    );
  }

  async dispatchWheel(opts: WheelDispatchOptions): Promise<void> {
    const doc = opts.doc ?? document;
    const win = doc.defaultView ?? window;
    const target =
      deepElementFromPoint(opts.x, opts.y, doc) ??
      doc.scrollingElement ??
      doc.body ??
      doc.documentElement;
    if (!target) return;

    const coords = buildBaseCoords(opts.x, opts.y, win);
    const WheelCtor = (win as unknown as WindowEventCtors).WheelEvent ?? WheelEvent;
    const wheelEv = new WheelCtor('wheel', {
      ...coords,
      deltaX: opts.deltaX,
      deltaY: opts.deltaY,
      deltaZ: 0,
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: win,
    });

    const notPrevented = target.dispatchEvent(wheelEv);
    if (notPrevented) {
      scrollElementOrAncestor(target, opts.deltaX, opts.deltaY, doc);
    }
  }

  async dispatchKey(opts: KeyDispatchOptions): Promise<void> {
    const doc = opts.doc ?? document;
    const win = doc.defaultView ?? window;
    const target = (doc.activeElement as Element | null) ?? doc.body ?? doc.documentElement;
    if (!target) return;

    const KeyCtor = (win as unknown as WindowEventCtors).KeyboardEvent ?? KeyboardEvent;
    const init: KeyboardEventInit = {
      key: opts.key,
      code: opts.code,
      keyCode: opts.keyCode,
      which: opts.keyCode,
      altKey: (opts.modifiers & 1) !== 0,
      ctrlKey: (opts.modifiers & 2) !== 0,
      metaKey: (opts.modifiers & 4) !== 0,
      shiftKey: (opts.modifiers & 8) !== 0,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: win,
    };

    target.dispatchEvent(new KeyCtor('keydown', init));
    target.dispatchEvent(new KeyCtor('keyup', init));
  }
}
