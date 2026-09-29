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
      // The import map and the modulepreload hints only serve the un-bundled source tree;
      // a build resolves `three` from node_modules itself.
      handler: (html) =>
        html
          .replace(/[ \t]*<script type="importmap">[\s\S]*?<\/script>\n?/, '')
          .replace(/[ \t]*<link rel="modulepreload"[^>]*data-source-only[^>]*>\n?/g, ''),
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

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [orbit()],
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  preview: { headers: securityHeaders() },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
