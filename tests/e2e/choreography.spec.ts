import { expect, test, type Page } from '@playwright/test';

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
/** Furthest the displayed progress may trail the scroll progress (MAX_LAG in src/scene/choreography.ts). */
const MAX_LAG = 0.5;

interface Probe {
  frames: number;
  tier?: string;
  progress?: number;
  displayed?: number;
  settled?: boolean;
  section?: number;
  cluster?: number;
  retarget?: boolean;
  parallax?: boolean;
}

type ProbeWindow = Window & { __PORTFOLIO_SCENE_PROBE__: Probe; __displayedSamples?: number[] };

/** Opts the page into the scene's test probe and records console and page errors. */
async function observe(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as ProbeWindow).__PORTFOLIO_SCENE_PROBE__ = { frames: 0 };
  });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const probe = (page: Page) =>
  page.evaluate(() => {
    const { frames, tier, progress, displayed, settled, section, cluster, retarget, parallax } = (
      window as unknown as ProbeWindow
    ).__PORTFOLIO_SCENE_PROBE__;
    return { frames, tier, progress, displayed, settled, section, cluster, retarget, parallax };
  });

/**
 * What a reader sees, measured from the layout: the section and project card under the viewport's vertical centre
 * (cards count within ±5% of the viewport height), independently of the scene's own bookkeeping.
 */
const inView = (page: Page) =>
  page.evaluate(() => {
    const centre = innerHeight / 2;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('main > section'));
    let index = 0;
    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= centre) index = i;
    });
    const band = innerHeight * 0.05;
    const cards = Array.from(document.querySelectorAll<HTMLElement>('main [data-cluster]'));
    const card = cards.find((element) => {
      // offsetTop ignores the active card's transform, as the tracker does.
      const top = element.getBoundingClientRect().top - (new DOMMatrix(getComputedStyle(element).transform).m42 || 0);
      return top <= centre + band && top + element.offsetHeight >= centre - band;
    });
    return { index, id: sections[index]?.id ?? '', cluster: card ? Number(card.dataset.cluster) : -1 };
  });

/** Waits until the scene has scrolled to the section in view and finished gliding there. */
/** Waits until a smooth scroll (anchor jumps, keys and focus all use one) has started, if any, and come to rest. */
const scrollIdle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = window.scrollY;
        let still = 0;
        const check = () => {
          if (window.scrollY === last) still += 1;
          else [last, still] = [window.scrollY, 0];
          if (still >= 6) resolve();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );

async function expectSettledInView(page: Page) {
  await scrollIdle(page);
  await expect
    .poll(
      async () => {
        const [view, state] = await Promise.all([inView(page), probe(page)]);
        return {
          section: state.section === view.index,
          attribute: (await page.locator('html').getAttribute('data-section')) === view.id,
          settled: state.settled === true && Math.abs((state.displayed ?? -1) - (state.progress ?? -2)) < 1e-3,
        };
      },
      { timeout: 10_000 },
    )
    .toEqual({ section: true, attribute: true, settled: true });
}

const scrollToSection = (page: Page, id: string, block: ScrollLogicalPosition = 'start') =>
  page.locator(`#${id}`).evaluate((element, position) => element.scrollIntoView({ block: position, behavior: 'instant' }), block);

/** Scrolls so that the middle of project card `cluster` sits at the viewport's vertical centre. */
const centreCard = (page: Page, cluster: number) =>
  page
    .locator(`main [data-cluster="${cluster}"]`)
    .evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));

