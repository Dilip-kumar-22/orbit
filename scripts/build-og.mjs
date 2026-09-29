#!/usr/bin/env node
// Renders assets/og.svg (the artwork) to assets/og.png, the 1200x630 social preview that Open Graph and
// Twitter cards use (most crawlers do not render SVG). The site's own fonts are loaded so the text
// matches. Run `npm run build:og` after editing the SVG.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './headers.mjs';
import { withBrowser } from './browser.mjs';

const svg = readFileSync(join(ROOT, 'assets', 'og.svg'), 'utf8');
const page = `<!DOCTYPE html><meta charset="utf-8"><style>
@font-face { font-family: 'Space Grotesk'; font-weight: 300 700; src: url('/assets/fonts/space-grotesk-latin-wght-normal.woff2') format('woff2'); }
@font-face { font-family: 'Inter'; font-weight: 100 900; src: url('/assets/fonts/inter-latin-wght-normal.woff2') format('woff2'); }
html, body { margin: 0; background: #0d0c1c; } svg { display: block; width: 1200px; height: 630px; }
</style>${svg}`;

await withBrowser(async ({ browser, origin }) => {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await tab.route('**/__og.html', (route) => route.fulfill({ contentType: 'text/html', body: page }));
  await tab.goto(`${origin}/__og.html`);
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({
    path: join(ROOT, 'assets', 'og.png'),
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });
});
console.log('wrote assets/og.png (1200x630)');
