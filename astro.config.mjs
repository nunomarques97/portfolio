// @ts-check
import { defineConfig } from 'astro/config';

// Static site: every page is rendered to HTML at build time. No adapter, no server output.
export default defineConfig({
  output: 'static',
});
