// @ts-check
import { defineConfig } from 'astro/config';

// Static site: every page is rendered to HTML at build time. No adapter, no server output.
// SITE_URL and SITE_BASE are set by the GitHub Pages workflow, which serves the site under /portfolio/.
// Local builds, tests and screenshots serve it from the root.
export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || undefined,
  base: process.env.SITE_BASE || '/',
});
