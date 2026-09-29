import { describe, expect, it } from 'vitest';
import { oklchToRGB } from '../../src/colors.js';

const close = (actual, expected, tolerance = 0.005) => {
  actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(tolerance));
};

describe('oklchToRGB', () => {
  it('maps the neutral axis to grey and the extremes to black and white', () => {
    expect(oklchToRGB([0, 0, 0])).toEqual([0, 0, 0]);
    close(oklchToRGB([1, 0, 0]), [1, 1, 1], 1e-3);
    const [r, g, b] = oklchToRGB([0.5, 0, 123]);
    expect(r).toBeCloseTo(g, 6);
    expect(g).toBeCloseTo(b, 6);
  });

  it.each([
    ['sRGB red', [0.62796, 0.25768, 29.23388], [1, 0, 0]],
    ['sRGB green', [0.86644, 0.29483, 142.49535], [0, 1, 0]],
    ['sRGB blue', [0.45201, 0.31321, 264.05202], [0, 0, 1]],
    ['sRGB yellow', [0.96798, 0.21101, 109.76923], [1, 1, 0]],
    ['sRGB cyan', [0.9054, 0.15455, 194.76893], [0, 1, 1]],
    ['sRGB magenta', [0.70167, 0.32249, 328.36341], [1, 0, 1]],
  ])('reproduces the CSS Color 4 reference for %s', (_name, oklch, rgb) => {
    close(oklchToRGB(oklch), rgb);
  });

  it('is periodic in hue', () => {
    close(oklchToRGB([0.7, 0.1, 40]), oklchToRGB([0.7, 0.1, 400]), 1e-9);
    close(oklchToRGB([0.7, 0.1, -320]), oklchToRGB([0.7, 0.1, 40]), 1e-9);
  });

  it('clamps out-of-gamut colours into 0..1', () => {
    for (const hue of [0, 90, 180, 270]) {
      for (const channel of oklchToRGB([0.7, 0.5, hue])) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gets lighter as lightness rises', () => {
    const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luma(oklchToRGB([0.8, 0.1, 200]))).toBeGreaterThan(luma(oklchToRGB([0.4, 0.1, 200])));
  });
});
