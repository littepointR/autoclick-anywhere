import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(rootDir, 'src/background/service-worker.ts')],
    outfile: resolve(distDir, 'service-worker.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome114',
    sourcemap: false,
  }),
  build({
    entryPoints: [resolve(rootDir, 'src/content/index.ts')],
    outfile: resolve(distDir, 'content.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome114',
    sourcemap: false,
  }),
  build({
    entryPoints: [resolve(rootDir, 'src/popup/popup.ts')],
    outfile: resolve(distDir, 'popup.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome114',
    sourcemap: false,
  }),
  build({
    entryPoints: [resolve(rootDir, 'src/playground/playground.ts')],
    outfile: resolve(distDir, 'playground.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome114',
    sourcemap: false,
  }),
]);

cpSync(resolve(rootDir, 'public/manifest.json'), resolve(distDir, 'manifest.json'));
cpSync(resolve(rootDir, 'public/icons'), resolve(distDir, 'icons'), { recursive: true });
cpSync(resolve(rootDir, 'src/popup/popup.html'), resolve(distDir, 'popup.html'));
cpSync(resolve(rootDir, 'src/popup/popup.css'), resolve(distDir, 'popup.css'));
cpSync(resolve(rootDir, 'src/playground/playground.html'), resolve(distDir, 'playground.html'));
cpSync(resolve(rootDir, 'src/playground/playground.css'), resolve(distDir, 'playground.css'));

console.log('Built AutoClick Anywhere extension into dist/');
