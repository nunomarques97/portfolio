import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { portfolio } from '../../src/content/portfolio';

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const navLinks = portfolio.sections.flatMap((section) =>
  section.navLabel ? [{ href: `#${section.id}`, label: section.navLabel }] : [],
);

/** Records every request and every failed request the page makes. */
function watchNetwork(page: Page) {
  const requests: string[] = [];
  const failed: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('requestfailed', (request) => failed.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  return { requests, failed };
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('page shell', () => {
  test.use({ viewport: desktop });

  test('has the document metadata and makes no third-party requests', async ({ page, baseURL }) => {
    const network = watchNetwork(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(portfolio.site.title);
    const head = page.locator('head');
    await expect(head.locator('meta[name="description"]')).toHaveAttribute('content', portfolio.site.description);
    await expect(head.locator('meta[property="og:title"]')).toHaveAttribute('content', portfolio.site.title);
    await expect(head.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      portfolio.site.description,
    );
    await expect(head.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#[0-9a-f]{6}$/i);
    await expect(head.locator('link[rel="icon"]')).toHaveAttribute('type', 'image/svg+xml');

    const favicon = await page.request.get(await head.locator('link[rel="icon"]').getAttribute('href') ?? '');
    expect(favicon.ok()).toBe(true);
    expect(favicon.headers()['content-type']).toContain('image/svg+xml');

    const origin = new URL(baseURL ?? '').origin;
    expect(network.requests.length).toBeGreaterThan(0);
    expect(network.requests.filter((url) => new URL(url).origin !== origin)).toEqual([]);
    expect(network.failed).toEqual([]);
  });

  test('uses landmarks, a single h1 and a nav whose targets all exist', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toContainText(portfolio.footer.copyright);

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(portfolio.hero.name);
    await expect(page.locator('#hero')).toContainText(portfolio.hero.name);

    const nav = page.getByRole('navigation', { name: portfolio.ui.navLabel });
    const links = nav.getByRole('link');
    await expect(links).toHaveText(navLinks.map((link) => link.label));
    for (const [index, link] of navLinks.entries()) {
      await expect(links.nth(index)).toHaveAttribute('href', link.href);
      await expect(page.locator(`main section${link.href}`)).toHaveCount(1);
    }
    for (const id of ['#about', '#projects', '#skills', '#experience', '#contact']) {
      expect(navLinks.map((link) => link.href)).toContain(id);
    }
  });

  test('the skip link is the first focusable element and moves focus into main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: portfolio.ui.skipLink });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('main')?.contains(document.activeElement) ?? false))
      .toBe(true);
    // The next Tab continues inside main, after the navigation.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: portfolio.hero.primaryAction.label })).toBeFocused();
  });

  test('renders hero and about copy from the content file', async ({ page }) => {
    const { hero, about } = portfolio;
    await page.goto('/');

    const heroSection = page.locator('#hero');
    await expect(heroSection).toContainText(hero.title);
    await expect(heroSection).toContainText(hero.location);
    await expect(heroSection).toContainText(hero.tagline);
    await expect(heroSection).toContainText(hero.availability);
    for (const action of [hero.primaryAction, hero.secondaryAction]) {
      await expect(heroSection.getByRole('link', { name: action.label })).toHaveAttribute('href', action.href);
    }

    const aboutSection = page.locator('#about');
    await expect(aboutSection.getByRole('heading', { level: 2 })).toHaveText(about.heading);
    await expect(aboutSection).toContainText(about.eyebrow);
    for (const paragraph of about.paragraphs) await expect(aboutSection).toContainText(paragraph);
    for (const stat of about.stats) {
      await expect(aboutSection.locator('dt', { hasText: stat.label })).toHaveCount(1);
      await expect(aboutSection.locator('dd', { hasText: stat.value })).toHaveCount(1);
    }
  });

  test('the portrait slot is a decorative placeholder that requests no image', async ({ page }) => {
    const network = watchNetwork(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    const slot = page.locator('#about [data-placeholder]');
    await expect(slot).toHaveCount(1);
    await expect(slot).toHaveAttribute('aria-hidden', 'true');
    await expect(slot).toContainText(portfolio.about.portrait.placeholderInitials);
    await expect(slot).toBeVisible();
    await expect(page.locator('#about img, #about picture')).toHaveCount(0);

    const box = await slot.boundingBox();
    expect(box?.width).toBeCloseTo(176, 0);
    expect(box?.height).toBeCloseTo(220, 0);

    await page.locator('#about').scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');
    expect(network.failed).toEqual([]);
    expect(network.requests.filter((url) => /\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(url))).toEqual([]);
  });

  test('the scene layer is a fixed, hidden backdrop that never takes focus or pointer events', async ({ page }) => {
    await page.goto('/');
    const layer = page.locator('[data-scene-layer]');
    await expect(layer).toHaveAttribute('aria-hidden', 'true');
    const style = await layer.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { position: computed.position, pointerEvents: computed.pointerEvents, zIndex: computed.zIndex };
    });
    expect(style).toEqual({ position: 'fixed', pointerEvents: 'none', zIndex: '0' });
    await expect(layer.locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0);

    // The fallback background is visible: the backdrop, not the content, is hit at the right edge.
    const background = await page.locator('.scene-fallback').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background).toContain('radial-gradient');
    const hit = await page.evaluate(() => document.elementFromPoint(1400, 450)?.closest('[data-scene-layer]'));
    expect(hit).toBeFalsy();
  });

  test('every interactive element shows a visible focus ring', async ({ page }) => {
    await page.goto('/');
    const count = await page.locator('a[href], button').count();
    const seen = new Set<string>();
    for (let step = 0; step < count + 2; step += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        return {
          name: `${element.tagName} ${element.textContent?.trim()}`,
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          visible: element.checkVisibility(),
        };
      });
      if (!focused) continue;
      seen.add(focused.name);
      expect(focused.outline, focused.name).toBe('solid 2px');
      expect(focused.visible, focused.name).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(navLinks.length + 3);
  });
});

