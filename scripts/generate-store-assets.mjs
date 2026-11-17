import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../release/store-assets');
mkdirSync(outDir, { recursive: true });

// Precompute CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba, includeAlpha) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = includeAlpha ? 6 : 2; // 6 = RGBA, 2 = 24-bit RGB (required for CWS promo & screenshots)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const bpp = includeAlpha ? 4 : 3;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter None
    if (includeAlpha) {
      rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    } else {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const dstIdx = rowStart + 1 + x * 3;
        raw[dstIdx] = rgba[srcIdx];
        raw[dstIdx + 1] = rgba[srcIdx + 1];
        raw[dstIdx + 2] = rgba[srcIdx + 2];
      }
    }
  }

  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp(v, lo = 0, hi = 255) {
  return v < lo ? lo : v > hi ? hi : Math.round(v);
}

class CanvasBuf {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.buf = Buffer.alloc(width * height * 4);
  }

  blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const idx = (y * this.w + x) * 4;
    const alpha = a > 1 ? 1 : a;
    const oldA = this.buf[idx + 3] / 255;
    const outA = alpha + oldA * (1 - alpha);
    if (outA <= 0) return;
    this.buf[idx] = clamp((r * alpha + this.buf[idx] * oldA * (1 - alpha)) / outA);
    this.buf[idx + 1] = clamp((g * alpha + this.buf[idx + 1] * oldA * (1 - alpha)) / outA);
    this.buf[idx + 2] = clamp((b * alpha + this.buf[idx + 2] * oldA * (1 - alpha)) / outA);
    this.buf[idx + 3] = clamp(outA * 255);
  }

  fillGradient(r1, g1, b1, r2, g2, b2) {
    for (let y = 0; y < this.h; y++) {
      const ty = y / Math.max(1, this.h - 1);
      for (let x = 0; x < this.w; x++) {
        const tx = x / Math.max(1, this.w - 1);
        const t = (tx * 0.45 + ty * 0.55);
        const idx = (y * this.w + x) * 4;
        this.buf[idx] = clamp(r1 + (r2 - r1) * t);
        this.buf[idx + 1] = clamp(g1 + (g2 - g1) * t);
        this.buf[idx + 2] = clamp(b1 + (b2 - b1) * t);
        this.buf[idx + 3] = 255;
      }
    }
  }

  drawGrid(step, r, g, b, a) {
    for (let x = 0; x < this.w; x += step) {
      for (let y = 0; y < this.h; y++) this.blend(x, y, r, g, b, a);
    }
    for (let y = 0; y < this.h; y += step) {
      for (let x = 0; x < this.w; x++) this.blend(x, y, r, g, b, a);
    }
  }

  fillRoundedRect(x, y, w, h, radius, r, g, b, a = 1, border = null) {
    const x0 = Math.max(0, Math.floor(x - 1));
    const y0 = Math.max(0, Math.floor(y - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(x + w + 1));
    const y1 = Math.min(this.h - 1, Math.ceil(y + h + 1));
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rad = Math.min(radius, w / 2, h / 2);

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = Math.max(0, Math.abs(px - cx) - (w / 2 - rad));
        const dy = Math.max(0, Math.abs(py - cy) - (h / 2 - rad));
        const dist = Math.hypot(dx, dy) - rad;
        const aa = Math.max(0, Math.min(1, 0.6 - dist));
        if (aa > 0) {
          this.blend(px, py, r, g, b, a * aa);
          if (border && dist > -(border.w ?? 1.4) && dist <= 0.6) {
            this.blend(px, py, border.r, border.g, border.b, (border.a ?? 1) * aa);
          }
        }
      }
    }
  }

  fillCircle(cx, cy, radius, r, g, b, a = 1) {
    const x0 = Math.max(0, Math.floor(cx - radius - 2));
    const y0 = Math.max(0, Math.floor(cy - radius - 2));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + radius + 2));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + radius + 2));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.hypot(px - cx, py - cy) - radius;
        const aa = Math.max(0, Math.min(1, 0.7 - dist));
        if (aa > 0) this.blend(px, py, r, g, b, a * aa);
      }
    }
  }

  strokeCircle(cx, cy, radius, thickness, r, g, b, a = 1) {
    const x0 = Math.max(0, Math.floor(cx - radius - thickness - 2));
    const y0 = Math.max(0, Math.floor(cy - radius - thickness - 2));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + radius + thickness + 2));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + radius + thickness + 2));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const diff = Math.abs(Math.hypot(px - cx, py - cy) - radius);
        const aa = Math.max(0, Math.min(1, 1 - diff / Math.max(0.8, thickness)));
        if (aa > 0) this.blend(px, py, r, g, b, a * aa);
      }
    }
  }

  drawLine(x1, y1, x2, y2, thickness, r, g, b, a = 1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness / 2, r, g, b, a);
    }
  }

  drawConicCdBox(x, y, size, ratio, r, g, b) {
    this.fillRoundedRect(x, y, size, size, 12, 22, 33, 56, 1, { r: 56, g: 189, b: 248, a: 0.7 });
    const cx = x + size / 2;
    const cy = y + size / 2;
    const clearAngle = (1 - ratio) * Math.PI * 2;
    for (let py = y + 2; py < y + size - 2; py++) {
      for (let px = x + 2; px < x + size - 2; px++) {
        let angle = Math.atan2(px - cx, -(py - cy));
        if (angle < 0) angle += Math.PI * 2;
        if (angle >= clearAngle) {
          this.blend(px, py, 2, 6, 23, 0.78);
        }
      }
    }
    this.fillCircle(cx, cy, size * 0.16, r, g, b, 0.95);
  }
}

