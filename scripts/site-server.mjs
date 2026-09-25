#!/usr/bin/env node
// Builds the site and serves the fresh production output, for the end-to-end tests and screenshot captures.
//   node scripts/site-server.mjs --port <n>   -> build, then serve dist/ on 127.0.0.1:<n> until stopped
// Also imported by playwright.config.ts and scripts/capture.mjs for the shared helpers below.
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const host = '127.0.0.1';

const FREE_PORT_SOURCE = `
const server = require('node:net').createServer();
server.listen(0, '${host}', () => { process.stdout.write(String(server.address().port)); server.close(); });
`;

/** A TCP port that is free right now, chosen by the operating system. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Synchronous variant for configuration files that cannot await. */
export function freePortSync() {
  return Number(execFileSync(process.execPath, ['-e', FREE_PORT_SOURCE], { encoding: 'utf8' }));
}

/**
 * The installed browser to test with, so no browser download is needed. Override with
 * PLAYWRIGHT_BROWSER_CHANNEL (for example chrome, msedge, or chromium for Playwright's own build).
 */
export function browserChannel() {
  return process.env.PLAYWRIGHT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chrome');
}

/** Runs the package's build script. Its output goes to stderr so callers keep stdout for their own results. */
export function buildSite() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'run-script.mjs'), 'build'], {
      cwd: root,
      stdio: ['ignore', process.stderr, process.stderr],
    });
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`build failed (${signal ?? `exit code ${code}`})`)),
    );
  });
}

/** Serves dist/ with Astro's preview server in this process. Returns its URL and a stop function. */
export async function startPreview(port) {
  process.env.ASTRO_TELEMETRY_DISABLED ??= '1';
  const { preview } = await import('astro');
  const server = await preview({ root, logLevel: 'warn', server: { host, port } });
  return { url: `http://${host}:${server.port}/`, stop: () => server.stop() };
}

async function main() {
  const index = process.argv.indexOf('--port');
  const port = Number(process.argv[index + 1]);
  if (index === -1 || !Number.isInteger(port) || port <= 0) {
    console.error('site-server: usage: node scripts/site-server.mjs --port <n>');
    process.exit(2);
  }
  await buildSite();
  const server = await startPreview(port);
  if (new URL(server.url).port !== String(port)) {
    // Astro moves to another port when the requested one is taken; the caller would be testing something else.
    await server.stop();
    throw new Error(`port ${port} is already in use`);
  }
  console.log(`site-server: serving the production build at ${server.url}`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`site-server: ${error.message}`);
    process.exit(1);
  });
}
