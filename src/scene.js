import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';
import { oklchToRGB } from './colors.js';
import { buildTimeline, sampleTimeline } from './choreography.js';
import { createIcosphere } from './geometry.js';
import { createParticles } from './particles.js';
import {
  TIERS,
  computeRenderSize,
  createQualityController,
  estimateTargetBytes,
  pickInitialTier,
} from './quality.js';
import { coreFragment, coreVertex, gradeFragment, gradeVertex } from './shaders.js';

const STATIC_TIME = 6; // scene time of the still frame (reduced motion, performance floor)
const MAX_DT = 0.1; // seconds; a longer gap (tab switch, stall) never makes the scene jump
const RESTORE_TIMEOUT_MS = 5000; // how long a lost WebGL context gets to come back

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// The config's per-frame ease factors were tuned at 60 fps; this keeps them frame-rate independent.
const damp = (ease, dt) => 1 - Math.pow(1 - ease, dt * 60);
const toColor = (oklch) => {
  const [r, g, b] = oklchToRGB(oklch);
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
};

/**
 * The 3D backdrop. Throws if WebGL is unavailable: the page must work without it (see app.js).
 *
 *   const scene = createScene(canvas, { config, hints: { software: false }, onState, onQuality });
 *   scene.start();  scene.setProgress(0.4);  scene.destroy();
 *
 * Controller: start() stop() resize() destroy() setProgress(p) setSections(anchors) onPointer(x, y)
 * setQuality('auto' | 'low' | 'medium' | 'high') stats() and the read-only `state`:
 * idle | running | paused | static | lost | failed | destroyed.
 */
