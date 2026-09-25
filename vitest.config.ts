/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Astro's Vite configuration lets unit tests import .astro components and render them with the container API.
export default getViteConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
