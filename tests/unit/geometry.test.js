import { describe, expect, it } from 'vitest';
import { createIcosphere } from '../../src/geometry.js';

describe('createIcosphere', () => {
  it.each([0, 1, 2, 5, 16, 64])('detail %i: counts follow the icosphere formulas', (detail) => {
    const n = detail + 1;
    const g = createIcosphere(1.2, detail);
    expect(g.vertexCount).toBe(10 * n * n + 2);
    expect(g.triangleCount).toBe(20 * n * n);
    expect(g.positions).toHaveLength(g.vertexCount * 3);
    expect(g.normals).toHaveLength(g.vertexCount * 3);
    expect(g.indices).toHaveLength(g.triangleCount * 3);
  });

  it('every vertex lies on the sphere and its normal is the outward unit vector', () => {
    const radius = 1.2;
    const g = createIcosphere(radius, 8);
    for (let v = 0; v < g.vertexCount; v += 1) {
      const [x, y, z] = [g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2]];
      const [nx, ny, nz] = [g.normals[v * 3], g.normals[v * 3 + 1], g.normals[v * 3 + 2]];
      expect(Math.hypot(x, y, z)).toBeCloseTo(radius, 5);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      expect(x).toBeCloseTo(nx * radius, 5);
      expect(y).toBeCloseTo(ny * radius, 5);
      expect(z).toBeCloseTo(nz * radius, 5);
    }
  });

  it('shares vertices: no two vertices coincide and every one is used', () => {
    const g = createIcosphere(1, 6);
    const seen = new Set();
    for (let v = 0; v < g.vertexCount; v += 1) {
      const key = [0, 1, 2].map((k) => g.positions[v * 3 + k].toFixed(4)).join(',');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(new Set(g.indices).size).toBe(g.vertexCount);
  });

  it('is a closed surface: every edge borders exactly two triangles (Euler characteristic 2)', () => {
    const g = createIcosphere(1, 5);
    const edges = new Map();
    for (let t = 0; t < g.triangleCount; t += 1) {
      const [a, b, c] = [g.indices[t * 3], g.indices[t * 3 + 1], g.indices[t * 3 + 2]];
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = u < v ? `${u}-${v}` : `${v}-${u}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    expect(g.vertexCount - edges.size + g.triangleCount).toBe(2);
  });

  it('winds every triangle counter-clockwise seen from outside (front faces)', () => {
    const g = createIcosphere(1, 7);
    const p = (i) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
    for (let t = 0; t < g.triangleCount; t += 1) {
      const [a, b, c] = [p(g.indices[t * 3]), p(g.indices[t * 3 + 1]), p(g.indices[t * 3 + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const centre = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
      const facing = normal[0] * centre[0] + normal[1] * centre[1] + normal[2] * centre[2];
      expect(facing).toBeGreaterThan(0);
    }
  });

  it('covers the sphere evenly enough: total triangle area approaches the sphere area', () => {
    const g = createIcosphere(1, 24);
    let area = 0;
    const p = (i) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
    for (let t = 0; t < g.triangleCount; t += 1) {
      const [a, b, c] = [p(g.indices[t * 3]), p(g.indices[t * 3 + 1]), p(g.indices[t * 3 + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      area +=
        0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    }
    expect(area / (4 * Math.PI)).toBeGreaterThan(0.995);
    expect(area / (4 * Math.PI)).toBeLessThan(1);
  });

  it('uses 16-bit indices while they fit and 32-bit beyond that', () => {
    expect(createIcosphere(1, 64).indices).toBeInstanceOf(Uint16Array); // 42,252 vertices
    expect(createIcosphere(1, 80).indices).toBeInstanceOf(Uint32Array); // 65,612 vertices
  });

  it('needs about six times fewer vertices than the non-indexed geometry it replaces', () => {
    const detail = 64;
    const indexed = createIcosphere(1, detail).vertexCount;
    const nonIndexed = 20 * (detail + 1) ** 2 * 3; // what three's IcosahedronGeometry uploads
    expect(nonIndexed / indexed).toBeGreaterThan(5.9);
  });
});
