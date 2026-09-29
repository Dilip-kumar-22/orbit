#!/usr/bin/env node
// Vendors the parts of three.js that ORBIT loads at runtime into vendor/three/, so the site is
// self-hosted (no CDN, no third-party request) and runs as plain static files.
//
//   npm run vendor         regenerate vendor/three/ from node_modules/three (run after bumping three)
//   npm run vendor:check   fail if vendor/three/ does not match node_modules/three (CI)
//
// What lands in vendor/three/:
//   three.core.js, three.module.js   the two files three ships in build/, minified (three no longer
//                                    ships .min.js builds; minifying roughly halves the transfer)
//   addons/**                        the postprocessing modules ORBIT imports plus every module they
//                                    import, copied byte for byte
//   LICENSE, manifest.json           three's MIT licence and a SHA-256 manifest of every file
//
// Trust chain: package-lock.json (npm verifies integrity) -> node_modules/three -> this script -> vendor/.
// `--check` re-hashes the upstream sources, verifies the vendored files against the manifest and proves
// the minified modules still export exactly what upstream exports. It does not re-minify, so a Vite
// upgrade alone never fails it.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_DIR = join(ROOT, 'node_modules', 'three');
const OUT_DIR = join(ROOT, 'vendor', 'three');
const MIN_FILES = ['three.core.js', 'three.module.js']; // from build/, minified
// Addon modules imported by src/. Everything they import is followed automatically.
const ADDON_ENTRIES = [
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'postprocessing/ShaderPass.js',
];

const sha256 = (buf) => `sha256-${createHash('sha256').update(buf).digest('base64')}`;
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function threeVersion() {
  const installed = readJson(join(PKG_DIR, 'package.json')).version;
  const pinned = readJson(join(ROOT, 'package.json')).dependencies?.three;
  if (installed !== pinned) {
    throw new Error(`node_modules/three is ${installed} but package.json pins ${pinned}. Run: npm ci`);
  }
  return installed;
}

// Relative and `three/addons/` imports of a module, i.e. the ones that need to be vendored too.
function localImports(source, file) {
  const found = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
  for (const [, spec] of source.matchAll(re)) {
    if (spec === 'three') continue; // resolved by the import map
    if (spec.startsWith('three/addons/')) found.push(spec.slice('three/addons/'.length));
    else if (spec.startsWith('./') || spec.startsWith('../'))
      found.push(posix.join(posix.dirname(file), spec));
    else throw new Error(`${file}: unexpected import "${spec}" - teach scripts/vendor-three.mjs about it`);
  }
  return found;
}

function collectAddons() {
  const base = join(PKG_DIR, 'examples', 'jsm');
  const files = new Map(); // path under examples/jsm -> Buffer
  const visit = (rel) => {
    if (files.has(rel)) return;
    if (rel.startsWith('..')) throw new Error(`${rel} escapes examples/jsm`);
    const buf = readFileSync(join(base, rel));
    files.set(rel, buf);
    for (const dep of localImports(buf.toString('utf8'), rel)) visit(dep);
  };
  ADDON_ENTRIES.forEach(visit);
  return files;
}

// Keep upstream's licence header: minifiers drop it.
function licenseBanner(source) {
  const header = source.match(/^\s*(\/\*\*[\s\S]*?\*\/)/)?.[1];
  if (!header || !header.includes('@license')) throw new Error('three build file lost its @license header');
  return `${header}\n`;
}

async function minify(name) {
  const path = join(PKG_DIR, 'build', name);
  const source = readFileSync(path, 'utf8');
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      copyPublicDir: false,
      lib: { entry: path, formats: ['es'], fileName: () => name },
      rollupOptions: {
        external: name === 'three.module.js' ? [/three\.core\.js$/] : [],
        output: { banner: licenseBanner(source) },
      },
    },
  });
  const chunks = (Array.isArray(result) ? result : [result])
    .flatMap((r) => r.output)
    .filter((o) => o.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`${name}: expected one output chunk, got ${chunks.length}`);
  return { code: Buffer.from(chunks[0].code, 'utf8'), source: Buffer.from(source, 'utf8') };
}

