#!/usr/bin/env node
// Builds the site, serves it on a free port and captures viewport screenshots for visual review.
//   node scripts/capture.mjs [--motion no-preference|reduce] [--webgl on|off] [--settle <ms>]
// Captures the page top and every `main section[id]` at 1440x900 and 390x844 into
// test-results/screenshots/<mode>/<width>-<section>.png, prints each path, then prints a JSON manifest
// (also written to manifest.json in the same folder). Exits non-zero when any capture fails.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { browserChannel, buildSite, freePort, root, startPreview } from './site-server.mjs';

const toPosix = (file) => path.relative(root, file).split(path.sep).join('/');

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
// Scene states that mean the page has finished starting up (see html[data-scene]).
const SETTLED_SCENES = ['running', 'reduced', 'unavailable'];

function usage(message) {
  console.error(`capture: ${message}`);
  console.error('usage: node scripts/capture.mjs [--motion no-preference|reduce] [--webgl on|off] [--settle <ms>]');
  process.exit(2);
}

function parseArgs(argv) {
  const options = { motion: 'no-preference', webgl: 'on', settle: 400 };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=', 2);
    const value = inline ?? argv[(i += 1)];
    if (flag === '--motion' && ['no-preference', 'reduce'].includes(value)) options.motion = value;
    else if (flag === '--webgl' && ['on', 'off'].includes(value)) options.webgl = value;
    else if (flag === '--settle' && /^\d+$/.test(value ?? '')) options.settle = Number(value);
    else usage(`invalid argument: ${flag} ${value ?? '(missing value)'}`);
  }
  return options;
}

function modeName({ motion, webgl }) {
  const parts = [];
  if (motion === 'reduce') parts.push('reduced-motion');
  if (webgl === 'off') parts.push('webgl-off');
  return parts.length ? parts.join('-') : 'default';
}

/** Waits for fonts, for the scene state (html[data-scene]) to settle when present, then two frames. */
async function settle(page, ms) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page
    .waitForFunction(
      (settled) => {
        const scene = document.documentElement.dataset.scene;
        return scene === undefined || settled.includes(scene);
      },
      SETTLED_SCENES,
      { timeout: 15_000 },
    )
    .catch(() => {
      throw new Error('the scene did not reach a settled state (html[data-scene]) within 15 s');
    });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))),
  );
  if (ms > 0) await page.waitForTimeout(ms);
}

const pageState = (page) =>
  page.evaluate(() => ({
    scene: document.documentElement.dataset.scene ?? null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    scrollY: Math.round(scrollY),
  }));

/** Whether the browser can create a WebGL context. The probe context is released so it cannot evict the scene's. */
const webglAvailable = (page) =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  });

async function captureViewport(browser, url, viewport, options, outDir, manifest, failures) {
  const context = await browser.newContext({ viewport, reducedMotion: options.motion });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response?.ok()) throw new Error(`GET ${url} returned ${response?.status() ?? 'no response'}`);

    const webgl = await webglAvailable(page);
    const ids = await page.$$eval('main section[id]', (sections) => sections.map((section) => section.id));
    const targets = [{ section: 'top', id: null }, ...ids.map((id) => ({ section: id, id }))];
    for (const { section, id } of targets) {
      const file = path.join(outDir, `${viewport.width}-${section}.png`);
      try {
        await page.evaluate((target) => {
          if (target === null) window.scrollTo({ top: 0, behavior: 'instant' });
          else document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'instant' });
        }, id);
        await settle(page, options.settle);
        await page.screenshot({ path: file });
        const state = await pageState(page);
        manifest.push({ mode: modeName(options), ...viewport, section, path: toPosix(file), webgl, ...state });
        console.log(toPosix(file));
      } catch (error) {
        failures.push(`${viewport.width}-${section}: ${error.message}`);
      }
    }
    if (pageErrors.length) failures.push(`${viewport.width}: page errors: ${pageErrors.join(' | ')}`);
  } catch (error) {
    failures.push(`${viewport.width}: ${error.message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = modeName(options);
  const outDir = path.join(root, 'test-results', 'screenshots', mode);
  mkdirSync(outDir, { recursive: true });
  // Old captures of sections that no longer exist would be mistaken for current ones.
  for (const name of readdirSync(outDir)) {
    if (name.endsWith('.png') || name === 'manifest.json') rmSync(path.join(outDir, name));
  }

  const resources = [];
  const cleanup = async () => {
    while (resources.length) await resources.pop()().catch(() => {});
  };
  const interrupt = (signal) => async () => {
    console.error(`capture: interrupted by ${signal}`);
    await cleanup();
    process.exit(130);
  };
  process.on('SIGINT', interrupt('SIGINT'));
  process.on('SIGTERM', interrupt('SIGTERM'));

  const manifest = [];
  const failures = [];
  try {
    await buildSite();
    const server = await startPreview(await freePort());
    resources.push(server.stop);
    const args = options.webgl === 'off' ? ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] : [];
    const browser = await chromium.launch({ channel: browserChannel(), args });
    resources.push(() => browser.close());
    for (const viewport of VIEWPORTS) {
      await captureViewport(browser, server.url, viewport, options, outDir, manifest, failures);
    }
  } catch (error) {
    failures.push(error.message);
  } finally {
    await cleanup();
  }

  const expectOff = options.webgl === 'off';
  for (const entry of manifest) {
    if (entry.webgl === expectOff) failures.push(`${entry.width}-${entry.section}: WebGL is not ${options.webgl}`);
    if (entry.reducedMotion !== (options.motion === 'reduce')) {
      failures.push(`${entry.width}-${entry.section}: prefers-reduced-motion is not ${options.motion}`);
    }
  }
  if (manifest.length) writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ mode, captures: manifest }, null, 2));
  if (failures.length) {
    for (const failure of failures) console.error(`capture: failed: ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`capture: ${error.stack ?? error.message}`);
  process.exit(1);
});
