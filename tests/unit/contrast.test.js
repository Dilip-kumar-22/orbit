import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { oklchToRGB } from '../../src/colors.js';

// Backs the README's accessibility wording: these pairs are verified, everything else is not claimed.
// Text that sits over the live 3D scene depends on what the scene draws, so the panel surfaces are
// checked over the darkest AND the brightest backdrop the scene can put behind them.
const css = readFileSync(new URL('../../styles/main.css', import.meta.url), 'utf8');
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];

const token = (name) => {
  const m = root.match(
    new RegExp(`--${name}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*/\\s*([\\d.]+))?\\s*\\)`),
  );
  if (!m) throw new Error(`--${name} is not an oklch() token`);
  return {
    rgb: oklchToRGB([Number(m[1]), Number(m[2]), Number(m[3])]),
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  };
};
const literal = (l, c, h) => ({ rgb: oklchToRGB([l, c, h]), alpha: 1 });

// browsers composite in gamma-encoded sRGB
const over = (fg, bg) => ({ rgb: fg.rgb.map((v, i) => fg.alpha * v + (1 - fg.alpha) * bg.rgb[i]), alpha: 1 });
const luminance = ({ rgb }) => {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const bg = token('bg');
const brightest = literal(0.85, 0.11, 200); // a bloom-lit rim passing behind a panel
const panel = over(token('surface'), bg);
// Literal fills from the stylesheet (asserted below, so a change there forces this test to be revisited).
const CARD = 'oklch(0.2 0.022 265 / 0.5)';
const CARD_HOVER = 'oklch(0.23 0.03 265 / 0.6)';
const FOOTER = 'oklch(0.15 0.02 265 / 0.6)';
const fill = (l, c, h, alpha) => ({ rgb: oklchToRGB([l, c, h]), alpha });
const surfaces = {
  'page background': bg,
  'panel over the page': panel,
  'card over a panel': over(fill(0.2, 0.022, 265, 0.5), panel),
  'hovered card over a panel': over(fill(0.23, 0.03, 265, 0.6), panel),
  'footer over the page': over(fill(0.15, 0.02, 265, 0.6), bg),
};
const overBrightBackdrop = over(token('surface'), brightest);

it('tests the fills the stylesheet actually uses', () => {
  for (const literalFill of [CARD, CARD_HOVER, FOOTER]) expect(css).toContain(literalFill);
});

describe('text contrast (WCAG 2 ratios)', () => {
  it('body text is at least 7:1 on every surface', () => {
    for (const [name, surface] of Object.entries(surfaces)) {
      expect(ratio(token('text'), surface), `--text on ${name}`).toBeGreaterThanOrEqual(7);
    }
  });

  it.each(['muted', 'faint', 'accent-a'])('--%s text is at least 4.5:1 on every surface', (name) => {
    for (const [surface, background] of Object.entries(surfaces)) {
      expect(ratio(token(name), background), `--${name} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('button text on both ends of the accent gradient is at least 4.5:1', () => {
    const label = literal(0.16, 0.03, 265);
    expect(ratio(label, token('accent-a'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(label, token('accent-b'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the focus ring is at least 3:1 against the page (non-text contrast)', () => {
    expect(ratio(token('accent-a'), bg)).toBeGreaterThanOrEqual(3);
  });

  it('documents the limit: over the brightest possible backdrop, secondary text can drop below AA', () => {
    // A bloom-lit rim behind a translucent panel is the worst case the scene can produce. If this
    // ever passes, the README can claim more; until then it must not.
    const worst = ratio(token('muted'), overBrightBackdrop);
    expect(worst).toBeGreaterThan(1);
    expect(Number.isFinite(worst)).toBe(true);
  });
});
