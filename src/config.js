// ORBIT - scene configuration.
// This is the one file to tweak the 3D look. Colors are authored in OKLCH (perceptual)
// and converted to linear-sRGB for three.js at load. Edit values, refresh, done.

export const CONFIG = {
  // --- palette (OKLCH: [Lightness 0..1, Chroma, Hue deg]) ---
  color: {
    background: [0.17, 0.02, 265], // deep space (also set in CSS --bg)
    coreA: [0.78, 0.14, 200],      // aurora cyan
    coreB: [0.72, 0.17, 300],      // aurora violet
    particle: [0.85, 0.11, 250],   // drifting points
  },

  // --- central morphing core ---
  core: {
    radius: 1.2,
    detail: 64,            // icosahedron subdivisions (geometry resolution)
    displacement: 0.42,    // curl-noise strength
    noiseScale: 1.15,
    speed: 0.18,           // morph speed
    rotate: 0.045,         // idle spin (rad/s)
    wireframeMix: 0.18,    // 0 solid .. 1 wireframe overlay
  },

  // --- particle galaxy ---
  particles: {
    count: 8000,           // lower to ~3000 on weak GPUs
    radius: 9,
    innerRadius: 2.2,
    size: 0.045,
    drift: 0.03,           // rotation (rad/s)
  },

  // --- camera dolly across the scroll (z at progress 0 -> 1) ---
  camera: { zStart: 6.8, zEnd: 2.9, fov: 42, parallax: 0.35, ease: 0.06 },

  // --- post-processing (bloom kept subtle: threshold high, strength low) ---
  bloom: { strength: 0.55, radius: 0.45, threshold: 0.92 },
  exposure: 0.96,
  vignette: 0.9, // 1 = none, lower = stronger

  // --- per-section hue grade (subtle background color shift, degrees of OKLCH hue) ---
  // keyed by the data-scene attribute on each <section>
  grade: {
    hero: 265, about: 250, work: 290, capabilities: 210, contact: 280,
  },
};
