import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { isPlaceholder, portfolio, projectHrefs } from '../../src/content/portfolio';

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const { projects, contact, skills, experience, ui } = portfolio;
const featured = projects.items.filter((project) => project.featured);

/** Links the keyboard must reach, in visual order: project cards, the profile link, then contact rows. */
const expectedStops = [
  ...featured.flatMap((project) => projectHrefs(project).map((href) => `projects ${href}`)),
  ...(isPlaceholder(projects.profileLink.href) ? [] : [`projects ${projects.profileLink.href}`]),
  ...contact.links.flatMap((link) => (isPlaceholder(link.href) ? [] : [`contact ${link.href}`])),
  ...(isPlaceholder(contact.cv.file) ? [] : [`contact ${contact.cv.file}`]),
];

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Boxes of the elements matching `selector`, in document coordinates. */
async function boxes(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    }),
  );
}

/** Elements inside `root` whose content is wider than their box (clipped or overflowing text). */
async function overflowingElements(page: Page, root: string) {
  return page.locator(root).evaluate((element) => {
    const viewport = document.documentElement.clientWidth;
    return [element, ...element.querySelectorAll('*')].flatMap((item) => {
      const rect = item.getBoundingClientRect();
      if (rect.width === 0 || item.closest('.visually-hidden')) return [];
      const clipped = item.scrollWidth > item.clientWidth + 1 && getComputedStyle(item).display !== 'inline';
      const outside = rect.right > viewport + 0.5 || rect.left < -0.5;
      return clipped || outside ? [`${item.tagName.toLowerCase()}.${item.className} ${Math.round(rect.right)}`] : [];
    });
  });
}

