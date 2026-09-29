// Small-screen navigation: the "disclosure navigation" pattern (WAI-ARIA Authoring Practices).
// Below 760px the links collapse behind a Menu button that carries aria-expanded / aria-controls.
// Escape closes the menu and returns focus to the button; choosing a link, clicking outside or moving
// focus out of the header also closes it. Without JS the links simply stay visible (see main.css).
export function initNav() {
  const nav = document.getElementById('nav');
  const toggle = nav?.querySelector('.nav__toggle');
  const panel = nav?.querySelector('.nav__panel');
  if (!nav || !toggle || !panel) return { destroy() {} };

  const narrow = matchMedia('(max-width: 760px)');
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  function setOpen(open, { focusToggle = false } = {}) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    if (!open && focusToggle) toggle.focus();
  }

  const onToggle = () => setOpen(!isOpen());
  const onKeydown = (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    e.preventDefault();
    setOpen(false, { focusToggle: true });
  };
  const onPanelClick = (e) => {
    if (e.target.closest('a')) setOpen(false);
  };
  const onFocusOut = (e) => {
    if (isOpen() && e.relatedTarget && !nav.contains(e.relatedTarget)) setOpen(false);
  };
  const onPointerDown = (e) => {
    if (isOpen() && !nav.contains(e.target)) setOpen(false);
  };
  const onBreakpoint = () => setOpen(false); // never leave a stale open state across a resize

  toggle.addEventListener('click', onToggle);
  nav.addEventListener('keydown', onKeydown);
  panel.addEventListener('click', onPanelClick);
  nav.addEventListener('focusout', onFocusOut);
  document.addEventListener('pointerdown', onPointerDown);
  narrow.addEventListener('change', onBreakpoint);

  return {
    destroy() {
      toggle.removeEventListener('click', onToggle);
      nav.removeEventListener('keydown', onKeydown);
      panel.removeEventListener('click', onPanelClick);
      nav.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown);
      narrow.removeEventListener('change', onBreakpoint);
      setOpen(false);
    },
  };
}
