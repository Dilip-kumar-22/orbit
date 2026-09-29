import * as THREE from 'three';
import { particleFragment, particleVertex } from './shaders.js';

/** mulberry32: a tiny seeded PRNG, so a given seed always produces the same galaxy. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A flattened galaxy disc: positions plus a per-point random that drives size, twinkle and tint.
 * Points are generated one after another, so the first N of a bigger galaxy are a uniform sample
 * of the same disc: quality tiers can simply draw fewer of them.
 */
export function generateParticleData({ count, radius, innerRadius }, random = Math.random) {
  const positions = new Float32Array(count * 3);
  const rand = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const r = innerRadius + Math.pow(random(), 0.6) * (radius - innerRadius);
    const theta = random() * Math.PI * 2;
    const flatten = 0.26 * (1 - (r / radius) * 0.5);
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = (random() - 0.5) * radius * flatten;
    positions[i * 3 + 2] = Math.sin(theta) * r;
    rand[i] = random();
  }
  return { positions, rand };
}

/**
 * The galaxy as one draw call. Buffers are sized for `maxCount` (the biggest tier); `setCount`
 * changes only the draw range, so switching quality allocates nothing.
 */
export function createParticles(config, { maxCount, color }) {
  const { radius, innerRadius, size, seed } = config.particles;
  const random = seed === null ? Math.random : mulberry32(seed);
  const { positions, rand } = generateParticleData({ count: maxCount, radius, innerRadius }, random);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  geometry.setDrawRange(0, maxCount);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: size },
      uPixelRatio: { value: 1 },
      uMaxSize: { value: 48 },
      uColor: { value: color },
      uTime: { value: 0 },
    },
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // spans the whole scene and spins around its centre

  return {
    points,
    uniforms: material.uniforms,
    get count() {
      return geometry.drawRange.count;
    },
    setCount(n) {
      geometry.setDrawRange(0, Math.min(maxCount, Math.max(0, Math.floor(n))));
    },
    /** `maxPointSize`: the GPU's point-size limit in device pixels. */
    setPixelRatio(dpr, maxPointSize = Infinity) {
      material.uniforms.uPixelRatio.value = dpr;
      material.uniforms.uMaxSize.value = Math.min(48 * dpr, maxPointSize);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
