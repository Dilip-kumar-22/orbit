// Section choreography: the scene "stage" for each <section data-scene="..."> and how the scene moves
// between stages. Pure maths - no three.js, no DOM - so it is unit-testable.
//
// Every section defines a state { hue, cameraZ, coreScale, particleRotation } (see CONFIG.sections).
// The scene blends between the states of neighbouring sections by scroll position and holds each
// state around its section's centre. Colour is not interpolated here: sampleTimeline() reports which
// two keys are active plus the blend factor, and the scene lerps two persistent colours, so nothing
// is converted or allocated per frame.

export const SECTION_DEFAULTS = Object.freeze({ hue: 265, cameraZ: 6, coreScale: 1, particleRotation: 0 });

// Share of the gap between two section centres, at each end, where a state is held before blending.
export const HOLD = 0.15;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Where each section's centre sits along the scroll, 0..1 (the page scroll position at which that
 * section is centred in the viewport). `rects` are measured in document coordinates.
 */
export function measureAnchors(rects, scrollHeight, viewportHeight) {
  const range = Math.max(1, scrollHeight - viewportHeight);
  return rects.map(({ name, top, height }) => ({
    name,
    at: clamp01((top + height / 2 - viewportHeight / 2) / range),
  }));
}

/**
 * Keys in scroll order. Sections missing from the config are skipped; anchors are forced to be
 * non-decreasing. Always returns at least one key so sampling never has to special-case "empty".
 */
export function buildTimeline(sections, anchors) {
  const keys = [];
  let prev = 0;
  for (const { name, at } of anchors) {
    const state = sections[name];
    if (!state) continue;
    prev = Math.max(prev, at);
    keys.push({ ...SECTION_DEFAULTS, ...state, name, at: prev });
  }
  if (keys.length === 0) keys.push({ ...SECTION_DEFAULTS, name: '', at: 0 });
  return { keys };
}

function write(out, a, b, ia, ib, t) {
  out.i0 = ia;
  out.i1 = ib;
  out.t = t;
  out.cameraZ = a.cameraZ + (b.cameraZ - a.cameraZ) * t;
  out.coreScale = a.coreScale + (b.coreScale - a.coreScale) * t;
  out.particleRotation = a.particleRotation + (b.particleRotation - a.particleRotation) * t;
  return out;
}

/**
 * Scene state at scroll progress `p` (0..1), written into `out` (reused every frame).
 * i0/i1 index `timeline.keys`; t is the eased blend between them, so the caller can blend anything
 * else it keeps per key (the scene does this for the background colour).
 */
export function sampleTimeline({ keys }, p, out = {}) {
  const last = keys.length - 1;
  if (last === 0 || p <= keys[0].at) return write(out, keys[0], keys[0], 0, 0, 0);
  if (p >= keys[last].at) return write(out, keys[last], keys[last], last, last, 0);
  let i = 0;
  while (i < last - 1 && p >= keys[i + 1].at) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.at - a.at;
  const u = span > 1e-6 ? clamp01((p - a.at) / span) : 1;
  const t = smooth(clamp01((u - HOLD) / (1 - 2 * HOLD)));
  return write(out, a, b, i, i + 1, t);
}

/**
 * Index of the section the reference line `refY` (document coordinates) falls in: the last section
 * that starts at or above it. `tops` are section tops in document order.
 */
export function pickActiveSection(tops, refY) {
  let active = 0;
  for (let i = 0; i < tops.length && tops[i] <= refY; i += 1) active = i;
  return active;
}
