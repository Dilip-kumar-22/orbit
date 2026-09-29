import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The workflow files are part of the supply chain: they run on every PR. These checks keep them on the
// least-privilege, no-secrets footing they were written with.
const DIR = new URL('../../.github/workflows/', import.meta.url);
const files = readdirSync(DIR).filter((name) => /\.ya?ml$/.test(name));
const read = (name) => readFileSync(new URL(name, DIR), 'utf8');

describe('GitHub workflows', () => {
  it('finds at least the CI workflow', () => {
    expect(files).toContain('ci.yml');
  });

  describe.each(files)('%s', (name) => {
    const text = read(name);
    const code = text
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');

    it('grants the job token read-only contents access and nothing else', () => {
      const block = code.match(/^permissions:\n((?: {2}.+\n)+)/m);
      expect(block, 'a top-level permissions block').not.toBeNull();
      expect(
        block[1]
          .trim()
          .split('\n')
          .map((line) => line.trim()),
      ).toEqual(['contents: read']);
    });

    it('never runs untrusted code with write access or secrets', () => {
      expect(code).not.toMatch(/pull_request_target/);
      expect(code).not.toMatch(/\bsecrets\./);
      expect(code).not.toMatch(/\bwrite\b/);
    });

    it('only uses official actions', () => {
      const used = [...code.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
      expect(used.length).toBeGreaterThan(0);
      for (const action of used) expect(action, action).toMatch(/^actions\/[\w-]+@\S+$/);
    });

    it('does not leave the job token in the checkout or run install scripts', () => {
      const checkouts = code.match(/uses: actions\/checkout@\S+\n(?: {8}.+\n)*/g) ?? [];
      for (const step of checkouts) expect(step).toMatch(/persist-credentials: false/);
      for (const line of code.split('\n').filter((l) => /\bnpm ci\b/.test(l))) {
        expect(line).toMatch(/--ignore-scripts/);
      }
    });
  });
});
