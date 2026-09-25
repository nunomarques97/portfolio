// @ts-check
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  {
    ignores: ['dist/', '.astro/', 'node_modules/', 'test-results/', 'playwright-report/', 'docs/'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...astro.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,ts,astro}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