async function generate() {
  const version = threeVersion();
  const files = new Map(); // vendored path -> { buf, source, minified?, sourceSha256? }
  for (const name of MIN_FILES) {
    const { code, source } = await minify(name);
    files.set(name, { buf: code, source: `build/${name}`, minified: true, sourceSha256: sha256(source) });
  }
  for (const [rel, buf] of collectAddons()) {
    files.set(`addons/${rel}`, { buf, source: `examples/jsm/${rel}` });
  }
  files.set('LICENSE', { buf: readFileSync(join(PKG_DIR, 'LICENSE')), source: 'LICENSE' });
  return { version, files };
}

function manifestOf({ version, files }) {
  const entries = [...files.keys()].sort().map((path) => {
    const f = files.get(path);
    const entry = { sha256: sha256(f.buf), source: f.source };
    if (f.minified) Object.assign(entry, { minified: true, sourceSha256: f.sourceSha256 });
    return [path, entry];
  });
  return { package: 'three', version, license: 'MIT', files: Object.fromEntries(entries) };
}

function listFiles(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(full).isDirectory() ? listFiles(full, rel) : [rel];
  });
}

async function write() {
  const generated = await generate();
  rmSync(OUT_DIR, { recursive: true, force: true });
  for (const [path, { buf }] of generated.files) {
    const target = join(OUT_DIR, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buf);
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifestOf(generated), null, 2)}\n`);
  const total = [...generated.files.values()].reduce((n, f) => n + f.buf.length, 0);
  console.log(
    `vendored three@${generated.version}: ${generated.files.size} files, ${(total / 1024).toFixed(0)} KiB -> vendor/three/`,
  );
}

async function check() {
  const problems = [];
  const version = threeVersion();
  const manifest = readJson(join(OUT_DIR, 'manifest.json'));
  if (manifest.version !== version)
    problems.push(`manifest is for three@${manifest.version}, installed is ${version}`);

  const vendored = new Set(listFiles(OUT_DIR).filter((f) => f !== 'manifest.json'));
  for (const path of Object.keys(manifest.files)) if (!vendored.has(path)) problems.push(`missing: ${path}`);
  for (const path of vendored) if (!manifest.files[path]) problems.push(`not in manifest: ${path}`);

  for (const [path, entry] of Object.entries(manifest.files)) {
    if (!vendored.has(path)) continue;
    const buf = readFileSync(join(OUT_DIR, path));
    if (sha256(buf) !== entry.sha256) problems.push(`modified: ${path}`);
    const upstream = sha256(readFileSync(join(PKG_DIR, entry.source)));
    if (entry.minified) {
      if (upstream !== entry.sourceSha256)
        problems.push(`upstream ${entry.source} changed - run: npm run vendor`);
    } else if (upstream !== entry.sha256) {
      problems.push(`upstream ${entry.source} changed - run: npm run vendor`);
    }
  }

  // The minified build must expose exactly the API upstream does.
  const upstreamApi = Object.keys(
    await import(pathToFileURL(join(PKG_DIR, 'build', 'three.module.js'))),
  ).sort();
  const vendoredApi = Object.keys(await import(pathToFileURL(join(OUT_DIR, 'three.module.js')))).sort();
  const lost = upstreamApi.filter((k) => !vendoredApi.includes(k));
  const extra = vendoredApi.filter((k) => !upstreamApi.includes(k));
  if (lost.length || extra.length) problems.push(`export mismatch: lost [${lost}] extra [${extra}]`);

  if (problems.length) {
    console.error(
      `vendor/three is out of date:\n - ${problems.join('\n - ')}\nFix: npm ci && npm run vendor`,
    );
    process.exit(1);
  }
  console.log(
    `vendor/three matches three@${version} (${vendored.size} files, ${upstreamApi.length} exports).`,
  );
}

if (process.argv.includes('--check')) await check();
else await write();
