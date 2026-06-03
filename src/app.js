// ORBIT - entry point. Boots the 3D scene (with a graceful no-WebGL fallback),
// reveals content, and wires native scroll to the scene.
import { createScene } from './scene.js';
import { initScroll } from './scroll.js';
import { initReveal } from './reveal.js';

initReveal();

let scene = null;
try {
  const canvas = document.getElementById('scene');
  scene = createScene(canvas);
  scene.start();
} catch (err) {
  console.warn('[ORBIT] WebGL unavailable - serving the static site without the 3D backdrop.', err);
  const canvas = document.getElementById('scene');
  if (canvas) canvas.style.display = 'none';
}

initScroll(scene);