for (const viewport of [desktop, mobile]) {
  test(`axe finds no serious or critical violations at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/', { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    const blocking = results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
    expect(blocking).toEqual([]);
  });
}

test.describe('at 390 px', () => {
  test.use({ viewport: mobile });

  test('has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    expect(await horizontalOverflow(page)).toBe(0);
    await page.locator('#about').scrollIntoViewIfNeeded();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('the menu disclosure opens by keyboard and closes with Escape, returning focus', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: portfolio.ui.menuButton });
    const list = page.locator('#site-nav-list');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveAttribute('aria-controls', 'site-nav-list');
    await expect(list).toBeHidden();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(list.getByRole('link')).toHaveText(navLinks.map((link) => link.label));

    await page.keyboard.press('Tab');
    await expect(list.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(list).toBeHidden();
    await expect(button).toBeFocused();

    // Choosing a link closes the menu and jumps to the section.
    await page.keyboard.press('Enter');
    await list.getByRole('link', { name: navLinks[1]?.label }).click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(new RegExp(`${navLinks[1]?.href}$`));
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('the portrait slot sits at the top of About at 144 x 180', async ({ page }) => {
    await page.goto('/');
    const box = await page.locator('#about [data-placeholder]').boundingBox();
    expect(box?.width).toBeCloseTo(144, 0);
    expect(box?.height).toBeCloseTo(180, 0);
  });
});

test.describe('with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  for (const viewport of [desktop, mobile]) {
    test(`hero, about and navigation are readable at ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(portfolio.hero.tagline)).toBeVisible();
      await expect(page.getByRole('link', { name: portfolio.hero.primaryAction.label })).toBeVisible();
      for (const paragraph of portfolio.about.paragraphs) {
        await expect(page.getByText(paragraph)).toBeAttached();
      }
      const nav = page.getByRole('navigation', { name: portfolio.ui.navLabel });
      await expect(page.getByRole('button', { name: portfolio.ui.menuButton })).toBeHidden();
      for (const link of navLinks) await expect(nav.getByRole('link', { name: link.label })).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);

      // Keyboard still reaches the navigation right after the skip link.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(nav.getByRole('link', { name: navLinks[0]?.label })).toBeFocused();
    });
  }
});
