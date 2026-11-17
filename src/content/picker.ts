import { fmt, getMessages } from '../shared/i18n.ts';
import { createLocatorFromPoint, deepElementFromPoint } from '../shared/selector.ts';
import type { LanguageSetting, LocatorMode, TargetLocator } from '../shared/types.ts';

export class TargetPicker {
  private readonly root: ShadowRoot;
  private activeCleanup: (() => void) | null = null;
  private language: LanguageSetting = 'auto';

  constructor(shadowRoot: ShadowRoot, language: LanguageSetting = 'auto') {
    this.root = shadowRoot;
    this.language = language;
  }

  setLanguage(language: LanguageSetting): void {
    this.language = language;
  }

  isPicking(): boolean {
    return this.activeCleanup !== null;
  }

  cancel(): void {
    this.activeCleanup?.();
  }

  pickPoint(
    promptText?: string,
    preferredMode: LocatorMode = 'auto',
  ): Promise<TargetLocator | null> {
    this.cancel();
    const t = getMessages(this.language);

    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'ac-picker-mask';

      const box = document.createElement('div');
      box.className = 'ac-picker-box ac-hidden';

      const tip = document.createElement('div');
      tip.className = 'ac-picker-tip ac-hidden';

      const banner = document.createElement('div');
      banner.className = 'ac-picker-banner';
      banner.textContent = promptText ?? t.picker.defaultPointPrompt;

      this.root.append(mask, box, tip, banner);

      const cleanup = () => {
        window.removeEventListener('keydown', onKeyDown, true);
        mask.remove();
        box.remove();
        tip.remove();
        banner.remove();
        this.activeCleanup = null;
      };

      const finish = (loc: TargetLocator | null) => {
        cleanup();
        resolve(loc);
      };

      this.activeCleanup = () => finish(null);

      const updatePreview = (x: number, y: number) => {
        const cur = getMessages(this.language);
        const el = deepElementFromPoint(x, y, document);
        const rx = Math.round(x);
        const ry = Math.round(y);

        if (el) {
          const rect = el.getBoundingClientRect();
          const isCanvas = el.tagName.toUpperCase() === 'CANVAS';
          box.className = `ac-picker-box ${isCanvas ? 'is-canvas' : ''}`.trim();
          box.style.left = `${rect.left}px`;
          box.style.top = `${rect.top}px`;
          box.style.width = `${rect.width}px`;
          box.style.height = `${rect.height}px`;

          const u = rect.width > 0 ? (((x - rect.left) / rect.width) * 100).toFixed(1) : '50.0';
          const v = rect.height > 0 ? (((y - rect.top) / rect.height) * 100).toFixed(1) : '50.0';
          const tag = el.tagName.toLowerCase();
          const idPart = el.id ? `#${el.id}` : '';
          const coordLine = fmt(cur.picker.coordLabel, { x: rx, y: ry });
          const ratioLine = fmt(cur.picker.canvasRatio, { u, v });

          tip.className = 'ac-picker-tip';
          tip.innerHTML = isCanvas
            ? `<div><strong>🎨 ${tag}${idPart} (Canvas/WebGL)</strong></div>
               <div>${coordLine}</div>
               <div>${ratioLine}</div>`
            : `<div><strong>🎯 ${tag}${idPart}</strong></div>
               <div>${coordLine}</div>`;
        } else {
          box.className = 'ac-picker-box ac-hidden';
          tip.className = 'ac-picker-tip';
          tip.innerHTML = `<div><strong>${cur.picker.viewportCoord}</strong></div><div>(${rx}, ${ry})</div>`;
        }

        const tipLeft = Math.min(window.innerWidth - 220, x + 16);
        const tipTop = Math.min(window.innerHeight - 80, y + 16);
        tip.style.left = `${Math.max(8, tipLeft)}px`;
        tip.style.top = `${Math.max(8, tipTop)}px`;
      };

      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          finish(null);
        }
      };

      mask.addEventListener('pointermove', (ev) => {
        updatePreview(ev.clientX, ev.clientY);
      });

      mask.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.button !== 0) {
          finish(null);
          return;
        }
        const locator = createLocatorFromPoint(ev.clientX, ev.clientY, preferredMode, document);
        finish(locator);
      });

      mask.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        finish(null);
      });

      window.addEventListener('keydown', onKeyDown, true);
    });
  }

  pickDrag(promptText?: string): Promise<{ start: TargetLocator; end: TargetLocator } | null> {
    this.cancel();
    const t = getMessages(this.language);

    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'ac-picker-mask';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ac-svg-layer');
      svg.style.zIndex = '11';

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', '#f59e0b');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('stroke-dasharray', '6 4');
      line.style.display = 'none';
      svg.appendChild(line);

      const tip = document.createElement('div');
      tip.className = 'ac-picker-tip ac-hidden';

      const banner = document.createElement('div');
      banner.className = 'ac-picker-banner';
      banner.textContent = promptText ?? t.picker.defaultDragPrompt;

      this.root.append(mask, svg, tip, banner);

      let startPos: { x: number; y: number } | null = null;

      const cleanup = () => {
        window.removeEventListener('keydown', onKeyDown, true);
        mask.remove();
        svg.remove();
        tip.remove();
        banner.remove();
        this.activeCleanup = null;
      };

      const finish = (res: { start: TargetLocator; end: TargetLocator } | null) => {
        cleanup();
        resolve(res);
      };

      this.activeCleanup = () => finish(null);

      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          finish(null);
        }
      };

      mask.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.button !== 0) {
          finish(null);
          return;
        }
        startPos = { x: ev.clientX, y: ev.clientY };
        line.setAttribute('x1', String(ev.clientX));
        line.setAttribute('y1', String(ev.clientY));
        line.setAttribute('x2', String(ev.clientX));
        line.setAttribute('y2', String(ev.clientY));
        line.style.display = 'block';
      });

      mask.addEventListener('pointermove', (ev) => {
        const cur = getMessages(this.language);
        tip.className = 'ac-picker-tip';
        tip.style.left = `${Math.min(window.innerWidth - 200, ev.clientX + 16)}px`;
        tip.style.top = `${Math.min(window.innerHeight - 60, ev.clientY + 16)}px`;

        if (startPos) {
          line.setAttribute('x2', String(ev.clientX));
          line.setAttribute('y2', String(ev.clientY));
          const dist = Math.round(Math.hypot(ev.clientX - startPos.x, ev.clientY - startPos.y));
          tip.innerHTML = `<div><strong>${cur.picker.dragEndTitle}</strong></div><div>${fmt(cur.picker.dragDistance, { x: Math.round(ev.clientX), y: Math.round(ev.clientY), d: dist })}</div>`;
        } else {
          tip.innerHTML = `<div><strong>${cur.picker.dragStartTitle}</strong></div><div>(${Math.round(ev.clientX)}, ${Math.round(ev.clientY)})</div>`;
        }
      });

      mask.addEventListener('pointerup', (ev) => {
        if (!startPos) return;
        ev.preventDefault();
        ev.stopPropagation();
        const start = createLocatorFromPoint(startPos.x, startPos.y, 'auto', document);
        const end = createLocatorFromPoint(ev.clientX, ev.clientY, 'auto', document);
        finish({ start, end });
      });

      mask.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        finish(null);
      });

      window.addEventListener('keydown', onKeyDown, true);
    });
  }
}
