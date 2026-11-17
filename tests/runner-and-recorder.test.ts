import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { MacroRecorder } from '../src/engine/recorder.ts';
import { ActionRunner } from '../src/engine/runner.ts';
import { AUTOCLICK_HOST_ID, DEFAULT_SETTINGS } from '../src/shared/constants.ts';
import type { ExtensionSettings, MacroConfig, MultiPointConfig, ScrollModeConfig, SingleClickConfig } from '../src/shared/types.ts';

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

test('ActionRunner executes Single-point mode with exact count and automatic CDP->DOM fallback', async () => {
  const dom = new JSDOM(`<!doctype html><html><body><button id="go">Go</button></body></html>`);
  const doc = dom.window.document;
  const btn = doc.getElementById('go')!;
  mockRect(btn, 50, 50, 100, 40);
  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [btn];

  let clickCount = 0;
  btn.addEventListener('click', () => {
    clickCount += 1;
  });

  const runner = new ActionRunner({
    doc,
    getViewportSize: () => ({ width: 800, height: 600 }),
    sendToBackground: async (msg) => {
      if (msg.type === 'DETACH_DEBUGGER') return { ok: true };
      return { ok: false, fallbackToDom: true, reason: 'CDP 测试降级' };
    },
  });

  const config: SingleClickConfig = {
    followCursor: false,
    target: {
      mode: 'dom',
      clientX: 100,
      clientY: 70,
      pageX: 100,
      pageY: 70,
      selector: '#go',
      relX: 0.5,
      relY: 0.5,
    },
    button: 'left',
    clickKind: 'single',
    holdMs: 0,
    intervalMs: 10,
    jitterMs: 0,
    jitterPx: 0,
    maxCount: 3,
  };

  const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, engine: 'cdp', showRipples: false };
  await runner.runSingle(config, settings);

  assert.equal(clickCount, 3);
  assert.equal(runner.getIsRunning(), false);
  assert.equal(runner.getStatusSnapshot().effectiveEngine, 'dom');
});

