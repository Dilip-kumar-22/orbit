import * as THREE from 'three';
import { particleVertex, particleFragment } from './shaders.js';
import { oklchToRGB } from './colors.js';

// A flattened "galaxy" disc of additive points that drifts and twinkles.
export function createParticles(cfg) {
  const { count, radius, innerRadius, size } = cfg.particles;
  const positions = new Float32Array(count * 3);
  const rand = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = innerRadius + Math.pow(Math.random(), 0.6) * (radius - innerRadius);
    const theta = Math.random() * Math.PI * 2;
    const flatten = 0.26 * (1 - (r / radius) * 0.5);
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * radius * flatten;
    positions[i * 3 + 2] = Math.sin(theta) * r;
    rand[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

  const c = new THREE.Color();
  const [pr, pg, pb] = oklchToRGB(cfg.color.particle);
  c.setRGB(pr, pg, pb, THREE.SRGBColorSpace);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: size },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uColor: { value: c },
      uTime: { value: 0 },
    },
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}
