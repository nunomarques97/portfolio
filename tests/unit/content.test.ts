import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findPlaceholders, isPlaceholder, placeholder, portfolio } from '../../src/content/portfolio';

const githubProfile = 'https://github.com/nunomarques97';
const email = 'nuno.d.o.marques1997@gmail.com';

/** Every string in the content, with its path. Functions are skipped. */
function strings(value: unknown, path = ''): { path: string; value: string }[] {
  if (typeof value === 'string') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item: unknown, index) => strings(item, `${path}[${index}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
  }
  return [];
}

const allStrings = strings(portfolio);

describe('projects', () => {
  const items = portfolio.projects.items;

  it('features six projects in the stated order', () => {
    expect(items.filter((project) => project.featured).map((project) => project.repo)).toEqual([
      'forja',
      'crypto-radar',
      'jarvis',
      'velora-poker',
      'seekai',
      'sextant',
    ]);
  });

  it('keeps gearlift-legal but does not feature it', () => {
    const gearlift = items.find((project) => project.repo === 'gearlift-legal');
    expect(gearlift).toMatchObject({ featured: false, pitch: 'Legal pages for the Gearlift app.', tags: ['HTML'] });
  });

  it('gives every project a title, pitch, tags and its own repository URL', () => {
    for (const project of items) {
      expect(project.title.trim(), project.repo).not.toBe('');
      expect(project.pitch.trim(), project.repo).not.toBe('');
      expect(project.tags.length, project.repo).toBeGreaterThan(0);
      expect(project.url).toBe(`${githubProfile}/${project.repo}`);
      expect(new URL(project.url).pathname.split('/')[1]).toBe('nunomarques97');
    }
  });

  it('builds one GitHub link label per title', () => {
    expect(portfolio.ui.projectLink('FORJA')).toBe('View FORJA on GitHub');
  });
});

describe('links', () => {
  const urls = allStrings.filter(({ value }) => /^[a-z][a-z0-9+.-]*:/i.test(value));

  it('uses https for every web URL', () => {
    const web = urls.filter(({ value }) => !value.startsWith('mailto:'));
    expect(web.length).toBeGreaterThan(0);
    for (const { path, value } of web) {
      expect(new URL(value).protocol, path).toBe('https:');
    }
    for (const { path, value } of allStrings) {
      expect(value, path).not.toMatch(/http:\/\//i);
    }
  });

  it('points the GitHub contact link at the profile', () => {
    const github = portfolio.contact.links.find((link) => link.kind === 'github');
    expect(github).toMatchObject({ href: githubProfile, external: true });
  });

  it('points the LinkedIn contact link at the approved profile', () => {
    const linkedin = portfolio.contact.links.find((link) => link.kind === 'linkedin');
    expect(linkedin).toMatchObject({ href: 'https://www.linkedin.com/in/ndomarques', external: true });
  });

  it('uses a valid email address as a mailto link', () => {
    expect(portfolio.contact.email).toBe(email);
    expect(portfolio.contact.email).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i);
    const link = portfolio.contact.links.find((item) => item.kind === 'email');
    expect(link).toMatchObject({ href: `mailto:${email}`, display: email, external: false });
    for (const { path, value } of urls.filter(({ value }) => value.startsWith('mailto:'))) {
      expect(value, path).toBe(`mailto:${email}`);
    }
  });

  it('marks external links as external and in-page links as internal', () => {
    for (const link of portfolio.contact.links) {
      expect(link.external, link.kind).toBe(link.href.startsWith('https:'));
    }
    expect(portfolio.hero.primaryAction.href).toBe('#projects');
    expect(portfolio.hero.secondaryAction.href).toBe('#contact');
  });
});

describe('private data', () => {
  it('contains no phone number or tel link', () => {
    const phone = /\+?\d[\d\s().-]{7,}\d/;
    for (const { path, value } of allStrings) {
      expect(value, path).not.toMatch(phone);
      expect(value, path).not.toMatch(/^tel:/i);
    }
    const source = readFileSync(fileURLToPath(new URL('../../src/content/portfolio.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/tel:|\+351|phone/i);
  });
});

describe('copy', () => {
  it('states the hero identity', () => {
    expect(portfolio.hero).toMatchObject({ name: 'Nuno Marques', title: 'Senior Full Stack Developer' });
    expect(portfolio.hero.tagline).not.toBe('');
  });

  it('uses the four skill groups of the prototype', () => {
    expect(portfolio.skills.groups.map((group) => group.title)).toEqual([
      'Frontend',
      'Backend',
      'Applied AI',
      'Quality & delivery',
    ]);
    for (const group of portfolio.skills.groups) expect(group.items.length, group.title).toBeGreaterThan(0);
  });

  it('lists one navigation label for every section except the hero', () => {
    expect(portfolio.sections.map((section) => section.id)).toEqual([
      'hero',
      'about',
      'projects',
      'skills',
      'experience',
      'contact',
    ]);
    expect(portfolio.sections.map((section) => section.navLabel)).toEqual([
      undefined,
      'About',
      'Projects',
      'Stack',
      'Experience',
      'Contact',
    ]);
  });

  it('marks only the latest role as current', () => {
    expect(portfolio.experience.roles.map((role) => role.current)).toEqual([true, false, false, false]);
  });

  it('carries no prototype labels', () => {
    for (const { path, value } of allStrings) expect(value, path).not.toMatch(/prototype/i);
  });
});

describe('placeholders', () => {
  it('leaves exactly the CV file and the portrait photo as placeholders, each with a hint', () => {
    const found = findPlaceholders(portfolio);
    expect(found.map((item) => item.path).sort()).toEqual(['about.portrait.photo', 'contact.cv.file']);
    for (const item of found) expect(item.hint.trim(), item.path).not.toBe('');
  });

  it('keeps the alt text next to the portrait photo', () => {
    expect(portfolio.about.portrait.alt).toBe('Portrait of Nuno Marques');
  });

  it('finds placeholders in nested objects and arrays', () => {
    const nested = {
      a: 'real',
      b: [1, { c: placeholder('first') }, [placeholder('second')]],
      d: { e: { f: placeholder('third'), g: null } },
    };
    expect(findPlaceholders(nested)).toEqual([
      { path: 'b[1].c', hint: 'first' },
      { path: 'b[2][0]', hint: 'second' },
      { path: 'd.e.f', hint: 'third' },
    ]);
    expect(findPlaceholders(placeholder('root'))).toEqual([{ path: '', hint: 'root' }]);
    expect(findPlaceholders({ a: 'x', b: [1, 2], c: null })).toEqual([]);
  });

  it('does not mistake look-alike values for placeholders', () => {
    expect(isPlaceholder({ placeholder: true, hint: 'x' })).toBe(true);
    expect(isPlaceholder({ placeholder: 'true', hint: 'x' })).toBe(false);
    expect(isPlaceholder({ placeholder: true })).toBe(false);
    expect(isPlaceholder({ hint: 'x' })).toBe(false);
    expect(isPlaceholder('placeholder')).toBe(false);
    expect(isPlaceholder(null)).toBe(false);
  });

  it('prints every placeholder with its path and hint and exits 0', async () => {
    const script = fileURLToPath(new URL('../../scripts/list-placeholders.mjs', import.meta.url));
    const result = await new Promise<{ code: number; stdout: string }>((resolve) => {
      execFile(process.execPath, [script], { shell: false }, (error, stdout) => {
        resolve({ code: error ? Number((error as NodeJS.ErrnoException).code ?? 1) : 0, stdout });
      });
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('2 placeholders left in src/content/portfolio.ts');
    for (const item of findPlaceholders(portfolio)) {
      expect(result.stdout).toContain(`- ${item.path}`);
      expect(result.stdout).toContain(item.hint);
    }
  });
});
