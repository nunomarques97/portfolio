import { defineConfig } from '@playwright/test';
import { browserChannel, freePortSync, host } from './scripts/site-server.mjs';

// The port is chosen once, in the main process; workers inherit it through the environment.
process.env.PORTFOLIO_E2E_PORT ??= String(freePortSync());
const port = Number(process.env.PORTFOLIO_E2E_PORT);
const baseURL = `http://${host}:${port}/`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  // Every page renders a continuous WebGL scene on the shared GPU. With one browser per core the renderers starve
  // each other and the choreography tests, which wait for the camera to settle, time out.
  workers: 4,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    // An installed browser (Edge on Windows by default), so no browser download is needed.
    channel: browserChannel(),
    // No trace screencast: the page animates continuously, so frame capture in parallel browsers
    // starves their renderers and makes the tests time out. DOM snapshots are still recorded.
    trace: { mode: 'retain-on-failure', screenshots: false },
  },
  webServer: {
    // Always a fresh production build: never reuse a server that happens to be running.
    command: `node scripts/site-server.mjs --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
