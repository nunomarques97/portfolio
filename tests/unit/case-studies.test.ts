import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import CaseStudyPage from '../../src/pages/projects/[slug].astro';
import { FONT, flowSteps, layoutDiagram, validateDiagram, VIEW_WIDTH, wrap } from '../../src/components/diagram-layout';
import {
  caseStudies,
  caseStudiesBySlug,
  caseStudyFor,
  caseStudyPath,
  caseStudyUi,
  withBase,
  type CaseStudy,
  type Diagram,
} from '../../src/content/case-studies';
import { findPlaceholders, isPlaceholder, portfolio, projectHrefs, type Project } from '../../src/content/portfolio';
import { all, byTag, parse, text, type Element } from './html';

const featured = portfolio.projects.items.filter((project) => project.featured);
const projectOf = (study: CaseStudy) => portfolio.projects.items.find((project) => project.repo === study.repo) as Project;

/** Every string in a value, with its path. Functions are skipped. */
function strings(value: unknown, path = ''): { path: string; value: string }[] {
  if (typeof value === 'string') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item: unknown, index) => strings(item, `${path}[${index}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
  }
  return [];
}

const copy = [
  ...strings(caseStudiesBySlug, 'caseStudies'),
  ...strings(caseStudyUi, 'caseStudyUi'),
  { path: 'caseStudyUi.pageTitle', value: caseStudyUi.pageTitle('Example') },
  { path: 'caseStudyUi.pageDescription', value: caseStudyUi.pageDescription('Example', 'A pitch.') },
  { path: 'ui.caseStudyLink', value: portfolio.ui.caseStudyLink('Example') },
];

describe('case-study entries', () => {
  it('has exactly one entry per featured project, in card order, and none for other projects', () => {
    expect(caseStudies.map((study) => study.repo)).toEqual(featured.map((project) => project.repo));
    const others = portfolio.projects.items.filter((item) => !item.featured);
    expect(others.length).toBeGreaterThan(0);
    for (const project of others) expect(caseStudyFor(project.repo), project.repo).toBeUndefined();
    expect(caseStudyFor('gearlift-legal')).toBeUndefined();
  });

  it('uses the agreed slugs, which never expose the name of a private repository', () => {
    expect(caseStudies.map((study) => study.slug)).toEqual([
      'forja',
      'tollwise',
      'gearlift',
      'repcastr',
      'crypto-radar',
      'jarvis',
      'statehop',
      'velora-poker',
      'seekai',
      'sextant',
    ]);
    expect(Object.keys(caseStudiesBySlug)).toEqual(caseStudies.map((study) => study.slug));
    expect(caseStudyFor('automacoes-n8n')?.slug).toBe('repcastr');
    for (const study of caseStudies) expect(study.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('gives every entry all six parts, each with content', () => {
    for (const study of caseStudies) {
      expect(study.problem.length, study.slug).toBeGreaterThan(0);
      expect(study.constraints.length, study.slug).toBeGreaterThan(0);
      expect(study.decisions.length, study.slug).toBeGreaterThan(0);
      expect(study.results.length, study.slug).toBeGreaterThan(0);
      expect(study.nextSteps.length, study.slug).toBeGreaterThan(0);
      for (const item of [...study.problem, ...study.constraints, ...study.results, ...study.nextSteps]) {
        if (!isPlaceholder(item)) expect(item.trim(), study.slug).not.toBe('');
      }
      for (const decision of study.decisions) {
        for (const field of [decision.decision, decision.rejected, decision.reason]) {
          expect(isPlaceholder(field) || field.trim() !== '', study.slug).toBe(true);
        }
      }
      if (!isPlaceholder(study.diagram)) expect(() => validateDiagram(study.diagram as Diagram)).not.toThrow();
    }
  });

  it('drafts Tollwise in full, with no placeholder', () => {
    const tollwise = caseStudiesBySlug.tollwise as CaseStudy;
    expect(findPlaceholders(tollwise)).toEqual([]);
    expect(tollwise.decisions.length).toBeGreaterThanOrEqual(2);
    const diagram = tollwise.diagram as Diagram;
    expect(diagram.nodes.length).toBeGreaterThanOrEqual(5);
    expect(diagram.edges.length).toBeGreaterThanOrEqual(diagram.nodes.length - 1);
  });

  it('keeps the main content file free of placeholders', () => {
    expect(findPlaceholders(portfolio)).toEqual([]);
  });
});

describe('site paths', () => {
  it('prefixes every internal link with the base the site is served from', () => {
    expect(withBase('/')).toBe('/');
    expect(withBase('/portfolio')).toBe('/portfolio/');
    expect(withBase('/portfolio/')).toBe('/portfolio/');
    expect(withBase('/portfolio', '#projects')).toBe('/portfolio/#projects');
    expect(withBase('/', '#projects')).toBe('/#projects');
    expect(withBase('/portfolio', '/favicon.svg')).toBe('/portfolio/favicon.svg');
    expect(caseStudyPath('/portfolio', 'tollwise')).toBe('/portfolio/projects/tollwise/');
    expect(caseStudyPath('/portfolio/', 'tollwise')).toBe('/portfolio/projects/tollwise/');
    expect(caseStudyPath('/', 'tollwise')).toBe('/projects/tollwise/');
  });
});

// SHA-256 of the lowercase names of local repositories that are not featured on the site. Only the hashes are kept,
// so the names themselves never appear in this public file.
const unlistedRepositories = new Set([
  '6917a02917ce244b3bebca53f4df578b06456e7b6e3e027732c1588a64461c94',
  '7906ea6d3a31ba7212d90207161ca8a073b6d01aa3bad9c511b87f3fd0f80228',
  '1c523e82daf2749aa92c594ba6fdec87a6b1c2c565058e46cd3a3804b21c7bd4',
  '62dd3ce013b40c4c61908b61eda33798ba556f959e13f3c394d1d6b09565e3f5',
  'c2639ce1e7474617689f1f7291a96b812ecdab954e7e275b1f064fc9078fa257',
  '1bfb222c0382ebaa1b27b4e4e6fd437fdb4a4a5b1c83b8154c196fa88b89aa8a',
  'f1176ff5e6a6a484e212cde79723fe3265c2ad162ec3ac398b4d175144c350d4',
  '99d888322b1b9423a76b640b08c4064468b0719c1b590918edde49635e027020',
  'edf42b039658026bfb3dd1407624489def21e2feafc641dda0a67490901453fd',
  '39b365a0a9206934b30b86563344724ec251a054f38f73740f1fc8b46272072c',
  '0470d70e2ad036afd1dcf77f8fcc65a03d7b1d5fa966ef291c173df7295e71e0',
  '1f74b51d76a95e7a9ca2013803b1b965cd6a65105569b88b08350dea62b93de6',
  'cd01f0908ea0a3c86d706a7d4bbec403b6d93de2528b212ea043dde5a775ab53',
  '89a4b85c40bd7760d41124bd9ed37ce802cbab0e090d1ab1dfd4182d21a8c9f5',
  'd2231b85a38daf1317fe71e67d10f6e262b2136cbe68e52dbe7a703a549cf64f',
  'c5924fae93560d14aac075b10d3439131ad462e5fa6ef949ba4d24de4d63b4d2',
  '3c52caf14de7ee047f62d150fdd165e25c2ce0957db09738ce5f4452d07cbf52',
  'cf4e6c51c35e7c5994d6c23e32b9f66b655f4f3d0500007765bccffb1e61e099',
  'e20676f8f2a37881e7f7e6eb91d7826fb1af0bfe07ded091c1651236d763f07d',
]);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Every run of one to six words in `value`, joined in the ways a repository name can be written. */
function nameCandidates(value: string): Set<string> {
  const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const found = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 1; length <= 6 && start + length <= words.length; length += 1) {
      const run = words.slice(start, start + length);
      for (const joiner of ['-', '', ' ', '_']) found.add(run.join(joiner));
    }
  }
  return found;
}

const mentionsUnlisted = (value: string) =>
  [...nameCandidates(value)].some((name) => unlistedRepositories.has(sha256(name)));

/** URLs and bare domain names in a string. */
function linksIn(value: string): string[] {
  const urls = value.match(/\b(?:https?:\/\/|www\.)[^\s)]+/gi) ?? [];
  const rest = urls.reduce((remaining, url) => remaining.replace(url, ' '), value);
  const domains = rest.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|app|ai|pt|eu|co|me|so)\b/gi) ?? [];
  return [...urls, ...domains];
}

/** Phone-number-like runs: nine or more digits, once ISO dates are set aside. */
function phoneNumbersIn(value: string): string[] {
  const runs = value.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').match(/\+?\d[\d\s().-]{7,}\d/g) ?? [];
  return runs.filter((run) => run.replace(/\D/g, '').length >= 9);
}

const emailsIn = (value: string) => value.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi) ?? [];

/**
 * Whether a case study may link to `link`: a site page, or the project's public repository and its existing links in
 * portfolio.ts (or a page under them). A bare domain must be the host of one of those links.
 */
function allowedLink(link: string, study: CaseStudy | null): boolean {
  if (link.startsWith('/') || link.startsWith('#')) return true;
  const allowed = study ? projectHrefs(projectOf(study)) : [];
  const bare = !/^https:\/\//i.test(link);
  const candidate = new URL(bare ? `https://${link.replace(/^www\./i, 'www.')}` : link);
  return allowed.some((target) => {
    const url = new URL(target);
    if (bare) return candidate.host === url.host && candidate.pathname === '/';
    return candidate.href === url.href || candidate.href.startsWith(url.href.replace(/\/?$/, '/'));
  });
}

