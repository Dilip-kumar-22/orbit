import { describe, expect, it } from 'vitest';
import {
  HOLD,
  SECTION_DEFAULTS,
  buildTimeline,
  measureAnchors,
  sampleTimeline,
} from '../../src/choreography.js';

describe('measureAnchors', () => {
  const rects = [
    { name: 'a', top: 0, height: 800 },
    { name: 'b', top: 800, height: 800 },
    { name: 'c', top: 1600, height: 800 },
  ];

  it('places each section where its centre meets the viewport centre', () => {
    const anchors = measureAnchors(rects, 2400, 800);
    expect(anchors.map((a) => a.name)).toEqual(['a', 'b', 'c']);
    expect(anchors.map((a) => a.at)).toEqual([0, 0.5, 1]);
  });

  it('clamps to 0..1 and survives a page that does not scroll', () => {
    const anchors = measureAnchors([{ name: 'a', top: 5000, height: 100 }], 600, 800);
    expect(anchors[0].at).toBe(1);
    expect(measureAnchors([{ name: 'a', top: 0, height: 100 }], 500, 800)[0].at).toBe(0);
  });
});

describe('buildTimeline', () => {
  const sections = { a: { hue: 10, cameraZ: 4 }, b: { hue: 20 }, c: { hue: 30, coreScale: 2 } };

  it('fills missing fields from the neutral defaults', () => {
    const { keys } = buildTimeline(sections, [{ name: 'a', at: 0 }]);
    expect(keys[0]).toMatchObject({ ...SECTION_DEFAULTS, hue: 10, cameraZ: 4, name: 'a', at: 0 });
  });

  it('skips sections the config does not know about', () => {
    const { keys } = buildTimeline(sections, [
      { name: 'a', at: 0 },
      { name: 'zzz', at: 0.4 },
      { name: 'c', at: 1 },
    ]);
    expect(keys.map((k) => k.name)).toEqual(['a', 'c']);
  });

  it('forces anchors to be non-decreasing', () => {
    const { keys } = buildTimeline(sections, [
      { name: 'a', at: 0.5 },
      { name: 'b', at: 0.2 },
    ]);
    expect(keys.map((k) => k.at)).toEqual([0.5, 0.5]);
  });

  it('always yields at least one key', () => {
    expect(buildTimeline(sections, []).keys).toHaveLength(1);
    expect(buildTimeline({}, [{ name: 'a', at: 0.3 }]).keys[0]).toMatchObject(SECTION_DEFAULTS);
  });
});

describe('sampleTimeline', () => {
  const timeline = buildTimeline(
    {
      a: { hue: 0, cameraZ: 8, coreScale: 1, particleRotation: 0 },
      b: { hue: 90, cameraZ: 4, coreScale: 2, particleRotation: 1 },
      c: { hue: 180, cameraZ: 2, coreScale: 1, particleRotation: 3 },
    },
    [
      { name: 'a', at: 0 },
      { name: 'b', at: 0.5 },
      { name: 'c', at: 1 },
    ],
  );

  it('returns the exact state at each anchor', () => {
    expect(sampleTimeline(timeline, 0)).toMatchObject({ i0: 0, i1: 0, cameraZ: 8, coreScale: 1 });
    expect(sampleTimeline(timeline, 0.5)).toMatchObject({ i0: 1, i1: 2, t: 0, cameraZ: 4, coreScale: 2 });
    expect(sampleTimeline(timeline, 1)).toMatchObject({ i0: 2, i1: 2, cameraZ: 2, particleRotation: 3 });
  });

  it('clamps outside the first and last anchor', () => {
    expect(sampleTimeline(timeline, -1).cameraZ).toBe(8);
    expect(sampleTimeline(timeline, 7).cameraZ).toBe(2);
  });

  it('blends halfway at the middle of a gap', () => {
    const s = sampleTimeline(timeline, 0.25);
    expect(s).toMatchObject({ i0: 0, i1: 1 });
    expect(s.t).toBeCloseTo(0.5, 10);
    expect(s.cameraZ).toBeCloseTo(6, 10);
    expect(s.coreScale).toBeCloseTo(1.5, 10);
  });

  it('holds each state near its anchor before blending', () => {
    const gap = 0.5;
    expect(sampleTimeline(timeline, gap * (HOLD * 0.9)).t).toBe(0);
    expect(sampleTimeline(timeline, gap * (1 - HOLD * 0.9)).t).toBe(1);
  });

  it('blends monotonically from one anchor to the next', () => {
    let previous = 0;
    for (let p = 0.005; p < 0.5; p += 0.005) {
      const { t, i0, i1 } = sampleTimeline(timeline, p);
      expect([i0, i1]).toEqual([0, 1]);
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
    expect(previous).toBe(1); // arrives fully blended just before the next anchor
  });

  it('reuses the object it is given (no per-frame allocation)', () => {
    const out = {};
    expect(sampleTimeline(timeline, 0.3, out)).toBe(out);
    expect(sampleTimeline(timeline, 0.6, out)).toBe(out);
  });

  it('handles coincident anchors and a single key without NaN', () => {
    const same = buildTimeline({ a: { cameraZ: 3 }, b: { cameraZ: 9 } }, [
      { name: 'a', at: 0.4 },
      { name: 'b', at: 0.4 },
    ]);
    for (const p of [0, 0.4, 0.41, 1]) {
      const s = sampleTimeline(same, p);
      expect(Number.isFinite(s.cameraZ)).toBe(true);
      expect(Number.isFinite(s.t)).toBe(true);
    }
    const single = buildTimeline({ a: { cameraZ: 3 } }, [{ name: 'a', at: 0.7 }]);
    expect(sampleTimeline(single, 0.1).cameraZ).toBe(3);
    expect(sampleTimeline(single, 0.9).cameraZ).toBe(3);
  });
});
