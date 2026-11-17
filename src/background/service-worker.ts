import { interpolateDragSteps } from '../shared/timing.ts';
import type {
  BgRequestMessage,
  ContentMessage,
  DispatchResult,
  MouseButtonType,
} from '../shared/types.ts';

const attachedTabs = new Set<number>();
const attachPromises = new Map<number, Promise<DispatchResult>>();

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

function mapCdpButton(button: MouseButtonType): {
  cdpButton: 'left' | 'right' | 'middle';
  buttonsMask: number;
} {
  switch (button) {
    case 'right':
      return { cdpButton: 'right', buttonsMask: 2 };
    case 'middle':
      return { cdpButton: 'middle', buttonsMask: 4 };
    case 'left':
    default:
      return { cdpButton: 'left', buttonsMask: 1 };
  }
}

function translateAttachError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/chrome:\/\/|chrome-extension:\/\/|devtools:\/\/|edge:\/\//i.test(msg)) {
    return '受限系统/扩展页面不支持 CDP，已自动切换为 DOM 引擎';
  }
  if (/another debugger/i.test(msg)) {
    return '页面已打开 DevTools 调试器，已自动切换为 DOM 引擎';
  }
  return `CDP 附加失败 (${msg})，已自动切换为 DOM 引擎`;
}

async function ensureAttached(tabId: number): Promise<DispatchResult> {
  if (attachedTabs.has(tabId)) {
    return { ok: true };
  }

  const inFlight = attachPromises.get(tabId);
  if (inFlight) return inFlight;

  const task = (async (): Promise<DispatchResult> => {
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = tab.url ?? '';
      if (
        url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('devtools://') ||
        url.startsWith('chrome-extension://')
      ) {
        return {
          ok: false,
          fallbackToDom: true,
          reason: '当前页面为浏览器内置/扩展页，不支持 CDP 调试，已切换为 DOM 引擎',
        };
      }

      await chrome.debugger.attach({ tabId }, '1.3');
      attachedTabs.add(tabId);
      return { ok: true };
    } catch (err) {
      attachedTabs.delete(tabId);
      return {
        ok: false,
        fallbackToDom: true,
        reason: translateAttachError(err),
      };
    } finally {
      attachPromises.delete(tabId);
    }
  })();

  attachPromises.set(tabId, task);
  return task;
}

async function detachTab(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) return;
  attachedTabs.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Already detached
  }
}

async function sendCdpCommand(
  tabId: number,
  method: string,
  params: Record<string, unknown>,
): Promise<DispatchResult> {
  const attached = await ensureAttached(tabId);
  if (!attached.ok) return attached;

  try {
    await chrome.debugger.sendCommand({ tabId }, method, params);
    return { ok: true };
  } catch (err) {
    attachedTabs.delete(tabId);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fallbackToDom: true,
      reason: `CDP 指令执行失败 (${msg})，已自动切换为 DOM 引擎`,
    };
  }
}

async function handleCdpClick(
  tabId: number,
  msg: Extract<BgRequestMessage, { type: 'CDP_CLICK' }>,
): Promise<DispatchResult> {
  const { cdpButton, buttonsMask } = mapCdpButton(msg.button);
  const holdMs = msg.clickKind === 'hold' ? Math.max(100, msg.holdMs) : Math.max(0, msg.holdMs);

  let res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: msg.x,
    y: msg.y,
    button: 'none',
    buttons: 0,
  });
  if (!res.ok) return res;

  res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: msg.x,
    y: msg.y,
    button: cdpButton,
    buttons: buttonsMask,
    clickCount: 1,
  });
  if (!res.ok) return res;

  if (holdMs > 0) await sleep(holdMs);

  res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: msg.x,
    y: msg.y,
    button: cdpButton,
    buttons: 0,
    clickCount: 1,
  });
  if (!res.ok) return res;

  if (msg.clickKind === 'double') {
    await sleep(36);
    res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: msg.x,
      y: msg.y,
      button: cdpButton,
      buttons: buttonsMask,
      clickCount: 2,
    });
    if (!res.ok) return res;

    await sleep(Math.min(35, holdMs));

    res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: msg.x,
      y: msg.y,
      button: cdpButton,
      buttons: 0,
      clickCount: 2,
    });
    if (!res.ok) return res;
  }

  return { ok: true };
}

async function handleCdpDrag(
  tabId: number,
  msg: Extract<BgRequestMessage, { type: 'CDP_DRAG' }>,
): Promise<DispatchResult> {
  const { cdpButton, buttonsMask } = mapCdpButton(msg.button);

  let res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: msg.startX,
    y: msg.startY,
    button: 'none',
    buttons: 0,
  });
  if (!res.ok) return res;

  res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: msg.startX,
    y: msg.startY,
    button: cdpButton,
    buttons: buttonsMask,
    clickCount: 1,
  });
  if (!res.ok) return res;

  const steps = interpolateDragSteps(msg.startX, msg.startY, msg.endX, msg.endY, msg.durationMs);
  for (const step of steps) {
    await sleep(step.waitMs);
    res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: step.x,
      y: step.y,
      button: cdpButton,
      buttons: buttonsMask,
    });
    if (!res.ok) return res;
  }

  return sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: msg.endX,
    y: msg.endY,
    button: cdpButton,
    buttons: 0,
    clickCount: 1,
  });
}

