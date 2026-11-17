import { createLocatorFromPoint, resolveTargetLocator } from '../shared/selector.ts';
import type {
  ActiveTabMode,
  MultiPointItem,
  TargetLocator,
  VisualEffect,
} from '../shared/types.ts';

export interface OverlayUpdateInput {
  activeMode: ActiveTabMode;
  showPins: boolean;
  isRunning: boolean;
  singleTarget: TargetLocator | null;
  followCursor: boolean;
  multiItems: MultiPointItem[];
  scrollTarget: TargetLocator | null;
  scrollUseTarget: boolean;
}

export interface OverlayCallbacks {
  onUpdateSingleTarget: (locator: TargetLocator) => void;
  onUpdateScrollTarget: (locator: TargetLocator) => void;
  onUpdateMultiItemTarget: (itemId: string, which: 'start' | 'end', locator: TargetLocator) => void;
}

export class OverlayManager {
  private readonly fxLayer: HTMLDivElement;
  private readonly svgLayer: SVGSVGElement;
  private readonly pinsLayer: HTMLDivElement;
  private readonly callbacks: OverlayCallbacks;

  private lastInput: OverlayUpdateInput | null = null;
  private rafPending = false;
  private draggingPin: {
    kind: 'single' | 'scroll' | 'multi-start' | 'multi-end';
    itemId?: string;
    pinEl: HTMLElement;
  } | null = null;

  constructor(shadowRoot: ShadowRoot, callbacks: OverlayCallbacks) {
    this.callbacks = callbacks;

    this.fxLayer = document.createElement('div');
    this.fxLayer.className = 'ac-fx-layer';

    this.svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgLayer.setAttribute('class', 'ac-svg-layer');

    this.pinsLayer = document.createElement('div');
    this.pinsLayer.className = 'ac-pins-layer';

    shadowRoot.append(this.svgLayer, this.pinsLayer, this.fxLayer);

    window.addEventListener('scroll', this.scheduleReposition, { capture: true, passive: true });
    window.addEventListener('resize', this.scheduleReposition, { passive: true });
  }

  destroy(): void {
    window.removeEventListener('scroll', this.scheduleReposition, true);
    window.removeEventListener('resize', this.scheduleReposition);
  }

