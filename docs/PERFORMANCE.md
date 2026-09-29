# Performance

ORBIT draws a decorative 3D backdrop behind real HTML. The HTML never waits for it, and the backdrop
adapts to the device it runs on. This page explains how, what the numbers are and where they come from.

## What loads, and when

| Stage                                     | Source tree (`npm start`, GitHub Pages from `/`)         | `npm run build` (`dist/`)                             |
| ----------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Critical path: HTML, CSS, fonts, `app.js` | 8 unminified modules, 33 KiB of JS                       | 14.2 KiB JS, 6.0 KiB gzip                             |
| 3D backdrop (lazy, only if WebGL works)   | three.js (885 KiB minified) + scene + addons, 17 files   | one 546 KiB chunk, 136 KiB gzip                       |
| Whole page, measured in a browser         | 31 requests: 1,097 KiB raw, 318 KiB gzip, 273 KiB brotli | 8 requests: 654 KiB raw, 219 KiB gzip, 193 KiB brotli |

Reproduce with `npm run weight` (source tree) and `npm run weight -- --dist`: they load the page in
headless Chromium and total every response, compressed with gzip level 9 and default brotli. The fonts
are two self-hosted variable woff2 files (70 KiB together) and are included. Nothing is requested from
another origin.

three.js is not on the critical path: the scene is a dynamic `import()` that starts after the content
and navigation are running, and it is never requested when WebGL is unavailable or the visitor prefers
reduced motion and `reducedMotionScene` is `'disabled'` (both are tested).

The build tree-shakes three.js, so the whole 3D graph is about 40% smaller than the vendored files it
replaces, raw and gzipped, and arrives in one request instead of 17. Deploy `dist/` when you can; the
source tree is the zero-build path and stays supported.

## Quality tiers

`quality.level` in `src/config.js` is `'auto'`, `'low'`, `'medium'` or `'high'`. Each tier is a profile:

| Tier   | Core mesh vertices | Particles | DPR ceiling | Pixel budget | Bloom | MSAA |
| ------ | -----------------: | --------: | ----------: | -----------: | :---: | :--: |
| low    |              2,892 |     2,500 |         1.0 |        1.6 M |  off  |  0   |
| medium |             10,892 |     5,000 |         1.5 |        2.6 M |  on   |  0   |
| high   |             42,252 |     8,000 |         2.0 |        4.0 M |  on   |  4   |

The pixel budget caps the drawing buffer regardless of screen size: a 1440x900 window on a 2x display
would be 5.2 M pixels, so `high` renders it at 1.76x (2529x1581, 4.0 M) and `medium` at 1.42x. The
post-processing stack keeps several float buffers alive, so memory scales with pixels, not with CSS size.

Estimated buffer memory for that window (arithmetic from the buffer formats, not a measurement):

| Configuration                                     | Estimated buffers |
| ------------------------------------------------- | ----------------: |
| Original: 4x MSAA on both composer targets, DPR 2 |           ~620 MB |
| `high`                                            |            272 MB |
| `medium`                                          |             68 MB |
| `low`                                             |             25 MB |

The original allocated the multisampled half-float target twice (both composer buffers were clones), and
never limited the pixel count. Now only the buffer the scene pass draws into is multisampled.

### The core mesh is indexed

three.js' `IcosahedronGeometry` is non-indexed, so a corner shared by six triangles is uploaded and run
through the vertex shader six times, and the core's vertex shader runs two simplex-noise evaluations
per vertex. `src/geometry.js` builds the same subdivision with shared vertices: at the top tier that is
42,252 vertex-shader invocations per frame instead of 253,500 (6.0x fewer), for an identical picture,
since the displacement only depends on a vertex's direction.

## How `auto` decides

1. **Starting tier**, from static hints only: viewport and DPR (large back buffers start lower), a coarse
   pointer (phones and tablets start one tier lower), `navigator.deviceMemory` and
   `hardwareConcurrency` where the browser exposes them, the data-saver preference, and whether WebGL is
   backed by real hardware (`failIfMajorPerformanceCaveat`). No user-agent strings.
2. **Measured frame time is the judge.** Frames are grouped into one-second blocks. Two slow blocks in a
   row (mean above 24 ms, about 42 fps) drop a tier; a mean above 45 ms drops one at once; above 90 ms
   drops to the lowest. Stalls over 250 ms (tab switches, garbage collection, shader compiles) and the
   30 frames after every change are ignored.
3. **It can climb, once.** While frames stay under 18.5 ms for eight seconds and no tier has failed yet,
   it tries one tier higher. **After the first drop it never climbs again**, so quality cannot oscillate.
4. **A floor.** If even `low` stays under about 16 fps for four seconds, the animation pauses on a still
   frame (`html[data-orbit="static"]`) instead of burning the CPU. This is what happens on software
   WebGL.

`?debug` shows all of this live (state, fps, tier and ceiling, buffer size, particles, vertices, MSAA,
estimated buffer memory, GPU name), and exposes `window.orbit` for the console.

The pure parts (`pickInitialTier`, `computeRenderSize`, the controller) are in `src/quality.js` and are
unit-tested with synthetic frame streams, including "does not oscillate" and "ignores stalls".

## Measured

`npm run bench` loads the page once per configuration in a fresh browser context and records
`requestAnimationFrame` intervals. These numbers were taken in a sandbox with **no GPU**: headless
Chromium rendering WebGL on the CPU (SwiftShader). Treat them as a comparison of configurations
against each other, not as the frame rates you will see on a GPU.

`1280x800`, DPR 1, 10 s per row (the "original" row is the first commit's scene code running on the same
three.js build, so the comparison isolates ORBIT's changes):

| Configuration         | fps | mean frame | p95 frame |
| --------------------- | --: | ---------: | --------: |
| Original              | 1.7 |     605 ms |   1150 ms |
| `high` (same content) | 2.3 |     443 ms |    867 ms |
| `medium`              | 4.3 |     231 ms |    417 ms |
| `low`                 | 8.6 |     116 ms |    217 ms |

`1440x900`, DPR 2 (what a 13" laptop reports):

| Configuration | Drawing buffer | fps | mean frame |
| ------------- | -------------- | --: | ---------: |
| Original      | 2880x1800      | 0.4 |    2446 ms |
| `high`        | 2529x1581      | 0.6 |    1600 ms |
| `medium`      | 2039x1274      | 2.0 |     501 ms |
| `low`         | 1440x900       | 7.1 |     142 ms |

Same content, the top tier renders ~35% faster at 1x and ~1.5x faster at 2x than the original (the
indexed mesh and the single multisampled buffer). The lower tiers are what make a low-power device usable.

The software rasteriser is dominated by pixel work, so these ratios overstate what the vertex savings do
on a real GPU, where the pixel budget and MSAA changes matter most on integrated GPUs and phones. Run
`npm run bench -- --native` on the hardware you care about; that is the number to trust.

## Tuning

- Force a tier for everyone: `quality: { level: 'medium' }` in `src/config.js`, or try it from the address
  bar with `?quality=low`.
- Change what a tier costs: edit `quality.profiles`. Particle count is the cheapest lever for fill rate,
  `maxPixels` for memory, `coreDetail` for vertex work.
- Pause the scene entirely for reduced-motion visitors: `reducedMotionScene: 'disabled'`.
