# ORBIT

**A free, open-source 3D scrollytelling website starter.** Fork it, edit the content + one config file, and deploy a cinematic, scroll-driven portfolio or product landing that actually feels alive - and stays fast and accessible.

> *"Scroll through a quiet galaxy of your work."*

**[Live demo](https://dilip-kumar-22.github.io/orbit/)** - **[Source](https://github.com/Dilip-kumar-22/orbit)** - MIT licensed, zero build.

- **Real 3D, behind real text** - a custom curl-noise core + an 8k-point particle galaxy + bloom and a film grade, layered *under* selectable, crawlable HTML.
- **Smooth, never scrolljacked** - native scroll drives an eased camera, so it feels buttery while staying fully keyboard- and screen-reader-accessible.
- **One dependency** - just [three.js](https://threejs.org) from a CDN. No build step, no framework, no bundler.
- **Fast + considerate** - capped DPR, the render loop pauses when the tab/canvas is hidden, and a complete `prefers-reduced-motion` path.

## Quick start

It is a static site - there is nothing to build.

```bash
git clone https://github.com/Dilip-kumar-22/orbit
cd orbit
# any static server works:
npx serve .
#   or: python -m http.server
#   or just open index.html (some browsers block ES modules on file://, so a server is safest)
```

Open the printed URL and scroll.

## Make it yours (about 5 minutes)

1. **Content** -> edit `index.html`. The hero copy, the About text, the Work cards, Capabilities, and Contact are all plain, semantic HTML. Add a Work card by copying one `<li class="card reveal">` block.
2. **The 3D look** -> edit `src/config.js`. Colors are authored in **OKLCH** (perceptual), plus the particle count, bloom, camera dolly, and the per-section hue grade. Lower `particles.count` to ~3000 for weak GPUs.
3. **Brand color** -> change `--accent-a` / `--accent-b` in `styles/main.css` (and the matching `coreA`/`coreB` in `config.js`).

## Structure

```
orbit/
  index.html            # semantic content + import map (loads three.js)
  styles/main.css       # OKLCH design tokens, layout, reveal animation, a11y
  src/
    config.js           # *** the scene knobs you tweak ***
    colors.js           # OKLCH -> sRGB (keeps JS + CSS palettes identical)
    shaders.js          # GLSL: curl-noise core, particles, vignette/grade
    scene.js            # three.js renderer, composer (bloom), render loop
    particles.js        # the particle galaxy
    scroll.js           # native scroll -> progress, nav, section hue, parallax
    reveal.js           # IntersectionObserver content reveals
    app.js              # entry point (boots + graceful no-WebGL fallback)
```

## Deploy

**Vercel** - import the repo (Framework preset: *Other*, no build command, output dir `.`) or run `vercel`.

**GitHub Pages** - Settings -> Pages -> deploy from `main` / root. It is plain static files, so it just works.

**Netlify / Cloudflare Pages** - drag the folder in, or connect the repo with no build command.

## Accessibility & performance

- Semantic landmarks (`header`/`main`/`section`/`footer`), a skip link, visible focus rings, and AA-contrast text.
- The canvas is `aria-hidden` and decorative; all meaning lives in the HTML.
- `prefers-reduced-motion` disables smooth scroll, reveals, and continuous animation (the scene renders one still frame).
- DPR is capped at 2 and the RAF loop stops when the page is hidden.

## Credits & license

Built with [three.js](https://threejs.org). MIT licensed - use it for anything, no attribution required (a star is appreciated).
