#!/usr/bin/env node
// Measures the scene's frame rate on this machine while the page scrolls from top to bottom.
//   node scripts/measure-fps.mjs [--duration <seconds>]
// Builds the site, serves it on a free port and opens a headed browser with the GPU enabled. Scrolls the page at
// 1440x900 (full tier) and at 390x844 (lite tier, 4x CPU throttling), then prints the average fps, the p95 frame
// time and the WebGL renderer as JSON. The results describe this development machine only.
// Exits non-zero when a run misses its budget (docs/design/DESIGN.md, "Performance budget"), when the scene does not
// run, or when the renderer is a software rasterizer, which makes the measurement invalid.
import { chromium } from '@playwright/test';
import { browserChannel, buildSite, freePort, startPreview } from './site-server.mjs';

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i;
const WARM_UP_FRAMES = 60;
const RUNS = [
  {
    name: 'desktop',
    context: { viewport: { width: 1440, height: 900 } },
    tier: 'full',
    cpuThrottling: 1,
    budget: { minAverageFps: 55, maxP95FrameMs: 25 },
  },
  {
    name: 'mobile',
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    tier: 'lite',
    cpuThrottling: 4,
    budget: { minAverageFps: 30 },
  },
];

function parseArgs(argv) {
  const options = { duration: 8 };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=', 2);
    const value = inline ?? argv[(i += 1)];
    if (flag === '--duration' && /^\d+(\.\d+)?$/.test(value ?? '') && Number(value) >= 1) options.duration = Number(value);
    else {
      console.error(`fps: invalid argument: ${flag} ${value ?? '(missing value)'}`);
      console.error('usage: node scripts/measure-fps.mjs [--duration <seconds>]');
      process.exit(2);
    }
  }
  return options;
}

/** The unmasked WebGL renderer string. The probe context is released so it cannot evict the scene's. */
const rendererOf = (page) =>
  page.evaluate(() => {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) return null;
    const info = context.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER));
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return renderer;
  });

/**
 * Scrolls linearly from the top to the bottom over `seconds` with native scroll, one step per animation frame, and
 * records every frame interval. Also counts the scene's own frames through its test probe.
 */
const scrollAndMeasure = (page, seconds) =>
  page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const probe = window.__PORTFOLIO_SCENE_PROBE__;
        const maxScroll = document.documentElement.scrollHeight - innerHeight;
        const intervals = [];
        const sceneFramesBefore = probe.frames;
        let start = 0;
        let previous = 0;
        const step = (now) => {
          if (!start) start = now;
          else intervals.push(now - previous);
          previous = now;
          const t = Math.min(1, (now - start) / duration);
          window.scrollTo({ top: maxScroll * t, behavior: 'instant' });
          if (t < 1) requestAnimationFrame(step);
          else resolve({ intervals, elapsed: now - start, sceneFrames: probe.frames - sceneFramesBefore, maxScroll });
        };
        window.scrollTo({ top: 0, behavior: 'instant' });
        requestAnimationFrame(step);
      }),
    seconds * 1000,
  );

function summarize(sample) {
  const sorted = [...sample.intervals].sort((a, b) => a - b);
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Infinity;
  return {
    frames: sample.intervals.length,
    sceneFrames: sample.sceneFrames,
    seconds: Number((sample.elapsed / 1000).toFixed(2)),
    averageFps: Number((sample.intervals.length / (sample.elapsed / 1000)).toFixed(1)),
    p95FrameMs: Number(p95.toFixed(2)),
    scrolledPx: Math.round(sample.maxScroll),
  };
}

async function measureRun(browser, url, run, options) {
  const context = await browser.newContext({ ...run.context, reducedMotion: 'no-preference' });
  try {
    await context.addInitScript(() => {
      window.__PORTFOLIO_SCENE_PROBE__ = { frames: 0, stills: 0 };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    const renderer = await rendererOf(page);
    await page.waitForFunction(() => document.documentElement.dataset.scene !== 'loading', null, { timeout: 30_000 });
    const scene = await page.evaluate(() => document.documentElement.dataset.scene);
    const probe = await page.evaluate(() => ({ ...window.__PORTFOLIO_SCENE_PROBE__ }));
    const result = { name: run.name, ...run.context.viewport, tier: probe.tier ?? null, particles: probe.particles ?? null };
    result.cpuThrottling = run.cpuThrottling;
    result.renderer = renderer;
    result.budget = run.budget;
    const failures = [];
    if (scene !== 'running') failures.push(`the scene is "${scene}", not running`);
    if (probe.tier !== run.tier) failures.push(`expected the ${run.tier} tier, got ${probe.tier ?? 'none'}`);
    if (!failures.length) {
      await page.waitForFunction((frames) => window.__PORTFOLIO_SCENE_PROBE__.frames >= frames, WARM_UP_FRAMES);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: run.cpuThrottling });
      Object.assign(result, summarize(await scrollAndMeasure(page, options.duration)));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      if (result.averageFps < run.budget.minAverageFps) {
        failures.push(`average ${result.averageFps} fps is below ${run.budget.minAverageFps}`);
      }
      if (run.budget.maxP95FrameMs !== undefined && result.p95FrameMs > run.budget.maxP95FrameMs) {
        failures.push(`p95 frame ${result.p95FrameMs} ms is above ${run.budget.maxP95FrameMs} ms`);
      }
      // The page loop must be the scene's: a stalled scene would still let the browser tick.
      if (result.sceneFrames < result.frames * 0.9) failures.push(`the scene rendered ${result.sceneFrames} of ${result.frames} frames`);
    }
    if (errors.length) failures.push(`page errors: ${errors.join(' | ')}`);
    result.pass = failures.length === 0;
    result.failures = failures;
    return result;
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const resources = [];
  const cleanup = async () => {
    while (resources.length) await resources.pop()().catch(() => {});
  };
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(130);
  });

  const report = {
    measurement: 'dev-machine',
    note: 'Measured on this development machine with a headed browser and its GPU; other hardware will differ.',
    browser: null,
    renderer: null,
    runs: [],
    pass: false,
    failures: [],
  };
  try {
    await buildSite();
    const server = await startPreview(await freePort());
    resources.push(server.stop);
    const browser = await chromium.launch({
      channel: browserChannel(),
      headless: false,
      args: [
        '--ignore-gpu-blocklist',
        // A headed window behind other windows must not be throttled while it is measured.
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });
    resources.push(() => browser.close());
    report.browser = `${browserChannel()} ${browser.version()}`;
    for (const run of RUNS) {
      const result = await measureRun(browser, server.url, run, options);
      report.runs.push(result);
      report.renderer ??= result.renderer;
    }
  } catch (error) {
    report.failures.push(error.message);
  } finally {
    await cleanup();
  }

  if (!report.renderer) report.failures.push('no WebGL renderer: the measurement needs a hardware GPU');
  else if (SOFTWARE_RENDERER.test(report.renderer)) {
    report.failures.push(`software renderer "${report.renderer}": the measurement is invalid`);
  }
  for (const run of report.runs) for (const failure of run.failures) report.failures.push(`${run.name}: ${failure}`);
  report.pass = report.failures.length === 0 && report.runs.length === RUNS.length;
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    for (const failure of report.failures) console.error(`fps: failed: ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`fps: ${error.stack ?? error.message}`);
  process.exit(1);
});
