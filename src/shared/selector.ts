import { AUTOCLICK_HOST_ID } from './constants.ts';
import type { LocatorMode, TargetLocator } from './types.ts';

const SHADOW_DELIM = ' >>> ';

export function isExtensionElement(el: Element | null): boolean {
  if (!el) return false;
  if (el.id === AUTOCLICK_HOST_ID) return true;
  if (typeof el.closest === 'function' && el.closest(`#${AUTOCLICK_HOST_ID}`)) {
    return true;
  }
  const root = el.getRootNode?.();
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
    return isExtensionElement(root.host);
  }
  return false;
}

function escapeCssIdent(ident: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(ident);
  }
  return ident.replace(/([^\w-])/g, '\\$1');
}

function looksDynamicId(id: string): boolean {
  if (!id) return true;
  if (/^\d/.test(id)) return true;
  // Long random hex/hash or UUID-like chunks
  if (/[0-9a-f]{8,}/i.test(id) && !/[a-z]{4,}/i.test(id)) return true;
  if (/^:r[0-9a-z]+:?$/i.test(id)) return true;
  return false;
}

function getElementSegment(el: Element): string {
  const tag = el.tagName.toLowerCase();

  if (el.id && !looksDynamicId(el.id)) {
    return `#${escapeCssIdent(el.id)}`;
  }

  for (const attr of ['data-testid', 'data-test-id', 'data-qa', 'name', 'aria-label']) {
    const val = el.getAttribute(attr);
    if (val && val.length > 0 && val.length <= 64) {
      const escapedVal = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `${tag}[${attr}="${escapedVal}"]`;
    }
  }

  let seg = tag;
  const classList = Array.from(el.classList || [])
    .filter((c) => c.length > 1 && c.length <= 36 && !/^(is-|has-|active|hover|focus)/.test(c))
    .slice(0, 2);
  if (classList.length > 0) {
    seg += '.' + classList.map(escapeCssIdent).join('.');
  }

  const parent = el.parentElement;
  if (parent) {
    const sameTagSiblings = Array.from(parent.children).filter(
      (child) => child.tagName === el.tagName,
    );
    if (sameTagSiblings.length > 1) {
      const idx = sameTagSiblings.indexOf(el) + 1;
      seg += `:nth-of-type(${idx})`;
    }
  }

  return seg;
}

function buildSelectorWithinRoot(el: Element, root: Document | ShadowRoot): string {
  const parts: string[] = [];
  let curr: Element | null = el;

  while (curr && parts.length < 6) {
    const seg = getElementSegment(curr);
    parts.unshift(seg);

    // Stop early if selector uniquely matches inside this root
    const candidate = parts.join(' > ');
    try {
      const matches = root.querySelectorAll(candidate);
      if (matches.length === 1 && matches[0] === el) {
        return candidate;
      }
    } catch {
      // Ignore invalid temporary selector and keep climbing
    }

    if (seg.startsWith('#')) {
      break;
    }

    curr = curr.parentElement;
  }

  return parts.join(' > ');
}

export function buildSmartSelector(el: Element): string {
  const chain: string[] = [];
  let currentEl: Element | null = el;

  while (currentEl) {
    const rootNode = currentEl.getRootNode?.();
    if (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot) {
      chain.unshift(buildSelectorWithinRoot(currentEl, rootNode));
      currentEl = rootNode.host;
    } else {
      const doc = currentEl.ownerDocument ?? document;
      chain.unshift(buildSelectorWithinRoot(currentEl, doc));
      break;
    }
  }

  return chain.join(SHADOW_DELIM);
}

export function querySelectorDeep(
  selector: string,
  root: Document | ShadowRoot = document,
): Element | null {
  if (!selector) return null;
  const segments = selector.split(SHADOW_DELIM);
  let currentRoot: Document | ShadowRoot | null = root;
  let found: Element | null = null;

  for (let i = 0; i < segments.length; i++) {
    if (!currentRoot) return null;
    try {
      found = currentRoot.querySelector(segments[i]);
    } catch {
      return null;
    }
    if (!found) return null;
    if (i < segments.length - 1) {
      currentRoot = found.shadowRoot ?? null;
    }
  }

  return found;
}

export function deepElementFromPoint(
  x: number,
  y: number,
  doc: Document = document,
): Element | null {
  const host = doc.getElementById(AUTOCLICK_HOST_ID) as HTMLElement | null;
  const prevDisplay = host ? host.style.display : '';
  let candidate: Element | null = null;

  try {
    // Use elementsFromPoint first when available, falling back to hiding our host briefly
    if (typeof doc.elementsFromPoint === 'function') {
      const list = doc.elementsFromPoint(x, y);
      candidate = list.find((el) => !isExtensionElement(el)) ?? null;
    }
    if (!candidate && typeof doc.elementFromPoint === 'function') {
      if (host) host.style.display = 'none';
      const el = doc.elementFromPoint(x, y);
      candidate = isExtensionElement(el) ? null : el;
    }
  } finally {
    if (host && host.style.display === 'none' && prevDisplay !== 'none') {
      host.style.display = prevDisplay;
    }
  }

  // Drill into open Shadow DOM layers
  while (candidate?.shadowRoot && typeof candidate.shadowRoot.elementFromPoint === 'function') {
    const inner = candidate.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === candidate || isExtensionElement(inner)) {
      break;
    }
    candidate = inner;
  }

  return candidate;
}

