import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { AUTOCLICK_HOST_ID } from '../src/shared/constants.ts';
import {
  buildSmartSelector,
  createLocatorFromPoint,
  deepElementFromPoint,
  querySelectorDeep,
  resolveTargetLocator,
} from '../src/shared/selector.ts';
import {
  applyPointJitter,
  applyTimeJitter,
  canCoalesceWheel,
  interpolateDragSteps,
} from '../src/shared/timing.ts';
import { computeClampedHudPosition } from '../src/shared/viewport.ts';

function mockRect(el: Element, left: number, top: number, width: number, height: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
  });
}

test('buildSmartSelector and querySelectorDeep traverse open Shadow DOM', () => {
  const dom = new JSDOM(`<!doctype html><html><body><div id="app-shell"></div></body></html>`);
  const doc = dom.window.document;
  const prevShadowRoot = globalThis.ShadowRoot;
  globalThis.ShadowRoot = dom.window.ShadowRoot;

  try {
    const host = doc.getElementById('app-shell')!;
    const shadow = host.attachShadow({ mode: 'open' });
    const innerWrap = doc.createElement('div');
    innerWrap.className = 'toolbar';
    const innerBtn = doc.createElement('button');
    innerBtn.setAttribute('data-testid', 'fire-btn');
    innerBtn.textContent = 'Fire';
    innerWrap.appendChild(innerBtn);
    shadow.appendChild(innerWrap);

    const selector = buildSmartSelector(innerBtn);
    assert.ok(selector.includes(' >>> '), `Expected shadow delimiter in "${selector}"`);

    const resolved = querySelectorDeep(selector, doc);
    assert.equal(resolved, innerBtn);
  } finally {
    globalThis.ShadowRoot = prevShadowRoot;
  }
});

test('deepElementFromPoint ignores extension host and drills into open Shadow DOM', () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="widget"></div>
    <div id="${AUTOCLICK_HOST_ID}"></div>
  </body></html>`);
  const doc = dom.window.document;
  const extHost = doc.getElementById(AUTOCLICK_HOST_ID)!;
  const widget = doc.getElementById('widget')!;
  const shadow = widget.attachShadow({ mode: 'open' });
  const targetBtn = doc.createElement('button');
  shadow.appendChild(targetBtn);

  (doc as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint =
    () => [extHost, widget];
  (shadow as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint =
    () => targetBtn;

  const found = deepElementFromPoint(120, 80, doc);
  assert.equal(found, targetBtn);
});

test('Canvas relative locator recalculates coordinates proportionally after resize/move', () => {
  const dom = new JSDOM(`<!doctype html><html><body><canvas id="game-gl"></canvas></body></html>`);
  const doc = dom.window.document;
  const canvas = doc.getElementById('game-gl')!;
  mockRect(canvas, 100, 50, 400, 200);

  (doc as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint =
    () => [canvas];

  // Pick at 75% width (100 + 300 = 400), 25% height (50 + 50 = 100)
  const locator = createLocatorFromPoint(400, 100, 'auto', doc);
  assert.equal(locator.mode, 'canvas-relative');
  assert.equal(locator.tagName, 'CANVAS');
  assert.equal(locator.relX, 0.75);
  assert.equal(locator.relY, 0.25);

  // Move and double canvas size: rect now at (20, 40) with 800x400
  mockRect(canvas, 20, 40, 800, 400);
  const resolved = resolveTargetLocator(locator, doc, false);
  assert.equal(resolved.isCanvas, true);
  assert.equal(resolved.x, 620); // 20 + 0.75 * 800
  assert.equal(resolved.y, 140); // 40 + 0.25 * 400
});

test('Viewport locator ignores DOM position changes and returns original viewport coords', () => {
  const dom = new JSDOM(`<!doctype html><html><body><button id="btn">Go</button></body></html>`);
  const doc = dom.window.document;
  const btn = doc.getElementById('btn')!;
  mockRect(btn, 300, 300, 100, 40);

  const locator = {
    mode: 'viewport' as const,
    clientX: 42,
    clientY: 77,
    pageX: 42,
    pageY: 77,
    selector: '#btn',
  };

  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
  const resolved = resolveTargetLocator(locator, doc, false);
  assert.equal(resolved.x, 42);
  assert.equal(resolved.y, 77);
});

test('Timing helpers: jitter bounds, drag interpolation, and wheel coalescing', () => {
  assert.equal(applyTimeJitter(100, 20, () => 0), 80);
  assert.equal(applyTimeJitter(100, 20, () => 1), 120);
  assert.equal(applyTimeJitter(10, 50, () => 0), 0);

  const pt = applyPointJitter(5, 5, 20, () => 0, { width: 100, height: 100 });
  assert.ok(pt.x >= 0 && pt.x < 100 && pt.y >= 0 && pt.y < 100);

  const dragSteps = interpolateDragSteps(0, 0, 200, 100, 240);
  assert.ok(dragSteps.length >= 4 && dragSteps.length <= 60);
  assert.deepEqual(
    { x: dragSteps[dragSteps.length - 1].x, y: dragSteps[dragSteps.length - 1].y },
    { x: 200, y: 100 },
  );

  assert.equal(
    canCoalesceWheel(
      { timestamp: 1000, x: 50, y: 50, deltaX: 0, deltaY: 100 },
      { timestamp: 1080, x: 58, y: 52, deltaX: 0, deltaY: 120 },
    ),
    true,
  );
  assert.equal(
    canCoalesceWheel(
      { timestamp: 1000, x: 50, y: 50, deltaX: 0, deltaY: 100 },
      { timestamp: 1250, x: 50, y: 50, deltaX: 0, deltaY: 120 },
    ),
    false,
  );
});

test('computeClampedHudPosition shifts expanded HUD into available surrounding viewport space', () => {
  // 1. Bottom-right mini-pill anchor expanding into 392x560 inside 1440x900 viewport
  const bottomRight = computeClampedHudPosition({
    preferred: { x: 1220, y: 840 },
    boxWidth: 392,
    boxHeight: 560,
    viewportWidth: 1440,
    viewportHeight: 900,
    margin: 10,
  });
  assert.deepEqual(bottomRight, { x: 1038, y: 330 });
  assert.ok(bottomRight.x + 392 <= 1440 - 10);
  assert.ok(bottomRight.y + 560 <= 900 - 10);

  // 2. Bottom-left anchor preserves X and shifts Y upwards
  const bottomLeft = computeClampedHudPosition({
    preferred: { x: 12, y: 820 },
    boxWidth: 392,
    boxHeight: 560,
    viewportWidth: 1440,
    viewportHeight: 900,
    margin: 10,
  });
  assert.deepEqual(bottomLeft, { x: 12, y: 330 });

  // 3. Toggling wide mode (472px) near right edge shifts X left and preserves Y
  const wideNearRight = computeClampedHudPosition({
    preferred: { x: 1040, y: 20 },
    boxWidth: 472,
    boxHeight: 500,
    viewportWidth: 1440,
    viewportHeight: 900,
    margin: 10,
  });
  assert.deepEqual(wideNearRight, { x: 958, y: 20 });

  // 4. Tiny viewport smaller than nominal panel returns safe non-negative coordinates
  const tiny = computeClampedHudPosition({
    preferred: { x: 300, y: 400 },
    boxWidth: 392,
    boxHeight: 560,
    viewportWidth: 360,
    viewportHeight: 480,
    margin: 10,
  });
  assert.ok(tiny.x >= 4 && tiny.y >= 4);
});
