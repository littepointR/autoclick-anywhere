export interface HudClampOptions {
  preferred: { x: number; y: number } | null;
  boxWidth: number;
  boxHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  defaultRightOffset?: number;
  defaultTopOffset?: number;
}

export function getViewportBounds(
  win: Window = window,
  doc: Document = document,
): { width: number; height: number } {
  const iw = win.innerWidth || 0;
  const ih = win.innerHeight || 0;
  const cw = doc.documentElement?.clientWidth || 0;
  const ch = doc.documentElement?.clientHeight || 0;
  return {
    width: cw > 0 && iw > 0 ? Math.min(iw, cw) : iw || cw || 1280,
    height: ch > 0 && ih > 0 ? Math.min(ih, ch) : ih || ch || 720,
  };
}

export function computeClampedHudPosition(opts: HudClampOptions): { x: number; y: number } {
  const margin = opts.margin ?? 10;
  const defaultRightOffset = opts.defaultRightOffset ?? 18;
  const defaultTopOffset = opts.defaultTopOffset ?? 18;

  const vpW = Math.max(1, Math.round(opts.viewportWidth));
  const vpH = Math.max(1, Math.round(opts.viewportHeight));
  const boxW = Math.max(0, opts.boxWidth);
  const boxH = Math.max(0, opts.boxHeight);

  const rawX = opts.preferred ? opts.preferred.x : vpW - boxW - defaultRightOffset;
  const rawY = opts.preferred ? opts.preferred.y : defaultTopOffset;

  let x: number;
  if (boxW + margin * 2 <= vpW) {
    x = Math.round(Math.max(margin, Math.min(vpW - boxW - margin, rawX)));
  } else {
    x = Math.max(4, Math.round((vpW - Math.min(boxW, vpW - 8)) / 2));
  }

  let y: number;
  if (boxH + margin * 2 <= vpH) {
    y = Math.round(Math.max(margin, Math.min(vpH - boxH - margin, rawY)));
  } else {
    y = Math.max(4, Math.round((vpH - Math.min(boxH, vpH - 8)) / 2));
  }

  return { x, y };
}
