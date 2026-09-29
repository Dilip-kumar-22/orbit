// Security headers, read from vercel.json so the local/preview servers and the test suite run
// under exactly the policy that ships. (Only the catch-all "/(.*)" rule is applied here.)
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function securityHeaders(root = ROOT) {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const headers = {};
  for (const rule of config.headers ?? []) {
    if (rule.source !== '/(.*)') continue;
    for (const { key, value } of rule.headers) headers[key] = value;
  }
  return headers;
}
