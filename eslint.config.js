import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'playwright-report/**', 'test-results/**', 'prototype/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/client/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.mjs', 'e2e/**/*.ts', 'playwright.config.ts', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
