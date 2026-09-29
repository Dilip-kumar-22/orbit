// ORBIT - scene configuration.
// This is the one file to tweak the 3D look. Colors are authored in OKLCH (perceptual) and converted
// to sRGB for three.js at load. Edit values, refresh, done.
//
// Every value is validated at startup (see src/settings.js): anything outside the range noted beside
// it falls back to the default and logs a console warning, so a typo can't break the page.
//
// Try things without editing this file:
//   ?quality=low|medium|high|auto   force a quality tier from the address bar
//   ?debug                          show the diagnostics overlay (FPS, tier, DPR, renderer, ...)
//   <script>window.ORBIT_CONFIG = { quality: { level: 'low' } }</script>   deep-merged over these
//   values; put it before src/app.js (handy when embedding ORBIT in a bigger site).

export const CONFIG = {
  // --- palette (OKLCH: [lightness 0..1, chroma 0..0.5, hue in degrees]) ---
  color: {
    background: [0.17, 0.02, 265], // deep space (also --bg in styles/main.css); each section sets the hue
    coreA: [0.78, 0.14, 200], // aurora cyan
    coreB: [0.72, 0.17, 300], // aurora violet
    particle: [0.85, 0.11, 250], // drifting points
  },

  // --- central morphing core ---
  core: {
    radius: 1.2, // 0.1..10
    displacement: 0.42, // curl-noise strength, 0..2
    noiseScale: 1.15, // 0.1..8
    speed: 0.18, // morph speed, 0..5
    rotate: 0.045, // idle spin (rad/s), -2..2
  },

  // --- particle galaxy (how many points it has: quality.profiles below) ---
  particles: {
    radius: 9, // 1..100
    innerRadius: 2.2, // 0..50, must be smaller than radius
    size: 0.045, // 0.001..1
    drift: 0.03, // rotation (rad/s), -2..2
    seed: null, // an integer gives the same galaxy on every load (screenshots, visual tests); null = random
  },

  // --- camera ---
  camera: {
    fov: 42, // 10..120
    parallax: 0.35, // pointer parallax, 0..3
    ease: 0.06, // how quickly the camera catches up per 1/60 s, 0.005..1 (frame-rate independent)
  },

  // --- post-processing (bloom kept subtle: threshold high, strength low) ---
  bloom: { strength: 0.55, radius: 0.45, threshold: 0.92 }, // 0..3, 0..1, 0..2
  exposure: 0.96, // 0.1..4
  vignette: 0.9, // 0.1..2.5, lower = stronger

  // --- section choreography ---
  // The scene "stage" at the centre of each <section data-scene="name">. Scrolling blends smoothly
  // between neighbouring stages. Every field is optional (unset ones use a neutral default).
  //   hue              background tint (OKLCH hue, degrees)
  //   cameraZ          camera distance to the core, 0.5..50 (smaller = closer)
  //   coreScale        0.1..4
  //   particleRotation yaw of the galaxy in radians, -20..20 (on top of its constant drift)
  sections: {
    hero: { hue: 265, cameraZ: 6.8, coreScale: 1.0, particleRotation: 0.0 },
    about: { hue: 250, cameraZ: 6.3, coreScale: 1.06, particleRotation: 0.15 },
    work: { hue: 290, cameraZ: 5.0, coreScale: 0.94, particleRotation: 0.3 },
    capabilities: { hue: 210, cameraZ: 3.6, coreScale: 1.1, particleRotation: 0.45 },
    contact: { hue: 280, cameraZ: 2.9, coreScale: 1.0, particleRotation: 0.6 },
  },

  // --- quality ---
  // level 'auto' starts from what the device looks like, then lets measured frame time decide:
  // it drops a tier after sustained slow frames and never climbs back once one has failed.
  // Or pin a tier with 'low' | 'medium' | 'high'. Each profile is what that tier switches on:
  //   coreDetail  core mesh subdivisions, 1..96          particles  point count, 0..50000
  //   dprMax      device-pixel-ratio ceiling, 0.5..3     maxPixels  drawing-buffer pixel budget, 1e5..3e7
  //   bloom       glow pass on/off                       msaa       multisampling: 0 | 2 | 4 | 8
  quality: {
    level: 'auto',
    profiles: {
      low: { coreDetail: 16, particles: 2500, dprMax: 1, maxPixels: 1.6e6, bloom: false, msaa: 0 },
      medium: { coreDetail: 32, particles: 5000, dprMax: 1.5, maxPixels: 2.6e6, bloom: true, msaa: 0 },
      high: { coreDetail: 64, particles: 8000, dprMax: 2, maxPixels: 4e6, bloom: true, msaa: 4 },
    },
  },

  // What the canvas does when the visitor prefers reduced motion:
  //   'static'   render one still frame (kept sharp on resize, no animation, no scroll/pointer motion)
  //   'disabled' don't render the 3D scene at all (no canvas, no GPU work)
  reducedMotionScene: 'static',

  debug: false, // true = always show the diagnostics overlay
};
