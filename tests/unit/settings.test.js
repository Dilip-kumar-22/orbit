import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { deepMerge, resolveConfig, unknownKeys, validateConfig } from '../../src/settings.js';

const resolve = (opts = {}) => {
  const warn = vi.fn();
  return { cfg: resolveConfig({ ...opts, warn }), warn };
};

describe('shipped defaults', () => {
  it('are valid', () => {
    expect(validateConfig(CONFIG)).toEqual([]);
    expect(unknownKeys(CONFIG)).toEqual([]);
  });

  it('resolve to themselves, frozen, without warnings', () => {
    const { cfg, warn } = resolve();
    expect(cfg).toEqual(CONFIG);
    expect(warn).not.toHaveBeenCalled();
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen(cfg.color.coreA)).toBe(true);
  });

  it('do not expose the removed dead options', () => {
    expect(CONFIG.core).not.toHaveProperty('wireframeMix');
    expect(CONFIG.core).not.toHaveProperty('detail');
    expect(CONFIG.particles).not.toHaveProperty('count');
  });
});

describe('overrides', () => {
  it('deep-merge over the defaults without touching them', () => {
    const before = JSON.stringify(CONFIG);
    const { cfg } = resolve({ overrides: { quality: { profiles: { low: { particles: 100 } } } } });
    expect(cfg.quality.profiles.low.particles).toBe(100);
    expect(cfg.quality.profiles.low.coreDetail).toBe(CONFIG.quality.profiles.low.coreDetail);
    expect(cfg.quality.profiles.high).toEqual(CONFIG.quality.profiles.high);
    expect(JSON.stringify(CONFIG)).toBe(before);
  });

  it('replace arrays wholesale', () => {
    const { cfg } = resolve({ overrides: { color: { coreA: [0.6, 0.1, 30] } } });
    expect(cfg.color.coreA).toEqual([0.6, 0.1, 30]);
  });

  it('ignore prototype-polluting keys', () => {
    const overrides = JSON.parse(
      '{"__proto__": {"polluted": true}, "core": {"__proto__": {"polluted": true}}}',
    );
    const { cfg } = resolve({ overrides });
    expect({}.polluted).toBeUndefined();
    expect(cfg.core.polluted).toBeUndefined();
    expect(deepMerge({ a: 1 }, overrides)).toEqual({ a: 1, core: {} });
  });

  it('accept new sections with partial state', () => {
    const { cfg, warn } = resolve({ overrides: { sections: { pricing: { hue: 40 } } } });
    expect(cfg.sections.pricing).toEqual({ hue: 40 });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  it.each([
    ['out-of-range number', { bloom: { strength: 99 } }, 'bloom.strength', CONFIG.bloom.strength],
    ['NaN', { exposure: NaN }, 'exposure', CONFIG.exposure],
    ['Infinity', { core: { radius: Infinity } }, 'core.radius', CONFIG.core.radius],
    ['string instead of number', { camera: { fov: '42' } }, 'camera.fov', CONFIG.camera.fov],
    ['vignette that would invert the smoothstep edges', { vignette: 3 }, 'vignette', CONFIG.vignette],
    ['unknown quality level', { quality: { level: 'ultra' } }, 'quality.level', 'auto'],
    ['invalid msaa', { quality: { profiles: { high: { msaa: 3 } } } }, 'quality.profiles.high.msaa', 4],
    [
      'fractional detail',
      { quality: { profiles: { low: { coreDetail: 4.5 } } } },
      'quality.profiles.low.coreDetail',
      16,
    ],
    ['bad seed', { particles: { seed: 1.5 } }, 'particles.seed', null],
    ['unknown reduced-motion mode', { reducedMotionScene: 'off' }, 'reducedMotionScene', 'static'],
  ])('falls back to the default for %s', (_name, overrides, path, expected) => {
    const { cfg, warn } = resolve({ overrides });
    const value = path.split('.').reduce((node, key) => node[key], cfg);
    expect(value).toEqual(expected);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(path);
  });

  it('rejects malformed OKLCH colours', () => {
    for (const bad of [[0.5, 0.1], [2, 0.1, 100], [0.5, 0.9, 100], ['a', 0.1, 100], 'red']) {
      const { cfg } = resolve({ overrides: { color: { particle: bad } } });
      expect(cfg.color.particle).toEqual(CONFIG.color.particle);
    }
  });

  it('restores a whole subtree that was replaced by a non-object', () => {
    const { cfg, warn } = resolve({ overrides: { color: 5 } });
    expect(cfg.color).toEqual(CONFIG.color);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('requires innerRadius below radius', () => {
    const { cfg, warn } = resolve({ overrides: { particles: { radius: 3, innerRadius: 5 } } });
    expect(cfg.particles.innerRadius).toBe(CONFIG.particles.innerRadius);
    expect(warn.mock.calls[0][0]).toContain('particles.innerRadius');
  });

  it('checks section fields and falls back per field', () => {
    const { cfg, warn } = resolve({ overrides: { sections: { work: { cameraZ: -4, coreScale: 2 } } } });
    expect(cfg.sections.work.cameraZ).toBe(CONFIG.sections.work.cameraZ);
    expect(cfg.sections.work.coreScale).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('restores the default sections when none are left', () => {
    const { cfg } = resolve({ overrides: { sections: 'nope' } });
    expect(cfg.sections).toEqual(CONFIG.sections);
  });

  it('warns about unknown options but keeps working', () => {
    const { cfg, warn } = resolve({
      overrides: { bloomm: { strength: 1 }, core: { wireframeMix: 0.5 }, sections: { hero: { zoom: 2 } } },
    });
    const messages = warn.mock.calls.map(([m]) => m).join('\n');
    expect(messages).toContain('"bloomm"');
    expect(messages).toContain('"core.wireframeMix"');
    expect(messages).toContain('"sections.hero.zoom"');
    expect(cfg.bloom).toEqual(CONFIG.bloom);
  });
});

describe('URL parameters', () => {
  it('?quality picks a tier', () => {
    expect(resolve({ search: '?quality=low' }).cfg.quality.level).toBe('low');
    expect(resolve({ search: '?quality=auto' }).cfg.quality.level).toBe('auto');
  });

  it('?quality with an unknown value is ignored with a warning', () => {
    const { cfg, warn } = resolve({ search: '?quality=ultra', overrides: { quality: { level: 'medium' } } });
    expect(cfg.quality.level).toBe('medium');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('?debug turns diagnostics on, ?debug=0 turns them off', () => {
    expect(resolve({ search: '?debug' }).cfg.debug).toBe(true);
    expect(resolve({ search: '?debug=1' }).cfg.debug).toBe(true);
    expect(resolve({ search: '?debug=0', overrides: { debug: true } }).cfg.debug).toBe(false);
    expect(resolve({ search: '' }).cfg.debug).toBe(false);
  });
});
