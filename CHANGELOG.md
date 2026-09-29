# Changelog

All notable changes to ORBIT are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Until 1.0.0 is released, minor versions may
change the config surface; each such change is listed and how to migrate is noted.

## [Unreleased]

The first release is held back until these are true: the content survives every failure (tested), the
scene lifecycle is safe (tested), CI is green in Chromium, Firefox and WebKit, and the security, accessibility
and performance notes below have been re-checked on real hardware. See "Not yet verified".

### Added

- **Progressive enhancement guarantees.** Content is visible by default; `html.reveal-enabled` is added only
  once the reveal can also run. The scene is a lazy `import()`, so a three.js, CDN, import-map or WebGL failure
  cannot take the page down. `<html data-orbit>` reports the backdrop's state.
- **Adaptive quality.** `low` / `medium` / `high` / `auto` tiers (core detail, particles, DPR ceiling, pixel
  budget, bloom, MSAA) and a frame-time controller that drops after sustained slowness and never oscillates.
  `?quality=`, `window.ORBIT_CONFIG` and a lazy `?debug` diagnostics overlay.
- **Scene controller**: `start`, `stop`, `resize`, `destroy`, `setProgress`, `setSections`, `onPointer`,
  `setQuality`, `stats`. Full cleanup on `destroy()`, WebGL context-loss handling, live `prefers-reduced-motion`
  handling (`reducedMotionScene: 'static' | 'disabled'`), DPR-change and resize coalescing, off-screen pause.
- **Section stages** (`config.sections`): hue, camera distance, core scale and particle rotation per section,
  blended by scroll position; the active section is chosen deterministically.
- **Validated config** with documented ranges; invalid values fall back with a console warning.
- **Accessible mobile menu** (disclosure pattern), `aria-current="location"`, a skip link that moves focus,
  forced-colors, `prefers-contrast` and print styles.
- **Security**: strict CSP and headers for Vercel, Netlify/Cloudflare Pages (`_headers`) and a `<meta>` CSP for
  GitHub Pages, generated and drift-checked by `scripts/security.mjs`.
- **Search and social metadata**: canonical URL, Open Graph and Twitter fields, a 1200x630 `assets/og.png`.
- **Tooling**: npm + Vite (dev server, optimised build), Vitest unit tests, Playwright + axe browser suite,
  ESLint, Prettier, html-validate, `scripts/check-repo.mjs`, `npm run bench` and `npm run weight`.
- **Repository**: CI, Dependabot, contributing and security policies, issue and PR templates,
  `THIRD_PARTY_NOTICES.md`, `docs/PERFORMANCE.md`, `docs/HOSTING.md`.

### Changed

- **three.js 0.160.0 -> 0.186.1, self-hosted** in `vendor/three/` (minified build files, byte-for-byte addons,
  SHA-256 manifest) instead of jsDelivr.
- **Fonts self-hosted** (Space Grotesk, Inter; Latin subset, OFL) instead of Google Fonts.
- The core mesh is **indexed** (6x fewer vertices through the vertex shader for the same picture).
- MSAA only on the buffer the scene pass draws into; the drawing buffer is capped by a per-tier pixel budget.
- Easing is frame-rate independent; no colour conversion or allocation per frame.
- The progress bar animates `transform` instead of `width`.
- README claims now match what is tested: the "AA contrast" and "complete reduced-motion path" wording is gone.

**Migrating the config from the first commit**

| Was                             | Now                                      |
| ------------------------------- | ---------------------------------------- |
| `core.detail`                   | `quality.profiles.<tier>.coreDetail`     |
| `particles.count`               | `quality.profiles.<tier>.particles`      |
| `camera.zStart` / `camera.zEnd` | `sections.<name>.cameraZ`                |
| `grade.<name>`                  | `sections.<name>.hue`                    |
| `core.wireframeMix`             | removed (it never did anything)          |
| `vignette`                      | same meaning, now validated to 0.1 - 2.5 |

Scene API: `scene.setSectionHue()` and `scene.reduceMotion` are gone (`setSections()` and `stats()` /
`state` replace them); `createScene(canvas, options)` takes `{ config, hints, onState, onQuality }`.

### Fixed

- **Blank page if the module graph or the CDN failed**: `.reveal` was `opacity: 0` in the base CSS and
  `initReveal()` ran after three.js was imported.
- **Reversed `smoothstep()` edges** in the particle and vignette shaders (undefined in GLSL).
- **Wrong licence note** on the embedded simplex noise ("public-domain"): it is Ashima Arts' MIT-licensed code,
  now attributed with its full notice.
- **Placeholder contact address** (`hello@example.com`) removed from the demo.
- **Reduced motion**: the still frame is re-rendered on resize/orientation change and the preference is
  watched while the page is open.
- **Resize/DPR**: the pixel ratio was captured once; now recomputed and applied to renderer, composer and
  particles, and only when something changed.
- Section highlighting never fired for sections taller than two viewports; blocks in the bottom 8% of the
  viewport (the hero's scroll cue) were never revealed; particle sizes could balloon near the camera.
- Removed unused variables and dead config.

### Security

- Enforced Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Frame-Options`, `Cross-Origin-Opener-Policy` and HSTS; no third-party requests remain.
- Vendored dependency integrity checks, exact version pinning, lockfile, `npm audit` and Dependabot in CI.

### Not yet verified

- Firefox and WebKit have not been run yet (they run in CI); only Chromium with software WebGL has been
  exercised locally.
- Performance was measured on a software rasteriser only (see docs/PERFORMANCE.md); no real-GPU or
  real-device numbers exist yet.
- No manual screen-reader pass has been done.
