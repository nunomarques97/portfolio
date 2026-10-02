import { mkdirSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { caseStudies, caseStudyPath, caseStudyUi, type CaseStudy } from '../../src/content/case-studies';
import { isPlaceholder, portfolio, projectHrefs, type Project } from '../../src/content/portfolio';

// The case-study pages: one per featured project, reachable from its card, readable and accessible in both colour
// schemes at both reference widths, self-contained, script-free and still under reduced motion.

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const schemes = ['dark', 'light'] as const;
const featured = portfolio.projects.items.filter((project) => project.featured);
const projectOf = (study: CaseStudy) => featured.find((project) => project.repo === study.repo) as Project;
// The local build serves the site from the root.
const route = (study: CaseStudy) => caseStudyPath('/', study.slug);
const screenshotDir = path.join('test-results', 'screenshots', 'case-study');

/** Records console errors, page errors, failed requests and every request that leaves the page's origin. */
function watch(page: Page, origin: string) {
  const errors: string[] = [];
  const foreign: string[] = [];
  const failed: string[] = [];
  const scripts: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== origin) foreign.push(request.url());
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  page.on('requestfailed', (request) => failed.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  return { errors, foreign, failed, scripts };
}

/** Whether the element has not moved over 300 ms (scrolling, reveals and the active-card shift have finished). */
async function restingBox(locator: Locator) {
  const before = await locator.boundingBox();
  await locator.page().waitForTimeout(300);
  const after = await locator.boundingBox();
  return before !== null && after !== null && before.x === after.x && before.y === after.y;
}

/** Waits until a smooth scroll (anchor jumps and focus both use one) has started, if any, and come to rest. */
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

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function expectNoBlockingViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.passes.length, `${label}: rules that ran`).toBeGreaterThan(0);
  const blocking = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
  expect(blocking, label).toEqual([]);
}

test.describe('case-study routes', () => {
  test('every featured project has a page with its title as the only h1', async ({ page, baseURL }) => {
    expect(caseStudies.map((study) => study.repo)).toEqual(featured.map((project) => project.repo));
    const network = watch(page, new URL(baseURL ?? '').origin);
    for (const study of caseStudies) {
      const response = await page.goto(route(study));
      expect(response?.status(), study.slug).toBe(200);
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText(projectOf(study).title);
      await expect(page.locator('main h2')).toHaveText(Object.values(caseStudyUi.sections));
      await expect(page).toHaveTitle(caseStudyUi.pageTitle(projectOf(study).title));
    }
    expect(network.errors, 'console and page errors').toEqual([]);
    expect(network.failed, 'failed requests').toEqual([]);
  });

  test('every home card links to its case study, and the page links back', async ({ page }) => {
    for (const study of caseStudies) {
      const project = projectOf(study);
      await page.goto('/');
      const card = page.locator('#projects article').filter({ has: page.getByRole('heading', { name: project.title, exact: true }) });
      const link = card.getByRole('link', { name: portfolio.ui.caseStudyLink(project.title), exact: true });
      await expect(link).toHaveAttribute('href', route(study));
      await expect(link).not.toHaveAttribute('target');
      // The page scrolls smoothly and the card being read shifts, so the link is brought to rest before the click.
      await link.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await expect.poll(() => restingBox(link), { message: `${study.slug}: link at rest` }).toBe(true);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${route(study)}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.title);

      const back = page.getByRole('link', { name: caseStudyUi.backLink });
      await expect(back).toHaveAttribute('href', '/#projects');
      const index = caseStudies.indexOf(study);
      const previous = caseStudies[(index - 1 + caseStudies.length) % caseStudies.length] as CaseStudy;
      const next = caseStudies[(index + 1) % caseStudies.length] as CaseStudy;
      await expect(page.locator('a[rel="prev"]')).toHaveAttribute('href', route(previous));
      await expect(page.locator('a[rel="prev"]')).toContainText(projectOf(previous).title);
      await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', route(next));
      await expect(page.locator('a[rel="next"]')).toContainText(projectOf(next).title);
    }
  });
});

