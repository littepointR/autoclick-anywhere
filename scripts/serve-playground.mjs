import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');
const port = Number(process.env.PORT ?? 4173);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0];
  const relPath = urlPath === '/' ? 'playground.html' : urlPath.replace(/^\/+/, '');
  const fullPath = resolve(distDir, relPath);

  if (!fullPath.startsWith(distDir) || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found. Run `npm run build` first.');
    return;
  }

  const ext = extname(fullPath);
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' });
  createReadStream(fullPath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Playground server listening on http://127.0.0.1:${port}/playground.html`);
});
