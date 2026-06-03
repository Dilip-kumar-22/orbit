// Reveal content panels as they scroll into view (staggered via the --i CSS var).
export function initReveal() {
  const els = document.querySelectorAll('.reveal');
  const noMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || noMotion) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  els.forEach((el) => io.observe(el));
}
