// Tiny static server for the MOCK portal. Binds 127.0.0.1 only. Usage: node mock-portal/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** `log` receives every request, so a test can prove the extension never called a portal endpoint. */
export function startMockPortal(port = 4318, log = []) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    log.push({ method: req.method, path: url.pathname });
    const name = url.pathname === '/' ? 'spice-a.html' : path.basename(url.pathname);
    if (!/^[\w.-]+\.(html|js|css)$/.test(name)) {
      res.writeHead(404).end('not found');
      return;
    }
    try {
      const body = await readFile(path.join(root, name));
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.argv[2] ?? 4318);
  await startMockPortal(port);
  console.log(`MOCK portal on http://127.0.0.1:${port}/spice-a.html (drift: /spice-a-drift.html, Part B: /spice-b.html)`);
}