export function createScene(
  canvas,
  { config = CONFIG, hints = {}, onState = () => {}, onQuality = () => {} } = {},
) {
  const cfg = config;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // multisampling happens on the composer's scene target (quality profile)
    alpha: false,
    depth: false, // the default framebuffer only receives the final full-screen pass
    stencil: false,
    powerPreference: 'high-performance',
  });
  let built = false;
  try {
    return build();
  } finally {
    if (!built) renderer.dispose(); // never leak a context when setup throws
  }

  function build() {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cfg.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const gl = renderer.getContext();
    const caps = {
      floatTargets: renderer.extensions.has('EXT_color_buffer_float'),
      halfFloatTargets:
        renderer.extensions.has('EXT_color_buffer_float') ||
        renderer.extensions.has('EXT_color_buffer_half_float'),
      maxSamples: renderer.capabilities.maxSamples,
      maxPointSize: gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1],
    };

    // ---- scene graph -------------------------------------------------------------------------
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(cfg.camera.fov, 1, 0.1, 100);

    const coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: cfg.core.displacement },
        uScale: { value: cfg.core.noiseScale },
        uColorA: { value: toColor(cfg.color.coreA) },
        uColorB: { value: toColor(cfg.color.coreB) },
      },
      vertexShader: coreVertex,
      fragmentShader: coreFragment,
    });
    const core = new THREE.Mesh(new THREE.BufferGeometry(), coreMat);
    core.frustumCulled = false; // the vertex shader displaces it beyond its bounding sphere
    scene.add(core);
    let coreDetail = -1;
    function setCoreDetail(detail) {
      if (detail === coreDetail) return;
      const { positions, normals, indices } = createIcosphere(cfg.core.radius, detail);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      core.geometry.dispose();
      core.geometry = geometry;
      coreDetail = detail;
    }

    const maxParticles = Math.max(...TIERS.map((tier) => cfg.quality.profiles[tier].particles));
    const particles = createParticles(cfg, { maxCount: maxParticles, color: toColor(cfg.color.particle) });
    scene.add(particles.points);

    // ---- section choreography (colours are converted once per key, never per frame) ----------
    const [bgLightness, bgChroma] = cfg.color.background;
    let timeline;
    let hueColors;
    function setSections(anchors) {
      timeline = buildTimeline(cfg.sections, anchors);
      hueColors = timeline.keys.map((key) => toColor([bgLightness, bgChroma, key.hue]));
    }
    const names = Object.keys(cfg.sections);
    setSections(names.map((name, i) => ({ name, at: names.length > 1 ? i / (names.length - 1) : 0 })));
    scene.background = hueColors[0].clone();
    const targetBackground = new THREE.Color();

    // ---- post-processing ---------------------------------------------------------------------
    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, {
        type: caps.halfFloatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
      }),
    );
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      cfg.bloom.strength,
      cfg.bloom.radius,
      cfg.bloom.threshold,
    );
    const gradePass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uVignette: { value: cfg.vignette } },
      vertexShader: gradeVertex,
      fragmentShader: gradeFragment,
    });
    const passes = [new RenderPass(scene, camera), bloomPass, new OutputPass(), gradePass];
    passes.forEach((pass) => composer.addPass(pass));

    // ---- state -------------------------------------------------------------------------------
    let state = 'idle';
    const setState = (next) => {
      if (state === next) return;
      state = next;
      onState(next);
    };
    let started = false;
    let destroyed = false;
    let lost = false;
    let floored = false;
    let onScreen = true;
    let reduced = motionQuery.matches;
    let raf = 0;
    let resizeRaf = 0;
    let restoreTimer = 0;
    let last = 0;
    let elapsed = 0;
    let frames = 0;

    let progress = 0;
    let curZ = cfg.sections[names[0]]?.cameraZ ?? 6;
    let curScale = 1;
    let curSpin = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const sample = { i0: 0, i1: 0, t: 0, cameraZ: curZ, coreScale: 1, particleRotation: 0 };

    // ---- quality -----------------------------------------------------------------------------
    let tierName;
    let profile;
    let msaa = 0;
    let quality = null; // frame-time controller when the level is 'auto'

    function setMsaa(samples) {
      // RenderPass draws into composer.readBuffer; the other buffer only ever sees full-screen passes.
      const target = composer.readBuffer;
      composer.writeBuffer.samples = 0;
      if (target.samples !== samples) {
        target.samples = samples;
        target.dispose(); // re-created with the new sample count on next use
      }
      msaa = samples;
    }

    function applyTier(name, reason) {
      tierName = name;
      profile = cfg.quality.profiles[name];
      setCoreDetail(profile.coreDetail);
      particles.setCount(profile.particles);
      bloomPass.enabled = profile.bloom && caps.halfFloatTargets;
      setMsaa(caps.floatTargets ? Math.min(profile.msaa, caps.maxSamples) : 0);
      applySize(true);
      onQuality(name, reason);
    }

    function enterFloor() {
      console.warn('[ORBIT] Frame rate stays too low even at the lowest quality: pausing the 3D animation.');
      floored = true;
      quality = null;
      syncLoop();
    }

    function startAuto() {
      quality = createQualityController({
        tier: tierName,
        onChange: (tier, reason) => {
          applyTier(tier, reason);
          refresh();
        },
        onFloor: enterFloor,
      });
    }

    function setQuality(level) {
      if (level !== 'auto' && !TIERS.includes(level)) {
        console.warn(`[ORBIT] setQuality: unknown level "${level}" (use auto, low, medium or high).`);
        return;
      }
      floored = false;
      if (level === 'auto') {
        startAuto();
      } else {
        quality = null;
        applyTier(level, 'manual');
      }
      syncLoop();
      refresh();
    }

    // ---- size --------------------------------------------------------------------------------
    let cssWidth = 0;
    let cssHeight = 0;
    let dpr = 0;
    function applySize(force = false) {
      const w = Math.max(1, Math.round(canvas.clientWidth || window.innerWidth));
      const h = Math.max(1, Math.round(canvas.clientHeight || window.innerHeight));
      const size = computeRenderSize(w, h, window.devicePixelRatio, profile);
      if (!force && w === cssWidth && h === cssHeight && size.dpr === dpr) return false;
      const dprChanged = size.dpr !== dpr;
      cssWidth = w;
      cssHeight = h;
      dpr = size.dpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false); // CSS owns the canvas box (100vw x 100lvh)
      if (dprChanged) composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      particles.setPixelRatio(dpr, caps.maxPointSize);
      return true;
    }

    // Coalesce bursts of resize / orientation / DPR events into one buffer reallocation per frame.
    function scheduleResize() {
      if (resizeRaf || destroyed) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        if (applySize()) refresh();
      });
    }

    let dprQuery = null;
    function watchDpr() {
      dprQuery?.removeEventListener('change', onDprChange);
      dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener('change', onDprChange);
    }
    function onDprChange() {
      watchDpr();
      scheduleResize();
    }

    // ---- frame -------------------------------------------------------------------------------
    function update(dt, time, snap) {
      sampleTimeline(timeline, reduced ? 0 : progress, sample);
      const k = snap ? 1 : damp(cfg.camera.ease, dt);
      curZ += (sample.cameraZ - curZ) * k;
      curScale += (sample.coreScale - curScale) * k;
      curSpin += (sample.particleRotation - curSpin) * k;

      const pk = snap ? 1 : damp(0.05, dt);
      pointer.x += ((reduced ? 0 : pointer.tx) - pointer.x) * pk;
      pointer.y += ((reduced ? 0 : pointer.ty) - pointer.y) * pk;
      camera.position.set(pointer.x * cfg.camera.parallax, pointer.y * cfg.camera.parallax, curZ);
      camera.lookAt(0, 0, 0);

      coreMat.uniforms.uTime.value = time * cfg.core.speed;
      core.rotation.y = time * cfg.core.rotate;
      core.rotation.x = Math.sin(time * 0.1) * 0.18;
      core.scale.setScalar(curScale);
      particles.points.rotation.y = time * cfg.particles.drift + curSpin;
      particles.uniforms.uTime.value = time;

      targetBackground.lerpColors(hueColors[sample.i0], hueColors[sample.i1], sample.t);
      scene.background.lerp(targetBackground, snap ? 1 : damp(0.04, dt));
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dtMs = last ? now - last : 1000 / 60;
      last = now;
      const dt = Math.min(dtMs / 1000, MAX_DT);
      elapsed += dt;
      try {
        update(dt, elapsed, false);
        composer.render(dt);
      } catch (err) {
        console.error('[ORBIT] The render loop crashed; stopping the 3D backdrop.', err);
        teardown('failed');
        return;
      }
      frames += 1;
      quality?.push(dtMs);
    }

    // One still frame: reduced motion, the performance floor, and every resize / tier change that
    // happens while the loop is not running.
    function renderStill() {
      update(0, STATIC_TIME, true);
      composer.render(0);
      frames += 1;
    }
    function refresh() {
      if (!raf && started && !destroyed && !lost && !document.hidden) renderStill();
    }

    function syncLoop() {
      if (destroyed) return;
      const animate = started && !lost && !floored && !reduced && !document.hidden && onScreen;
      if (animate) {
        if (!raf) {
          last = 0; // the gap since the last frame is not a frame time
          quality?.reset();
          raf = requestAnimationFrame(frame);
        }
        setState('running');
        return;
      }
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (lost) setState('lost');
      else if (!started) setState('idle');
      else if (reduced || floored) setState('static');
      else setState('paused');
    }

    // ---- listeners ---------------------------------------------------------------------------
    function onMotionChange() {
      reduced = motionQuery.matches;
      syncLoop();
      refresh();
    }
    function onContextLost(event) {
      event.preventDefault(); // without this the browser never restores the context
      lost = true;
      syncLoop();
      restoreTimer = setTimeout(() => teardown('failed'), RESTORE_TIMEOUT_MS);
    }
    function onContextRestored() {
      clearTimeout(restoreTimer);
      lost = false;
      applySize(true);
      syncLoop();
      refresh();
    }
    const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(scheduleResize) : null;
    const intersection =
      'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => {
            onScreen = entries[entries.length - 1].isIntersecting;
            syncLoop();
          })
        : null;

    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    document.addEventListener('visibilitychange', syncLoop);
    motionQuery.addEventListener('change', onMotionChange);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    resizeObserver?.observe(canvas);
    intersection?.observe(canvas);
    watchDpr();

    // ---- teardown ----------------------------------------------------------------------------
    function teardown(finalState) {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      clearTimeout(restoreTimer);
      raf = resizeRaf = 0;
      window.removeEventListener('resize', scheduleResize);
      window.removeEventListener('orientationchange', scheduleResize);
      document.removeEventListener('visibilitychange', syncLoop);
      motionQuery.removeEventListener('change', onMotionChange);
      dprQuery?.removeEventListener('change', onDprChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      resizeObserver?.disconnect();
      intersection?.disconnect();
      quality = null;

      particles.dispose();
      core.geometry.dispose();
      coreMat.dispose();
      passes.forEach((pass) => pass.dispose?.());
      composer.dispose();
      scene.clear();
      renderer.dispose();
      setState(finalState);
    }

    // ---- diagnostics -------------------------------------------------------------------------
    let gpuName = null;
    function stats() {
      const q = quality?.stats();
      if (cfg.debug && gpuName === null && !lost) {
        // Deprecated in Firefox (it warns), so only ever asked for in debug mode.
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        gpuName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      }
      return {
        state,
        tier: tierName,
        auto: quality !== null,
        ceiling: q?.ceiling ?? null,
        meanFrameMs: q?.meanMs ?? 0,
        floored,
        frames,
        dpr,
        cssWidth,
        cssHeight,
        width: canvas.width,
        height: canvas.height,
        particles: particles.count,
        coreDetail,
        coreVertices: core.geometry.attributes.position?.count ?? 0,
        msaa,
        bloom: bloomPass.enabled,
        halfFloat: caps.halfFloatTargets,
        reducedMotion: reduced,
        contextLost: lost,
        targetBytes: estimateTargetBytes({
          width: canvas.width,
          height: canvas.height,
          msaa,
          bloom: bloomPass.enabled,
        }),
        maxPointSize: caps.maxPointSize,
        gpu: gpuName,
      };
    }

    // ---- boot --------------------------------------------------------------------------------
    const level = cfg.quality.level;
    tierName =
      level === 'auto'
        ? pickInitialTier({
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio,
            coarsePointer: matchMedia('(pointer: coarse)').matches,
            deviceMemory: navigator.deviceMemory,
            cores: navigator.hardwareConcurrency,
            saveData: navigator.connection?.saveData === true,
            software: hints.software === true,
          })
        : level;
    profile = cfg.quality.profiles[tierName];
    applyTier(tierName, 'initial');
    if (level === 'auto') startAuto();

    built = true;
    return {
      start() {
        started = true;
        syncLoop();
        refresh();
      },
      stop() {
        started = false;
        syncLoop();
      },
      resize() {
        if (applySize()) refresh();
      },
      destroy() {
        teardown('destroyed');
      },
      setProgress(p) {
        progress = clamp(Number(p) || 0, 0, 1);
      },
      /** Anchors from choreography.measureAnchors(): where each section sits along the scroll. */
      setSections,
      /** Normalised pointer position, -1..1 (ignored under reduced motion). */
      onPointer(x, y) {
        pointer.tx = clamp(Number(x) || 0, -1, 1);
        pointer.ty = clamp(Number(y) || 0, -1, 1);
      },
      setQuality,
      get state() {
        return state;
      },
      stats,
    };
  }
}
