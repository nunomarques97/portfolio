import { expect, test, type Page, type Route } from '@playwright/test';

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
/** The lazily imported chunk that holds three.js and the scene. */
const SCENE_CHUNK = /\/_astro\/particles\.[^/]+\.js(\?|$)/;
const canvas = '[data-scene-layer] canvas';
/** Right half of the desktop viewport, where the field sits beside the content column. */
const sceneRegion = { x: 820, y: 120, width: 560, height: 660 };

interface Probe {
  frames: number;
  stills: number;
  tier?: string;
  particles?: number;
  init?: () => void;
  teardown?: () => void;
}

/**
 * Opts the page into the scene's test probe (a frame counter and lifecycle hooks that normal visits do not have),
 * and records console errors, page errors and requests for the scene chunk.
 */
async function observe(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __PORTFOLIO_SCENE_PROBE__: Probe }).__PORTFOLIO_SCENE_PROBE__ = { frames: 0, stills: 0 };
  });
  const errors: string[] = [];
  const chunkRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (SCENE_CHUNK.test(request.url())) chunkRequests.push(request.url());
  });
  return { errors, chunkRequests };
}

const probe = (page: Page) =>
  page.evaluate(() => {
    const { frames, stills, tier, particles } = (window as unknown as { __PORTFOLIO_SCENE_PROBE__: Probe })
      .__PORTFOLIO_SCENE_PROBE__;
    return { frames, stills, tier, particles };
  });

const call = (page: Page, hook: 'init' | 'teardown') =>
  page.evaluate((name) => (window as unknown as { __PORTFOLIO_SCENE_PROBE__: Probe }).__PORTFOLIO_SCENE_PROBE__[name]?.(), hook);

const sceneState = (page: Page) => page.locator('html');

/** Frames rendered during `ms` milliseconds. */
async function framesDuring(page: Page, ms: number) {
  const before = (await probe(page)).frames;
  await page.waitForTimeout(ms);
  return (await probe(page)).frames - before;
}

/**
 * Scene frames per browser animation frame during `ms` milliseconds: 1 for exactly one loop, 2 for a duplicate loop.
 * Headless frame rates vary with machine load, so this ratio is compared instead of absolute frame counts.
 */
