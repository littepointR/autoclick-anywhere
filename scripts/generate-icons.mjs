import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

// Precompute CRC32 lookup table for PNG chunk encoding
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

function encodePngRgba(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type None
    pixels.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp(v, lo = 0, hi = 255) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function blendPixel(buf, idx, r, g, b, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  if (a <= 0) return;
  const oldA = buf[idx + 3] / 255;
  const outA = a + oldA * (1 - a);
  if (outA <= 0) return;
  buf[idx] = clamp((r * a + buf[idx] * oldA * (1 - a)) / outA);
  buf[idx + 1] = clamp((g * a + buf[idx + 1] * oldA * (1 - a)) / outA);
  buf[idx + 2] = clamp((b * a + buf[idx + 2] * oldA * (1 - a)) / outA);
  buf[idx + 3] = clamp(outA * 255);
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size * 0.22;
  const margin = size * 0.04;

  // Rounded dark background card with subtle gradient
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = Math.max(0, Math.abs(x - cx) - (size / 2 - margin - radius));
      const dy = Math.max(0, Math.abs(y - cy) - (size / 2 - margin - radius));
      const dist = Math.hypot(dx, dy) - radius;
      const aa = Math.max(0, Math.min(1, 0.7 - dist));
      if (aa > 0) {
        const t = (x + y) / (2 * size);
        const bgR = 13 + t * 14;
        const bgG = 19 + t * 16;
        const bgB = 36 + t * 28;
        blendPixel(pixels, idx, bgR, bgG, bgB, aa);

        // Subtle border highlight
        if (dist > -size * 0.055 && dist < 0.5) {
          blendPixel(pixels, idx, 56, 189, 248, aa * 0.45);
        }
      }
    }
  }

  // Concentric cyan/violet target rings around upper-left center
  const targetX = size * 0.44;
  const targetY = size * 0.44;
  const outerR = size * 0.27;
  const innerR = size * 0.14;
  const strokeW = Math.max(1.1, size * 0.055);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const d = Math.hypot(x - targetX, y - targetY);
      const outerDiff = Math.abs(d - outerR);
      if (outerDiff < strokeW) {
        const alpha = Math.max(0, Math.min(1, 1 - outerDiff / strokeW));
        blendPixel(pixels, idx, 6, 182, 212, alpha * 0.95);
      }
      const innerDiff = Math.abs(d - innerR);
      if (innerDiff < strokeW * 0.85) {
        const alpha = Math.max(0, Math.min(1, 1 - innerDiff / (strokeW * 0.85)));
        blendPixel(pixels, idx, 139, 92, 246, alpha * 0.95);
      }
      if (d < size * 0.055) {
        blendPixel(pixels, idx, 34, 211, 238, 1);
      }
    }
  }

  // Crisp cursor pointer polygon pointing to the target center
  const cursorPoly = [
    [size * 0.45, size * 0.45],
    [size * 0.54, size * 0.84],
    [size * 0.64, size * 0.69],
    [size * 0.80, size * 0.83],
    [size * 0.87, size * 0.76],
    [size * 0.71, size * 0.62],
    [size * 0.85, size * 0.53],
  ];

  // Supersampled cursor rendering for anti-aliasing
  const ss = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss - 0.5;
          const py = y + (sy + 0.5) / ss - 0.5;
          if (pointInPolygon(px, py, cursorPoly)) hits++;
        }
      }
      if (hits > 0) {
        const idx = (y * size + x) * 4;
        blendPixel(pixels, idx, 248, 250, 252, hits / (ss * ss));
      }
    }
  }

  return encodePngRgba(size, size, pixels);
}

for (const size of [16, 32, 48, 128]) {
  const png = drawIcon(size);
  writeFileSync(resolve(outDir, `icon${size}.png`), png);
}

console.log('Generated PNG icons in public/icons/');