for (const viewport of [desktop, mobile]) {
  for (const colorScheme of schemes) {
    test.describe(`case studies at ${viewport.width} px, ${colorScheme}`, () => {
      test.use({ viewport, colorScheme });

      test('have no serious or critical axe violations, no overflow and no foreign request', async ({ page, baseURL }) => {
        test.setTimeout(120_000);
        const network = watch(page, new URL(baseURL ?? '').origin);
        for (const study of caseStudies) {
          await page.goto(route(study), { waitUntil: 'networkidle' });
          const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
          // Dark keeps the home palette; light swaps in the light tokens.
          expect(background, study.slug).toBe(colorScheme === 'dark' ? 'rgb(4, 6, 13)' : 'rgb(244, 247, 251)');
          await expectNoBlockingViolations(page, `${study.slug} ${colorScheme} ${viewport.width}`);
          expect(await horizontalOverflow(page), study.slug).toBe(0);
        }
        expect(network.foreign, 'requests that leave the site origin').toEqual([]);
        expect(network.scripts, 'scripts loaded by case-study pages').toEqual([]);
        expect(network.failed, 'failed requests').toEqual([]);
        expect(network.errors, 'console and page errors').toEqual([]);
      });
    });
  }
}

interface Stop {
  key: string;
  top: number;
  left: number;
  outline: string;
  visible: boolean;
  inViewport: boolean;
}

/** Tabs through the page from a fresh load until focus comes back to an element already seen or leaves the page. */
async function keyboardWalk(page: Page) {
  const stops: Stop[] = [];
  for (let step = 0; step < 80; step += 1) {
    await page.keyboard.press('Tab');
    await scrollIdle(page);
    const stop = await page.evaluate((): Stop | null => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        key: element.getAttribute('href') ?? element.tagName,
        top: rect.top + scrollY,
        left: rect.left,
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        visible: element.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
        inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
      };
    });
    if (!stop) {
      if (stops.length > 0) break;
      continue;
    }
    if (stops.some((seen) => seen.key === stop.key && seen.top === stop.top)) break;
    stops.push(stop);
  }
  return stops;
}

for (const viewport of [desktop, mobile]) {
  test.describe(`case-study keyboard walk at ${viewport.width} px`, () => {
    test.use({ viewport });

    test('runs from the skip link through every link in visual order with a focus ring', async ({ page }) => {
      test.setTimeout(120_000);
      const sections = portfolio.sections.flatMap((section) => (section.navLabel ? [`/#${section.id}`] : []));
      for (const study of caseStudies) {
        const project = projectOf(study);
        await page.goto(route(study));
        const stops = await keyboardWalk(page);
        const index = caseStudies.indexOf(study);
        const previous = caseStudies[(index - 1 + caseStudies.length) % caseStudies.length] as CaseStudy;
        const next = caseStudies[(index + 1) % caseStudies.length] as CaseStudy;
        expect(stops.map((stop) => stop.key), study.slug).toEqual([
          '#main',
          '/',
          ...sections,
          ...projectHrefs(project),
          '/#projects',
          route(previous),
          route(next),
        ]);
        for (const stop of stops) {
          expect(stop.outline, `${study.slug} ${stop.key}: focus ring`).toBe('solid 2px');
          expect(stop.visible, `${study.slug} ${stop.key}: visible`).toBe(true);
          expect(stop.inViewport, `${study.slug} ${stop.key}: scrolled into view`).toBe(true);
        }
        // Top to bottom; links that share a row go left to right. The skip link sits over the header.
        const flow = stops.slice(1);
        for (const [position, stop] of flow.entries()) {
          const before = flow[position - 1];
          if (!before) continue;
          if (Math.abs(stop.top - before.top) < 2) expect(stop.left, `${study.slug} ${stop.key}`).toBeGreaterThan(before.left);
          else expect(stop.top, `${study.slug} ${stop.key}`).toBeGreaterThan(before.top);
        }
      }
    });
  });
}

test.describe('case studies under reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: desktop });

  test('run no transition or animation, even on hover and focus', async ({ page }) => {
    test.setTimeout(120_000);
    for (const study of caseStudies) {
      await page.goto(route(study));
      for (const link of await page.locator('a:not(.skip-link)').all()) {
        await link.hover();
        await link.focus();
      }
      // The skip link waits above the viewport until it is focused, and then covers the header: focused last.
      await page.locator('.skip-link').focus();
      const moving = await page.evaluate(() => {
        const animations = document.getAnimations().map((animation) => String(animation.id || animation.constructor.name));
        const styled = [...document.querySelectorAll('*')].flatMap((element) => {
          const style = getComputedStyle(element);
          const durations = `${style.transitionDuration},${style.animationDuration}`.split(',').map((value) => parseFloat(value));
          const running = durations.some((value) => value > 0) && (style.transitionProperty !== 'none' || style.animationName !== 'none');
          return running ? [`${element.tagName.toLowerCase()}.${element.className}`] : [];
        });
        const smooth = getComputedStyle(document.documentElement).scrollBehavior;
        return { animations, styled, smooth };
      });
      expect(moving.animations, study.slug).toEqual([]);
      expect(moving.styled, study.slug).toEqual([]);
      expect(moving.smooth, study.slug).toBe('auto');
    }
  });
});

