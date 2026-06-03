import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';
import { oklchToRGB } from './colors.js';
import { coreVertex, coreFragment, gradeVertex, gradeFragment } from './shaders.js';
import { createParticles } from './particles.js';

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function createScene(canvas) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const srgb = (oklch) => { const [r, g, b] = oklchToRGB(oklch); const c = new THREE.Color(); c.setRGB(r, g, b, THREE.SRGBColorSpace); return c; };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = () => window.innerWidth, H = () => window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = srgb(CONFIG.color.background);

  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, W() / H(), 0.1, 100);
  camera.position.set(0, 0, CONFIG.camera.zStart);

  // morphing core (custom shader: dark body + luminous fresnel rim)
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: CONFIG.core.displacement }, uScale: { value: CONFIG.core.noiseScale },
      uColorA: { value: srgb(CONFIG.color.coreA) }, uColorB: { value: srgb(CONFIG.color.coreB) },
    },
    vertexShader: coreVertex, fragmentShader: coreFragment,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(CONFIG.core.radius, CONFIG.core.detail), coreMat);
  scene.add(core);

  const particles = createParticles(CONFIG);
  scene.add(particles);

  // composer with a HalfFloat + 4x MSAA target (no banding/aliasing in post)
  const rt = new THREE.WebGLRenderTarget(W(), H(), { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W(), H()), CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold));
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uVignette: { value: CONFIG.vignette } },
    vertexShader: gradeVertex, fragmentShader: gradeFragment,
  }));

  // scroll/pointer state
  let progress = 0, curZ = CONFIG.camera.zStart;
  let hue = CONFIG.grade.hero;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const clock = new THREE.Clock();

  function render(t) {
    const targetZ = CONFIG.camera.zStart + (CONFIG.camera.zEnd - CONFIG.camera.zStart) * easeInOut(progress);
    curZ += (targetZ - curZ) * CONFIG.camera.ease;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    camera.position.set(pointer.x * CONFIG.camera.parallax, pointer.y * CONFIG.camera.parallax, curZ);
    camera.lookAt(0, 0, 0);
    coreMat.uniforms.uTime.value = t * CONFIG.core.speed;
    core.rotation.y = t * CONFIG.core.rotate;
    core.rotation.x = Math.sin(t * 0.1) * 0.18;
    particles.rotation.y = t * CONFIG.particles.drift + progress * 0.6;
    particles.material.uniforms.uTime.value = t;
    scene.background.lerp(srgb([CONFIG.color.background[0], CONFIG.color.background[1], hue]), 0.04);
    composer.render();
  }

  function resize() {
    camera.aspect = W() / H(); camera.updateProjectionMatrix();
    renderer.setSize(W(), H()); composer.setSize(W(), H());
    particles.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }
  window.addEventListener('resize', resize);

  let raf = 0, last = performance.now();
  function loop(now) { raf = requestAnimationFrame(loop); render(clock.getElapsedTime()); }
  function start() {
    if (reduceMotion) { render(0); return; }  // single static frame, no animation
    cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (!reduceMotion) start(); });

  return {
    start, stop, reduceMotion,
    setProgress: (p) => { progress = Math.min(1, Math.max(0, p)); },
    setSectionHue: (h) => { hue = h; },
    onPointer: (nx, ny) => { pointer.tx = nx; pointer.ty = ny; },
  };
}