function framesPerTick(page: Page, ms = 1000) {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        const read = () => (window as unknown as { __PORTFOLIO_SCENE_PROBE__: Probe }).__PORTFOLIO_SCENE_PROBE__.frames;
        const start = performance.now();
        const before = read();
        let ticks = 0;
        const tick = (now: number) => {
          ticks += 1;
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve((read() - before) / ticks);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/**
 * Pixels that differ visibly between two screenshots of the same size. The summed RGB delta must exceed a small
 * tolerance, because the compositor can re-rasterize the backdrop gradients with off-by-a-few rounding between captures;
 * a moving particle changes its pixels by far more.
 */
function changedPixels(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([first64, second64]) => {
      const pixels = async (base64: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = surface.getContext('2d') as OffscreenCanvasRenderingContext2D;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [first, second] = await Promise.all([pixels(first64 as string), pixels(second64 as string)]);
      let changed = 0;
      for (let i = 0; i < first.length; i += 4) {
        const delta =
          Math.abs((first[i] ?? 0) - (second[i] ?? 0)) +
          Math.abs((first[i + 1] ?? 0) - (second[i + 1] ?? 0)) +
          Math.abs((first[i + 2] ?? 0) - (second[i + 2] ?? 0));
        if (delta > 24) changed += 1;
      }
      return changed;
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

/** Number of pixels in the region that the canvas changes: a capture with it, compared with one without it. */
async function canvasPixels(page: Page, clip = sceneRegion) {
  const withCanvas = await page.screenshot({ clip });
  await page.locator(canvas).evaluate((element: HTMLElement) => (element.style.visibility = 'hidden'));
  const without = await page.screenshot({ clip });
  await page.locator(canvas).evaluate((element: HTMLElement) => (element.style.visibility = ''));
  return changedPixels(page, withCanvas, without);
}

/** Holds the scene chunk's response until `release` is called, to exercise changes while it is loading. */
async function holdSceneChunk(page: Page) {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  let requested = () => {};
  const seen = new Promise<void>((resolve) => (requested = resolve));
  await page.route(SCENE_CHUNK, async (route: Route) => {
    requested();
    await released;
    await route.continue();
  });
  return { seen, release };
}

test.describe('scene: default', () => {
  test.use({ viewport: desktop });

  test('runs one non-blank, hidden, non-interactive canvas loaded after the page', async ({ page }) => {
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');

    await expect(page.locator('canvas')).toHaveCount(1);
    const scene = page.locator(canvas);
    await expect(scene).toHaveAttribute('aria-hidden', 'true');
    const box = await scene.boundingBox();
    expect(box).toEqual({ x: 0, y: 0, ...desktop });
    const traits = await scene.evaluate((element) => ({
      pointerEvents: getComputedStyle(element).pointerEvents,
      tabIndex: element.tabIndex,
      beforeScrim: element.nextElementSibling?.classList.contains('scene-scrim'),
    }));
    expect(traits).toEqual({ pointerEvents: 'none', tabIndex: -1, beforeScrim: true });
    await scene.evaluate((element: HTMLElement) => element.focus());
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('CANVAS');

    expect(watch.chunkRequests).toHaveLength(1);
    expect(await framesDuring(page, 500)).toBeGreaterThan(5);
    expect(await canvasPixels(page)).toBeGreaterThan(2000);
    // The field sits to the right: the content column over the scrim stays calm.
    expect((await probe(page)).tier).toBe('full');
    expect((await probe(page)).particles).toBe(26_000);
    expect(watch.errors).toEqual([]);
  });

  test('exposes no frame counter or lifecycle hooks on a normal visit', async ({ page }) => {
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => '__PORTFOLIO_SCENE_PROBE__' in window)).toBe(false);
  });

  test('pauses while the document is hidden and resumes on return', async ({ page }) => {
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    expect(await framesDuring(page, 300)).toBeGreaterThan(3);

    const setHidden = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);

    await setHidden(true);
    await page.waitForTimeout(50);
    expect(await framesDuring(page, 600)).toBe(0);
    await setHidden(false);
    expect(await framesDuring(page, 500)).toBeGreaterThan(5);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(watch.errors).toEqual([]);
  });

  test('setup, teardown and setup again leave exactly one canvas and one loop', async ({ page }) => {
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    expect(await framesPerTick(page)).toBeCloseTo(1, 0);

    await call(page, 'init');
    await expect(page.locator('canvas')).toHaveCount(1);

    await call(page, 'teardown');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(sceneState(page)).not.toHaveAttribute('data-scene', /.+/);
    expect(await framesDuring(page, 300)).toBe(0);

    await call(page, 'init');
    await call(page, 'init');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(await framesPerTick(page)).toBeCloseTo(1, 0);

    // A teardown before the page-idle callback fires never loads anything.
    await call(page, 'teardown');
    await call(page, 'init');
    await call(page, 'teardown');
    await page.waitForTimeout(800);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await framesDuring(page, 300)).toBe(0);
    expect(watch.errors).toEqual([]);
  });

  test('a teardown while the chunk is loading never starts a loop afterwards', async ({ page }) => {
    const watch = await observe(page);
    const chunk = await holdSceneChunk(page);
    await page.goto('/');
    await chunk.seen;
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'loading');

    await call(page, 'teardown');
    chunk.release();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(sceneState(page)).not.toHaveAttribute('data-scene', /.+/);
    expect((await probe(page)).frames).toBe(0);
    expect(watch.errors).toEqual([]);
  });

  test('switching to reduced motion while the chunk is loading starts no loop', async ({ page }) => {
    const watch = await observe(page);
    const chunk = await holdSceneChunk(page);
    await page.goto('/');
    await chunk.seen;

    await page.emulateMedia({ reducedMotion: 'reduce' });
    chunk.release();
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'reduced');
    expect(await framesDuring(page, 500)).toBe(0);
    expect((await probe(page)).stills).toBeGreaterThan(0);
    expect(watch.errors).toEqual([]);
  });

  test('changing prefers-reduced-motion at runtime switches both ways without a second loop', async ({ page }) => {
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    expect(await framesPerTick(page)).toBeCloseTo(1, 0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'reduced');
    await page.waitForTimeout(50);
    expect(await framesDuring(page, 500)).toBe(0);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    expect(await framesPerTick(page)).toBeCloseTo(1, 0);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(watch.errors).toEqual([]);
  });

  test('debounces resize and caps the pixel ratio of the full tier at 2', async ({ browser }) => {
    const context = await browser.newContext({ viewport: desktop, deviceScaleFactor: 3 });
    const page = await context.newPage();
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    const width = () => page.locator(canvas).evaluate((element: HTMLCanvasElement) => element.width);
    expect(await width()).toBe(desktop.width * 2);

    // Record the canvas width when the resize event fires and 60 ms later: both precede the 120 ms debounce, since
    // the scene's timer is set first and timers run in due order, even when the machine is slow.
    await page.evaluate((selector) => {
      const target = window as unknown as { __resizeWidths?: number[] };
      addEventListener(
        'resize',
        () => {
          const element = document.querySelector<HTMLCanvasElement>(selector) as HTMLCanvasElement;
          const atEvent = element.width;
          setTimeout(() => (target.__resizeWidths = [atEvent, element.width]), 60);
        },
        { once: true },
      );
    }, canvas);
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __resizeWidths?: number[] }).__resizeWidths))
      .toEqual([desktop.width * 2, desktop.width * 2]);
    await expect.poll(width).toBe(1200 * 2);
    expect(watch.errors).toEqual([]);
    await context.close();
  });

  test('low-capability hardware gets the lite tier on a wide screen', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }));
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    expect(await probe(page)).toMatchObject({ tier: 'lite', particles: 9_000 });
    await expect(page.locator(canvas)).toHaveAttribute('data-scene-tier', 'lite');
    expect(watch.errors).toEqual([]);
  });

  test('context loss falls back to the static background without errors', async ({ page }) => {
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');

    await page.locator(canvas).evaluate((element: HTMLCanvasElement) => {
      element.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    });
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'unavailable');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.scene-fallback')).toBeVisible();
    expect(await framesDuring(page, 300)).toBe(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(watch.errors).toEqual([]);
  });

  test('a failed scene chunk import falls back without an unhandled rejection', async ({ page }) => {
    const watch = await observe(page);
    await page.route(SCENE_CHUNK, (route) => route.fulfill({ status: 503, body: '' }));
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'unavailable');
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.waitForTimeout(300);
    // The browser itself reports the failed response; the page adds no error of its own.
    expect(watch.errors.filter((text) => !/Failed to load resource/.test(text))).toEqual([]);
  });
});