test.describe('case studies without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: mobile });

  test('show their complete content', async ({ page }) => {
    for (const study of caseStudies) {
      await page.goto(route(study));
      const project = projectOf(study);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.title);
      await expect(page.locator('main')).toContainText(project.pitch);
      for (const paragraph of study.problem) {
        await expect(page.locator('#problem')).toContainText(isPlaceholder(paragraph) ? paragraph.hint : paragraph);
      }
      for (const item of [...study.constraints, ...study.results, ...study.nextSteps]) {
        await expect(page.locator('main')).toContainText(isPlaceholder(item) ? item.hint : item);
      }
      if (!isPlaceholder(study.diagram)) {
        await expect(page.locator('#architecture svg[role="img"]')).toBeVisible();
        for (const node of study.diagram.nodes) await expect(page.locator('#architecture ol')).toContainText(node.label);
      }
      const nav = page.getByRole('navigation', { name: portfolio.ui.navLabel });
      for (const section of portfolio.sections.filter((item) => item.navLabel)) {
        await expect(nav.getByRole('link', { name: section.navLabel })).toBeVisible();
      }
    }
  });
});

test.describe('architecture diagrams', () => {
  for (const viewport of [desktop, mobile]) {
    test(`keep every label at 12 CSS px or more at ${viewport.width} px`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, viewport });
      const page = await context.newPage();
      let checked = 0;
      for (const study of caseStudies.filter((item) => !isPlaceholder(item.diagram))) {
        await page.goto(route(study));
        const sizes = await page.locator('#architecture svg text').evaluateAll((texts) =>
          texts.map((element) => {
            const svg = (element as SVGTextElement).ownerSVGElement as SVGSVGElement;
            const scale = svg.getScreenCTM()?.a ?? 0;
            return { text: element.textContent, size: parseFloat(getComputedStyle(element).fontSize) * scale };
          }),
        );
        expect(sizes.length, study.slug).toBeGreaterThan(0);
        for (const { text, size } of sizes) expect(size, `${study.slug}: ${text}`).toBeGreaterThanOrEqual(12);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(0);
      await context.close();
    });
  }

  test('follow the colour scheme through theme variables', async ({ browser, baseURL }) => {
    const study = caseStudies.find((item) => !isPlaceholder(item.diagram)) as CaseStudy;
    const fills: Record<string, string> = {};
    for (const colorScheme of schemes) {
      const context = await browser.newContext({ baseURL, colorScheme });
      const page = await context.newPage();
      await page.goto(route(study));
      fills[colorScheme] = await page.locator('#architecture .diagram-surface').evaluate((element) => getComputedStyle(element).fill);
      await context.close();
    }
    expect(fills.dark).toBe('rgb(7, 12, 24)');
    expect(fills.light).toBe('rgb(255, 255, 255)');
  });
});

test.describe('narrow screens', () => {
  for (const width of [320, 390, 1440]) {
    test(`case studies have no horizontal overflow at ${width} px`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 800 } });
      const page = await context.newPage();
      for (const study of caseStudies) {
        await page.goto(route(study));
        expect(await horizontalOverflow(page), study.slug).toBe(0);
      }
      await context.close();
    });
  }
});

test.describe('screenshots', () => {
  for (const viewport of [desktop, mobile]) {
    for (const colorScheme of schemes) {
      test(`Tollwise at ${viewport.width} px, ${colorScheme}`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL, viewport, colorScheme });
        const page = await context.newPage();
        await page.goto(route(caseStudies.find((study) => study.slug === 'tollwise') as CaseStudy), {
          waitUntil: 'networkidle',
        });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        mkdirSync(screenshotDir, { recursive: true });
        const file = path.join(screenshotDir, `tollwise-${viewport.width}-${colorScheme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`case-study screenshot: ${file.split(path.sep).join('/')}`);
        await context.close();
      });
    }
  }
});