function describeElement(el: Element | null): string {
  if (!el) return '视口坐标';
  const tag = el.tagName.toLowerCase();
  if (tag === 'canvas') {
    return el.id ? `canvas#${el.id}` : 'Canvas / WebGL 画布';
  }
  const aria = el.getAttribute('aria-label');
  if (aria) return `${tag}[${aria.slice(0, 18)}]`;
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text && text.length > 0 && tag !== 'body' && tag !== 'html') {
    return `${tag} "${text.slice(0, 18)}${text.length > 18 ? '…' : ''}"`;
  }
  if (el.id) return `${tag}#${el.id}`;
  return tag;
}

export function createLocatorFromPoint(
  clientX: number,
  clientY: number,
  preferredMode: LocatorMode = 'auto',
  doc: Document = document,
): TargetLocator {
  const el = deepElementFromPoint(clientX, clientY, doc);
  const win = doc.defaultView ?? (typeof window !== 'undefined' ? window : undefined);
  const scrollX = win?.scrollX ?? 0;
  const scrollY = win?.scrollY ?? 0;

  if (!el) {
    return {
      mode: preferredMode === 'auto' ? 'viewport' : preferredMode,
      clientX: Math.round(clientX),
      clientY: Math.round(clientY),
      pageX: Math.round(clientX + scrollX),
      pageY: Math.round(clientY + scrollY),
      label: `坐标 (${Math.round(clientX)}, ${Math.round(clientY)})`,
    };
  }

  const rect = el.getBoundingClientRect();
  const isCanvas = el.tagName.toUpperCase() === 'CANVAS';
  const relX = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0.5;
  const relY = rect.height > 0 ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : 0.5;
  const selector = buildSmartSelector(el);

  const resolvedMode: LocatorMode =
    preferredMode !== 'auto' ? preferredMode : isCanvas ? 'canvas-relative' : 'auto';

  return {
    mode: resolvedMode,
    clientX: Math.round(clientX),
    clientY: Math.round(clientY),
    pageX: Math.round(clientX + scrollX),
    pageY: Math.round(clientY + scrollY),
    selector,
    tagName: el.tagName.toUpperCase(),
    label: describeElement(el),
    relX: Number(relX.toFixed(4)),
    relY: Number(relY.toFixed(4)),
    scrollIntoView: true,
  };
}

export interface ResolvedTarget {
  x: number;
  y: number;
  element: Element | null;
  isCanvas: boolean;
}

function isRectVisibleInViewport(rect: DOMRect, win: Window): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= win.innerHeight &&
    rect.left <= win.innerWidth
  );
}

export function resolveTargetLocator(
  locator: TargetLocator,
  doc: Document = document,
  allowScrollIntoView = true,
): ResolvedTarget {
  const win = doc.defaultView ?? (typeof window !== 'undefined' ? window : undefined);
  const effectiveMode: LocatorMode =
    locator.mode === 'auto'
      ? locator.tagName === 'CANVAS'
        ? 'canvas-relative'
        : 'dom'
      : locator.mode;

  if (effectiveMode === 'viewport' || !locator.selector) {
    const el = deepElementFromPoint(locator.clientX, locator.clientY, doc);
    return {
      x: Math.round(locator.clientX),
      y: Math.round(locator.clientY),
      element: el,
      isCanvas: el?.tagName.toUpperCase() === 'CANVAS' || locator.tagName === 'CANVAS',
    };
  }

  const matched = querySelectorDeep(locator.selector, doc);
  if (!matched) {
    const fallbackEl = deepElementFromPoint(locator.clientX, locator.clientY, doc);
    return {
      x: Math.round(locator.clientX),
      y: Math.round(locator.clientY),
      element: fallbackEl,
      isCanvas: fallbackEl?.tagName.toUpperCase() === 'CANVAS' || locator.tagName === 'CANVAS',
    };
  }

  let rect = matched.getBoundingClientRect();
  if (
    allowScrollIntoView &&
    locator.scrollIntoView !== false &&
    win &&
    typeof matched.scrollIntoView === 'function' &&
    !isRectVisibleInViewport(rect, win)
  ) {
    matched.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
    rect = matched.getBoundingClientRect();
  }

  if (rect.width <= 0 || rect.height <= 0) {
    return {
      x: Math.round(locator.clientX),
      y: Math.round(locator.clientY),
      element: matched,
      isCanvas: matched.tagName.toUpperCase() === 'CANVAS',
    };
  }

  const rx = typeof locator.relX === 'number' ? locator.relX : 0.5;
  const ry = typeof locator.relY === 'number' ? locator.relY : 0.5;
  const x = Math.round(rect.left + rx * rect.width);
  const y = Math.round(rect.top + ry * rect.height);

  return {
    x,
    y,
    element: matched,
    isCanvas: matched.tagName.toUpperCase() === 'CANVAS',
  };
}
