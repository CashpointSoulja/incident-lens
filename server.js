import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export default async function handler(req, res) {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    // Fixtures and the product knowledge base live in /data (one source of truth, also read by scripts).
    const base = p.startsWith('/data/') ? ROOT : join(ROOT, 'public');
    const file = normalize(join(base, p));
    if (!file.startsWith(join(ROOT, 'public')) && !file.startsWith(join(ROOT, 'data'))) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  createServer(handler).listen(process.env.PORT || 3000, () => console.log('incident-lens on :' + (process.env.PORT || 3000)));
}