async function handleCdpWheel(
  tabId: number,
  msg: Extract<BgRequestMessage, { type: 'CDP_WHEEL' }>,
): Promise<DispatchResult> {
  const res = await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: msg.x,
    y: msg.y,
    button: 'none',
    buttons: 0,
  });
  if (!res.ok) return res;

  return sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: msg.x,
    y: msg.y,
    deltaX: msg.deltaX,
    deltaY: msg.deltaY,
  });
}

async function handleCdpKey(
  tabId: number,
  msg: Extract<BgRequestMessage, { type: 'CDP_KEY' }>,
): Promise<DispatchResult> {
  const text = msg.key.length === 1 ? msg.key : msg.key === 'Enter' ? '\r' : undefined;
  const downParams: Record<string, unknown> = {
    type: 'keyDown',
    key: msg.key,
    code: msg.code,
    windowsVirtualKeyCode: msg.keyCode || undefined,
    nativeVirtualKeyCode: msg.keyCode || undefined,
    modifiers: msg.modifiers,
  };
  if (text !== undefined) {
    downParams.text = text;
    downParams.unmodifiedText = text;
  }

  const res = await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', downParams);
  if (!res.ok) return res;

  return sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: msg.key,
    code: msg.code,
    windowsVirtualKeyCode: msg.keyCode || undefined,
    nativeVirtualKeyCode: msg.keyCode || undefined,
    modifiers: msg.modifiers,
  });
}

async function getActiveTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function ensureContentScriptAndSend<T = unknown>(
  tabId: number,
  message: ContentMessage,
): Promise<T | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      return (await chrome.tabs.sendMessage(tabId, message)) as T;
    } catch {
      return null;
    }
  }
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== undefined) {
    attachedTabs.delete(source.tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
});

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    const tabId = await getActiveTabId();
    if (tabId === undefined) return;
    if (command === 'toggle-run') {
      await ensureContentScriptAndSend(tabId, { type: 'TOGGLE_RUN' });
    } else if (command === 'toggle-record') {
      await ensureContentScriptAndSend(tabId, { type: 'TOGGLE_RECORD' });
    } else if (command === 'toggle-hud') {
      await ensureContentScriptAndSend(tabId, { type: 'TOGGLE_HUD' });
    }
  })();
});

chrome.runtime.onMessage.addListener((rawMsg: BgRequestMessage, sender, sendResponse) => {
  void (async () => {
    const senderTabId = sender.tab?.id;

    switch (rawMsg.type) {
      case 'PREFLIGHT_CDP': {
        if (senderTabId === undefined) {
          sendResponse({ ok: false, fallbackToDom: true, reason: '未识别标签页' });
          return;
        }
        sendResponse(await ensureAttached(senderTabId));
        return;
      }
      case 'DETACH_DEBUGGER': {
        if (senderTabId !== undefined) {
          await detachTab(senderTabId);
        }
        sendResponse({ ok: true });
        return;
      }
      case 'CDP_CLICK': {
        if (senderTabId === undefined) {
          sendResponse({ ok: false, fallbackToDom: true, reason: '未识别标签页' });
          return;
        }
        sendResponse(await handleCdpClick(senderTabId, rawMsg));
        return;
      }
      case 'CDP_DRAG': {
        if (senderTabId === undefined) {
          sendResponse({ ok: false, fallbackToDom: true, reason: '未识别标签页' });
          return;
        }
        sendResponse(await handleCdpDrag(senderTabId, rawMsg));
        return;
      }
      case 'CDP_WHEEL': {
        if (senderTabId === undefined) {
          sendResponse({ ok: false, fallbackToDom: true, reason: '未识别标签页' });
          return;
        }
        sendResponse(await handleCdpWheel(senderTabId, rawMsg));
        return;
      }
      case 'CDP_KEY': {
        if (senderTabId === undefined) {
          sendResponse({ ok: false, fallbackToDom: true, reason: '未识别标签页' });
          return;
        }
        sendResponse(await handleCdpKey(senderTabId, rawMsg));
        return;
      }
      case 'POPUP_TOGGLE_HUD': {
        const tabId = await getActiveTabId();
        if (tabId === undefined) {
          sendResponse({ ok: false });
          return;
        }
        const res = await ensureContentScriptAndSend(tabId, { type: 'TOGGLE_HUD' });
        sendResponse(res ?? { ok: false });
        return;
      }
      case 'POPUP_TOGGLE_RUN': {
        const tabId = await getActiveTabId();
        if (tabId === undefined) {
          sendResponse({ ok: false });
          return;
        }
        const res = await ensureContentScriptAndSend(tabId, { type: 'TOGGLE_RUN' });
        sendResponse(res ?? { ok: false });
        return;
      }
      case 'POPUP_TOGGLE_RECORD': {
        const tabId = await getActiveTabId();
        if (tabId === undefined) {
          sendResponse({ ok: false });
          return;
        }
        const res = await ensureContentScriptAndSend(tabId, { type: 'TOGGLE_RECORD' });
        sendResponse(res ?? { ok: false });
        return;
      }
      case 'POPUP_GET_STATUS': {
        const tabId = await getActiveTabId();
        if (tabId === undefined) {
          sendResponse(null);
          return;
        }
        const res = await ensureContentScriptAndSend(tabId, { type: 'GET_STATUS' });
        sendResponse(res);
        return;
      }
      default:
        sendResponse({ ok: false });
    }
  })();

  return true;
});
