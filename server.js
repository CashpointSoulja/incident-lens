import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { researchDomain } from './live-research.js';

const ROOT = new URL('.', import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
export function liveResearchEnabled(env = process.env) {
  return !['0', 'false', 'off'].includes(String(env.LIVE_RESEARCH_ENABLED ?? '').trim().toLowerCase());
}
function sendJson(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }

export default async function handler(req, res) {
  try {
    const requestUrl = new URL(req.url, 'http://x');
    if (requestUrl.pathname === '/api/research') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
      const domain = requestUrl.searchParams.get('domain') || '';
      // Live lookup is on by default; LIVE_RESEARCH_ENABLED=0 is the kill switch.
      if (!liveResearchEnabled()) {
        return sendJson(res, 422, { error: 'Live lookup is switched off right now - pick one of the preloaded examples below.' });
      }
      try { return sendJson(res, 200, await researchDomain(domain)); }
      catch (error) { return sendJson(res, 422, { error: error?.message || 'Live research failed.' }); }
    }
    let p = decodeURIComponent(requestUrl.pathname);
    if (p === '/') p = '/index.html';
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
