import { describe, expect, it, vi } from 'vitest';
import {
  TIERS,
  computeRenderSize,
  createQualityController,
  estimateTargetBytes,
  pickInitialTier,
} from '../../src/quality.js';

// Push `ms` worth of frames of `dt` ms each.
const feed = (ctl, ms, dt) => {
  for (let elapsed = 0; elapsed < ms; elapsed += dt) ctl.push(dt);
};

// Push frames of `dt` ms until the controller changes tier (at most `limitMs`).
const feedUntilChange = (ctl, dt, limitMs = 60_000) => {
  const before = ctl.tier;
  for (let elapsed = 0; elapsed < limitMs && ctl.tier === before; elapsed += dt) ctl.push(dt);
};

describe('pickInitialTier', () => {
  const desktop = { width: 1440, height: 900, dpr: 2, cores: 8, deviceMemory: 8 };

  it('starts strong desktops at high', () => {
    expect(pickInitialTier(desktop)).toBe('high');
    expect(pickInitialTier({})).toBe('high');
  });

  it('starts touch devices one tier lower', () => {
    expect(pickInitialTier({ ...desktop, coarsePointer: true })).toBe('medium');
  });

  it('starts weak hardware low', () => {
    expect(pickInitialTier({ ...desktop, cores: 4, deviceMemory: 4 })).toBe('low');
    expect(pickInitialTier({ ...desktop, deviceMemory: 1 })).toBe('low');
    expect(pickInitialTier({ ...desktop, coarsePointer: true, cores: 4 })).toBe('low');
  });

  it('starts software renderers and data-saver users low', () => {
    expect(pickInitialTier({ ...desktop, software: true })).toBe('low');
    expect(pickInitialTier({ ...desktop, saveData: true })).toBe('low');
  });

  it('steps down for very large back buffers', () => {
    expect(pickInitialTier({ ...desktop, width: 3840, height: 2160, dpr: 2 })).toBe('medium');
  });

  it('does not penalise unknown hints (Firefox/Safari expose fewer)', () => {
    expect(pickInitialTier({ width: 1440, height: 900, dpr: 2 })).toBe('high');
  });
});

describe('computeRenderSize', () => {
  it('caps the pixel ratio at the tier ceiling', () => {
    const size = computeRenderSize(1000, 600, 3, { dprMax: 2, maxPixels: 1e8 });
    expect(size).toEqual({ dpr: 2, width: 2000, height: 1200 });
  });

  it('caps the pixel count at the tier budget', () => {
    const size = computeRenderSize(1920, 1080, 2, { dprMax: 2, maxPixels: 4e6 });
    expect(size.dpr).toBeCloseTo(Math.sqrt(4e6 / (1920 * 1080)), 5);
    expect(size.width * size.height).toBeLessThanOrEqual(4e6 * 1.001);
  });

  it('follows the device when it is below both caps', () => {
    expect(computeRenderSize(800, 600, 1, { dprMax: 2, maxPixels: 4e6 }).dpr).toBe(1);
    expect(computeRenderSize(800, 600, 0, { dprMax: 2, maxPixels: 4e6 }).dpr).toBe(1);
  });

  it('never returns a degenerate buffer', () => {
    const size = computeRenderSize(0, 0, 1, { dprMax: 1, maxPixels: 1e5 });
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
    expect(computeRenderSize(8000, 8000, 1, { dprMax: 1, maxPixels: 1e5 }).dpr).toBe(0.5);
  });
});

describe('estimateTargetBytes', () => {
  const base = { width: 1000, height: 1000 };

  it('adds up scene target, output target and bloom chain', () => {
    expect(estimateTargetBytes({ ...base, msaa: 0, bloom: false })).toBe(20_000_000);
    expect(estimateTargetBytes({ ...base, msaa: 0, bloom: true })).toBe(27_300_000);
  });

  it('grows with multisampling', () => {
    expect(estimateTargetBytes({ ...base, msaa: 4, bloom: false })).toBe(64_000_000);
  });
});

