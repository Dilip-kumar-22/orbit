import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createParticles, generateParticleData, mulberry32 } from '../../src/particles.js';

const disc = { radius: 9, innerRadius: 2.2 };

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(seqA);
    expect(Array.from({ length: 50 }, c)).not.toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('looks uniform enough', () => {
    const rand = mulberry32(7);
    const values = Array.from({ length: 20000 }, rand);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });
});

describe('generateParticleData', () => {
  it('keeps every point inside the flattened disc', () => {
    const { positions, rand } = generateParticleData({ count: 4000, ...disc }, mulberry32(1));
    for (let i = 0; i < 4000; i += 1) {
      const r = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
      expect(r).toBeGreaterThanOrEqual(disc.innerRadius - 1e-4);
      expect(r).toBeLessThanOrEqual(disc.radius + 1e-4);
      expect(Math.abs(positions[i * 3 + 1])).toBeLessThanOrEqual(disc.radius * 0.26 * 0.5 + 1e-4);
      expect(rand[i]).toBeGreaterThanOrEqual(0);
      expect(rand[i]).toBeLessThan(1);
    }
  });

  it('gives the same galaxy for the same seed, and a smaller galaxy is a prefix of a bigger one', () => {
    const big = generateParticleData({ count: 1000, ...disc }, mulberry32(9));
    const again = generateParticleData({ count: 1000, ...disc }, mulberry32(9));
    const small = generateParticleData({ count: 100, ...disc }, mulberry32(9));
    expect(again.positions).toEqual(big.positions);
    expect(small.positions).toEqual(big.positions.slice(0, 300));
    expect(small.rand).toEqual(big.rand.slice(0, 100));
  });
});

describe('createParticles', () => {
  const color = new THREE.Color();

  it('seeds the galaxy from config.particles.seed', () => {
    const a = createParticles(
      { ...CONFIG, particles: { ...CONFIG.particles, seed: 5 } },
      { maxCount: 200, color },
    );
    const b = createParticles(
      { ...CONFIG, particles: { ...CONFIG.particles, seed: 5 } },
      { maxCount: 200, color },
    );
    expect(b.points.geometry.attributes.position.array).toEqual(a.points.geometry.attributes.position.array);
    a.dispose();
    b.dispose();
  });

  it('switches quality by draw range only, clamped to the buffer', () => {
    const p = createParticles(CONFIG, { maxCount: 1000, color });
    const positions = p.points.geometry.attributes.position;
    expect(p.count).toBe(1000);
    p.setCount(250);
    expect(p.count).toBe(250);
    expect(p.points.geometry.attributes.position).toBe(positions); // no reallocation
    p.setCount(99999);
    expect(p.count).toBe(1000);
    p.setCount(-5);
    expect(p.count).toBe(0);
    p.dispose();
  });

  it('caps point size by both the device ratio and the GPU limit', () => {
    const p = createParticles(CONFIG, { maxCount: 10, color });
    p.setPixelRatio(2, 1000);
    expect(p.uniforms.uMaxSize.value).toBe(96);
    expect(p.uniforms.uPixelRatio.value).toBe(2);
    p.setPixelRatio(2, 64);
    expect(p.uniforms.uMaxSize.value).toBe(64);
    p.dispose();
  });
});