// Compact 5x7 uppercase/ASCII bitmap glyphs for crisp asset typography
const FONT_5X7 = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  ':': [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100],
  '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0b00000],
  '>': [0b10000, 0b01000, 0b00100, 0b00010, 0b00100, 0b01000, 0b10000],
  '=': [0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  '|': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(canvas, text, x, y, scale, r, g, b, a = 1) {
  const upper = text.toUpperCase();
  let cx = Math.round(x);
  for (const ch of upper) {
    const glyph = FONT_5X7[ch] ?? FONT_5X7[' '];
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if ((bits >> (4 - col)) & 1) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              canvas.blend(cx + col * scale + sx, Math.round(y) + row * scale + sy, r, g, b, a);
            }
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawCursorIcon(c, x, y, size) {
  const poly = [
    [x, y],
    [x + size * 0.22, y + size * 0.94],
    [x + size * 0.44, y + size * 0.58],
    [x + size * 0.82, y + size * 0.9],
    [x + size * 0.96, y + size * 0.74],
    [x + size * 0.58, y + size * 0.42],
    [x + size * 0.9, y + size * 0.2],
  ];
  const minX = Math.floor(x);
  const maxX = Math.ceil(x + size);
  const minY = Math.floor(y);
  const maxY = Math.ceil(y + size);
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi) {
          inside = !inside;
        }
      }
      if (inside) c.blend(px, py, 248, 250, 252, 1);
    }
  }
}

// 1. Edge Store Logo (300x300 RGBA PNG)
{
  const c = new CanvasBuf(300, 300);
  c.fillRoundedRect(14, 14, 272, 272, 62, 14, 22, 42, 1, { r: 56, g: 189, b: 248, a: 0.65 });
  c.strokeCircle(132, 132, 82, 10, 6, 182, 212, 0.95);
  c.strokeCircle(132, 132, 46, 9, 139, 92, 246, 0.95);
  c.fillCircle(132, 132, 16, 34, 211, 238, 1);
  drawCursorIcon(c, 134, 134, 118);
  writeFileSync(resolve(outDir, 'edge-logo-300x300.png'), encodePng(300, 300, c.buf, true));
}

// 2. Small Promo Tile (440x280 24-bit RGB PNG, no alpha)
{
  const c = new CanvasBuf(440, 280);
  c.fillGradient(10, 15, 34, 30, 27, 75);
  c.drawGrid(32, 56, 189, 248, 0.08);
  c.strokeCircle(92, 105, 50, 5, 6, 182, 212, 0.95);
  c.strokeCircle(92, 105, 28, 4, 139, 92, 246, 0.95);
  c.fillCircle(92, 105, 9, 34, 211, 238, 1);
  drawCursorIcon(c, 92, 105, 62);
  drawText(c, 'AUTOCLICK', 175, 58, 4, 248, 250, 252, 1);
  drawText(c, 'ANYWHERE', 175, 98, 4, 56, 189, 248, 1);
  c.fillRoundedRect(32, 198, 376, 46, 12, 15, 23, 42, 0.92, { r: 56, g: 189, b: 248, a: 0.45 });
  drawText(c, 'DOM + CANVAS + WEBGL FLOWCHART', 48, 214, 2, 203, 213, 225, 1);
  writeFileSync(resolve(outDir, 'promo-small-440x280.png'), encodePng(440, 280, c.buf, false));
}

