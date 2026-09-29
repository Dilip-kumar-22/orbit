// Config validation and overrides. src/config.js stays plain, readable data; this file makes it safe to
// edit: an out-of-range value falls back to its default (with a console warning) instead of breaking
// the scene. Pure functions, no DOM: unit-tested in tests/unit/settings.test.js.
import { CONFIG } from './config.js';
import { SECTION_DEFAULTS } from './choreography.js';
import { TIERS } from './quality.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);

// Leaf validators: { ok(value) -> boolean, want: 'what a valid value looks like' }
const num = (min, max, { int = false } = {}) => ({
  ok: (v) => isNum(v) && v >= min && v <= max && (!int || Number.isInteger(v)),
  want: `${int ? 'an integer' : 'a number'} from ${min} to ${max}`,
});
const oneOf = (...values) => ({
  ok: (v) => values.includes(v),
  want: `one of ${values.map((x) => JSON.stringify(x)).join(', ')}`,
});
const bool = { ok: (v) => typeof v === 'boolean', want: 'true or false' };
const seed = {
  ok: (v) => v === null || Number.isInteger(v),
  want: 'an integer, or null for a random galaxy',
};
const oklch = {
  ok: (v) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(isNum) &&
    v[0] >= 0 &&
    v[0] <= 1 &&
    v[1] >= 0 &&
    v[1] <= 0.5,
  want: '[lightness 0-1, chroma 0-0.5, hue in degrees]',
};

const PROFILE = {
  coreDetail: num(1, 96, { int: true }),
  particles: num(0, 50000, { int: true }),
  dprMax: num(0.5, 3),
  maxPixels: num(1e5, 3e7),
  bloom: bool,
  msaa: oneOf(0, 2, 4, 8),
};

// Everything except `sections` (a free-form map of section name -> state, checked separately).
export const SCHEMA = {
  color: { background: oklch, coreA: oklch, coreB: oklch, particle: oklch },
  core: {
    radius: num(0.1, 10),
    displacement: num(0, 2),
    noiseScale: num(0.1, 8),
    speed: num(0, 5),
    rotate: num(-2, 2),
  },
  particles: { radius: num(1, 100), innerRadius: num(0, 50), size: num(0.001, 1), drift: num(-2, 2), seed },
  camera: { fov: num(10, 120), parallax: num(0, 3), ease: num(0.005, 1) },
  bloom: { strength: num(0, 3), radius: num(0, 1), threshold: num(0, 2) },
  exposure: num(0.1, 4),
  vignette: num(0.1, 2.5),
  quality: {
    level: oneOf('auto', ...TIERS),
    profiles: { low: PROFILE, medium: PROFILE, high: PROFILE },
  },
  reducedMotionScene: oneOf('static', 'disabled'),
  debug: bool,
};

export const SECTION_SCHEMA = {
  hue: num(-720, 720),
  cameraZ: num(0.5, 50),
  coreScale: num(0.1, 4),
  particleRotation: num(-20, 20),
};

const show = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));

function check(cfg, schema, path, problems) {
  for (const [key, spec] of Object.entries(schema)) {
    const here = path ? `${path}.${key}` : key;
    const value = cfg?.[key];
    if (typeof spec.ok === 'function') {
      if (!spec.ok(value))
        problems.push({ path: here, message: `expected ${spec.want}, got ${show(value)}` });
    } else if (!isPlain(value)) {
      problems.push({ path: here, message: `expected an object, got ${show(value)}` });
    } else {
      check(value, spec, here, problems);
    }
  }
}

function checkSections(sections, problems) {
  if (!isPlain(sections) || Object.keys(sections).length === 0) {
    problems.push({ path: 'sections', message: `expected at least one section, got ${show(sections)}` });
    return;
  }
  for (const [name, state] of Object.entries(sections)) {
    if (!isPlain(state)) {
      problems.push({ path: `sections.${name}`, message: `expected an object, got ${show(state)}` });
      continue;
    }
    for (const [prop, spec] of Object.entries(SECTION_SCHEMA)) {
      if (state[prop] !== undefined && !spec.ok(state[prop])) {
        problems.push({
          path: `sections.${name}.${prop}`,
          message: `expected ${spec.want}, got ${show(state[prop])}`,
        });
      }
    }
  }
}

