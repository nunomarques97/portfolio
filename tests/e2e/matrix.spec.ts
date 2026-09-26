import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { isPlaceholder, portfolio } from '../../src/content/portfolio';

// Integrated check of every rendering mode at both reference widths: the content layer must be complete, readable,
// accessible and self-contained whatever the scene does (running, static, unavailable or never started).

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const WEBGL_OFF_ARGS = ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'];
const { hero, about, projects, skills, experience, contact, ui } = portfolio;
const featured = projects.items.filter((project) => project.featured);
const sectionIds = portfolio.sections.map((section) => section.id);

interface Mode {
  name: string;
  /** Expected html[data-scene] once the page has settled; null when scripts never run. */
  scene: 'running' | 'unavailable' | null;
  reducedMotion: 'reduce' | 'no-preference';
  javaScriptEnabled: boolean;
  args: string[];
}

const modes: Mode[] = [
  { name: 'default', scene: 'running', reducedMotion: 'no-preference', javaScriptEnabled: true, args: [] },
  { name: 'reduced motion', scene: 'running', reducedMotion: 'reduce', javaScriptEnabled: true, args: [] },
  {
    name: 'WebGL off',
    scene: 'unavailable',
    reducedMotion: 'no-preference',
    javaScriptEnabled: true,
    args: WEBGL_OFF_ARGS,
  },
  { name: 'JavaScript disabled', scene: null, reducedMotion: 'no-preference', javaScriptEnabled: false, args: [] },
];