test('ActionRunner executes Multi-point (click + scroll + drag) and supports immediate stop()', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button id="b1">B1</button>
    <canvas id="cv"></canvas>
  </body></html>`);
  const doc = dom.window.document;
  const b1 = doc.getElementById('b1')!;
  const cv = doc.getElementById('cv')!;
  mockRect(b1, 10, 10, 80, 30);
  mockRect(cv, 100, 100, 300, 200);

  const dispatches: string[] = [];
  const runner = new ActionRunner({
    doc,
    getViewportSize: () => ({ width: 800, height: 600 }),
    sendToBackground: async (msg) => {
      dispatches.push(msg.type);
      return { ok: true };
    },
  });

  const multi: MultiPointConfig = {
    loopCount: 1,
    loopDelayMs: 0,
    jitterMs: 0,
    jitterPx: 0,
    items: [
      {
        id: '1',
        enabled: true,
        type: 'click',
        target: { mode: 'viewport', clientX: 40, clientY: 20, pageX: 40, pageY: 20 },
        button: 'left',
        clickKind: 'single',
        holdMs: 0,
        deltaX: 0,
        deltaY: 0,
        dragDurationMs: 50,
        repeatCount: 1,
        delayAfterMs: 0,
      },
      {
        id: '2',
        enabled: true,
        type: 'scroll',
        target: { mode: 'viewport', clientX: 200, clientY: 200, pageX: 200, pageY: 200 },
        button: 'left',
        clickKind: 'single',
        holdMs: 0,
        deltaX: 0,
        deltaY: 180,
        dragDurationMs: 50,
        repeatCount: 1,
        delayAfterMs: 0,
      },
      {
        id: '3',
        enabled: true,
        type: 'drag',
        target: { mode: 'viewport', clientX: 150, clientY: 150, pageX: 150, pageY: 150 },
        endTarget: { mode: 'viewport', clientX: 250, clientY: 220, pageX: 250, pageY: 220 },
        button: 'left',
        clickKind: 'single',
        holdMs: 0,
        deltaX: 0,
        deltaY: 0,
        dragDurationMs: 60,
        repeatCount: 1,
        delayAfterMs: 0,
      },
    ],
  };

  await runner.runMulti(multi, { ...DEFAULT_SETTINGS, engine: 'cdp', showRipples: false });
  assert.deepEqual(dispatches, ['CDP_CLICK', 'CDP_WHEEL', 'CDP_DRAG', 'DETACH_DEBUGGER']);

  // Verify Scroll mode can be aborted immediately mid-run
  const scrollCfg: ScrollModeConfig = {
    useTarget: false,
    target: null,
    direction: 'down',
    deltaX: 0,
    deltaY: 200,
    intervalMs: 1000,
    smooth: false,
    maxCount: 100,
  };
  let scrollCalls = 0;
  const abortRunner = new ActionRunner({
    doc,
    getViewportSize: () => ({ width: 800, height: 600 }),
    sendToBackground: async (msg) => {
      if (msg.type === 'CDP_WHEEL') {
        scrollCalls += 1;
        abortRunner.stop(false);
      }
      return { ok: true };
    },
  });

  await abortRunner.runScroll(scrollCfg, { ...DEFAULT_SETTINGS, engine: 'cdp', showRipples: false });
  assert.equal(scrollCalls, 1);
  assert.equal(abortRunner.getIsRunning(), false);
});

test('MacroRecorder captures clicks, drags, coalesced wheels, keys while ignoring extension HUD, and ActionRunner replays them', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <canvas id="game"></canvas>
    <div id="${AUTOCLICK_HOST_ID}"><button id="hud-btn">HUD</button></div>
  </body></html>`);
  const win = dom.window as unknown as Window;
  const doc = dom.window.document;
  const canvas = doc.getElementById('game')!;
  const hudBtn = doc.getElementById('hud-btn')!;
  mockRect(canvas, 0, 0, 500, 400);
  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [canvas];

  let clock = 1000;
  const recorder = new MacroRecorder({
    recordWheel: true,
    recordKeyboard: true,
    win,
    doc,
    now: () => clock,
  });

  recorder.start();

  // 1. Click inside extension HUD -> MUST be ignored
  hudBtn.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5, button: 0 }));
  hudBtn.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, clientX: 5, clientY: 5, button: 0 }));

  // 2. Normal left click on canvas
  clock = 1100;
  canvas.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 120, button: 0 }));
  clock = 1140;
  canvas.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, clientX: 100, clientY: 120, button: 0 }));

  // 3. Drag on canvas (>= 8px)
  clock = 1340;
  canvas.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 200, button: 0 }));
  clock = 1520;
  canvas.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, clientX: 320, clientY: 260, button: 0 }));

  // 4. Two burst wheel events within 120ms -> coalesced into one wheel step
  clock = 1600;
  canvas.dispatchEvent(new dom.window.WheelEvent('wheel', { bubbles: true, clientX: 250, clientY: 250, deltaX: 0, deltaY: 100 }));
  clock = 1660;
  canvas.dispatchEvent(new dom.window.WheelEvent('wheel', { bubbles: true, clientX: 252, clientY: 252, deltaX: 0, deltaY: 140 }));

  // 5. Keystroke (and ignored F8 hotkey)
  clock = 1800;
  canvas.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'F8', code: 'F8' }));
  canvas.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Space', code: 'Space', keyCode: 32 }));

  const steps = recorder.stop();
  assert.equal(steps.length, 4);
  assert.equal(steps[0].type, 'click');
  assert.equal(steps[1].type, 'drag');
  assert.equal(steps[2].type, 'wheel');
  assert.equal(steps[2].deltaY, 240);
  assert.equal(steps[3].type, 'key');
  assert.equal(steps[3].code, 'Space');

  // Playback via ActionRunner at 10x speed
  const replayed: string[] = [];
  const replayRunner = new ActionRunner({
    doc,
    getViewportSize: () => ({ width: 800, height: 600 }),
    sendToBackground: async (msg) => {
      if (msg.type !== 'DETACH_DEBUGGER') replayed.push(msg.type);
      return { ok: true };
    },
  });

  const macroCfg: MacroConfig = {
    activeMacroId: 'm1',
    macros: [],
    playbackSpeed: 20,
    loopCount: 1,
    loopDelayMs: 0,
    recordKeyboard: true,
    recordWheel: true,
  };

  await replayRunner.runMacro(
    { id: 'm1', name: 'Test Macro', createdAt: 1, steps },
    macroCfg,
    { ...DEFAULT_SETTINGS, engine: 'cdp', showRipples: false },
  );

  assert.deepEqual(replayed, ['CDP_CLICK', 'CDP_DRAG', 'CDP_WHEEL', 'CDP_KEY']);
});