/** Records the displayed progress on every animation frame until `stopSampling` is called. */
const startSampling = (page: Page) =>
  page.evaluate(() => {
    const win = window as unknown as ProbeWindow;
    const samples: number[] = [];
    win.__displayedSamples = samples;
    const sample = () => {
      if (win.__displayedSamples !== samples) return;
      samples.push(win.__PORTFOLIO_SCENE_PROBE__.displayed ?? Number.NaN);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

const stopSampling = (page: Page) =>
  page.evaluate(() => {
    const win = window as unknown as ProbeWindow;
    const samples = win.__displayedSamples ?? [];
    delete win.__displayedSamples;
    return samples;
  });

/** Only the particle field: content and chrome are hidden so the capture compares the canvas region alone. */
async function sceneCapture(page: Page) {
  const style = await page.addStyleTag({
    content: 'main, header, footer, .hud, .scroll-progress { visibility: hidden !important; }',
  });
  const image = await page.screenshot({ clip: { x: 720, y: 0, width: 720, height: 900 } });
  await style.evaluate((element) => (element as Element).remove());
  return image;
}

const decode = (base64: string) =>
  fetch(`data:image/png;base64,${base64}`)
    .then((response) => response.blob())
    .then(createImageBitmap)
    .then((bitmap) => {
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = surface.getContext('2d') as OffscreenCanvasRenderingContext2D;
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    });

/**
 * Mean absolute difference of the average brightness of 24 × 30 px cells between two screenshots, from 0 to 255. The
 * continuous spin and shimmer move individual particles but barely change where the field is bright; a different
 * formation, camera or colour does.
 */
function compositionDistance(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([first64, second64, source]) => {
      const load = new Function(`return ${source}`)() as typeof decode;
      const [first, second] = await Promise.all([load(first64), load(second64)]);
      const cellWidth = 24;
      const cellHeight = 30;
      const columns = Math.floor(first.width / cellWidth);
      const rows = Math.floor(first.height / cellHeight);
      const cells = (image: ImageData) => {
        const sums = new Float64Array(columns * rows);
        for (let y = 0; y < rows * cellHeight; y += 1) {
          for (let x = 0; x < columns * cellWidth; x += 1) {
            const i = (y * image.width + x) * 4;
            const brightness = ((image.data[i] ?? 0) + (image.data[i + 1] ?? 0) + (image.data[i + 2] ?? 0)) / 3;
            const cell = Math.floor(y / cellHeight) * columns + Math.floor(x / cellWidth);
            sums[cell] = (sums[cell] ?? 0) + brightness / (cellWidth * cellHeight);
          }
        }
        return sums;
      };
      const [left, right] = [cells(first), cells(second)];
      let total = 0;
      for (let i = 0; i < left.length; i += 1) total += Math.abs((left[i] ?? 0) - (right[i] ?? 0));
      return total / left.length;
    },
    [a.toString('base64'), b.toString('base64'), decode.toString()] as const,
  );
}

async function open(page: Page) {
  const errors = await observe(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'running');
  return errors;
}

test.describe('choreography: default', () => {
  test.use({ viewport: desktop });
  // Each settle waits for a real-time glide of about 2.7 s (DAMPING in src/scene/choreography.ts), which slows down
  // further when parallel browsers share the GPU, so these tests get more than the default 30 s.
  test.describe.configure({ timeout: 60_000 });

  test('scroll progress follows native scroll through every section, with the HUD and nav in step', async ({ page }) => {
    const errors = await open(page);
    const ids = await page.$$eval('main > section', (sections) => sections.map((section) => section.id));
    const hudStates = JSON.parse((await page.locator('[data-hud-states]').getAttribute('data-hud-states')) ?? '[]');
    expect(ids).toEqual(['hero', 'about', 'projects', 'skills', 'experience', 'contact']);

    let previous = -1;
    for (const [index, id] of ids.entries()) {
      await scrollToSection(page, id, 'center');
      await expectSettledInView(page);
      const state = await probe(page);
      expect(state.section).toBe(index);
      // Progress is continuous and grows with the page.
      expect(state.progress).toBeGreaterThan(previous);
      previous = state.progress ?? previous;
      await expect(page.locator('[data-hud-index]')).toHaveText(String(index + 1).padStart(2, '0'));
      await expect(page.locator('[data-hud-state]')).toHaveText(hudStates[index]);
      const current = page.locator('[data-site-nav] a[aria-current="location"]');
      if (await page.locator(`[data-site-nav] a[href="#${id}"]`).count()) await expect(current).toHaveAttribute('href', `#${id}`);
      else await expect(current).toHaveCount(0);
    }

    // Within a section the formation holds for the first 60% before it starts to morph toward the next one.
    await scrollToSection(page, 'skills', 'start');
    await page.evaluate(() => window.scrollBy(0, -innerHeight / 2 + 10));
    await expect.poll(async () => (await probe(page)).progress).toBe(3);
    const scrollbar = await page.locator('[data-scroll-progress]').evaluate((element) => getComputedStyle(element).transform);
    expect(scrollbar).not.toBe('none');
    expect(errors).toEqual([]);
  });

  test('a long instant jump glides in from the neighbouring state without sweeping unrelated states', async ({ page }) => {
    const errors = await open(page);
    await expectSettledInView(page);

    // A long instant jump glides in from the neighbouring state, never through the sections in between.
    await startSampling(page);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expectSettledInView(page);
    const samples = await stopSampling(page);
    const goal = (await probe(page)).progress ?? 0;
    const afterJump = samples.slice(samples.findIndex((value) => value > 0.01) + 1);
    expect(afterJump.length).toBeGreaterThan(2);
    for (const value of afterJump) expect(value).toBeGreaterThanOrEqual(goal - MAX_LAG - 1e-6);
    expect(errors).toEqual([]);
  });

  test('Home, End and Page Down settle to the section in view', async ({ page }) => {
    const errors = await open(page);
    await expectSettledInView(page);

    await page.keyboard.press('End');
    await expectSettledInView(page);
    expect((await inView(page)).id).toBe('contact');

    await page.keyboard.press('Home');
    await expectSettledInView(page);
    expect((await inView(page)).id).toBe('hero');

    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await expectSettledInView(page);
    expect((await probe(page)).section).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('nav anchor jumps settle to the linked section', async ({ page }) => {
    const errors = await open(page);
    await expectSettledInView(page);

    for (const id of ['skills', 'projects', 'contact', 'about']) {
      await page.locator(`[data-site-nav] a[href="#${id}"]`).click();
      await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#${id}`);
      await expectSettledInView(page);
      expect((await inView(page)).id).toBe(id);
      await expect(page.locator('html')).toHaveAttribute('data-section', id);
    }
    expect(errors).toEqual([]);
  });

  test('a reload mid-page starts from the section in view, not from the hero', async ({ page }) => {
    const errors = await open(page);
    await scrollToSection(page, 'experience', 'center');
    await expectSettledInView(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'running');
    await expect(page.locator('html')).toHaveAttribute('data-section', 'experience');
    await expect.poll(async () => (await probe(page)).frames).toBeGreaterThan(0);
    const first = await probe(page);
    // The loop starts already settled on the restored position.
    expect(Math.abs((first.displayed ?? 0) - (first.progress ?? 0))).toBeLessThanOrEqual(MAX_LAG);
    expect(first.displayed).toBeGreaterThan(3);
    await expectSettledInView(page);
    expect(errors).toEqual([]);
  });

  test('resize and orientation change recompute section offsets', async ({ page }) => {
    const errors = await open(page);
    await scrollToSection(page, 'skills', 'center');
    await expectSettledInView(page);

    await page.setViewportSize({ width: 820, height: 1180 });
    await scrollToSection(page, 'experience', 'center');
    await expectSettledInView(page);
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await scrollToSection(page, 'projects', 'center');
    await expectSettledInView(page);
    expect((await inView(page)).id).toBe('projects');
    expect(errors).toEqual([]);
  });

  test('highlights the cluster of the project card being read and retargets the camera', async ({ page }) => {
    const errors = await open(page);
    expect(await probe(page)).toMatchObject({ retarget: true });
    const cards = await page.locator('main [data-cluster]').count();
    expect(cards).toBe(6);
    for (const cluster of [0, 3, 5, 1]) {
      await centreCard(page, cluster);
      await expect.poll(async () => (await probe(page)).cluster).toBe(cluster);
      expect((await inView(page)).cluster).toBe(cluster);
      await expect(page.locator('main [data-active="true"]')).toHaveCount(1);
      await expect(page.locator(`main [data-cluster="${cluster}"]`)).toHaveAttribute('data-active', 'true');
    }
    await scrollToSection(page, 'skills', 'center');
    await expect(page.locator('main [data-active]')).toHaveCount(0);
    await expect.poll(async () => (await probe(page)).cluster).toBe(-1);
    expect(errors).toEqual([]);
  });

  test('captures of different sections differ in the canvas region', async ({ page }) => {
    const errors = await open(page);
    const settledCapture = async (id: string) => {
      await scrollToSection(page, id, 'center');
      await expectSettledInView(page);
      return sceneCapture(page);
    };
    const hero = await settledCapture('hero');
    const heroAgain = await sceneCapture(page);
    const skills = await settledCapture('skills');
    const contact = await settledCapture('contact');
    const drift = await compositionDistance(page, hero, heroAgain);
    const heroSkills = await compositionDistance(page, hero, skills);
    const skillsContact = await compositionDistance(page, skills, contact);
    // The change comes from the choreography, not from the continuous spin and shimmer.
    expect(heroSkills).toBeGreaterThan(Math.max(1, drift * 3));
    expect(skillsContact).toBeGreaterThan(Math.max(1, drift * 3));
    expect(errors).toEqual([]);
  });
});

test.describe('choreography: mobile', () => {
  test.use({ viewport: mobile, hasTouch: true, isMobile: true });

  test('uses the simplified choreography: card highlight without camera retargeting or parallax', async ({ page }) => {
    const errors = await open(page);
    expect(await probe(page)).toMatchObject({ tier: 'lite', retarget: false, parallax: false });
    for (const cluster of [2, 4]) {
      await centreCard(page, cluster);
      await expect.poll(async () => (await probe(page)).cluster).toBe(cluster);
      await expect(page.locator(`main [data-cluster="${cluster}"]`)).toHaveAttribute('data-active', 'true');
    }
    for (const id of ['about', 'contact']) {
      await scrollToSection(page, id, 'center');
      await expectSettledInView(page);
    }
    expect(errors).toEqual([]);
  });
});
