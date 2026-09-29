import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  coreFragment,
  coreVertex,
  gradeFragment,
  gradeVertex,
  particleFragment,
  particleVertex,
} from '../../src/shaders.js';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const SHADERS = { coreVertex, coreFragment, particleVertex, particleFragment, gradeVertex, gradeFragment };

// GLSL's definition: t = clamp((x - edge0) / (edge1 - edge0), 0, 1); t * t * (3 - 2 * t).
// The result is undefined when edge0 >= edge1: that is what the rewritten calls avoid.
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// The arguments of every smoothstep( ... ) call in a shader's code, split at top-level commas.
function smoothstepCalls(source) {
  const src = stripComments(source);
  const calls = [];
  for (const m of src.matchAll(/smoothstep\s*\(/g)) {
    const args = [];
    let depth = 1;
    let current = '';
    for (let i = m.index + m[0].length; i < src.length && depth > 0; i += 1) {
      const c = src[i];
      if (c === '(') depth += 1;
      if (c === ')') depth -= 1;
      if (depth === 0) break;
      if (c === ',' && depth === 1) {
        args.push(current.trim());
        current = '';
      } else current += c;
    }
    args.push(current.trim());
    calls.push(args);
  }
  return calls;
}
const evaluate = (expr, uniforms) =>
  new Function(...Object.keys(uniforms), 'min', `return (${expr});`)(...Object.values(uniforms), Math.min);

describe('smoothstep edges are ascending (GLSL leaves edge0 >= edge1 undefined)', () => {
  const calls = Object.entries(SHADERS).flatMap(([name, src]) =>
    smoothstepCalls(src).map((args) => ({ name, args })),
  );

  it('finds the calls it is meant to check', () => {
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it.each(calls.map((c) => [`${c.name}: smoothstep(${c.args.join(', ')})`, c]))('%s', (_label, { args }) => {
    // literal or uniform-dependent: sample every uniform over (and beyond) its documented range
    for (const uVignette of [0, 0.1, 0.5, 0.9, 1, 2.5, 10, 1000]) {
      const [e0, e1] = [evaluate(args[0], { uVignette }), evaluate(args[1], { uVignette })];
      expect(e0, `edge0 for uVignette=${uVignette}`).toBeLessThan(e1);
    }
  });

  it('the particle alpha keeps the curve the old (reversed) arguments described', () => {
    for (let d = 0; d <= 0.5; d += 0.01) {
      expect(1 - smoothstep(0, 0.5, d)).toBeCloseTo(smoothstep(0.5, 0, d), 12);
    }
    expect(particleFragment).toContain('1.0 - smoothstep(0.0, 0.5, d)');
  });

  it('the vignette keeps the default look and stays valid for any uVignette', () => {
    const uVignette = 0.9;
    for (let x = 0; x <= 1.2; x += 0.02) {
      expect(1 - smoothstep(Math.min(uVignette * 0.35, 0.89), 0.9, x)).toBeCloseTo(
        smoothstep(0.9, uVignette * 0.35, x),
        12,
      );
    }
    expect(gradeFragment).toContain('1.0 - smoothstep(min(uVignette * 0.35, 0.89), 0.9,');
  });
});

describe('shader interfaces', () => {
  const varyings = (src) => new Set([...src.matchAll(/varying\s+\w+\s+(\w+)/g)].map((m) => m[1]));

  it('every varying a fragment shader reads is written by its vertex shader', () => {
    for (const [vertex, fragment] of [
      [coreVertex, coreFragment],
      [particleVertex, particleFragment],
      [gradeVertex, gradeFragment],
    ]) {
      const written = varyings(vertex);
      for (const name of varyings(fragment)) expect(written.has(name), name).toBe(true);
    }
  });

  it('declares the uniforms the scene and particles set', () => {
    const declared = (src) => new Set([...src.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]));
    expect([...declared(coreVertex + coreFragment)]).toEqual(
      expect.arrayContaining(['uTime', 'uAmp', 'uScale', 'uColorA', 'uColorB']),
    );
    expect([...declared(particleVertex + particleFragment)]).toEqual(
      expect.arrayContaining(['uSize', 'uPixelRatio', 'uMaxSize', 'uColor', 'uTime']),
    );
    expect([...declared(gradeFragment)]).toEqual(expect.arrayContaining(['tDiffuse', 'uVignette']));
  });
});

describe('third-party attribution', () => {
  const source = read('src/shaders.js');
  const notices = read('THIRD_PARTY_NOTICES.md');

  it('the simplex noise carries its upstream MIT notice and does not claim to be public domain', () => {
    const header = source.slice(0, source.indexOf('const SIMPLEX'));
    expect(header).toMatch(/Ashima Arts/);
    expect(header).toMatch(/Ian McEwan/);
    expect(header).toMatch(/MIT License/);
    expect(header).toMatch(/Permission is hereby granted, free of charge/);
    expect(header).toMatch(/THE SOFTWARE IS PROVIDED "AS IS"/);
    expect(header).toMatch(/Copyright \(C\) 2011 by Ashima Arts/);
    // the old header called the noise "standard, public-domain"; the only mention left is the correction
    expect(header).not.toMatch(/\(standard, public-domain\)/i);
    expect(source.match(/public[- ]domain/gi) ?? []).toHaveLength(1);
    expect(header).toMatch(/NOT public domain/);
  });

  it('the notice is a legal comment, so minifiers keep it', () => {
    expect(source).toMatch(/\/\*!\s*\n \* Third-party code/);
  });

  it('THIRD_PARTY_NOTICES.md covers every third-party component the repository ships', () => {
    for (const needle of [
      'three.js',
      'webgl-noise',
      'Ashima Arts',
      'Space Grotesk',
      'Inter',
      'SIL Open Font License',
      'MIT',
    ]) {
      expect(notices, needle).toContain(needle);
    }
    expect(notices).toContain('Permission is hereby granted, free of charge');
    expect(notices).toMatch(/is \*\*not\*\* public domain|not public domain/i);
  });
});
