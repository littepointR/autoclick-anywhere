import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DomDispatcher } from '../src/engine/dom-dispatcher.ts';

const instantSleep = async () => Promise.resolve();

test('DomDispatcher single click fires ordered pointer/mouse sequence once without duplicate click', async () => {
  const dom = new JSDOM(`<!doctype html><html><body><button id="target">Click Me</button></body></html>`);
  const doc = dom.window.document;
  const btn = doc.getElementById('target')!;

  const log: string[] = [];
  for (const evName of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    btn.addEventListener(evName, (ev) => {
      const m = ev as MouseEvent;
      log.push(`${evName}:${m.clientX},${m.clientY}:b${m.button}`);
    });
  }

  const dispatcher = new DomDispatcher();
  await dispatcher.dispatchClick({
    x: 150,
    y: 90,
    element: btn,
    button: 'left',
    clickKind: 'single',
    holdMs: 0,
    sleep: instantSleep,
    doc,
  });

  // Note: pointerdown falls back to mousedown constructor if PointerEvent isn't on jsdom window,
  // but event.type is still 'pointerdown' and 'pointerup'.
  assert.deepEqual(log, [
    'pointerdown:150,90:b0',
    'mousedown:150,90:b0',
    'pointerup:150,90:b0',
    'mouseup:150,90:b0',
    'click:150,90:b0',
  ]);
});

test('DomDispatcher supports double click and right click contextmenu', async () => {
  const dom = new JSDOM(`<!doctype html><html><body><canvas id="c"></canvas></body></html>`);
  const doc = dom.window.document;
  const canvas = doc.getElementById('c')!;

  const events: Array<{ type: string; button: number; detail: number }> = [];
  for (const name of ['click', 'dblclick', 'contextmenu']) {
    canvas.addEventListener(name, (ev) => {
      const m = ev as MouseEvent;
      events.push({ type: ev.type, button: m.button, detail: m.detail });
    });
  }

  const dispatcher = new DomDispatcher();
  await dispatcher.dispatchClick({
    x: 80,
    y: 80,
    element: canvas,
    button: 'left',
    clickKind: 'double',
    holdMs: 0,
    sleep: instantSleep,
    doc,
  });

  await dispatcher.dispatchClick({
    x: 85,
    y: 85,
    element: canvas,
    button: 'right',
    clickKind: 'single',
    holdMs: 0,
    sleep: instantSleep,
    doc,
  });

  assert.deepEqual(events, [
    { type: 'click', button: 0, detail: 1 },
    { type: 'click', button: 0, detail: 2 },
    { type: 'dblclick', button: 0, detail: 2 },
    { type: 'contextmenu', button: 2, detail: 1 },
  ]);
});

test('DomDispatcher dispatchDrag interpolates pointermove events from start to end', async () => {
  const dom = new JSDOM(`<!doctype html><html><body><canvas id="gl"></canvas></body></html>`);
  const doc = dom.window.document;
  const canvas = doc.getElementById('gl')!;
  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [canvas];

  const trace: Array<{ type: string; x: number; y: number; buttons: number }> = [];
  for (const name of ['pointerdown', 'pointermove', 'pointerup']) {
    canvas.addEventListener(name, (ev) => {
      const m = ev as MouseEvent;
      trace.push({ type: ev.type, x: m.clientX, y: m.clientY, buttons: m.buttons });
    });
  }

  const dispatcher = new DomDispatcher();
  await dispatcher.dispatchDrag({
    startX: 10,
    startY: 20,
    endX: 110,
    endY: 120,
    durationMs: 96,
    button: 'left',
    sleep: instantSleep,
    doc,
  });

  const downIdx = trace.findIndex((t) => t.type === 'pointerdown');
  const upIdx = trace.findIndex((t) => t.type === 'pointerup');
  assert.ok(downIdx >= 0 && upIdx > downIdx);
  assert.equal(trace[downIdx].x, 10);
  assert.equal(trace[downIdx].y, 20);
  assert.equal(trace[downIdx].buttons, 1);

  const dragMoves = trace.slice(downIdx + 1, upIdx).filter((t) => t.type === 'pointermove');
  assert.ok(dragMoves.length >= 4);
  assert.ok(dragMoves.every((m) => m.buttons === 1));

  assert.equal(trace[upIdx].x, 110);
  assert.equal(trace[upIdx].y, 120);
  assert.equal(trace[upIdx].buttons, 0);
});

test('DomDispatcher dispatchWheel triggers canvas preventDefault or scrolls DOM container', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <canvas id="cv"></canvas>
    <div id="scroller" style="overflow-y: auto; height: 100px;"></div>
  </body></html>`);
  const doc = dom.window.document;
  const canvas = doc.getElementById('cv')!;
  const scroller = doc.getElementById('scroller')!;

  // 1. Canvas prevents default wheel and handles zoom internally
  let canvasDeltaY = 0;
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    canvasDeltaY += (ev as WheelEvent).deltaY;
  });

  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [canvas];
  const dispatcher = new DomDispatcher();
  await dispatcher.dispatchWheel({ x: 50, y: 50, deltaX: 0, deltaY: -120, doc });
  assert.equal(canvasDeltaY, -120);

  // 2. Scrollable DOM container when wheel is NOT prevented
  Object.defineProperty(scroller, 'scrollHeight', { value: 500 });
  Object.defineProperty(scroller, 'clientHeight', { value: 100 });
  let scrolledBy: { left: number; top: number } | null = null;
  scroller.scrollBy = ((opts: ScrollToOptions) => {
    scrolledBy = { left: opts.left ?? 0, top: opts.top ?? 0 };
  }) as typeof scroller.scrollBy;

  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [scroller];
  await dispatcher.dispatchWheel({ x: 200, y: 200, deltaX: 0, deltaY: 260, doc });
  assert.deepEqual(scrolledBy, { left: 0, top: 260 });
});