/** Records console errors, page errors and every request that leaves the page's origin. */
function watch(page: Page, origin: string) {
  const errors: string[] = [];
  const foreign: string[] = [];
  const failed: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    // data: and blob: URLs never reach the network.
    if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== origin) foreign.push(request.url());
  });
  page.on('requestfailed', (request) => failed.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  return { errors, foreign, failed };
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Opacity as painted: the product of the element's and its ancestors' opacity. */
function paintedOpacity(locator: Locator) {
  return locator.evaluate((element) => {
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    return opacity;
  });
}

/** The texts each section must show, with the element that carries them. */
function sectionContent(page: Page): Record<string, Locator[]> {
  const inSection = (id: string, text: string) => page.locator(`#${id}`).getByText(text, { exact: true }).first();
  return {
    hero: [
      page.locator('#hero').getByRole('heading', { level: 1, name: hero.name, exact: true }),
      inSection('hero', hero.title),
      inSection('hero', hero.tagline),
      page.locator('#hero').getByRole('link', { name: hero.primaryAction.label, exact: true }),
      page.locator('#hero').getByRole('link', { name: hero.secondaryAction.label, exact: true }),
    ],
    about: [
      page.locator('#about').getByRole('heading', { level: 2, name: about.heading, exact: true }),
      ...about.paragraphs.map((paragraph) => inSection('about', paragraph)),
      ...about.stats.map((stat) => inSection('about', stat.label)),
      page.locator('#about').getByRole('img', { name: about.portrait.alt, exact: true }),
    ],
    projects: [
      page.locator('#projects').getByRole('heading', { level: 2, name: projects.heading, exact: true }),
      ...featured.flatMap((project) => [
        page.locator('#projects').getByRole('heading', { level: 3, name: project.title, exact: true }),
        inSection('projects', project.pitch),
        inSection('projects', project.description),
      ]),
    ],
    skills: [
      page.locator('#skills').getByRole('heading', { level: 2, name: skills.heading, exact: true }),
      ...skills.groups.flatMap((group) => [
        page.locator('#skills').getByRole('heading', { level: 3, name: group.title, exact: true }),
        ...group.items.map((item) => inSection('skills', item)),
      ]),
    ],
    experience: [
      page.locator('#experience').getByRole('heading', { level: 2, name: experience.heading, exact: true }),
      ...experience.roles.map((role) =>
        page.locator('#experience').getByRole('heading', { level: 3, name: role.title, exact: true }),
      ),
      ...experience.education.map((entry) => inSection('experience', entry.school)),
    ],
    contact: [
      page.locator('#contact').getByRole('heading', { level: 2, name: contact.heading, exact: true }),
      inSection('contact', contact.lede),
      ...contact.links.map((link) => page.locator(`#contact [data-contact="${link.kind}"]`)),
      page.locator('#contact [data-contact="cv"]'),
    ],
  };
}

/** Loads the page in `mode` and checks that every section shows its content, unfaded, without horizontal overflow. */
async function checkContent(page: Page, mode: Mode) {
  await page.goto('/', { waitUntil: 'networkidle' });

  const html = page.locator('html');
  if (mode.scene) await expect(html).toHaveAttribute('data-scene', mode.scene, { timeout: 15_000 });
  else await expect(html).not.toHaveAttribute('data-scene', /.+/);
  if (mode.scene === 'unavailable' || mode.scene === null) await expect(page.locator('canvas')).toHaveCount(0);

  await expect(page.locator('main > section')).toHaveCount(sectionIds.length);
  const content = sectionContent(page);
  for (const id of sectionIds) {
    const section = page.locator(`#${id}`);
    await section.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await expect(section, id).toBeVisible();
    for (const item of content[id] ?? []) {
      await expect(item, id).toBeVisible();
      // Content reveals as it scrolls into view, so each item is brought into view and given time to finish.
      await item.scrollIntoViewIfNeeded();
      await expect.poll(() => paintedOpacity(item), { message: `${id}: painted opacity` }).toBeGreaterThan(0.95);
    }
    expect(await horizontalOverflow(page), `${id}: horizontal overflow`).toBe(0);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.passes.length, 'rules that ran').toBeGreaterThan(0);
  const blocking = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
  expect(blocking).toEqual([]);
}

/** A scripted page showing the markup that `page` rendered without JavaScript, minus its (never run) scripts. */
async function withoutScripts(browser: Browser, page: Page, viewport: { width: number; height: number }) {
  const markup = (await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  expect(markup).not.toMatch(/<script/i);
  const context = await browser.newContext({ baseURL: page.url(), viewport });
  const copy = await context.newPage();
  await copy.route(page.url(), (route) => route.fulfill({ contentType: 'text/html', body: markup }));
  await copy.goto(page.url(), { waitUntil: 'networkidle' });
  await expect(copy.locator('html')).not.toHaveClass(/\bjs\b/);
  await expect(copy.getByRole('heading', { level: 1 })).toBeVisible();
  return copy;
}

for (const mode of modes) {
  test.describe(`matrix: ${mode.name}`, () => {
    for (const viewport of [desktop, mobile]) {
      test(`at ${viewport.width} px every section is visible, accessible and self-contained`, async ({
        browser: shared,
        playwright,
        baseURL,
      }) => {
        test.setTimeout(90_000);
        // Launch arguments need a browser of their own; the other modes are context options of the shared one.
        const browser = mode.args.length
          ? await playwright.chromium.launch({ channel: test.info().project.use.channel, args: mode.args })
          : shared;
        const context = await browser.newContext({
          baseURL,
          viewport,
          reducedMotion: mode.reducedMotion,
          javaScriptEnabled: mode.javaScriptEnabled,
        });
        try {
          const page = await context.newPage();
          const network = watch(page, new URL(baseURL ?? '').origin);
          await checkContent(page, mode);
          // axe needs scripts, so without JavaScript it audits the same markup, served with its scripts removed.
          const audited = mode.javaScriptEnabled ? page : await withoutScripts(browser, page, viewport);
          try {
            await expectNoBlockingViolations(audited);
          } finally {
            if (audited !== page) await audited.context().close();
          }
          expect(network.foreign, 'requests that leave the site origin').toEqual([]);
          expect(network.failed, 'failed requests').toEqual([]);
          expect(network.errors, 'console and page errors').toEqual([]);
        } finally {
          await context.close();
          if (browser !== shared) await browser.close();
        }
      });
    }
  });
}


interface Stop {
  id: string;
  /** Document coordinates of the focused element; null for elements in fixed chrome. */
  top: number | null;
  left: number;
  outline: string;
  visible: boolean;
  inViewport: boolean;
  unobscured: boolean;
  inScene: boolean;
}

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

/** Tabs through the whole page from a fresh load and describes every focus stop until focus leaves the document. */
async function keyboardWalk(page: Page) {
  const stops: Stop[] = [];
  for (let step = 0; step < 60; step += 1) {
    await page.keyboard.press('Tab');
    await scrollIdle(page);
    const stop = await page.evaluate((): Stop | null => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const fixed = element.closest('.site-header') !== null || element.classList.contains('skip-link');
      const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      const section = element.closest('main section[id], header, footer');
      const key = element.getAttribute('href') ?? element.textContent?.trim() ?? element.tagName;
      return {
        id: `${section?.id || section?.tagName.toLowerCase() || 'body'} ${key}`,
        top: fixed ? null : rect.top + scrollY,
        left: rect.left,
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        visible: element.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
        inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
        unobscured: hit !== null && (element === hit || element.contains(hit)),
        inScene: element.tagName === 'CANVAS' || element.closest('[data-scene-layer], .hud') !== null,
      };
    });
    if (!stop) {
      if (stops.length > 0) break;
      continue;
    }
    if (stops.some((seen) => seen.id === stop.id)) break;
    stops.push(stop);
  }
  return stops;
}

const linkStops = [
  `hero ${hero.primaryAction.href}`,
  `hero ${hero.secondaryAction.href}`,
  ...featured.flatMap((project) => (isPlaceholder(project.url) ? [] : [`projects ${project.url}`])),
  ...(isPlaceholder(projects.profileLink.href) ? [] : [`projects ${projects.profileLink.href}`]),
  ...contact.links.flatMap((link) => (isPlaceholder(link.href) ? [] : [`contact ${link.href}`])),
  ...(isPlaceholder(contact.cv.file) ? [] : [`contact ${contact.cv.file}`]),
];
const navStops = portfolio.sections.flatMap((section) => (section.navLabel ? [`header #${section.id}`] : []));

for (const viewport of [desktop, mobile]) {
  test.describe(`keyboard walk at ${viewport.width} px`, () => {
    test.use({ viewport });

    test('runs from the skip link through nav, projects and contact in visual order with a focus ring', async ({
      page,
    }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      await expect(page.locator('html')).toHaveAttribute('data-scene', 'running', { timeout: 15_000 });

      const stops = await keyboardWalk(page);
      // At 390 px the navigation is a disclosure: its button is the only nav stop while it is closed.
      const header = viewport === mobile ? [`header ${ui.menuButton}`] : navStops;
      expect(stops.map((stop) => stop.id)).toEqual([`body #main`, ...header, ...linkStops]);

      for (const stop of stops) {
        expect(stop.inScene, `${stop.id}: focus in the scene layer`).toBe(false);
        expect(stop.outline, `${stop.id}: focus ring`).toBe('solid 2px');
        expect(stop.visible, `${stop.id}: visible`).toBe(true);
        expect(stop.inViewport, `${stop.id}: scrolled into view`).toBe(true);
        expect(stop.unobscured, `${stop.id}: not covered by other content`).toBe(true);
      }
      const flow = stops.filter((stop) => stop.top !== null);
      for (const [index, stop] of flow.entries()) {
        const previous = flow[index - 1];
        if (!previous || previous.top === null || stop.top === null) continue;
        const sameRow = Math.abs(stop.top - previous.top) < 2;
        if (sameRow) expect(stop.left, `${stop.id}: left to right after ${previous.id}`).toBeGreaterThan(previous.left);
        else expect(stop.top, `${stop.id}: below ${previous.id}`).toBeGreaterThan(previous.top);
      }
      await expect(page.locator('canvas:focus, [data-scene-layer] :focus')).toHaveCount(0);
    });
  });
}