// 3. Store Screenshot 1: Visual Flowchart + Game Skill CD (1280x800 24-bit RGB PNG)
{
  const c = new CanvasBuf(1280, 800);
  c.fillGradient(7, 11, 25, 25, 20, 62);
  c.drawGrid(40, 56, 189, 248, 0.06);

  // Left Canvas/WebGL Demo Arena mock
  c.fillRoundedRect(48, 56, 710, 688, 18, 12, 19, 38, 0.95, { r: 148, g: 163, b: 184, a: 0.28 });
  drawText(c, 'CANVAS & WEBGL TARGET ARENA', 76, 84, 3, 241, 245, 249, 1);
  c.fillRoundedRect(76, 134, 654, 574, 14, 5, 9, 22, 1, { r: 168, g: 85, b: 247, a: 0.45 });
  c.strokeCircle(280, 320, 68, 4, 6, 182, 212, 0.7);
  c.fillRoundedRect(130, 200, 175, 58, 12, 2, 132, 199, 1);
  drawText(c, 'ATTACK #1', 156, 222, 2, 255, 255, 255, 1);
  c.fillRoundedRect(130, 290, 175, 58, 12, 124, 58, 237, 1);
  drawText(c, 'COLLECT #2', 150, 312, 2, 255, 255, 255, 1);
  c.drawLine(390, 340, 610, 480, 5, 245, 158, 11, 0.9);
  c.fillCircle(390, 340, 18, 139, 92, 246, 1);
  drawText(c, '3', 385, 333, 2, 255, 255, 255, 1);
  c.fillRoundedRect(594, 464, 32, 32, 8, 245, 158, 11, 1);
  drawText(c, '3B', 598, 473, 2, 15, 23, 42, 1);
  c.fillCircle(285, 225, 18, 34, 211, 238, 1);
  drawText(c, '1', 280, 218, 2, 15, 23, 42, 1);

  // Right Flowchart HUD Panel mock
  c.fillRoundedRect(796, 56, 436, 688, 18, 15, 23, 42, 0.98, { r: 34, g: 211, b: 238, a: 0.55 });
  c.fillRoundedRect(796, 56, 436, 54, 18, 18, 45, 72, 1);
  drawText(c, 'AUTOCLICK FLOWCHART HUD', 822, 76, 2, 248, 250, 252, 1);
  c.fillRoundedRect(816, 124, 188, 34, 9, 8, 145, 178, 1);
  drawText(c, 'CDP TRUSTED', 844, 135, 2, 255, 255, 255, 1);
  c.fillRoundedRect(1016, 124, 196, 34, 9, 30, 41, 59, 1, { r: 148, g: 163, b: 184, a: 0.3 });
  drawText(c, 'DOM SILENT', 1054, 135, 2, 148, 163, 184, 1);

  c.fillRoundedRect(816, 172, 126, 38, 10, 217, 119, 6, 1);
  drawText(c, 'PAUSE F8', 834, 185, 2, 255, 255, 255, 1);
  c.fillRoundedRect(952, 172, 116, 38, 10, 225, 29, 72, 1);
  drawText(c, 'STOP ESC', 964, 185, 2, 255, 255, 255, 1);
  c.fillRoundedRect(1078, 172, 134, 38, 10, 147, 51, 234, 1);
  drawText(c, 'MACRO F9', 1094, 185, 2, 255, 255, 255, 1);

  // Flowchart Nodes with Skill CD Sweep
  const nodes = [
    { y: 236, label: '#1 CLICK CANVAS', sub: 'PRE 200MS  >  CLICK X3  >  CD 1.2S', ratio: 0.35, active: true },
    { y: 374, label: '#2 DRAG A -> B', sub: 'DRAG 280MS  >  COOLDOWN 300MS', ratio: 0, active: false },
    { y: 512, label: '#3 WHEEL ZOOM', sub: 'SCROLL -180PX  >  WAIT 500MS', ratio: 0, active: false },
  ];
  for (const n of nodes) {
    c.fillRoundedRect(
      816,
      n.y,
      396,
      106,
      14,
      n.active ? 17 : 26,
      n.active ? 32 : 36,
      n.active ? 56 : 58,
      1,
      n.active ? { r: 34, g: 211, b: 238, a: 0.9 } : { r: 148, g: 163, b: 184, a: 0.25 },
    );
    c.drawConicCdBox(834, n.y + 18, 66, n.ratio, 34, 211, 238);
    drawText(c, n.label, 916, n.y + 24, 2, 241, 245, 249, 1);
    c.fillRoundedRect(916, n.y + 56, 276, 30, 8, 15, 23, 42, 1, { r: 56, g: 189, b: 248, a: n.active ? 0.8 : 0.2 });
    drawText(c, n.sub, 926, n.y + 65, 1.5, 186, 230, 253, 1);
    c.drawLine(1014, n.y + 108, 1014, n.y + 134, 3, 56, 189, 248, 0.75);
  }
  c.fillRoundedRect(816, 650, 396, 64, 12, 15, 23, 42, 0.9, { r: 148, g: 163, b: 184, a: 0.35 });
  drawText(c, 'LOOP CONTROL  :  INFINITE / CD', 884, 675, 2, 148, 163, 184, 1);

  writeFileSync(resolve(outDir, 'screenshot-1-flowchart-1280x800.png'), encodePng(1280, 800, c.buf, false));
}

