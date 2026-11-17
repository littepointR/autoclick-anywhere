import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { MacroRecorder } from '../src/engine/recorder.ts';
import { ActionRunner } from '../src/engine/runner.ts';
import { AUTOCLICK_HOST_ID, DEFAULT_SETTINGS, createFlowStep } from '../src/shared/constants.ts';
import type { ExtensionSettings, FlowRecord, FlowSubPhase } from '../src/shared/types.ts';

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

test('ActionRunner.runFlow executes composable steps and emits sub-phases with Skill CD timing', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button id="b1">B1</button>
    <canvas id="cv"></canvas>
  </body></html>`);
  const doc = dom.window.document;
  const b1 = doc.getElementById('b1')!;
  const cv = doc.getElementById('cv')!;
  mockRect(b1, 10, 10, 80, 30);
  mockRect(cv, 100, 100, 300, 200);
  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [b1];

  const dispatches: string[] = [];
  const seenPhases: FlowSubPhase[] = [];
  let sawTimedPhase = false;

  const runner = new ActionRunner({
    doc,
    getViewportSize: () => ({ width: 800, height: 600 }),
    sendToBackground: async (msg) => {
      if (msg.type !== 'DETACH_DEBUGGER') dispatches.push(msg.type);
      return { ok: true };
    },
    onStatusChange: (status) => {
      if (!seenPhases.includes(status.subPhase)) {
        seenPhases.push(status.subPhase);
      }
      if (status.phaseTiming && status.phaseTiming.totalDurationMs > 0) {
        sawTimedPhase = true;
      }
    },
  });

  const flow: FlowRecord = {
    id: 'flow_1',
    name: 'Composable Flow',
    createdAt: 1,
    playbackSpeed: 2,
    loopCount: 2,
    loopDelayMs: 40,
    steps: [
      createFlowStep({
        type: 'click',
        target: { mode: 'viewport', clientX: 40, clientY: 20, pageX: 40, pageY: 20 },
        delayBeforeMs: 40,
        delayAfterMs: 40,
        jitterMs: 0,
        jitterPx: 0,
      }),
      createFlowStep({
        type: 'wheel',
        usePageScroll: true,
        direction: 'down',
        deltaY: 200,
        delayAfterMs: 0,
        jitterMs: 0,
      }),
      createFlowStep({
        type: 'drag',
        target: { mode: 'viewport', clientX: 150, clientY: 150, pageX: 150, pageY: 150 },
        endTarget: { mode: 'viewport', clientX: 250, clientY: 220, pageX: 250, pageY: 220 },
        dragDurationMs: 80,
        delayAfterMs: 0,
        jitterMs: 0,
        jitterPx: 0,
      }),
      createFlowStep({
        type: 'wait',
        waitMs: 50,
        delayAfterMs: 0,
        jitterMs: 0,
      }),
      createFlowStep({
        type: 'key',
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        delayAfterMs: 0,
        jitterMs: 0,
      }),
    ],
  };

  await runner.runFlow(flow, { ...DEFAULT_SETTINGS, engine: 'cdp', showRipples: false });

  assert.deepEqual(dispatches, [
    'CDP_CLICK',
    'CDP_WHEEL',
    'CDP_DRAG',
    'CDP_KEY',
    'CDP_CLICK',
    'CDP_WHEEL',
    'CDP_DRAG',
    'CDP_KEY',
  ]);
  assert.ok(seenPhases.includes('delayBefore'));
  assert.ok(seenPhases.includes('acting'));
  assert.ok(seenPhases.includes('dragging'));
  assert.ok(seenPhases.includes('waiting'));
  assert.ok(seenPhases.includes('delayAfter'));
  assert.ok(seenPhases.includes('loopCooldown'));
  assert.equal(sawTimedPhase, true);
  assert.equal(runner.getRunState(), 'idle');
});

test('ActionRunner distinguishes Pause/Resume (freezing remainingMs) from Stop', async () => {
  const dom = new JSDOM(`<!doctype html><html><body><button id="btn">Click</button></body></html>`);
  const doc = dom.window.document;
  const btn = doc.getElementById('btn')!;
  mockRect(btn, 10, 10, 80, 30);
  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [btn];

  let domClicks = 0;
  btn.addEventListener('click', () => {
    domClicks += 1;
  });

  const runner = new ActionRunner({
    doc,
    getViewportSize: () => ({ width: 800, height: 600 }),
  });

  const flow: FlowRecord = {
    id: 'pause_flow',
    name: 'Pause Test',
    createdAt: 1,
    playbackSpeed: 1,
    loopCount: 1,
    loopDelayMs: 0,
    steps: [
      createFlowStep({ id: 's_wait', type: 'wait', waitMs: 220, delayAfterMs: 0, jitterMs: 0 }),
      createFlowStep({
        id: 's_click',
        type: 'click',
        target: { mode: 'dom', clientX: 50, clientY: 25, pageX: 50, pageY: 25, selector: '#btn' },
        delayAfterMs: 0,
        jitterMs: 0,
        jitterPx: 0,
      }),
    ],
  };

  const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, engine: 'dom', showRipples: false };
  const runPromise = runner.runFlow(flow, settings);

  await new Promise((r) => setTimeout(r, 65));
  runner.pause();

  assert.equal(runner.getRunState(), 'paused');
  assert.equal(runner.getIsPaused(), true);
  assert.equal(runner.getIsRunning(), false);
  const pausedTiming = runner.getStatusSnapshot().phaseTiming;
  assert.ok(pausedTiming && pausedTiming.remainingMs > 0 && pausedTiming.remainingMs < 220);

  // Confirm zero steps execute while paused
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(domClicks, 0);

  runner.resume();
  assert.equal(runner.getRunState(), 'running');
  await runPromise;

  assert.equal(domClicks, 1);
  assert.equal(runner.getRunState(), 'idle');

  // Verify stop() cleanly terminates from paused state without running remaining steps
  domClicks = 0;
  const run2 = runner.runFlow(flow, settings);
  await new Promise((r) => setTimeout(r, 50));
  runner.pause();
  assert.equal(runner.getRunState(), 'paused');
  runner.stop(false);
  await run2;
  assert.equal(runner.getRunState(), 'idle');
  assert.equal(domClicks, 0);
});

test('ActionRunner applies live CDP <-> DOM engine switching mid-flow without restarting', async () => {
  const dom = new JSDOM(`<!doctype html><html><body><button id="live-btn">Go</button></body></html>`);
  const doc = dom.window.document;
  const btn = doc.getElementById('live-btn')!;
  mockRect(btn, 40, 40, 100, 40);
  (doc as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [btn];

  const baseSettings: ExtensionSettings = { ...DEFAULT_SETTINGS, engine: 'cdp', showRipples: false };
  let cdpClicks = 0;
  let domClicks = 0;
  let detachCount = 0;

  const runner = new ActionRunner({
    doc,
    getViewportSize: () => ({ width: 800, height: 600 }),
    sendToBackground: async (msg) => {
      if (msg.type === 'PREFLIGHT_CDP') return { ok: true };
      if (msg.type === 'DETACH_DEBUGGER') {
        detachCount += 1;
        return { ok: true };
      }
      if (msg.type === 'CDP_CLICK') {
        cdpClicks += 1;
        if (cdpClicks === 1) {
          runner.updateSettings({ ...baseSettings, engine: 'dom' });
        }
        return { ok: true };
      }
      return { ok: true };
    },
  });

  btn.addEventListener('click', () => {
    domClicks += 1;
    if (domClicks === 2) {
      runner.updateSettings({ ...baseSettings, engine: 'cdp' }, true);
    }
  });

  const flow: FlowRecord = {
    id: 'switch_flow',
    name: 'Live Switch',
    createdAt: 1,
    playbackSpeed: 1,
    loopCount: 4,
    loopDelayMs: 15,
    steps: [
      createFlowStep({
        type: 'click',
        target: {
          mode: 'dom',
          clientX: 90,
          clientY: 60,
          pageX: 90,
          pageY: 60,
          selector: '#live-btn',
          relX: 0.5,
          relY: 0.5,
        },
        delayAfterMs: 0,
        jitterMs: 0,
        jitterPx: 0,
      }),
    ],
  };

  await runner.runFlow(flow, baseSettings);

  assert.equal(cdpClicks, 2);
  assert.equal(domClicks, 2);
  assert.ok(detachCount >= 1);
  assert.equal(runner.getStatusSnapshot().executedCount, 4);
  assert.equal(runner.getRunState(), 'idle');
});

test('MacroRecorder outputs composable FlowSteps ignoring extension HUD and ActionRunner replays them', async () => {
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

  // Replay recorded steps directly as a FlowRecord
  const replayed: string[] = [];
  const replayRunner = new ActionRunner({
    doc,
    getViewportSize: () => ({ width: 800, height: 600 }),
    sendToBackground: async (msg) => {
      if (msg.type !== 'DETACH_DEBUGGER') replayed.push(msg.type);
      return { ok: true };
    },
  });

  await replayRunner.runFlow(
    {
      id: 'macro_flow_1',
      name: 'Recorded Flow',
      createdAt: 1,
      source: 'macro',
      playbackSpeed: 20,
      loopCount: 1,
      loopDelayMs: 0,
      steps,
    },
    { ...DEFAULT_SETTINGS, engine: 'cdp', showRipples: false },
  );

  assert.deepEqual(replayed, ['CDP_CLICK', 'CDP_DRAG', 'CDP_WHEEL', 'CDP_KEY']);
});
