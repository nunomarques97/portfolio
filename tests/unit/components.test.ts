import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import ExperienceContact from '../../src/components/ExperienceContact.astro';
import Projects from '../../src/components/Projects.astro';
import { placeholder, portfolio, type Portfolio, type Project } from '../../src/content/portfolio';
import { all, byTag, parse, text, type Element } from './html';
import { caseStudyFor, caseStudyPath } from '../../src/content/case-studies';

function section(tree: Element, id: string): Element {
  const found = all(tree, (item) => item.tag === 'section' && item.attrs.id === id)[0];
  if (!found) throw new Error(`section #${id} was not rendered`);
  return found;
}

const newTab = portfolio.ui.opensInNewTab;
const comingSoon = portfolio.ui.comingSoon;

const baseProjects: Portfolio['projects'] = {
  eyebrow: 'Projects',
  heading: 'Work.',
  items: [
    {
      repo: 'alpha',
      title: 'Alpha',
      pitch: 'First project.',
      description: 'What the first project does.',
      tags: ['TypeScript', 'Astro'],
      url: 'https://example.com/alpha',
      featured: true,
    },
    {
      repo: 'beta',
      title: 'Beta',
      pitch: 'Second project.',
      description: 'What the second project does.',
      tags: ['Rust'],
      url: 'https://example.com/beta',
      featured: true,
    },
    {
      repo: 'hidden',
      title: 'Hidden',
      pitch: 'Not featured.',
      description: 'What the hidden project does.',
      tags: ['HTML'],
      url: 'https://example.com/hidden',
      featured: false,
    },
  ],
  profileLink: { label: 'All projects', href: 'https://example.com/profile' },
};

const placeholderProjects: Portfolio['projects'] = {
  ...baseProjects,
  items: baseProjects.items.map((project) => ({ ...project, url: placeholder(`URL of ${project.repo}`) })),
  profileLink: { label: 'All projects', href: placeholder('profile URL') },
};

const baseContact: Portfolio['contact'] = {
  eyebrow: 'Contact',
  heading: 'Say hello.',
  lede: 'Lede.',
  email: 'hello@example.com',
  links: [
    { kind: 'email', label: 'Email', display: 'hello@example.com', href: 'mailto:hello@example.com', external: false },
    {
      kind: 'linkedin',
      label: 'LinkedIn',
      display: 'example.com/in/someone',
      href: 'https://example.com/in/someone',
      external: true,
    },
    { kind: 'github', label: 'GitHub', display: 'example.com/someone', href: 'https://example.com/someone', external: true },
  ],
  cv: { label: 'Download CV', file: '/example-cv.pdf' },
};

const placeholderContact: Portfolio['contact'] = {
  ...baseContact,
  links: baseContact.links.map((link) => ({ ...link, href: placeholder(`${link.kind} link`) })),
  cv: { label: 'Download CV', file: placeholder('CV file') },
};

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

const studies = [
  { repo: 'alpha', slug: 'alpha-study' },
  { repo: 'beta', slug: 'beta-study' },
];

async function renderProjects(projects: Portfolio['projects']) {
  return parse(await container.renderToString(Projects, { props: { projects, studies } }));
}

/** The case-study link of a card: internal, same tab, named after the project. Returns the card's other links. */
function expectCaseStudyLink(article: Element, project: Project): Element[] {
  const [first, ...rest] = byTag(article, 'a') as [Element, ...Element[]];
  const slug = studies.find((study) => study.repo === project.repo)?.slug;
  expect(first.attrs.href).toBe(`/projects/${slug}/`);
  expect(first.attrs).not.toHaveProperty('target');
  expect(first.attrs).not.toHaveProperty('rel');
  expect(text(first)).toContain(portfolio.ui.caseStudyLink(project.title));
  expect(text(first)).toContain(project.title);
  expect(text(first)).not.toContain('↗');
  expect(text(first)).not.toContain(newTab);
  return rest;
}

async function renderContact(contact: Portfolio['contact']) {
  return section(parse(await container.renderToString(ExperienceContact, { props: { contact } })), 'contact');
}

