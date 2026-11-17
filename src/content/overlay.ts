import { fmt, getMessages } from '../shared/i18n.ts';
import { createLocatorFromPoint, resolveTargetLocator } from '../shared/selector.ts';
import type { FlowStep, LanguageSetting, TargetLocator, VisualEffect } from '../shared/types.ts';

export interface OverlayUpdateInput {
  steps: FlowStep[];
  showPins: boolean;
  isRunning: boolean;
  activeStepId: string | null;
  language?: LanguageSetting;
}

export interface OverlayCallbacks {
  onUpdateStepTarget: (stepId: string, which: 'start' | 'end', locator: TargetLocator) => void;
}

export class OverlayManager {
  private readonly shadowRoot: ShadowRoot;
  private readonly fxLayer: HTMLDivElement;
  private readonly svgLayer: SVGSVGElement;
  private readonly pinsLayer: HTMLDivElement;
  private readonly callbacks: OverlayCallbacks;

  private lastInput: OverlayUpdateInput | null = null;
  private deferredInput: OverlayUpdateInput | null = null;
  private rafPending = false;
  private draggingPin: {
    stepId: string;
    which: 'start' | 'end';
    pinEl: HTMLElement;
    shield: HTMLDivElement;
  } | null = null;

  constructor(shadowRoot: ShadowRoot, callbacks: OverlayCallbacks) {
    this.shadowRoot = shadowRoot;
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
    if (this.draggingPin || !this.lastInput || !this.lastInput.showPins || this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (!this.draggingPin && this.lastInput) {
        this.renderPins(this.lastInput);
      }
    });
  };

  renderPins(input: OverlayUpdateInput): void {
    if (this.draggingPin) {
      this.deferredInput = input;
      return;
    }

    this.lastInput = input;
    this.pinsLayer.innerHTML = '';
    this.svgLayer.innerHTML = '';

    if (!input.showPins) return;

    const t = getMessages(input.language ?? 'auto');
    let hasArrows = false;

    input.steps.forEach((step, idx) => {
      if (!step.enabled) return;

      const needsStartPin =
        (step.type === 'click' && !step.followCursor && !!step.target) ||
        (step.type === 'wheel' && !step.usePageScroll && !!step.target) ||
        (step.type === 'drag' && !!step.target);

      if (!needsStartPin || !step.target) return;

      const start = resolveTargetLocator(step.target, document, false);
      const isExecuting = input.isRunning && input.activeStepId === step.id;

      const pin = this.createPinElement({
        label: String(idx + 1),
        x: start.x,
        y: start.y,
        isCanvas: start.isCanvas,
        isExecuting,
        extraClass: step.type === 'wheel' ? 'is-scroll' : '',
        title: fmt(t.overlay.pinTitle, {
          idx: idx + 1,
          type: t.stepTypes[step.type],
          x: start.x,
          y: start.y,
        }),
        stepId: step.id,
      });
      this.pinsLayer.appendChild(pin);

      if (step.type === 'drag' && step.endTarget) {
        if (!hasArrows) {
          this.ensureSvgArrowDefs();
          hasArrows = true;
        }
        const end = resolveTargetLocator(step.endTarget, document, false);
        this.drawDragArrow(step.id, start.x, start.y, end.x, end.y);
        const endPin = this.createEndPinElement(
          idx + 1,
          end.x,
          end.y,
          step.id,
          isExecuting,
          fmt(t.overlay.endPinTitle, { idx: idx + 1, x: end.x, y: end.y }),
        );
        this.pinsLayer.appendChild(endPin);
      }
    });
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

  private drawDragArrow(stepId: string, x1: number, y1: number, x2: number, y2: number): void {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('data-step-id', stepId);
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
    isExecuting: boolean;
    extraClass?: string;
    title: string;
    stepId: string;
  }): HTMLDivElement {
    const pin = document.createElement('div');
    pin.className = `ac-pin ${opts.isCanvas ? 'is-canvas' : ''} ${opts.isExecuting ? 'is-executing-pin' : ''} ${opts.extraClass ?? ''}`.trim();
    pin.textContent = opts.label;
    pin.title = opts.title;
    pin.style.left = `${opts.x}px`;
    pin.style.top = `${opts.y}px`;

    pin.addEventListener('dragstart', (ev) => ev.preventDefault());
    pin.addEventListener('pointerdown', (ev) => {
      if (this.lastInput?.isRunning || ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.startPinDrag(opts.stepId, 'start', pin, ev.pointerId);
    });

    return pin;
  }

  private createEndPinElement(
    index: number,
    x: number,
    y: number,
    stepId: string,
    isExecuting: boolean,
    title: string,
  ): HTMLDivElement {
    const endPin = document.createElement('div');
    endPin.className = `ac-pin-end ${isExecuting ? 'is-executing-pin' : ''}`.trim();
    endPin.textContent = `${index}B`;
    endPin.title = title;
    endPin.style.left = `${x}px`;
    endPin.style.top = `${y}px`;

    endPin.addEventListener('dragstart', (ev) => ev.preventDefault());
    endPin.addEventListener('pointerdown', (ev) => {
      if (this.lastInput?.isRunning || ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.startPinDrag(stepId, 'end', endPin, ev.pointerId);
    });

    return endPin;
  }

  private startPinDrag(
    stepId: string,
    which: 'start' | 'end',
    pinEl: HTMLElement,
    pointerId: number,
  ): void {
    const shield = document.createElement('div');
    shield.className = 'ac-drag-shield';
    this.shadowRoot.appendChild(shield);
    try {
      shield.setPointerCapture(pointerId);
    } catch {
      // Fallback safely when synthetic events lack active pointerId
    }

    this.draggingPin = { stepId, which, pinEl, shield };

    const updateVisual = (clientX: number, clientY: number) => {
      const rx = Math.round(Math.max(0, Math.min(window.innerWidth - 1, clientX)));
      const ry = Math.round(Math.max(0, Math.min(window.innerHeight - 1, clientY)));
      pinEl.style.left = `${rx}px`;
      pinEl.style.top = `${ry}px`;

      const line = this.svgLayer.querySelector(`line[data-step-id="${stepId}"]`);
      if (line) {
        if (which === 'start') {
          line.setAttribute('x1', String(rx));
          line.setAttribute('y1', String(ry));
        } else {
          line.setAttribute('x2', String(rx));
          line.setAttribute('y2', String(ry));
        }
      }
      return { rx, ry };
    };

    const onMove = (ev: PointerEvent) => {
      if (!this.draggingPin) return;
      ev.preventDefault();
      updateVisual(ev.clientX, ev.clientY);
    };

    const finishDrag = (ev: PointerEvent, commit: boolean) => {
      shield.removeEventListener('pointermove', onMove);
      shield.removeEventListener('pointerup', onUp);
      shield.removeEventListener('pointercancel', onCancel);
      try {
        if (shield.hasPointerCapture?.(ev.pointerId)) {
          shield.releasePointerCapture(ev.pointerId);
        }
      } catch {
        // Ignore release errors
      }
      shield.remove();

      const active = this.draggingPin;
      this.draggingPin = null;
      if (!active) return;

      if (commit) {
        const { rx, ry } = updateVisual(ev.clientX, ev.clientY);
        const locator = createLocatorFromPoint(rx, ry, 'auto', document);
        this.callbacks.onUpdateStepTarget(active.stepId, active.which, locator);
      }

      if (this.deferredInput) {
        const pending = this.deferredInput;
        this.deferredInput = null;
        this.renderPins(pending);
      }
    };

    const onUp = (ev: PointerEvent) => finishDrag(ev, true);
    const onCancel = (ev: PointerEvent) => finishDrag(ev, false);

    shield.addEventListener('pointermove', onMove);
    shield.addEventListener('pointerup', onUp);
    shield.addEventListener('pointercancel', onCancel);
  }

  spawnEffect(effect: VisualEffect, language: LanguageSetting = 'auto'): void {
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
      const t = getMessages(language);
      const badge = document.createElement('div');
      badge.className = 'ac-wheel-fx';
      const arrow =
        Math.abs(effect.deltaY) >= Math.abs(effect.deltaX)
          ? effect.deltaY >= 0
            ? t.overlay.scrollDown
            : t.overlay.scrollUp
          : effect.deltaX >= 0
            ? t.overlay.scrollRight
            : t.overlay.scrollLeft;
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
