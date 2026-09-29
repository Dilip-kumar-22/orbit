import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../../scripts/serve.mjs';

// The static server ships to consumers (`npm start`) and runs the e2e suite: it must never serve
// anything outside the site, and it must apply the security headers.
let server;
let port;
beforeAll(async () => {
  server = await startServer({ port: 0 });
  port = server.address().port;
});
afterAll(() => server.close());

// Raw request: fetch() would normalise dot segments before they reach the server.
const raw = (path, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });

describe('serving the site', () => {
  it('serves index.html at / with the security headers', async () => {
    const res = await raw('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toContain('<title>ORBIT');
  });

  it.each([
    ['/src/app.js', 'text/javascript; charset=utf-8'],
    ['/styles/main.css', 'text/css; charset=utf-8'],
    ['/assets/favicon.svg', 'image/svg+xml'],
    ['/assets/og.png', 'image/png'],
    ['/assets/fonts/inter-latin-wght-normal.woff2', 'font/woff2'],
    ['/vendor/three/manifest.json', 'application/json; charset=utf-8'],
  ])('%s is served as %s (module scripts need a JavaScript MIME type)', async (path, type) => {
    const res = await raw(path);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(type);
  });

  it('answers HEAD without a body and rejects other methods', async () => {
    const head = await raw('/', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect((await raw('/', 'POST')).status).toBe(405);
    expect((await raw('/', 'DELETE')).status).toBe(405);
  });

  it('returns 404 (with the headers) for what does not exist, and for directories without an index', async () => {
    for (const path of ['/nope.html', '/assets/', '/src']) {
      const res = await raw(path);
      expect(res.status, path).toBe(404);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('ignores the query string', async () => {
    expect((await raw('/index.html?x=1#y')).status).toBe(200);
  });
});

describe('what it must never serve', () => {
  it.each(['/.git/config', '/.gitignore', '/.github/workflows/ci.yml', '/node_modules/three/package.json'])(
    '%s',
    async (path) => {
      expect((await raw(path)).status).toBe(404);
    },
  );

  it.each([
    '/..%2f..%2fetc%2fpasswd',
    '/..%2fpackage.json',
    '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/assets/..%2f..%2f..%2fetc%2fpasswd',
    '/..%5c..%5cetc%5cpasswd',
  ])('path traversal %s', async (path) => {
    const res = await raw(path);
    expect([403, 404]).toContain(res.status);
    expect(res.body).not.toContain('root:');
    expect(res.body).not.toContain('"name": "orbit"');
  });

  it('null bytes and malformed escapes', async () => {
    expect([400, 404]).toContain((await raw('/index.html%00.png')).status);
    expect((await raw('/%E0%A4%A')).status).toBe(400);
  });
});
