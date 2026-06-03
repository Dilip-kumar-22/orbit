import { CONFIG } from './config.js';

// Native scroll drives everything (accessible, no scrolljacking). The scene eases toward
// the scroll-derived target each frame, which is where the "smooth" feel comes from.
export function initScroll(scene) {
  const bar = document.getElementById('progress-bar');
  const nav = document.getElementById('nav');
  const links = [...document.querySelectorAll('.nav__links a')];
  const sections = [...document.querySelectorAll('[data-scene]')];

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
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const name = e.target.getAttribute('data-scene');
        if (scene && CONFIG.grade[name] != null) scene.setSectionHue(CONFIG.grade[name]);
        const id = e.target.id;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
      }
    }, { threshold: 0.5 });
    sections.forEach((s) => io.observe(s));
  }

  // pointer parallax (skip on touch + reduced-motion)
  if (scene && !scene.reduceMotion && !matchMedia('(pointer: coarse)').matches) {
    window.addEventListener('pointermove', (e) => {
      scene.onPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    }, { passive: true });
  }
}