// 4. Store Screenshot 2: Dual-Engine + WebGL 3D & Macro (1280x800 24-bit RGB PNG)
{
  const c = new CanvasBuf(1280, 800);
  c.fillGradient(9, 14, 30, 28, 22, 68);
  c.drawGrid(40, 139, 92, 246, 0.07);

  drawText(c, 'DUAL ENGINE : CDP TRUSTED + DOM SILENT', 72, 62, 4, 248, 250, 252, 1);
  drawText(c, 'WORKS ON DOM SHADOW DOM 2D CANVAS & WEBGL 3D', 72, 108, 2, 125, 211, 252, 1);

  // Card 1: DOM Selector Tracking
  c.fillRoundedRect(72, 168, 360, 540, 16, 15, 23, 42, 0.95, { r: 6, g: 182, b: 212, a: 0.5 });
  drawText(c, '1. DOM & SHADOW DOM', 98, 198, 2, 56, 189, 248, 1);
  c.fillRoundedRect(102, 260, 300, 74, 12, 8, 145, 178, 1);
  drawText(c, 'CLICK +1  ISTRUSTED=TRUE', 120, 290, 2, 255, 255, 255, 1);
  c.fillRoundedRect(102, 364, 300, 74, 12, 79, 70, 229, 1);
  drawText(c, 'AUTO SCROLL CONTAINER', 120, 394, 2, 255, 255, 255, 1);
  c.fillRoundedRect(102, 468, 300, 190, 12, 10, 18, 34, 1, { r: 148, g: 163, b: 184, a: 0.25 });
  drawText(c, 'SMART SELECTOR LOCKING', 124, 510, 2, 203, 213, 225, 1);
  drawText(c, 'RESILIENT TO RESIZE', 124, 550, 2, 148, 163, 184, 1);

  // Card 2: Canvas Relative Coords
  c.fillRoundedRect(460, 168, 360, 540, 16, 15, 23, 42, 0.95, { r: 168, g: 85, b: 247, a: 0.55 });
  drawText(c, '2. CANVAS PIXEL UI', 488, 198, 2, 216, 180, 254, 1);
  c.fillRoundedRect(490, 256, 300, 320, 12, 6, 10, 24, 1, { r: 168, g: 85, b: 247, a: 0.35 });
  c.fillCircle(640, 416, 62, 6, 182, 212, 0.9);
  c.strokeCircle(640, 416, 92, 4, 168, 85, 247, 0.9);
  drawText(c, 'REL X:0.50 Y:0.50', 514, 616, 2, 226, 232, 240, 1);

  // Card 3: WebGL 3D Interactive
  c.fillRoundedRect(848, 168, 360, 540, 16, 15, 23, 42, 0.95, { r: 244, g: 63, b: 94, a: 0.55 });
  drawText(c, '3. WEBGL 3D & MACRO', 876, 198, 2, 253, 164, 175, 1);
  c.fillRoundedRect(878, 256, 300, 320, 12, 6, 10, 24, 1, { r: 244, g: 63, b: 94, a: 0.35 });
  // Draw 3D wireframe octahedron
  const cx = 1028;
  const cy = 416;
  const top = [cx, cy - 108];
  const bot = [cx, cy + 108];
  const pts = [
    [cx - 96, cy - 12],
    [cx + 18, cy + 36],
    [cx + 98, cy - 14],
    [cx - 16, cy - 42],
  ];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    c.drawLine(top[0], top[1], a[0], a[1], 3, 34, 211, 238, 0.95);
    c.drawLine(bot[0], bot[1], a[0], a[1], 3, 168, 85, 247, 0.95);
    c.drawLine(a[0], a[1], b[0], b[1], 3, 244, 63, 94, 0.95);
  }
  drawText(c, 'ORBIT + ZOOM + RECORD', 898, 616, 2, 226, 232, 240, 1);

  writeFileSync(resolve(outDir, 'screenshot-2-dual-engine-1280x800.png'), encodePng(1280, 800, c.buf, false));
}

console.log('Generated Chrome Web Store & Edge Add-ons visual assets in release/store-assets/');