const studyAt = (path: string) => caseStudiesBySlug[/^caseStudies\.([^.[]+)/.exec(path)?.[1] ?? ''] ?? null;

describe('case-study copy', () => {
  it('has strings to check', () => {
    expect(copy.length).toBeGreaterThan(caseStudies.length * 8);
  });

  it('never uses an em-dash', () => {
    for (const { path, value } of copy) expect(value, path).not.toContain('—');
  });

  it('never names the employer', () => {
    for (const { path, value } of copy) expect(value, path).not.toMatch(/natixis/i);
  });

  it('never uses http:// links', () => {
    for (const { path, value } of copy) expect(value, path).not.toMatch(/http:\/\//i);
  });

  it('links only to site pages, the project repository and its existing links', () => {
    for (const { path, value } of copy) {
      for (const link of linksIn(value)) expect(allowedLink(link, studyAt(path)), `${path}: ${link}`).toBe(true);
    }
  });

  it('contains no phone numbers or email addresses', () => {
    for (const { path, value } of copy) {
      expect(phoneNumbersIn(value), path).toEqual([]);
      expect(emailsIn(value), path).toEqual([]);
    }
  });

  it('never names a local repository that is not featured', () => {
    for (const { path, value } of copy) expect(mentionsUnlisted(value), path).toBe(false);
  });

  it('uses rules that catch what they are for', () => {
    expect(phoneNumbersIn('Call +351 900 000 000 today')).toHaveLength(1);
    expect(phoneNumbersIn('Measured on 2026-09-19 at 127.0.0.1:8484 in 408.06 ms')).toEqual([]);
    expect(emailsIn('write to someone@example.com')).toHaveLength(1);
    expect(linksIn('see https://example.com/page and example.org')).toEqual(['https://example.com/page', 'example.org']);
    const tollwise = caseStudiesBySlug.tollwise as CaseStudy;
    expect(allowedLink('https://github.com/nunomarques97/tollwise/blob/main/README.md', tollwise)).toBe(true);
    expect(allowedLink('https://nunomarques97.github.io/tollwise/demo/', tollwise)).toBe(true);
    expect(allowedLink('https://github.com/nunomarques97/tollwise-other', tollwise)).toBe(false);
    expect(allowedLink('https://github.com/nunomarques97/other', tollwise)).toBe(false);
    expect(allowedLink('https://example.com', tollwise)).toBe(false);
    expect(allowedLink('github.com', tollwise)).toBe(true);
    expect(allowedLink('/projects/forja/', tollwise)).toBe(true);
    const repcastr = caseStudiesBySlug.repcastr as CaseStudy;
    expect(allowedLink('repcastr.com', repcastr)).toBe(true);
    expect(allowedLink('repcastr.com', tollwise)).toBe(false);
    expect(allowedLink('https://repcastr.com/pricing', repcastr)).toBe(true);
    // The one unlisted repository that portfolio.ts already names in public is the probe for the hash check.
    const unlisted = portfolio.projects.items.find((project) => !project.featured)?.repo ?? '';
    expect(unlisted).not.toBe('');
    expect(mentionsUnlisted(`It reuses ${unlisted} for this`)).toBe(true);
    expect(mentionsUnlisted(`It reuses ${unlisted.replace(/-/g, ' ')} for this`)).toBe(true);
    expect(mentionsUnlisted('Tollwise routes requests')).toBe(false);
  });
});

describe('diagram layout', () => {
  const diagrams = caseStudies.flatMap((study) => (isPlaceholder(study.diagram) ? [] : [study.diagram as Diagram]));

  it('lays out at least one real diagram', () => {
    expect(diagrams.length).toBeGreaterThan(0);
  });

  it('keeps every font at 12 units or more in a 320-unit-wide drawing', () => {
    expect(VIEW_WIDTH).toBe(320);
    expect(Math.min(...Object.values(FONT))).toBeGreaterThanOrEqual(12);
  });

  it('keeps every box and label inside the drawing, and every node label inside its box', () => {
    for (const diagram of diagrams) {
      const layout = layoutDiagram(diagram);
      expect(layout.width).toBe(VIEW_WIDTH);
      expect(layout.nodes).toHaveLength(diagram.nodes.length);
      for (const node of layout.nodes) {
        expect(node.x, node.id).toBeGreaterThanOrEqual(0);
        expect(node.x + node.width, node.id).toBeLessThanOrEqual(layout.width);
        expect(node.y + node.height, node.id).toBeLessThanOrEqual(layout.height);
        for (const [lines, size, glyph] of [
          [node.label, FONT.label, 0.62],
          [node.detail, FONT.detail, 0.57],
        ] as const) {
          for (const line of lines) {
            expect(line.x + line.text.length * size * glyph, `${node.id}: ${line.text}`).toBeLessThanOrEqual(
              node.x + node.width,
            );
            expect(line.y, line.text).toBeLessThan(node.y + node.height);
          }
        }
      }
      for (const edge of layout.edges) {
        for (const value of edge.line.match(/-?\d+(?:\.\d+)?/g) ?? []) {
          expect(Number(value)).toBeGreaterThanOrEqual(0);
          expect(Number(value)).toBeLessThanOrEqual(Math.max(layout.width, layout.height));
        }
        for (const line of edge.label) {
          expect(line.x + line.text.length * FONT.edge * 0.57, line.text).toBeLessThanOrEqual(layout.width);
        }
      }
      for (const [index, node] of layout.nodes.entries()) {
        const next = layout.nodes[index + 1];
        if (next) expect(next.y, `${next.id} below ${node.id}`).toBeGreaterThan(node.y + node.height);
      }
    }
  });

  it('draws one line per edge and states every node and edge in the text equivalent', () => {
    for (const diagram of diagrams) {
      expect(layoutDiagram(diagram).edges).toHaveLength(diagram.edges.length);
      const steps = flowSteps(diagram);
      expect(steps.map((step) => step.label)).toEqual(diagram.nodes.map((node) => node.label));
      expect(steps.flatMap((step) => step.next)).toHaveLength(diagram.edges.length);
    }
  });

  it('wraps words into lines and breaks only words longer than a line', () => {
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four']);
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrap('', 10)).toEqual([]);
  });

  it('rejects diagrams with unknown nodes or groups, duplicate ids or split groups', () => {
    const base: Diagram = {
      title: 'Test',
      description: 'Test diagram.',
      groups: [{ id: 'g', label: 'Group' }],
      nodes: [
        { id: 'a', kind: 'client', label: 'A' },
        { id: 'b', kind: 'component', label: 'B', group: 'g' },
        { id: 'c', kind: 'store', label: 'C' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    expect(() => validateDiagram(base)).not.toThrow();
    expect(() => validateDiagram({ ...base, edges: [{ from: 'a', to: 'x' }] })).toThrow(/unknown node/);
    expect(() => validateDiagram({ ...base, edges: [{ from: 'a', to: 'a' }] })).toThrow(/to itself/);
    const duplicate: Diagram = { ...base, nodes: [...base.nodes, { id: 'a', kind: 'component', label: 'D' }] };
    expect(() => validateDiagram(duplicate)).toThrow(/duplicate/);
    const split: Diagram = { ...base, nodes: [...base.nodes, { id: 'd', kind: 'component', label: 'D', group: 'g' }] };
    expect(() => validateDiagram(split)).toThrow(/not consecutive/);
    const unknown: Diagram = { ...base, nodes: [{ id: 'a', kind: 'client', label: 'A', group: 'nope' }], edges: [] };
    expect(() => validateDiagram(unknown)).toThrow(/unknown group/);
  });
});

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

async function renderPage(study: CaseStudy) {
  const index = caseStudies.indexOf(study);
  const previous = caseStudies[(index - 1 + caseStudies.length) % caseStudies.length] as CaseStudy;
  const next = caseStudies[(index + 1) % caseStudies.length] as CaseStudy;
  const html = await container.renderToString(CaseStudyPage, {
    params: { slug: study.slug },
    props: {
      study,
      project: projectOf(study),
      previous: projectOf(previous),
      previousSlug: previous.slug,
      next: projectOf(next),
      nextSlug: next.slug,
    },
  });
  return { html, tree: parse(html), previous, next };
}

const sectionOrder = Object.values(caseStudyUi.sections);
const base = import.meta.env.BASE_URL;

describe('case-study page', () => {
  it.each(caseStudies.map((study) => [study.slug, study] as const))('%s renders its structure and links', async (_slug, study) => {
    const { html, tree, previous, next } = await renderPage(study);
    const project = projectOf(study);

    const h1 = byTag(tree, 'h1');
    expect(h1).toHaveLength(1);
    expect(text(h1[0] as Element).trim()).toBe(project.title);
    expect(byTag(tree, 'h2').map((heading) => text(heading).trim())).toEqual(sectionOrder);

    const links = byTag(tree, 'a');
    expect(links[0]?.attrs.href).toBe('#main');
    expect(all(tree, (item) => item.tag === 'main' && item.attrs.id === 'main')).toHaveLength(1);

    const nav = all(tree, (item) => item.tag === 'nav' && item.attrs['aria-label'] === portfolio.ui.navLabel)[0];
    const sections = portfolio.sections.filter((section) => section.navLabel);
    expect(byTag(nav as Element, 'a').map((link) => link.attrs.href)).toEqual(
      sections.map((section) => withBase(base, `#${section.id}`)),
    );

    const back = links.find((link) => text(link).includes(caseStudyUi.backLink));
    expect(back?.attrs.href).toBe(withBase(base, '#projects'));
    const prev = links.find((link) => link.attrs.rel === 'prev') as Element;
    const following = links.find((link) => link.attrs.rel === 'next') as Element;
    expect(prev.attrs.href).toBe(caseStudyPath(base, previous.slug));
    expect(text(prev)).toContain(projectOf(previous).title);
    expect(following.attrs.href).toBe(caseStudyPath(base, next.slug));
    expect(text(following)).toContain(projectOf(next).title);

    // Internal links all start with the base; external ones are only the project's own links, in a new tab.
    const external = projectHrefs(project);
    for (const link of links) {
      const href = link.attrs.href ?? '';
      if (href === '#main') continue;
      if (external.includes(href)) {
        expect(link.attrs).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
        expect(text(link)).toContain(portfolio.ui.opensInNewTab);
      } else {
        expect(href.startsWith(base), href).toBe(true);
        expect(link.attrs).not.toHaveProperty('target');
      }
    }
    expect(links.filter((link) => external.includes(link.attrs.href ?? '')).map((link) => link.attrs.href)).toEqual(
      external,
    );

    // No script at all: no scene, no three.js, and nothing that needs JavaScript to show the content.
    expect(html).not.toMatch(/<script/i);

    // Every placeholder is marked, shows its hint and is never a link.
    const marked = all(tree, (item) => 'data-placeholder' in item.attrs);
    const pending = findPlaceholders(study);
    expect(marked).toHaveLength(pending.length);
    for (const [position, element] of marked.entries()) {
      expect(element.tag).not.toBe('a');
      expect(element.attrs).not.toHaveProperty('href');
      expect(element.attrs).not.toHaveProperty('tabindex');
      expect(all(element, (item) => item.tag === 'a' || 'href' in item.attrs)).toEqual([]);
      expect(text(element)).toContain(portfolio.ui.comingSoon);
      expect(text(element)).toContain(pending[position]?.hint);
    }
  });

  it('draws the Tollwise diagram as a named image with a visible text equivalent', async () => {
    const study = caseStudiesBySlug.tollwise as CaseStudy;
    const diagram = study.diagram as Diagram;
    const { tree } = await renderPage(study);
    const [svg] = byTag(tree, 'svg') as [Element];
    expect(svg.attrs.role).toBe('img');
    const [title] = byTag(svg, 'title') as [Element];
    const [desc] = byTag(svg, 'desc') as [Element];
    expect(text(title)).toBe(diagram.title);
    expect(text(desc)).toBe(diagram.description);
    expect(svg.attrs['aria-labelledby']).toBe(title.attrs.id);
    expect(svg.attrs['aria-describedby']).toBe(desc.attrs.id);
    // Colours come from the stylesheet (theme variables), never from fixed attributes.
    expect(all(svg, (item) => 'fill' in item.attrs || 'stroke' in item.attrs || 'style' in item.attrs)).toEqual([]);
    const flow = all(tree, (item) => item.tag === 'ol' && (item.attrs.class ?? '').includes('diagram-flow'))[0];
    const flowText = text(flow as Element);
    for (const node of diagram.nodes) expect(flowText).toContain(node.label);
    for (const edge of diagram.edges) if (edge.label) expect(flowText).toContain(edge.label);
  });
});

describe('npm run placeholders', () => {
  it('reports the case-study placeholders after the main content file', async () => {
    const script = fileURLToPath(new URL('../../scripts/list-placeholders.mjs', import.meta.url));
    const result = await new Promise<{ code: number; stdout: string }>((resolve) => {
      execFile(process.execPath, [script], { shell: false }, (error, stdout) => {
        resolve({ code: error ? Number((error as NodeJS.ErrnoException).code ?? 1) : 0, stdout });
      });
    });
    expect(result.code).toBe(0);
    const stdout = result.stdout.replace(/\r\n/g, '\n');
    const main = stdout.indexOf('No placeholders left in src/content/portfolio.ts.');
    const studies = stdout.indexOf('left in src/content/case-studies/');
    expect(main).toBeGreaterThanOrEqual(0);
    expect(studies).toBeGreaterThan(main);
    const pending = findPlaceholders(caseStudiesBySlug, 'caseStudies');
    if (pending.length === 0) expect(stdout).toContain('No placeholders left in src/content/case-studies/.');
    else expect(stdout).toContain(`${pending.length} placeholder`);
    for (const item of pending) {
      expect(item.path).toMatch(/^caseStudies\.[a-z0-9-]+[.[]?/);
      expect(stdout).toContain(`- ${item.path}\n  ${item.hint}\n`);
    }
  });
});
