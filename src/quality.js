// Adaptive quality: pure helpers plus a frame-time controller.
// No three.js and no DOM in here, so all of it is unit-testable (tests/unit/quality.test.js).
//
// Three tiers (see CONFIG.quality.profiles for what each one switches on). "auto" picks a starting
// tier from static hints, then lets *measured frame time* correct it:
//   - it drops a tier after sustained slow frames,
//   - it climbs only while the device keeps up and nothing has failed yet,
//   - after the first drop it never climbs again, so quality cannot oscillate.

export const TIERS = ['low', 'medium', 'high'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Starting tier from static hints. Deliberately coarse: it only decides where measurement begins.
 * `software` = the WebGL renderer is a CPU rasteriser (SwiftShader, llvmpipe, ...).
 */
export function pickInitialTier({
  width = 1280,
  height = 720,
  dpr = 1,
  coarsePointer = false,
  deviceMemory, // GiB, Chromium only (capped at 8)
  cores, // navigator.hardwareConcurrency
  saveData = false,
  software = false,
} = {}) {
  if (software || saveData) return 'low';
  let score = 2; // 2 = high, 1 = medium, 0 = low
  if (coarsePointer) score -= 1; // phones and tablets are thermally constrained
  if (deviceMemory !== undefined && deviceMemory <= 4) score -= 1;
  if (deviceMemory !== undefined && deviceMemory <= 1) score -= 1;
  if (cores !== undefined && cores <= 4) score -= 1;
  if (width * height * Math.min(dpr, 2) ** 2 > 8.3e6) score -= 1; // ~4K back buffer or larger
  return TIERS[clamp(score, 0, 2)];
}

/**
 * Drawing-buffer size for a tier: the device pixel ratio, capped by the tier's `dprMax` and by its
 * `maxPixels` budget (post-processing keeps several full-size float targets alive, so memory
 * scales with pixels, not with CSS size).
 */
export function computeRenderSize(cssWidth, cssHeight, deviceDpr, { dprMax, maxPixels }) {
  const area = Math.max(1, cssWidth * cssHeight);
  const dpr = clamp(Math.min(deviceDpr || 1, dprMax, Math.sqrt(maxPixels / area)), 0.5, 4);
  return {
    dpr,
    width: Math.max(1, Math.round(cssWidth * dpr)),
    height: Math.max(1, Math.round(cssHeight * dpr)),
  };
}

/**
 * Rough GPU memory for the post-processing targets, in bytes. An estimate for the debug overlay and
 * the docs, not a measurement: half-float RGBA scene target (+ MSAA renderbuffer + depth), the
 * output target, and an approximation of the bloom mip chain.
 */
export function estimateTargetBytes({ width, height, msaa = 0, bloom = true }) {
  const px = width * height;
  const samples = Math.max(1, msaa);
  const sceneTarget = px * (8 + 4) * samples + (msaa > 0 ? px * 8 : 0); // colour + depth, plus resolve
  const outputTarget = px * 8;
  const bloomChain = bloom ? px * 7.3 : 0; // bright pass + 5 blur mips x2, all at half resolution
  return Math.round(sceneTarget + outputTarget + bloomChain);
}

/**
 * Frame-time controller for `quality: 'auto'`. Feed it one rAF delta (ms) per rendered frame.
 * Frames are grouped into ~1 s blocks; each block's mean frame time is what gets judged.
 *
 *   mean > slowMs for 2 blocks in a row  -> drop one tier   (mean > verySlowMs: drop right away)
 *   mean > 2 * verySlowMs                -> drop to the lowest tier
 *   mean <= fastMs for upgradeAfterMs    -> try one tier up (only until the first drop happens)
 *   lowest tier and mean > floorMs for floorAfterMs -> onFloor() once: the GPU cannot cope at all
 *
 * A drop lowers the ceiling to the tier it lands on, so a tier that failed is never retried.
 * Frames longer than `stallMs` (tab switch, GC, shader compile) are ignored, and so are the first
 * `settleFrames` after every change (buffers are being reallocated).
 */
export function createQualityController({
  tier = 'medium',
  min = 'low',
  max = 'high',
  blockMs = 1000,
  slowMs = 24, // ~42 fps
  verySlowMs = 45, // ~22 fps
  fastMs = 18.5, // >= ~54 fps: a 60 Hz display is being fed every frame
  floorMs = 60, // ~16 fps
  settleFrames = 30,
  stallMs = 250,
  upgradeAfterMs = 8000,
  floorAfterMs = 4000,
  onChange = () => {},
  onFloor = () => {},
} = {}) {
  const lo = TIERS.indexOf(min);
  const hi = TIERS.indexOf(max);
  let idx = clamp(TIERS.indexOf(tier), lo, hi);
  let ceiling = hi; // highest tier that has not failed
  let settle = settleFrames;
  let blockTime = 0;
  let blockFrames = 0;
  let slowBlocks = 0;
  let goodTime = 0;
  let floorTime = 0;
  let floored = false;
  let mean = 0; // last block mean, ms

  const resetBlock = () => {
    blockTime = 0;
    blockFrames = 0;
  };

  function move(to, reason) {
    idx = to;
    settle = settleFrames;
    slowBlocks = 0;
    goodTime = 0;
    resetBlock();
    onChange(TIERS[idx], reason);
  }

  function judge(blockMean, elapsed) {
    mean = blockMean;
    if (blockMean > slowMs) {
      slowBlocks += 1;
      goodTime = 0;
      if (idx > lo && (blockMean > verySlowMs || slowBlocks >= 2)) {
        const to = blockMean > verySlowMs * 2 ? lo : idx - 1;
        ceiling = Math.min(ceiling, to);
        move(to, 'slow');
        return;
      }
    } else {
      slowBlocks = 0;
      goodTime = blockMean <= fastMs ? goodTime + elapsed : 0;
      if (goodTime >= upgradeAfterMs && idx < Math.min(ceiling, hi)) {
        move(idx + 1, 'headroom');
        return;
      }
    }
    if (idx === lo && blockMean > floorMs) {
      floorTime += elapsed;
      if (floorTime >= floorAfterMs && !floored) {
        floored = true;
        onFloor();
      }
    } else {
      floorTime = 0;
    }
  }

  return {
    /** One rendered frame took `dtMs`. */
    push(dtMs) {
      if (!(dtMs > 0)) return;
      if (dtMs > stallMs) {
        resetBlock();
        return;
      }
      if (settle > 0) {
        settle -= 1;
        return;
      }
      blockTime += dtMs;
      blockFrames += 1;
      if (blockTime < blockMs) return;
      const elapsed = blockTime;
      const blockMean = blockTime / blockFrames;
      resetBlock();
      judge(blockMean, elapsed);
    },
    /** Rendering was paused (hidden tab, off-screen): forget the partial block. */
    reset() {
      resetBlock();
      settle = Math.max(settle, 5);
    },
    get tier() {
      return TIERS[idx];
    },
    stats() {
      return { tier: TIERS[idx], ceiling: TIERS[ceiling], meanMs: mean, floored };
    },
  };
}
