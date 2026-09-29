import { CONFIG } from './config.js';

// Native scroll drives everything (accessible, no scrolljacking). The scene eases toward
// the scroll-derived target each frame, which is where the "smooth" feel comes from.
// The scene is optional and arrives late (it is loaded after the baseline UI): call
// attachScene(scene) when it is ready; everything else works without it.
export function initScroll() {
  const bar = document.getElementById('progress-bar');
  const nav = document.getElementById('nav');
  const links = [...document.querySelectorAll('.nav__links a')];
  const sections = [...document.querySelectorAll('[data-scene]')];
  let scene = null;
  let hue = null; // last active section hue, replayed to a scene that attaches late

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 12);
    if (scene) scene.setProgress(p);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  // active section -> nav highlight + scene hue grade
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const name = e.target.getAttribute('data-scene');
          if (CONFIG.grade[name] != null) {
            hue = CONFIG.grade[name];
            if (scene) scene.setSectionHue(hue);
          }
          const id = e.target.id;
          links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
        }
      },
      { threshold: 0.5 },
    );
    sections.forEach((s) => io.observe(s));
  }

  // pointer parallax (skip on touch + reduced-motion)
  function onPointerMove(e) {
    scene.onPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  }

  return {
    attachScene(s) {
      scene = s;
      onScroll();
      if (hue != null) scene.setSectionHue(hue);
      if (!scene.reduceMotion && !matchMedia('(pointer: coarse)').matches) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
      }
    },
  };
}