describe('createQualityController', () => {
  const make = (opts = {}) => {
    const onChange = vi.fn();
    const onFloor = vi.fn();
    const ctl = createQualityController({ onChange, onFloor, ...opts });
    return { ctl, onChange, onFloor };
  };

  it('holds steady while frames are on time', () => {
    const { ctl, onChange } = make({ tier: 'high' });
    feed(ctl, 30_000, 16.7);
    expect(ctl.tier).toBe('high');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drops a tier after sustained slow frames, and again if it stays slow', () => {
    const { ctl, onChange } = make({ tier: 'high' });
    feed(ctl, 6_000, 40);
    expect(ctl.tier).toBe('medium');
    expect(onChange).toHaveBeenCalledWith('medium', 'slow');
    feed(ctl, 8_000, 40);
    expect(ctl.tier).toBe('low');
    expect(onChange).toHaveBeenLastCalledWith('low', 'slow');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('needs two slow blocks in a row for a moderate slowdown', () => {
    const { ctl, onChange } = make({ tier: 'medium', settleFrames: 0 });
    feed(ctl, 1_000, 30); // one slow block...
    feed(ctl, 3_000, 16.7); // ...then recovery: no change
    expect(onChange).not.toHaveBeenCalled();
    feed(ctl, 2_100, 30); // two in a row
    expect(onChange).toHaveBeenCalledWith('low', 'slow');
  });

  it('drops at once when frames are very slow', () => {
    const { ctl, onChange } = make({ tier: 'high', settleFrames: 0 });
    feed(ctl, 1_000, 60);
    expect(ctl.tier).toBe('medium');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('jumps to the lowest tier when the device cannot cope at all', () => {
    const { ctl, onChange } = make({ tier: 'high', settleFrames: 0 });
    feed(ctl, 1_000, 120);
    expect(ctl.tier).toBe('low');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('never climbs back after a tier failed', () => {
    const { ctl, onChange } = make({ tier: 'high' });
    feedUntilChange(ctl, 40);
    expect(ctl.tier).toBe('medium');
    onChange.mockClear();
    feed(ctl, 120_000, 16.7); // two minutes of perfect frames
    expect(ctl.tier).toBe('medium');
    expect(onChange).not.toHaveBeenCalled();
    expect(ctl.stats().ceiling).toBe('medium');
  });

  it('climbs while frames stay on time, one tier per headroom window, up to the maximum', () => {
    const { ctl, onChange } = make({ tier: 'low' });
    feed(ctl, 7_000, 16.7);
    expect(ctl.tier).toBe('low'); // 8 s of headroom are required first
    feed(ctl, 3_000, 16.7);
    expect(ctl.tier).toBe('medium');
    feed(ctl, 12_000, 16.7);
    expect(ctl.tier).toBe('high');
    feed(ctl, 60_000, 16.7);
    expect(ctl.tier).toBe('high');
    expect(onChange.mock.calls.map(([tier, reason]) => `${tier}:${reason}`)).toEqual([
      'medium:headroom',
      'high:headroom',
    ]);
  });

  it('does not oscillate: a failed climb is final', () => {
    const { ctl, onChange } = make({ tier: 'low', max: 'medium' });
    feed(ctl, 10_000, 16.7); // climbs to medium
    expect(ctl.tier).toBe('medium');
    feed(ctl, 6_000, 40); // medium is too heavy: back to low, and low is now the ceiling
    expect(ctl.tier).toBe('low');
    feed(ctl, 300_000, 16.7);
    expect(ctl.tier).toBe('low');
    expect(onChange.mock.calls.map(([tier, reason]) => `${tier}:${reason}`)).toEqual([
      'medium:headroom',
      'low:slow',
    ]);
  });

  it('does not treat a display that caps at 30 fps as headroom', () => {
    const { ctl } = make({ tier: 'low' });
    feed(ctl, 60_000, 33.3);
    expect(ctl.tier).toBe('low');
  });

  it('ignores stalls (tab switches, GC, shader compiles)', () => {
    const { ctl, onChange } = make({ tier: 'high', settleFrames: 0 });
    for (let i = 0; i < 600; i += 1) {
      ctl.push(16.7);
      if (i % 60 === 0) ctl.push(900);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores the frames right after a change while buffers are reallocated', () => {
    const { ctl, onChange } = make({ tier: 'high', settleFrames: 30 });
    feedUntilChange(ctl, 40);
    expect(ctl.tier).toBe('medium');
    onChange.mockClear();
    for (let i = 0; i < 30; i += 1) ctl.push(200); // 30 hitchy frames while buffers settle
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports the floor once when even the lowest tier cannot keep up', () => {
    const { ctl, onFloor } = make({ tier: 'low' });
    feed(ctl, 15_000, 80);
    expect(onFloor).toHaveBeenCalledTimes(1);
    feed(ctl, 15_000, 80);
    expect(onFloor).toHaveBeenCalledTimes(1);
    expect(ctl.stats().floored).toBe(true);
  });

  it('does not report the floor for merely mediocre frames on the lowest tier', () => {
    const { ctl, onFloor } = make({ tier: 'low' });
    feed(ctl, 30_000, 30);
    expect(onFloor).not.toHaveBeenCalled();
  });

  it('respects min and max', () => {
    const { ctl } = make({ tier: 'high', min: 'medium', max: 'high' });
    feed(ctl, 20_000, 100);
    expect(ctl.tier).toBe('medium');
    const capped = make({ tier: 'medium', min: 'low', max: 'medium' });
    feed(capped.ctl, 60_000, 16.7);
    expect(capped.ctl.tier).toBe('medium');
  });

  it('reset() drops the partial block but keeps the tier', () => {
    const { ctl } = make({ tier: 'medium' });
    feed(ctl, 500, 16.7);
    ctl.reset();
    expect(ctl.tier).toBe('medium');
  });

  it('exposes tiers in ascending order', () => {
    expect(TIERS).toEqual(['low', 'medium', 'high']);
  });
});
