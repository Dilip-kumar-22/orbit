// ORBIT - entry point.
//
// Baseline first: reveals, the progress bar and the nav only need plain browser APIs, so a
// three.js / WebGL failure can never take the content down with it. The 3D backdrop is a separate,
// failure-isolated enhancement, loaded afterwards with a dynamic import() and only when it can work.
//
// <html data-orbit="..."> mirrors what the backdrop is doing (loading | running | paused | static |
// lost | failed | unavailable | disabled), for CSS and for debugging.
import { initReveal } from './reveal.js';
import { initScroll } from './scroll.js';
import { resolveConfig } from './settings.js';

const root = document.documentElement;
const canvas = document.getElementById('scene');
const config = resolveConfig({ overrides: window.ORBIT_CONFIG, search: location.search });

root.classList.add('js');
root.dataset.orbit = 'loading';
initReveal();
const scroll = initScroll();

const motion = matchMedia('(prefers-reduced-motion: reduce)');
let scene = null;
let debug = null;
let pending = false;
let gone = false; // WebGL missing or crashed: not coming back this page load

const disabledByMotion = () => motion.matches && config.reducedMotionScene === 'disabled';

function fallback(state) {
  root.dataset.orbit = state;
  if (canvas) canvas.hidden = true;
}

// Can we get a WebGL2 context at all, and is it real hardware? A throw-away canvas is used because a
// canvas keeps the attributes of its first context, and three.js must create the real one.
function probeWebGL() {
  const release = (gl) => gl.getExtension('WEBGL_lose_context')?.loseContext();
  const hardware = document
    .createElement('canvas')
    .getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  if (hardware) {
    release(hardware);
    return { ok: true, software: false };
  }
  const any = document.createElement('canvas').getContext('webgl2');
  if (any) {
    release(any);
    return { ok: true, software: true }; // works, but on the CPU
  }
  return { ok: false, software: false };
}

function onSceneState(state) {
  root.dataset.orbit = state;
  if (state === 'failed') {
    scroll.detachScene();
    debug?.destroy();
    scene = debug = null;
    gone = true;
    fallback('failed');
  }
}

async function enableScene() {
  if (scene || pending || gone || !canvas) return;
  if (disabledByMotion()) return fallback('disabled');
  const webgl = probeWebGL();
  if (!webgl.ok) {
    gone = true;
    return fallback('unavailable');
  }
  pending = true;
  try {
    const { createScene } = await import('./scene.js'); // three.js is fetched here, not at startup
    if (disabledByMotion()) return fallback('disabled'); // the preference changed while it loaded
    canvas.hidden = false;
    scene = createScene(canvas, { config, hints: { software: webgl.software }, onState: onSceneState });
    scroll.attachScene(scene);
    scene.start();
    if (config.debug) {
      const { initDebug } = await import('./debug.js');
      debug = initDebug({ scene, config });
    }
  } catch (err) {
    console.warn('[ORBIT] 3D backdrop unavailable - serving the static site without it.', err);
    scene?.destroy();
    scene = null;
    gone = true;
    fallback('unavailable');
  } finally {
    pending = false;
  }
}

function disableScene() {
  if (scene) {
    scroll.detachScene();
    debug?.destroy();
    scene.destroy();
    scene = debug = null;
  }
  fallback('disabled');
}

// reducedMotionScene: 'disabled' tears the backdrop down (and brings it back) with the preference.
motion.addEventListener('change', () => (disabledByMotion() ? disableScene() : enableScene()));
enableScene();