function expectInert(element: Element) {
  expect(element.tag).not.toBe('a');
  expect(element.tag).not.toBe('button');
  expect(element.attrs).not.toHaveProperty('href');
  expect(element.attrs).not.toHaveProperty('tabindex');
  expect(all(element, (item) => item.tag === 'a' || 'href' in item.attrs || 'tabindex' in item.attrs)).toEqual([]);
  expect(text(element)).toContain(comingSoon);
}

describe('Projects', () => {
  it('renders featured projects in order as articles with a titled GitHub link', async () => {
    const tree = await renderProjects(baseProjects);
    const articles = byTag(tree, 'article');
    const featured = baseProjects.items.filter((project) => project.featured);
    expect(articles).toHaveLength(featured.length);

    for (const [index, project] of featured.entries()) {
      const article = articles[index] as Element;
      const [title] = byTag(article, 'h3');
      expect(title && text(title).trim()).toBe(project.title);
      expect(article.attrs['aria-labelledby']).toBe(title?.attrs.id);
      expect(text(article)).toContain(project.pitch);
      expect(text(article)).toContain(project.description);
      expect(byTag(article, 'ul')).toHaveLength(1);
      expect(byTag(article, 'li').map((tag) => text(tag).trim())).toEqual(project.tags);

      const links = expectCaseStudyLink(article, project);
      expect(links).toHaveLength(1);
      const link = links[0] as Element;
      expect(link.attrs).toMatchObject({ href: project.url, target: '_blank', rel: 'noopener noreferrer' });
      expect(text(link)).toContain(portfolio.ui.projectLink(project.title));
      expect(text(link)).toContain(newTab);
    }
    expect(text(tree)).not.toContain('Hidden');
    expect(all(tree, (item) => 'data-placeholder' in item.attrs)).toEqual([]);
  });

  it('links the full profile in a new tab', async () => {
    const tree = await renderProjects(baseProjects);
    const profile = byTag(tree, 'a').filter((link) => link.attrs.href === 'https://example.com/profile');
    expect(profile).toHaveLength(1);
    expect(profile[0]?.attrs).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
    expect(text(profile[0] as Element)).toContain(newTab);
  });

  it('renders placeholder URLs as non-focusable marked text, never as links', async () => {
    const tree = await renderProjects(placeholderProjects);
    expect(byTag(tree, 'article')).toHaveLength(2);
    // Only the case-study links, which are never placeholders, remain links.
    const articles = byTag(tree, 'article');
    for (const [index, article] of articles.entries()) {
      expect(expectCaseStudyLink(article, placeholderProjects.items[index] as Project)).toEqual([]);
    }
    expect(byTag(tree, 'a')).toHaveLength(2);
    const marked = all(tree, (item) => 'data-placeholder' in item.attrs);
    expect(marked).toHaveLength(3);
    for (const element of marked) expectInert(element);
    expect(text(marked[0] as Element)).toContain(portfolio.ui.projectLink('Alpha'));
  });

  it('notes a private repository as text and adds further links after the repository link', async () => {
    const [alpha, beta] = baseProjects.items as [Project, Project];
    const tree = await renderProjects({
      ...baseProjects,
      items: [
        { ...alpha, links: [{ label: 'Live demo', href: 'https://example.com/alpha/demo' }] },
        { ...beta, url: null, links: [{ label: 'Store', href: 'https://example.com/store/beta' }] },
      ],
    });
    const [first, second] = byTag(tree, 'article') as [Element, Element];
    expect(byTag(first, 'a').map((link) => link.attrs.href)).toEqual([
      '/projects/alpha-study/',
      'https://example.com/alpha',
      'https://example.com/alpha/demo',
    ]);
    const [store] = expectCaseStudyLink(second, beta) as [Element];
    expect(byTag(second, 'a')).toHaveLength(2);
    expect(store.attrs).toMatchObject({ href: 'https://example.com/store/beta', target: '_blank' });
    expect(text(store)).toContain(newTab);
    expect(text(second)).toContain(portfolio.ui.privateRepository);
    expect(text(second)).not.toContain(portfolio.ui.projectLink('Beta'));
  });
});

