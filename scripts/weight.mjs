#!/usr/bin/env node
// What a visitor downloads: loads the page in headless Chromium and totals every response, raw, gzip
// (level 9) and brotli (default). Sizes are what a compressing host would send.
//
//   npm run weight              the source tree (what `npm start` and GitHub Pages serve)
//   npm run weight -- --dist    the `npm run build` output (build it first)
import { existsSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from './headers.mjs';
import { startServer } from './serve.mjs';
import { chromium } from '@playwright/test';

const dist = process.argv.includes('--dist');
const root = dist ? join(ROOT, 'dist') : ROOT;
if (!existsSync(root)) throw new Error('dist/ does not exist: run `npm run build` first');

const server = await startServer({ root, port: 0, headers: false });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.ORBIT_CHROMIUM || undefined,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const rows = [];
page.on('response', async (res) => {
  const body = await res.body().catch(() => null);
  if (!body) return;
  rows.push({
    url: res.url().replace(base, ''),
    raw: body.length,
    gzip: gzipSync(body, { level: 9 }).length,
    brotli: brotliCompressSync(body).length,
  });
});
await page.goto(`${base}/?quality=low`);
await page.waitForFunction(() => document.documentElement.dataset.orbit === 'running', null, {
  timeout: 90_000,
});
await page.waitForTimeout(500);
await browser.close();
server.close();

const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
const total = (list, key) => list.reduce((sum, r) => sum + r[key], 0);
const js = rows.filter((r) => r.url.endsWith('.js'));
const rest = rows.filter((r) => !r.url.endsWith('.js'));
console.log(`\n${dist ? 'dist/ (npm run build)' : 'source tree'}: ${rows.length} requests\n`);
console.log('| group | files | raw | gzip | brotli |\n| --- | ---: | ---: | ---: | ---: |');
for (const [name, list] of [
  ['JavaScript', js],
  ['HTML, CSS, fonts, images', rest],
  ['total', rows],
]) {
  console.log(
    `| ${name} | ${list.length} | ${kib(total(list, 'raw'))} | ${kib(total(list, 'gzip'))} | ${kib(total(list, 'brotli'))} |`,
  );
}
console.log('\nlargest scripts:');
for (const r of [...js].sort((a, b) => b.raw - a.raw).slice(0, 5))
  console.log(`  ${r.url.padEnd(48)} ${kib(r.raw)} raw, ${kib(r.gzip)} gzip`);
