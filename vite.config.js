// Maintainer tooling only. ORBIT itself is plain static files: the source tree runs as-is with any
// static server (see `npm start`). Vite adds a dev server, an optimised `dist/` build (tree-shaken,
// minified, hashed assets) and the unit-test runner - nothing consumers need to understand.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';
import { securityHeaders } from './scripts/headers.mjs';

// Referenced by absolute URL / never imported by a module, but a deployment still needs them.
const COPY_TO_DIST = ['assets/og.png', 'THIRD_PARTY_NOTICES.md', 'LICENSE', '_headers'];

function orbit() {
  return {
    name: 'orbit',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      // The import map only serves the un-bundled source tree; a build resolves `three` from node_modules.
      handler: (html) =>
        html.replace(
          /[ \t]*<!-- Resolves `three`[^>]*-->\n[ \t]*<script type="importmap">[\s\S]*?<\/script>\n?/,
          '',
        ),
    },
    writeBundle(options) {
      for (const file of COPY_TO_DIST) {
        if (!existsSync(file)) continue;
        const target = join(options.dir, file);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(file, target);
      }
    },
  };
}

// The dev server's HMR client talks over a WebSocket and injects a little inline code, which the page's
// own CSP (a <meta> tag, see scripts/security.mjs) would block. The policy is for deployments, so the dev
// server serves the page without it.
function orbitDev() {
  return {
    name: 'orbit-dev',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace(/[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, ''),
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [orbit(), orbitDev()],
  // three.js is most of the lazy scene chunk (~560 kB, ~140 kB gzip after tree-shaking); it is not on the critical path.
  // assetsInlineLimit 0: Vite inlines assets under 4 kB as data: URLs, which the CSP (img-src 'self') refuses.
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 650,
  },
  preview: { headers: securityHeaders() },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
