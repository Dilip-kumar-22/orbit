#!/usr/bin/env node
// Zero-dependency static server for the ORBIT source tree: `npm start`, and what the e2e tests run
// against. It serves the repo as-is (no bundler) and applies the headers from vercel.json.
//
//   node scripts/serve.mjs [--port 4173] [--host 127.0.0.1] [--root .] [--no-headers]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { ROOT, securityHeaders } from './headers.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

export function startServer({ root = ROOT, port = 4173, host = '127.0.0.1', headers = true } = {}) {
  const base = resolve(root);
  const extra = headers ? securityHeaders(base) : {};

  const server = createServer((req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, ...extra });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');

    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      return send(400, 'Bad request');
    }
    let file = normalize(join(base, path));
    const rel = file.slice(base.length + 1);
    // Never serve outside the root, dotfiles/dot-directories (.git, ...) or dependencies.
    if (file !== base && !file.startsWith(base + sep)) return send(403, 'Forbidden');
    if (rel.split(sep).some((part) => part.startsWith('.') || part === 'node_modules')) return send(404, 'Not found');
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) || !statSync(file).isFile()) return send(404, 'Not found');

    const stat = statSync(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      ...extra,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });

  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => done(server));
  });
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const port = Number(arg('port', 4173));
  const host = arg('host', '127.0.0.1');
  const server = await startServer({ root: arg('root', ROOT), port, host, headers: !process.argv.includes('--no-headers') });
  const { address, port: bound } = server.address();
  console.log(`ORBIT  http://${address === '::' ? 'localhost' : address}:${bound}/   (Ctrl+C to stop)`);
}
