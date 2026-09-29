// Shared by the asset scripts: a headless Chromium with software WebGL, from Playwright or from
// ORBIT_CHROMIUM=/path/to/chrome, plus the static server for the source tree.
import { chromium } from '@playwright/test';
import { startServer } from './serve.mjs';

export async function withBrowser(work, { headers = false } = {}) {
  const server = await startServer({ port: 0, headers });
  const browser = await chromium.launch({
    executablePath: process.env.ORBIT_CHROMIUM || undefined,
    args: [
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--use-gl=angle',
      '--ignore-gpu-blocklist',
    ],
  });
  try {
    return await work({ browser, origin: `http://127.0.0.1:${server.address().port}` });
  } finally {
    await browser.close();
    server.close();
  }
}
