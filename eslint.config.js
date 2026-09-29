import js from '@eslint/js';
import globals from 'globals';

const rules = {
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
};

export default [
  { ignores: ['vendor/**', 'dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  // Browser code: the only place the site's own scripts run.
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
    rules: { ...rules, 'no-console': ['error', { allow: ['warn', 'error'] }] },
  },
  // Tooling and unit tests run in Node.
  {
    files: ['scripts/**/*.mjs', '*.config.js', 'tests/unit/**/*.js'],
    languageOptions: { globals: globals.node },
    rules,
  },
  // e2e specs run in Node but hand functions to the page (page.evaluate), so they see both.
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules,
  },
];
