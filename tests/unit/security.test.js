import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { csp, expected, headers, importMapHash } from '../../scripts/security.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const html = read('index.html');
const hash = importMapHash(html);

describe('generated files', () => {
  it('vercel.json, _headers and the <meta> CSP match the policy (fix: npm run security:sync)', () => {
    const want = expected();
    expect(read('vercel.json')).toBe(want.vercel);
    expect(read('_headers')).toBe(want.headersFile);
    expect(html).toBe(want.html);
  });

  it('the CSP allows exactly the inline import map that is in index.html', () => {
    const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const independent = `sha256-${createHash('sha256').update(map, 'utf8').digest('base64')}`;
    expect(hash).toBe(independent);
    expect(csp(hash)).toContain(`'${independent}'`);
  });
});

describe('policy', () => {
  const policy = csp(hash);
  const directive = (name) => policy.split('; ').find((d) => d.startsWith(`${name} `));

  it('is same-origin only: no wildcards, no third-party hosts, no data:/blob: URLs', () => {
    expect(policy).not.toMatch(/\*|https?:|data:|blob:|ws:|wss:/);
  });

  it('never allows inline or eval code', () => {
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|strict-dynamic/);
    expect(directive('script-src')).toBe(`script-src 'self' '${hash}'`);
    expect(directive('style-src')).toBe("style-src 'self'");
  });

  it('locks down plugins, base URI, forms, framing and network access', () => {
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('form-action')).toBe("form-action 'self'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('connect-src')).toBe("connect-src 'none'");
    expect(directive('default-src')).toBe("default-src 'self'");
  });

  it('leaves frame-ancestors out of the <meta> variant, where browsers ignore it and complain', () => {
    expect(csp(hash, { meta: true })).not.toContain('frame-ancestors');
    expect(html).not.toContain('frame-ancestors');
  });

  it('ships the other headers too, with only Permissions-Policy features browsers recognise', () => {
    const map = new Map(headers(hash));
    expect(map.get('X-Content-Type-Options')).toBe('nosniff');
    expect(map.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(map.get('X-Frame-Options')).toBe('DENY');
    expect(map.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(map.get('Strict-Transport-Security')).toMatch(/^max-age=\d+$/);
    const known = new Set([
      'accelerometer',
      'camera',
      'geolocation',
      'gyroscope',
      'magnetometer',
      'microphone',
      'payment',
      'usb',
    ]);
    const features = map
      .get('Permissions-Policy')
      .split(', ')
      .map((f) => f.split('=')[0]);
    expect(features.every((f) => known.has(f))).toBe(true);
    expect(map.get('Permissions-Policy')).not.toContain('interest-cohort');
  });
});

describe('index.html works under that policy', () => {
  it('has no inline event handlers, style attributes, style elements or inline scripts (beyond the import map)', () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
    for (const attrs of scripts) expect(attrs).toMatch(/type="importmap"|\ssrc="\.\//);
    expect(html).not.toMatch(/javascript:/i);
  });

  it('loads nothing from another origin', () => {
    const urls = [...html.matchAll(/\b(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    // only navigation targets: the canonical, the social image URLs are meta content, not requests
    for (const url of urls) expect(url).toMatch(/^https:\/\/(github\.com|dilip-kumar-22\.github\.io)\//);
  });
});
