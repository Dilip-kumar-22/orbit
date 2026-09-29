// Reveal content panels as they scroll into view (staggered via the --i CSS var).
//
// Progressive enhancement: content is visible by default. This module only adds `reveal-enabled`
// (the class that hides not-yet-revealed elements, see styles/main.css) once it is certain it can
// also reveal them again. No IntersectionObserver or reduced motion => nothing is ever hidden.
export function initReveal() {
  const root = document.documentElement;
  const els = [...document.querySelectorAll('.reveal')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let io = null;

  function enable() {
    if (io || motion.matches || !('IntersectionObserver' in window)) return;
    // Hiding what is already on screen after first paint would flash, so it stays as it is. Elements
    // scrolled past (restored scroll position) are shown too: the observer would never fire for them.
    const painted = performance.getEntriesByType?.('paint').length > 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || (painted && r.top < innerHeight)) el.classList.add('is-visible');
    }
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    for (const el of els) if (!el.classList.contains('is-visible')) io.observe(el);
    root.classList.add('reveal-enabled');
  }

  function disable() {
    io?.disconnect();
    io = null;
    root.classList.remove('reveal-enabled');
    for (const el of els) el.classList.add('is-visible');
  }

  const onMotionChange = () => (motion.matches ? disable() : enable());
  motion.addEventListener('change', onMotionChange);
  enable();

  return {
    destroy() {
      motion.removeEventListener('change', onMotionChange);
      disable();
    },
  };
}
