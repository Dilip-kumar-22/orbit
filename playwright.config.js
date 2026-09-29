import { defineConfig, devices } from '@playwright/test';

// What the e2e suite runs against:
//   ORBIT_TARGET=src   (default) the source tree exactly as a consumer clones it, served by scripts/serve.mjs
//   ORBIT_TARGET=dist  the `npm run build` output, served by `vite preview`
// Browsers: ORBIT_BROWSERS=chromium,firefox,webkit (default: chromium). CI runs all three.
// ORBIT_CHROMIUM=/path/to/chrome uses an existing Chromium instead of Playwright's own download.
const target = process.env.ORBIT_TARGET === 'dist' ? 'dist' : 'src';
const port = Number(process.env.ORBIT_PORT ?? (target === 'dist' ? 4174 : 4173));
const wanted = (process.env.ORBIT_BROWSERS ?? 'chromium').split(',').map((s) => s.trim());

// Headless Chromium has no GPU: use SwiftShader so WebGL exists (slow, but real WebGL2).
const chromiumLaunch = {
  args: [
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--ignore-gpu-blocklist',
  ],
  ...(process.env.ORBIT_CHROMIUM && { executablePath: process.env.ORBIT_CHROMIUM }),
};

const projects = {
  chromium: { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch } },
  firefox: { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  webkit: { name: 'webkit', use: { ...devices['Desktop Safari'] } },
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: Number(process.env.ORBIT_WORKERS ?? (process.env.CI ? 2 : 1)),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: wanted.map((name) => projects[name]).filter(Boolean),
  webServer: {
    command:
      target === 'dist'
        ? `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`
        : `node scripts/serve.mjs --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
