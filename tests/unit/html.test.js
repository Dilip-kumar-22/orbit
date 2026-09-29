import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { oklchToRGB } from '../../src/colors.js';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('styles/main.css');

const meta = (attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];
const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

function pngSize(file) {
  const buf = readFileSync(new URL(`../../${file}`, import.meta.url));
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

describe('search and social metadata', () => {
  it('has a title and a description of a sensible length', () => {
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    expect(title.length).toBeLessThanOrEqual(70);
    expect(meta('name', 'description').length).toBeGreaterThanOrEqual(50);
    expect(meta('name', 'description').length).toBeLessThanOrEqual(160);
    expect(html).toMatch(/<html lang="en">/);
  });

  it('declares an absolute HTTPS canonical URL that og:url repeats', () => {
    expect(canonical).toMatch(/^https:\/\/[^/]+\/.*\/$|^https:\/\/[^/]+\/$/);
    expect(meta('property', 'og:url')).toBe(canonical);
  });

  it('points og:image and twitter:image at the same absolute HTTPS raster under that site', () => {
    const image = meta('property', 'og:image');
    expect(image).toMatch(/^https:\/\//);
    expect(image).toMatch(/\.png$/);
    expect(meta('name', 'twitter:image')).toBe(image);
    const site = new URL(canonical);
    const url = new URL(image);
    expect(url.origin).toBe(site.origin);
    const local = decodeURIComponent(url.pathname).slice(site.pathname.length);
    expect(local).toBe('assets/og.png');
    expect(statSync(new URL(`../../${local}`, import.meta.url)).isFile()).toBe(true);
  });

  it('describes the image accurately: size, type and alt text', () => {
    const { width, height, bytes } = pngSize('assets/og.png');
    expect([width, height]).toEqual([1200, 630]);
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:image:type')).toBe('image/png');
    expect(bytes).toBeLessThan(600 * 1024);
    expect(meta('property', 'og:image:alt').length).toBeGreaterThan(20);
    expect(meta('name', 'twitter:image:alt')).toBe(meta('property', 'og:image:alt'));
  });

  it('has complete Open Graph and Twitter card fields', () => {
    for (const name of ['og:title', 'og:description', 'og:type', 'og:site_name']) {
      expect(meta('property', name), name).toBeTruthy();
    }
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'));
    expect(meta('name', 'twitter:description')).toBe(meta('property', 'og:description'));
  });

  it('theme-color matches the page background', () => {
    const [l, c, h] = css
      .match(/--bg:\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/)
      .slice(1)
      .map(Number);
    const hex = `#${oklchToRGB([l, c, h])
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
    expect(meta('name', 'theme-color')).toBe(hex);
  });
});

describe('markup hygiene', () => {
  it('has no placeholder addresses', () => {
    expect(html).not.toMatch(/example\.(com|org)|hello@/i);
  });

  it('every scene section has a stage in the config, and the config has no orphan stages', () => {
    const names = [...html.matchAll(/<section[^>]*data-scene="([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(Object.keys(CONFIG.sections).sort()).toEqual([...names].sort());
  });

  it('every scene section has an id (the nav and the active-section logic key off it)', () => {
    for (const [tag] of html.matchAll(/<section[^>]*data-scene="[^"]+"[^>]*>/g))
      expect(tag).toMatch(/\sid="[^"]+"/);
  });

  it('stagger indices stay within what the stylesheet defines (1-9)', () => {
    const used = [...html.matchAll(/data-i="(\d+)"/g)].map((m) => Number(m[1]));
    expect(used.length).toBeGreaterThan(0);
    for (const i of used) {
      expect(i).toBeLessThanOrEqual(9);
      if (i > 0) expect(css).toContain(`.reveal[data-i='${i}']`);
    }
  });

  it('the skip link target can take focus', () => {
    expect(html).toMatch(/<a class="skip-link" href="#main">/);
    expect(html).toMatch(/<main id="main" tabindex="-1">/);
  });

  it('keeps the promises it makes: no claim of AA conformance or a "complete" reduced-motion path', () => {
    expect(html + read('README.md')).not.toMatch(
      /AA[- ]contrast|WCAG (2\.\d )?AA (compliant|conformant)|complete prefers-reduced-motion/i,
    );
  });
});