  private scheduleReposition = (): void => {
    if (!this.lastInput || !this.lastInput.showPins || this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (this.lastInput) {
        this.renderPins(this.lastInput);
      }
    });
  };

  renderPins(input: OverlayUpdateInput): void {
    this.lastInput = input;
    this.pinsLayer.innerHTML = '';
    this.svgLayer.innerHTML = '';

    if (!input.showPins) return;

    if (input.activeMode === 'single' && !input.followCursor && input.singleTarget) {
      const resolved = resolveTargetLocator(input.singleTarget, document, false);
      const pin = this.createPinElement({
        label: '1',
        x: resolved.x,
        y: resolved.y,
        isCanvas: resolved.isCanvas,
        extraClass: 'is-single',
        title: `单点目标 (${resolved.x}, ${resolved.y}) - 可拖拽调整`,
        kind: 'single',
      });
      this.pinsLayer.appendChild(pin);
      return;
    }

    if (input.activeMode === 'scroll' && input.scrollUseTarget && input.scrollTarget) {
      const resolved = resolveTargetLocator(input.scrollTarget, document, false);
      const pin = this.createPinElement({
        label: '⇅',
        x: resolved.x,
        y: resolved.y,
        isCanvas: resolved.isCanvas,
        extraClass: 'is-scroll',
        title: `滚动目标 (${resolved.x}, ${resolved.y}) - 可拖拽调整`,
        kind: 'scroll',
      });
      this.pinsLayer.appendChild(pin);
      return;
    }

    if (input.activeMode === 'multi') {
      this.ensureSvgArrowDefs();
      input.multiItems.forEach((item, idx) => {
        if (!item.enabled || item.type === 'wait') return;
        const start = resolveTargetLocator(item.target, document, false);

        const pin = this.createPinElement({
          label: String(idx + 1),
          x: start.x,
          y: start.y,
          isCanvas: start.isCanvas,
          extraClass: item.type === 'scroll' ? 'is-scroll' : '',
          title: `#${idx + 1} ${item.type.toUpperCase()} (${start.x}, ${start.y})`,
          kind: 'multi-start',
          itemId: item.id,
        });
        this.pinsLayer.appendChild(pin);

        if (item.type === 'drag' && item.endTarget) {
          const end = resolveTargetLocator(item.endTarget, document, false);
          this.drawDragArrow(start.x, start.y, end.x, end.y);
          const endPin = this.createEndPinElement(idx + 1, end.x, end.y, item.id);
          this.pinsLayer.appendChild(endPin);
        }
      });
    }
  }

  private ensureSvgArrowDefs(): void {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'ac-arrow-head');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,0 L0,6 L7,3 z');
    path.setAttribute('fill', '#f59e0b');
    marker.appendChild(path);
    defs.appendChild(marker);
    this.svgLayer.appendChild(defs);
  }

  private drawDragArrow(x1: number, y1: number, x2: number, y2: number): void {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', '#f59e0b');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-dasharray', '6 4');
    line.setAttribute('marker-end', 'url(#ac-arrow-head)');
    this.svgLayer.appendChild(line);
  }

  private createPinElement(opts: {
    label: string;
    x: number;
    y: number;
    isCanvas: boolean;
    extraClass?: string;
    title: string;
    kind: 'single' | 'scroll' | 'multi-start';
    itemId?: string;
  }): HTMLDivElement {
    const pin = document.createElement('div');
    pin.className = `ac-pin ${opts.isCanvas ? 'is-canvas' : ''} ${opts.extraClass ?? ''}`.trim();
    pin.textContent = opts.label;
    pin.title = opts.title;
    pin.style.left = `${opts.x}px`;
    pin.style.top = `${opts.y}px`;

    pin.addEventListener('pointerdown', (ev) => {
      if (this.lastInput?.isRunning || ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.startPinDrag(opts.kind, opts.itemId, pin);
    });

    return pin;
  }

  private createEndPinElement(index: number, x: number, y: number, itemId: string): HTMLDivElement {
    const endPin = document.createElement('div');
    endPin.className = 'ac-pin-end';
    endPin.textContent = `${index}B`;
    endPin.title = `#${index} 拖拽终点 (${x}, ${y}) - 可拖拽调整`;
    endPin.style.left = `${x}px`;
    endPin.style.top = `${y}px`;

    endPin.addEventListener('pointerdown', (ev) => {
      if (this.lastInput?.isRunning || ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.startPinDrag('multi-end', itemId, endPin);
    });

    return endPin;
  }

  private startPinDrag(
    kind: 'single' | 'scroll' | 'multi-start' | 'multi-end',
    itemId: string | undefined,
    pinEl: HTMLElement,
  ): void {
    this.draggingPin = { kind, itemId, pinEl };

    const onMove = (ev: PointerEvent) => {
      if (!this.draggingPin) return;
      pinEl.style.left = `${Math.round(ev.clientX)}px`;
      pinEl.style.top = `${Math.round(ev.clientY)}px`;
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      const drag = this.draggingPin;
      this.draggingPin = null;
      if (!drag) return;

      const locator = createLocatorFromPoint(ev.clientX, ev.clientY, 'auto', document);
      if (drag.kind === 'single') {
        this.callbacks.onUpdateSingleTarget(locator);
      } else if (drag.kind === 'scroll') {
        this.callbacks.onUpdateScrollTarget(locator);
      } else if (drag.kind === 'multi-start' && drag.itemId) {
        this.callbacks.onUpdateMultiItemTarget(drag.itemId, 'start', locator);
      } else if (drag.kind === 'multi-end' && drag.itemId) {
        this.callbacks.onUpdateMultiItemTarget(drag.itemId, 'end', locator);
      }
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  }

  spawnEffect(effect: VisualEffect): void {
    if (effect.kind === 'click') {
      const ripple = document.createElement('div');
      ripple.className = `ac-ripple ${effect.button === 'right' ? 'is-right' : ''} ${effect.isCanvas ? 'is-canvas' : ''}`.trim();
      ripple.style.left = `${effect.x}px`;
      ripple.style.top = `${effect.y}px`;
      this.fxLayer.appendChild(ripple);
      setTimeout(() => ripple.remove(), 480);
      return;
    }

    if (effect.kind === 'wheel') {
      const badge = document.createElement('div');
      badge.className = 'ac-wheel-fx';
      const arrow =
        Math.abs(effect.deltaY) >= Math.abs(effect.deltaX)
          ? effect.deltaY >= 0
            ? '↓ 滚动'
            : '↑ 滚动'
          : effect.deltaX >= 0
            ? '→ 滚动'
            : '← 滚动';
      badge.textContent = arrow;
      badge.style.left = `${effect.x}px`;
      badge.style.top = `${effect.y}px`;
      this.fxLayer.appendChild(badge);
      setTimeout(() => badge.remove(), 540);
      return;
    }

    if (effect.kind === 'drag') {
      const r1 = document.createElement('div');
      r1.className = 'ac-ripple';
      r1.style.left = `${effect.startX}px`;
      r1.style.top = `${effect.startY}px`;
      const r2 = document.createElement('div');
      r2.className = 'ac-ripple is-right';
      r2.style.left = `${effect.endX}px`;
      r2.style.top = `${effect.endY}px`;
      this.fxLayer.append(r1, r2);
      setTimeout(() => {
        r1.remove();
        r2.remove();
      }, 480);
    }
  }
}
