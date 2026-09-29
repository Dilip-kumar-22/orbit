// Diagnostics overlay: FPS, frame time, quality tier, DPR, viewport, renderer, particle count, active
// section, WebGL capabilities and context state. Off by default; turn it on with ?debug in the URL or
// `debug: true` in src/config.js. Loaded lazily, so the public site never pays for it.
// Also exposes window.orbit = { scene, config, stats() } for the console (and the e2e tests).
const MB = 1024 * 1024;

export function initDebug({ scene, config }) {
  const panel = document.createElement('pre');
  panel.className = 'orbit-debug';
  panel.setAttribute('aria-hidden', 'true');
  document.body.append(panel);

  window.orbit = { scene, config, stats: () => scene.stats() };

  let lastFrames = 0;
  let lastTime = performance.now();
  function render() {
    const s = scene.stats();
    const now = performance.now();
    const fps = ((s.frames - lastFrames) * 1000) / (now - lastTime);
    lastFrames = s.frames;
    lastTime = now;
    const section = document.documentElement.dataset.section || '-';
    panel.textContent = [
      `state     ${s.state}${s.floored ? ' (floor)' : ''}${s.contextLost ? ' (context lost)' : ''}`,
      `fps       ${fps.toFixed(0)}  (${fps > 0 ? (1000 / fps).toFixed(1) : '-'} ms)`,
      `quality   ${s.tier}${s.auto ? ` auto, ceiling ${s.ceiling}` : ' fixed'}`,
      `dpr       ${s.dpr.toFixed(2)}  ${s.cssWidth}x${s.cssHeight} css -> ${s.width}x${s.height}`,
      `core      ${s.coreDetail} detail, ${s.coreVertices} vertices`,
      `particles ${s.particles}`,
      `post      ${s.bloom ? 'bloom' : 'no bloom'}, msaa ${s.msaa}, ${s.halfFloat ? 'half-float' : '8-bit'}`,
      `targets   ~${(s.targetBytes / MB).toFixed(0)} MB (estimate)`,
      `section   ${section}`,
      `motion    ${s.reducedMotion ? 'reduced' : 'full'}`,
      `gpu       ${s.gpu ?? '-'}`,
      `max point ${s.maxPointSize}px`,
    ].join('\n');
  }
  render();
  const timer = setInterval(render, 250);

  return {
    destroy() {
      clearInterval(timer);
      panel.remove();
      delete window.orbit;
    },
  };
}
