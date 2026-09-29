import { measureAnchors, pickActiveSection } from './choreography.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Native scroll drives everything (accessible, no scrolljacking). The scene eases toward the
// scroll-derived target each frame, which is where the "smooth" feel comes from.
//
// The scene is optional and arrives late (it is loaded after the baseline UI): call attachScene()
// once it is ready; the progress bar, nav state and active section work without it.
export function initScroll() {
  const root = document.documentElement;
  const bar = document.getElementById('progress-bar');
  const nav = document.getElementById('nav');
  const links = [...document.querySelectorAll('.nav__links a[href^="#"]')];
  const sectionEls = [...document.querySelectorAll('section[data-scene]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');

  let scene = null;
  let layout = { max: 0, tops: [], anchors: [] };
  let active = -1;
  let measureRaf = 0;

  // Layout is measured only when it can have changed (load, resize, content size) - never per scroll
  // event - so scrolling itself does no layout reads.
  function measure() {
    const y = window.scrollY;
    const rects = sectionEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.dataset.scene, top: r.top + y, height: r.height };
    });
    const height = root.scrollHeight;
    layout = {
      max: Math.max(0, height - window.innerHeight),
      tops: rects.map((r) => r.top),
      anchors: measureAnchors(rects, height, window.innerHeight),
    };
    scene?.setSections(layout.anchors);
    onScroll();
  }
  function scheduleMeasure() {
    if (measureRaf) return;
    measureRaf = requestAnimationFrame(() => {
      measureRaf = 0;
      measure();
    });
  }

  // The section under a reference line 40% down the viewport is the active one. It is deterministic
  // (unlike intersection thresholds, which never fire for a section taller than the viewport allows).
  function markActive(index) {
    const section = sectionEls[index];
    root.dataset.section = section?.dataset.scene ?? '';
    for (const a of links) {
      const current = section !== undefined && a.getAttribute('href') === `#${section.id}`;
      if (current) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  }

  function onScroll() {
    const y = window.scrollY;
    const p = layout.max > 0 ? clamp01(y / layout.max) : 0;
    if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
    nav?.classList.toggle('is-scrolled', y > 12);
    scene?.setProgress(p);
    const index = layout.tops.length ? pickActiveSection(layout.tops, y + window.innerHeight * 0.4) : -1;
    if (index !== active) {
      active = index;
      markActive(index);
    }
  }

  // pointer parallax (not on touch, not under reduced motion)
  function onPointerMove(e) {
    if (!scene || motion.matches || coarse.matches) return;
    scene.onPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  }

  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(scheduleMeasure) : null;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  resizeObserver?.observe(document.body); // content growing or shrinking (fonts, images, wrapping)
  document.fonts?.ready.then(scheduleMeasure);
  measure();

  return {
    attachScene(s) {
      scene = s;
      scene.setSections(layout.anchors);
      onScroll();
      window.addEventListener('pointermove', onPointerMove, { passive: true });
    },
    detachScene() {
      scene = null;
      window.removeEventListener('pointermove', onPointerMove);
    },
    destroy() {
      cancelAnimationFrame(measureRaf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver?.disconnect();
    },
  };
}
