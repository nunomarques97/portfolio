// Case studies of the featured projects: one file per project, collected here in the order of the project cards.
// The page title, pitch, tags and links come from the project's entry in ../portfolio.ts; these files hold the
// long-form story. Facts that are not available yet are `placeholder()` values: `npm run placeholders` lists them
// under `caseStudies.<slug>`.
import type { Pending } from '../portfolio';
import cryptoRadar from './crypto-radar';
import forja from './forja';
import gearlift from './gearlift';
import jarvis from './jarvis';
import repcastr from './repcastr';
import seekai from './seekai';
import sextant from './sextant';
import statehop from './statehop';
import tollwise from './tollwise';
import veloraPoker from './velora-poker';

/** How a box in an architecture diagram is drawn: the caller, a part of the project, its data, or a third party. */
export type DiagramNodeKind = 'client' | 'component' | 'store' | 'external';

export interface DiagramNode {
  /** Unique within the diagram; edges refer to it. */
  readonly id: string;
  readonly label: string;
  /** One short line on what the part does. */
  readonly detail?: string;
  readonly kind: DiagramNodeKind;
  /** Id of the group the node belongs to. The nodes of a group must be consecutive. */
  readonly group?: string;
}

export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  /** What travels along the edge, for example "chat request". */
  readonly label?: string;
}

export interface DiagramGroup {
  readonly id: string;
  readonly label: string;
}

/**
 * An architecture diagram as data. Nodes are drawn top to bottom in array order. An edge to the next node is a
 * straight arrow with its label; any other edge is routed along the right-hand side.
 */
export interface Diagram {
  /** Short name of the diagram, read as the image's title. */
  readonly title: string;
  /** One or two sentences summarising the flow, read as the image's description. */
  readonly description: string;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  readonly groups?: readonly DiagramGroup[];
}

export interface KeyDecision {
  readonly decision: Pending<string>;
  /** The alternative that was considered and not taken. */
  readonly rejected: Pending<string>;
  readonly reason: Pending<string>;
}

export interface CaseStudy {
  /** Key of the project in `portfolio.projects.items` (`Project.repo`). */
  readonly repo: string;
  /** URL segment: the page lives at `projects/<slug>/`. */
  readonly slug: string;
  /** Paragraphs. */
  readonly problem: readonly Pending<string>[];
  /** List items. */
  readonly constraints: readonly Pending<string>[];
  readonly diagram: Pending<Diagram>;
  readonly decisions: readonly KeyDecision[];
  /** List items. */
  readonly results: readonly Pending<string>[];
  /** List items. */
  readonly nextSteps: readonly Pending<string>[];
}

/** Every case study, in the order of the featured project cards. */
export const caseStudies: readonly CaseStudy[] = [
  forja,
  tollwise,
  gearlift,
  repcastr,
  cryptoRadar,
  jarvis,
  statehop,
  veloraPoker,
  seekai,
  sextant,
];

/** The case studies keyed by slug, the shape `npm run placeholders` reports paths against. */
export const caseStudiesBySlug: Readonly<Record<string, CaseStudy>> = Object.fromEntries(
  caseStudies.map((study) => [study.slug, study]),
);

export function caseStudyFor(repo: string): CaseStudy | undefined {
  return caseStudies.find((study) => study.repo === repo);
}

/** Labels of the case-study pages and of the links that lead to them. */
export const caseStudyUi = {
  eyebrow: 'Case study',
  homeLink: 'Nuno Marques',
  homeLinkLabel: 'Nuno Marques, home page',
  metaLabel: 'Project details',
  sections: {
    problem: 'Problem',
    constraints: 'Constraints',
    architecture: 'Architecture',
    decisions: 'Key decisions',
    results: 'Results',
    nextSteps: 'Next steps',
  },
  flowHeading: 'The flow, step by step',
  flowTo: 'to',
  decisionLabel: 'Decision',
  rejectedLabel: 'Rejected',
  reasonLabel: 'Why',
  pagerLabel: 'More case studies',
  backLink: 'Back to all projects',
  previous: 'Previous',
  next: 'Next',
  pageTitle: (title: string) => `${title} case study · Nuno Marques`,
  pageDescription: (title: string, pitch: string) => `${title} case study. ${pitch}`,
} as const;

/**
 * Prefixes a site path with the base the site is served from (`import.meta.env.BASE_URL`, `/` locally and
 * `/portfolio` on GitHub Pages), with exactly one slash between them. `path` is relative to the site root, such as
 * `projects/tollwise/` or `#projects`; an empty path is the home page.
 */
export function withBase(base: string, path = ''): string {
  const root = `${base.replace(/\/+$/, '')}/`;
  return `${root}${path.replace(/^\/+/, '')}`;
}

export function caseStudyPath(base: string, slug: string): string {
  return withBase(base, `projects/${slug}/`);
}
