# Contributing to ORBIT

Thanks for helping. ORBIT is deliberately small: a reader should understand it from `index.html`,
`src/config.js` and the README. Changes that make the fundamentals more correct, accessible, fast or easy
to customise are very welcome. Changes that add a framework, a runtime dependency, telemetry, or a build
step that consumers must run will not be accepted.

## Ground rules

- **Semantic HTML first, three.js second.** Content must stay visible and usable without JavaScript, without
  WebGL and without three.js. If you touch the scene, reveals or navigation, add or extend a test in
  `tests/e2e/resilience.spec.js`.
- **No runtime network requests, no new runtime dependencies.** The CSP (`connect-src 'none'`) enforces the
  first; talk to us before adding the second.
- **Claims must be true.** The README and docs say what tests or measurements back, and no more. If you
  change behaviour, change the words with it.
- **Config values have a documented range** in `src/settings.js`, or they are not config.
- Style is Prettier and ESLint (`npm run format`, `npm run lint`).

## Setup

You need Node 22.22 or newer (`.nvmrc`) and npm.

```bash
git clone https://github.com/Dilip-kumar-22/orbit && cd orbit
npm ci
npm start        # serve the source tree, exactly what a consumer gets
npm run dev      # or the Vite dev server with hot reload
```

## Before you push

```bash
npm run verify     # eslint, prettier, html-validate, repo checks, vendor + header drift, unit tests
npm run test:e2e   # browser suite against the source tree
```

The e2e suite needs a browser: `npx playwright install chromium` (add `firefox webkit` for the rest, and
`ORBIT_BROWSERS=chromium,firefox,webkit`). Headless Chromium has no GPU, so the suite uses software WebGL
and pins `?quality=low` where speed matters. If you already have a Chromium, point at it with
`ORBIT_CHROMIUM=/path/to/chrome`. After `npm run build`, `ORBIT_TARGET=dist npm run test:e2e` runs the same
suite against the optimised build. CI runs both, in three browsers.

Useful while working: `?debug` on the page shows live diagnostics, and `npm run bench` compares quality tiers.

## Generated files

Some files are generated. Edit their source and regenerate; CI fails if they drift.

| File                                        | Source                    | Regenerate              |
| ------------------------------------------- | ------------------------- | ----------------------- |
| `vendor/three/**`                           | `three` in `package.json` | `npm run vendor`        |
| `vercel.json`, `_headers`, the `<meta>` CSP | `scripts/security.mjs`    | `npm run security:sync` |
| `assets/og.png`                             | `assets/og.svg`           | `npm run build:og`      |
| `assets/screenshot-*.jpg`                   | the running site          | `npm run screenshots`   |

### Updating three.js

```bash
npm install three@X.Y.Z --save-exact
npm run vendor          # copies, minifies and hashes what ORBIT loads into vendor/three/
npm run verify && npm run test:e2e
```

Commit `package.json`, `package-lock.json` and `vendor/three/`, and note the new version in
`THIRD_PARTY_NOTICES.md` and `CHANGELOG.md`. A Dependabot PR for three.js will fail `vendor:check` until you
run `npm run vendor` on its branch: that failure is the point, it means a human reviewed the vendored diff.

## Commits and pull requests

- Small, focused commits with a conventional prefix (`fix:`, `feat:`, `perf:`, `docs:`, `test:`, `build:`,
  `security:`, `chore:`) and a body that explains why. Commit messages are human-written and carry no
  tool-attribution trailers; `npm run check:history` (part of CI) enforces that.
- Open a PR against `main` and fill in the template. Keep it to one concern.

## Maintainers

Settings that live outside the repository and cannot be set by a commit:

- **Branch protection on `main`**: require pull requests, require the `CI` checks (`verify`, `audit` and the
  `e2e` matrix) to pass, block force pushes.
- **Security**: enable _Private vulnerability reporting_ (the link in `SECURITY.md` needs it), Dependabot
  alerts, _Secret scanning_ and _Push protection_.
- **About box**: set the website to the live demo and add the topics `threejs`, `webgl`, `3d`,
  `scrollytelling`, `portfolio`, `landing-page`, `starter-template` and `creative-development`.
- **Pages**: if you deploy the optimised build, switch the source to GitHub Actions (see
  [docs/HOSTING.md](docs/HOSTING.md)).

Releases: stay on 0.x until the stable criteria in the changelog are met. To release, update
`CHANGELOG.md`, bump `package.json`, tag `vX.Y.Z`, and attach `dist/` (zipped) and the source archive.
