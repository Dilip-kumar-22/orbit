// ORBIT - entry point.
//
// Baseline first: reveals, the progress bar and the nav only need plain browser APIs, so a three.js /
// CDN / WebGL failure can never take the content down with it. The 3D backdrop is a separate,
// failure-isolated enhancement that is loaded afterwards with a dynamic import().
import { initReveal } from './reveal.js';
import { initScroll } from './scroll.js';

document.documentElement.classList.add('js');
initReveal();
const scroll = initScroll();

async function enhance() {
  const canvas = document.getElementById('scene');
  try {
    const { createScene } = await import('./scene.js'); // three.js is fetched here, not at startup
    const scene = createScene(canvas);
    scene.start();
    scroll.attachScene(scene);
  } catch (err) {
    console.warn('[ORBIT] 3D backdrop unavailable - serving the static site without it.', err);
    if (canvas) canvas.style.display = 'none';
  }
}

enhance();
