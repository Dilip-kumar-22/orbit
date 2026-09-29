#!/usr/bin/env node
// Frame-rate benchmark. Loads the page in a fresh browser context per target and measures how fast
// requestAnimationFrame runs, together with what ORBIT reports (tier, DPR, particles, vertices...).
//
//   npm run bench                                   every quality tier, 1280x800 @ 1x, 10 s each
//   npm run bench -- --width 1440 --height 900 --dpr 2 --seconds 20
//   npm run bench -- --url http://localhost:8080/   any other page (only frame timing is available)
//   npm run bench -- --native                       use the machine's GPU instead of software WebGL
//
// Headless Chromium without --native renders WebGL on the CPU (SwiftShader): the numbers are only
// good for comparing configurations with each other, never as absolute GPU performance.
import { chromium } from '@playwright/test';
import { startServer } from './serve.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const seconds = Number(arg('seconds', 10));
const viewport = { width: Number(arg('width', 1280)), height: Number(arg('height', 800)) };
const dpr = Number(arg('dpr', 1));
const tiers = arg('tiers', 'low,medium,high').split(',');
const warmup = Number(arg('warmup', 5));

const server = flag('url') || arg('url') ? null : await startServer({ port: 0, headers: false });
const base = arg('url') ?? `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.ORBIT_CHROMIUM || undefined,
  args: flag('native')
    ? []
    : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'],
});

async function measure(label, url) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForTimeout(warmup * 1000);
  const times = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const stamps = [];
        const start = performance.now();
        const tick = (now) => {
          stamps.push(now);
          if (now - start < ms) requestAnimationFrame(tick);
          else resolve(stamps);
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
  const s = await page.evaluate(() => window.orbit?.stats() ?? null);
  await context.close();
  const dt = times
    .slice(1)
    .map((t, i) => t - times[i])
    .sort((a, b) => a - b);
  const mean = dt.reduce((sum, v) => sum + v, 0) / dt.length;
  const pct = (p) => dt[Math.min(dt.length - 1, Math.floor(dt.length * p))];
  return { label, frames: times.length, fps: 1000 / mean, mean, p50: pct(0.5), p95: pct(0.95), stats: s };
}

const results = [];
if (arg('url')) results.push(await measure('custom', base));
else for (const tier of tiers) results.push(await measure(tier, `${base}?debug&quality=${tier}`));
await browser.close();
server?.close();

const MB = 1024 * 1024;
console.log(
  `\n${viewport.width}x${viewport.height} @ ${dpr}x, ${seconds} s per target, ${flag('native') ? 'native GPU' : 'software WebGL (SwiftShader)'}\n`,
);
console.log(
  '| target | fps | mean ms | p50 ms | p95 ms | tier | buffer | particles | core vertices | msaa | est. targets |',
);
console.log('| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |');
for (const r of results) {
  const s = r.stats;
  console.log(
    `| ${r.label} | ${r.fps.toFixed(1)} | ${r.mean.toFixed(0)} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} | ${s?.tier ?? '-'} | ${s ? `${s.width}x${s.height} (${s.dpr.toFixed(2)}x)` : '-'} | ${s?.particles ?? '-'} | ${s?.coreVertices ?? '-'} | ${s?.msaa ?? '-'} | ${s ? `${(s.targetBytes / MB).toFixed(0)} MB` : '-'} |`,
  );
}
