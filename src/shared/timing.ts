export function applyTimeJitter(
  baseMs: number,
  jitterMs: number,
  rng: () => number = Math.random,
): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return 0;
  if (!Number.isFinite(jitterMs) || jitterMs <= 0) return Math.round(baseMs);
  const delta = (rng() * 2 - 1) * jitterMs;
  return Math.max(0, Math.round(baseMs + delta));
}

export function applyPointJitter(
  x: number,
  y: number,
  radiusPx: number,
  rng: () => number = Math.random,
  bounds?: { width: number; height: number },
): { x: number; y: number } {
  const maxW = bounds?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1920);
  const maxH = bounds?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 1080);

  if (!Number.isFinite(radiusPx) || radiusPx <= 0) {
    return {
      x: Math.max(0, Math.min(Math.max(0, maxW - 1), Math.round(x))),
      y: Math.max(0, Math.min(Math.max(0, maxH - 1), Math.round(y))),
    };
  }

  // Uniform distribution inside a disk of radius `radiusPx`
  const angle = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * radiusPx;
  const nx = Math.round(x + Math.cos(angle) * r);
  const ny = Math.round(y + Math.sin(angle) * r);

  return {
    x: Math.max(0, Math.min(Math.max(0, maxW - 1), nx)),
    y: Math.max(0, Math.min(Math.max(0, maxH - 1), ny)),
  };
}

export interface DragInterpolationStep {
  x: number;
  y: number;
  waitMs: number;
}

export function interpolateDragSteps(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  durationMs: number,
): DragInterpolationStep[] {
  const safeDuration = Math.max(16, Math.round(durationMs));
  const rawSteps = Math.round(safeDuration / 16);
  const stepsCount = Math.max(4, Math.min(60, rawSteps));
  const waitMs = Math.max(1, Math.round(safeDuration / stepsCount));

  const steps: DragInterpolationStep[] = [];
  for (let i = 1; i <= stepsCount; i++) {
    const t = i / stepsCount;
    // Slight ease-in-out curve for natural Canvas/WebGL camera & object dragging
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    steps.push({
      x: Math.round(x1 + (x2 - x1) * eased),
      y: Math.round(y1 + (y2 - y1) * eased),
      waitMs,
    });
  }
  return steps;
}

export interface WheelCoalesceCandidate {
  timestamp: number;
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
}

export function canCoalesceWheel(
  prev: WheelCoalesceCandidate | null,
  next: WheelCoalesceCandidate,
  windowMs = 120,
  maxDistPx = 24,
): boolean {
  if (!prev) return false;
  if (next.timestamp - prev.timestamp > windowMs) return false;
  const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
  return dist <= maxDistPx;
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