test.describe('scene: mobile', () => {
  test.use({ viewport: mobile, deviceScaleFactor: 3 });

  test('uses the lite tier with the pixel ratio capped at 1.5, a full-brightness canvas and backed text', async ({ page }) => {
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'running');
    expect(await probe(page)).toMatchObject({ tier: 'lite', particles: 9_000 });
    const scene = page.locator(canvas);
    expect(await scene.evaluate((element: HTMLCanvasElement) => element.width)).toBe(mobile.width * 1.5);
    expect(await scene.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    // Text keeps its contrast through its own backing instead of a dimmed scene.
    expect(await page.locator('#hero .section-inner').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgba(4, 6, 13, 0.85)',
    );
    expect(await canvasPixels(page, { x: 0, y: 200, width: mobile.width, height: 500 })).toBeGreaterThan(500);
    expect(watch.errors).toEqual([]);
  });
});

test.describe('scene: reduced motion', () => {
  test.use({ viewport: desktop, reducedMotion: 'reduce' });

  test('renders a static composition and re-renders only on section change', async ({ page }) => {
    const watch = await observe(page);
    await page.goto('/');
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'reduced');
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(await canvasPixels(page)).toBeGreaterThan(2000);

    const first = await page.screenshot({ clip: sceneRegion });
    await page.waitForTimeout(1000);
    const second = await page.screenshot({ clip: sceneRegion });
    expect(await changedPixels(page, first, second)).toBe(0);
    expect((await probe(page)).frames).toBe(0);

    const { stills } = await probe(page);
    await page.locator('#skills').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await expect.poll(async () => (await probe(page)).stills).toBeGreaterThan(stills);
    expect(await changedPixels(page, first, await page.screenshot({ clip: sceneRegion }))).toBeGreaterThan(2000);
    expect((await probe(page)).frames).toBe(0);
    expect(watch.errors).toEqual([]);
  });
});

test.describe('scene: WebGL disabled', () => {
  // Launch options force a separate browser, so this test starts its own instead of using the shared one.
  test('never requests three.js, keeps the fallback and shows all content', async ({ playwright, baseURL }) => {
    const browser = await playwright.chromium.launch({
      channel: test.info().project.use.channel,
      args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'],
    });
    const page = await browser.newPage({ viewport: desktop, baseURL });
    const watch = await observe(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(sceneState(page)).toHaveAttribute('data-scene', 'unavailable');
    await page.waitForTimeout(300);

    expect(watch.chunkRequests).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.scene-fallback')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const id of ['hero', 'about', 'projects', 'skills', 'experience', 'contact']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await expect(page.locator('#contact h2')).toBeVisible();
    expect(watch.errors).toEqual([]);
    await browser.close();
  });
});