for (const viewport of [desktop, mobile]) {
  test.describe(`at ${viewport.width} px`, () => {
    test.use({ viewport });

    test('projects render the featured content in order with GitHub links', async ({ page }) => {
      await page.goto('/');
      const section = page.locator('#projects');
      await expect(section.getByRole('heading', { level: 2 })).toHaveText(projects.heading);

      const cards = section.locator('article');
      await expect(cards).toHaveCount(featured.length);
      await expect(cards.getByRole('heading', { level: 3 })).toHaveText(featured.map((project) => project.title));
      for (const [index, project] of featured.entries()) {
        const card = cards.nth(index);
        await expect(card).toHaveAccessibleName(project.title);
        await expect(card).toContainText(project.pitch);
        await expect(card.getByRole('listitem')).toHaveText([...project.tags]);
        const links = card.getByRole('link');
        const names = [
          ...(project.url === null ? [] : [ui.projectLink(project.title)]),
          ...(project.links ?? []).map((link) => link.label),
        ];
        await expect(links).toHaveCount(names.length);
        for (const [position, href] of projectHrefs(project).entries()) {
          const link = links.nth(position);
          await expect(link).toHaveAttribute('href', href);
          await expect(link).toHaveAttribute('target', '_blank');
          await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
          await expect(link).toHaveAccessibleName(`${names[position]} ${ui.opensInNewTab}`);
        }
        if (project.url === null) await expect(card).toContainText(ui.privateRepository);
      }
      for (const hidden of projects.items.filter((project) => !project.featured)) {
        await expect(section).not.toContainText(hidden.title);
        await expect(section.locator(`a[href="${String(hidden.url)}"]`)).toHaveCount(0);
      }
      const hrefs = await section
        .locator('article a[href]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
      expect(hrefs).toEqual(featured.flatMap(projectHrefs));

      const profile = section.getByRole('link', { name: projects.profileLink.label });
      await expect(profile).toHaveAttribute('href', String(projects.profileLink.href));
      await expect(profile).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(profile).toHaveAccessibleName(`${projects.profileLink.label} ${ui.opensInNewTab}`);
    });

    test('project cards stack in one column and skills use the documented grid', async ({ page }) => {
      await page.goto('/');
      const cards = await boxes(page, '#projects article');
      expect(cards).toHaveLength(featured.length);
      for (const [index, card] of cards.entries()) {
        expect(card.left).toBeCloseTo(cards[0]?.left ?? 0, 0);
        if (index > 0) expect(card.top).toBeGreaterThan(cards[index - 1]?.bottom ?? 0);
      }

      const groups = await boxes(page, '#skills .skill-group');
      expect(groups).toHaveLength(skills.groups.length);
      const columns = new Set(groups.map((group) => Math.round(group.left))).size;
      expect(columns).toBe(viewport === desktop ? 2 : 1);
      await expect(page.locator('#skills h3')).toHaveText(skills.groups.map((group) => group.title));
      for (const [index, group] of skills.groups.entries()) {
        await expect(page.locator('#skills ul').nth(index).getByRole('listitem')).toHaveText([...group.items]);
      }
    });

    test('experience is an ordered timeline and contact rows follow the content', async ({ page }) => {
      await page.goto('/');
      const entries = page.locator('#experience ol > li');
      await expect(entries).toHaveCount(experience.roles.length + experience.education.length);
      await expect(entries.getByRole('heading', { level: 3 })).toHaveText([
        ...experience.roles.map((role) => role.title),
        ...experience.education.map((entry) => entry.degree),
      ]);
      for (const [index, role] of experience.roles.entries()) {
        await expect(entries.nth(index)).toContainText(role.period);
        await expect(entries.nth(index)).toContainText(experience.employer);
      }

      const section = page.locator('#contact');
      for (const link of contact.links) {
        const row = section.locator(`[data-contact="${link.kind}"]`);
        await expect(row).toContainText(link.display);
        if (isPlaceholder(link.href)) continue;
        await expect(row).toHaveAttribute('href', link.href);
        if (link.external) await expect(row).toHaveAttribute('rel', 'noopener noreferrer');
        else await expect(row).not.toHaveAttribute('target');
      }
      await expect(section.locator('a[href^="mailto:"]')).toHaveAttribute('href', `mailto:${contact.email}`);

      const cv = section.locator('[data-contact="cv"]');
      await expect(cv).toContainText(contact.cv.label);
      if (isPlaceholder(contact.cv.file)) {
        await expect(cv).toHaveAttribute('data-placeholder');
        await expect(cv).toContainText(ui.comingSoon);
        await expect(cv).not.toHaveAttribute('href');
        await expect(cv).not.toHaveAttribute('tabindex');
        expect(await cv.evaluate((element) => element.matches('a, button, [tabindex]'))).toBe(false);
      } else {
        await expect(cv).toHaveAttribute('href', contact.cv.file);
        await expect(cv).toHaveAttribute('download');
      }
    });

    test('Tab reaches every project and contact link in visual order', async ({ page }) => {
      await page.goto('/');
      const stops: { id: string; top: number; left: number }[] = [];
      for (let step = 0; step < 80; step += 1) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const element = document.activeElement;
          const section = element?.closest('#projects, #contact');
          if (!element || !section) return null;
          const rect = element.getBoundingClientRect();
          return { id: `${section.id} ${element.getAttribute('href')}`, top: rect.top + scrollY, left: rect.left };
        });
        if (!focused) {
          if (stops.length > 0 && stops.length >= expectedStops.length) break;
          continue;
        }
        stops.push(focused);
      }
      expect(stops.map((stop) => stop.id)).toEqual(expectedStops);
      // Top to bottom; links that share a row (a repository and its demo) go left to right.
      for (const [index, stop] of stops.entries()) {
        const previous = stops[index - 1];
        if (!previous) continue;
        if (Math.abs(stop.top - previous.top) < 2) expect(stop.left, stop.id).toBeGreaterThan(previous.left);
        else expect(stop.top, stop.id).toBeGreaterThan(previous.top);
      }
    });

    test('axe finds no serious or critical violations in the sections', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page })
        .include(['#projects', '#skills', '#experience', '#contact'])
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
      const blocking = results.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
      expect(blocking).toEqual([]);
    });

    test('long titles, pitches, tags and contact values wrap without overflow or clipping', async ({ page }) => {
      await page.goto('/');
      expect(await horizontalOverflow(page)).toBe(0);
      for (const root of ['#projects', '#skills', '#experience', '#contact']) {
        expect(await overflowingElements(page, root), root).toEqual([]);
      }

      await page.evaluate(() => {
        const long = 'Extraordinarilylongprojectnamewithoutanybreakopportunity';
        const card = document.querySelector('#projects article');
        const title = card?.querySelector('h3');
        const pitch = card?.querySelector('p:not([aria-hidden])');
        const tags = card?.querySelector('ul');
        // Clones keep the scoped-style attribute that a new element would lack.
        const tagTemplate = tags?.querySelector('li');
        if (!title || !pitch || !tags || !tagTemplate) throw new Error('project card structure changed');
        title.textContent = `${long} ${long}`;
        pitch.textContent = `${long}${long} with a pitch that goes on for a while to force several lines of text.`;
        for (let index = 0; index < 12; index += 1) {
          const tag = tagTemplate.cloneNode() as HTMLElement;
          tag.textContent = index % 3 === 0 ? long : `Tag ${index}`;
          tags.append(tag);
        }
        const value = document.querySelector('#contact .contact-value');
        if (value) value.textContent = `someone.with.a.very.long.address.${long}@example.com`;
        const group = document.querySelector('#skills .skill-group li');
        if (group) group.textContent = long;
      });

      expect(await horizontalOverflow(page)).toBe(0);
      for (const root of ['#projects', '#skills', '#contact']) {
        expect(await overflowingElements(page, root), root).toEqual([]);
      }
    });
  });
}

test.describe('at 390 px', () => {
  test.use({ viewport: mobile });

  test('has no horizontal overflow while scrolling through the sections', async ({ page }) => {
    await page.goto('/');
    for (const id of ['#projects', '#skills', '#experience', '#contact']) {
      await page.locator(id).scrollIntoViewIfNeeded();
      expect(await horizontalOverflow(page), id).toBe(0);
    }
  });

  test('contact rows put the label above the value', async ({ page }) => {
    await page.goto('/');
    for (const kind of ['email', 'linkedin', 'github', 'cv']) {
      const row = page.locator(`#contact [data-contact="${kind}"]`);
      const label = await row.locator('.contact-label').boundingBox();
      const value = await row.locator('.contact-value').boundingBox();
      expect(label && value && label.y + label.height <= value.y + 1, kind).toBe(true);
    }
  });
});