/** Every problem in `cfg` as [{ path, message }]; an empty array means it is valid. */
export function validateConfig(cfg) {
  const problems = [];
  check(cfg, SCHEMA, '', problems);
  checkSections(cfg?.sections, problems);
  const p = cfg?.particles;
  if (isNum(p?.radius) && isNum(p?.innerRadius) && p.innerRadius >= p.radius) {
    problems.push({
      path: 'particles.innerRadius',
      message: `expected a number below particles.radius (${p.radius})`,
    });
  }
  return problems;
}

/** Option paths that exist in `cfg` but are not part of ORBIT's config (usually typos). */
export function unknownKeys(cfg) {
  const out = [];
  const walk = (value, schema, path) => {
    if (!isPlain(value)) return;
    for (const key of Object.keys(value)) {
      const here = path ? `${path}.${key}` : key;
      if (!(key in schema)) out.push(here);
      else if (typeof schema[key].ok !== 'function') walk(value[key], schema[key], here);
    }
  };
  const { sections, ...rest } = cfg ?? {};
  walk(rest, SCHEMA, '');
  for (const [name, state] of Object.entries(isPlain(sections) ? sections : {})) {
    if (!isPlain(state)) continue;
    for (const prop of Object.keys(state))
      if (!(prop in SECTION_SCHEMA)) out.push(`sections.${name}.${prop}`);
  }
  return out;
}

const clone = (v) =>
  Array.isArray(v)
    ? v.map(clone)
    : isPlain(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => !BLOCKED.has(k))
            .map(([k, x]) => [k, clone(x)]),
        )
      : v;

/** `base` with `over` merged in. Objects merge recursively; arrays and scalars replace. Neither is mutated. */
export function deepMerge(base, over) {
  const out = clone(base);
  if (!isPlain(over)) return out;
  for (const key of Object.keys(over)) {
    if (BLOCKED.has(key)) continue;
    out[key] = isPlain(over[key]) && isPlain(out[key]) ? deepMerge(out[key], over[key]) : clone(over[key]);
  }
  return out;
}

function defaultAt(defaults, path) {
  const [head, name, prop] = path.split('.');
  if (head === 'sections') {
    if (prop) return defaults.sections?.[name]?.[prop] ?? SECTION_DEFAULTS[prop];
    return name ? clone(defaults.sections?.[name] ?? {}) : clone(defaults.sections);
  }
  return clone(path.split('.').reduce((node, key) => node?.[key], defaults));
}

function setAt(cfg, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((node, key) => node[key], cfg)[last] = value;
}

function freeze(v) {
  if (v !== null && typeof v === 'object') Object.values(v).forEach(freeze);
  return Object.freeze(v);
}

/**
 * The config the scene runs with: defaults <- overrides (window.ORBIT_CONFIG) <- URL parameters.
 * Invalid values are replaced by their default and reported through `warn`.
 */
export function resolveConfig({ overrides, search = '', defaults = CONFIG, warn = console.warn } = {}) {
  const cfg = deepMerge(defaults, overrides);
  for (const key of unknownKeys(cfg)) warn(`[ORBIT] config: unknown option "${key}" is ignored.`);
  for (const { path, message } of validateConfig(cfg)) {
    warn(`[ORBIT] config.${path}: ${message}. Using the default.`);
    setAt(cfg, path, defaultAt(defaults, path));
  }

  const params = new URLSearchParams(search);
  if (params.has('quality')) {
    const level = params.get('quality');
    if (SCHEMA.quality.level.ok(level)) cfg.quality.level = level;
    else warn(`[ORBIT] ?quality=${level} ignored: expected ${SCHEMA.quality.level.want}.`);
  }
  if (params.has('debug')) cfg.debug = !['0', 'false', 'off'].includes(params.get('debug'));
  return freeze(cfg);
}