describe('Projects and case studies', () => {
  it('refuses to render a featured project without a case study', async () => {
    await expect(
      container.renderToString(Projects, { props: { projects: baseProjects, studies: studies.slice(0, 1) } }),
    ).rejects.toThrow(/"beta" has no case study/);
  });

  it('links every featured card of the real content to its case study page', async () => {
    const tree = parse(await container.renderToString(Projects));
    const featured = portfolio.projects.items.filter((project) => project.featured);
    const articles = byTag(tree, 'article');
    expect(articles).toHaveLength(featured.length);
    for (const [index, project] of featured.entries()) {
      const [first] = byTag(articles[index] as Element, 'a') as [Element];
      const study = caseStudyFor(project.repo);
      expect(study, project.repo).toBeDefined();
      expect(first.attrs.href).toBe(caseStudyPath(import.meta.env.BASE_URL, study?.slug ?? ''));
      expect(first.attrs).not.toHaveProperty('target');
      expect(text(first)).toContain(project.title);
    }
  });
});

describe('Contact', () => {
  it('renders real values as links: mailto, new-tab profiles and a same-origin CV download', async () => {
    const contact = await renderContact(baseContact);
    const links = byTag(contact, 'a');
    expect(links.map((link) => link.attrs.href)).toEqual([
      'mailto:hello@example.com',
      'https://example.com/in/someone',
      'https://example.com/someone',
      '/example-cv.pdf',
    ]);

    const [email, linkedin, github, cv] = links as [Element, Element, Element, Element];
    expect(email.attrs).not.toHaveProperty('target');
    expect(text(email)).toContain('hello@example.com');
    for (const [link, label] of [
      [linkedin, 'LinkedIn'],
      [github, 'GitHub'],
    ] as const) {
      expect(link.attrs).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
      expect(text(link)).toContain(label);
      expect(text(link)).toContain(newTab);
    }
    expect(cv.attrs).toHaveProperty('download');
    expect(cv.attrs).not.toHaveProperty('target');
    expect(text(cv)).toContain('Download CV');
    expect(all(contact, (item) => 'data-placeholder' in item.attrs)).toEqual([]);
  });

  it('renders every placeholder value as non-focusable marked text without href', async () => {
    const contact = await renderContact(placeholderContact);
    expect(byTag(contact, 'a')).toEqual([]);
    const marked = all(contact, (item) => 'data-placeholder' in item.attrs);
    expect(marked.map((item) => item.attrs['data-contact'])).toEqual(['email', 'linkedin', 'github', 'cv']);
    for (const element of marked) expectInert(element);
    expect(text(marked[3] as Element)).toContain('Download CV');
  });

  it('refuses a CV file that is not a same-origin path', async () => {
    for (const file of ['https://example.com/cv.pdf', '//example.com/cv.pdf', 'cv.pdf', '/\\example.com/cv.pdf']) {
      await expect(renderContact({ ...baseContact, cv: { label: 'Download CV', file } }), file).rejects.toThrow(
        /same-origin/,
      );
    }
  });
});

describe('Experience', () => {
  it('renders an ordered timeline with role, organisation and period per entry', async () => {
    const tree = parse(await container.renderToString(ExperienceContact));
    const experience = section(tree, 'experience');
    const lists = byTag(experience, 'ol');
    expect(lists).toHaveLength(1);
    const entries = (lists[0] as Element).children.filter((child): child is Element => typeof child !== 'string');
    const { roles, education, employer } = portfolio.experience;
    expect(entries).toHaveLength(roles.length + education.length);

    const expected = [
      ...roles.map((role) => ({ title: role.title, organisation: employer, period: role.period })),
      ...education.map((entry) => ({ title: entry.degree, organisation: entry.school, period: entry.period })),
    ];
    for (const [index, entry] of entries.entries()) {
      const want = expected[index];
      expect(entry.tag).toBe('li');
      expect(byTag(entry, 'h3').map((heading) => text(heading).trim())).toEqual([want?.title]);
      expect(text(entry)).toContain(want?.organisation);
      expect(text(entry)).toContain(want?.period);
    }
    for (const [index, role] of roles.entries()) {
      const entry = text(entries[index] as Element);
      for (const line of [role.summary, ...(role.highlights ?? [])]) if (line) expect(entry).toContain(line);
    }
  });
});
