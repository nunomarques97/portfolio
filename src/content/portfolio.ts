// All user-facing copy and data of the site. Components render this file and never hard-code copy.
// Facts that are not available yet are explicit placeholders: `npm run placeholders` lists them.
// Keep this file free of runtime imports so scripts/list-placeholders.mjs can load it on its own.

/** A value that has not been supplied yet. `hint` says what to put in its place. */
export interface Placeholder {
  readonly placeholder: true;
  readonly hint: string;
}

/** Either the real value or a placeholder for it. */
export type Pending<T> = T | Placeholder;

export interface PlaceholderLocation {
  /** Dotted path from the root value, for example `contact.cv.file`. */
  readonly path: string;
  readonly hint: string;
}

export function placeholder(hint: string): Placeholder {
  return { placeholder: true, hint };
}

export function isPlaceholder(value: unknown): value is Placeholder {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof Placeholder, unknown>>;
  return candidate.placeholder === true && typeof candidate.hint === 'string';
}

/** Walks plain objects and arrays and returns every placeholder with its path. */
export function findPlaceholders(value: unknown, path = ''): PlaceholderLocation[] {
  if (isPlaceholder(value)) return [{ path, hint: value.hint }];
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) => findPlaceholders(item, `${path}[${index}]`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      findPlaceholders(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

export type SectionId = 'hero' | 'about' | 'projects' | 'skills' | 'experience' | 'contact';

export interface Section {
  readonly id: SectionId;
  /** Label in the top navigation; the hero has none. */
  readonly navLabel?: string;
  /** Name of the scene state shown in the HUD while the section is read. */
  readonly hudState: string;
}

export interface Link {
  readonly label: string;
  readonly href: string;
}

export interface Stat {
  readonly value: string;
  readonly label: string;
}

export interface Portrait {
  /** Photo path, for example `src/assets/portrait/nuno-marques.jpg`. */
  readonly photo: Pending<string>;
  /** Alt text of the real photo. The placeholder is hidden from assistive technology instead. */
  readonly alt: string;
  readonly caption: string;
  readonly placeholderInitials: string;
  readonly placeholderCaption: string;
}

export interface Project {
  /** Repository name under the GitHub profile. */
  readonly repo: string;
  readonly title: string;
  readonly pitch: string;
  readonly tags: readonly string[];
  readonly url: string;
  /** Featured projects are rendered, in array order. */
  readonly featured: boolean;
}

export interface SkillGroup {
  readonly title: string;
  readonly items: readonly string[];
}

export interface Role {
  readonly period: string;
  readonly title: string;
  readonly current: boolean;
  readonly summary?: string;
  readonly highlights?: readonly string[];
}

export interface Education {
  readonly period: string;
  readonly degree: string;
  readonly school: string;
}

export interface ContactLink {
  readonly kind: 'email' | 'linkedin' | 'github';
  readonly label: string;
  readonly display: string;
  readonly href: string;
  readonly external: boolean;
}

export interface Portfolio {
  readonly site: {
    readonly lang: 'en';
    readonly title: string;
    readonly description: string;
    readonly author: string;
  };
  readonly ui: {
    readonly skipLink: string;
    readonly navLabel: string;
    readonly menuButton: string;
    readonly hudTitle: string;
    readonly hudSection: string;
    readonly opensInNewTab: string;
    readonly comingSoon: string;
    readonly projectLink: (title: string) => string;
  };
  readonly sections: readonly Section[];
  readonly hero: {
    readonly name: string;
    readonly title: string;
    readonly location: string;
    readonly tagline: string;
    readonly primaryAction: Link;
    readonly secondaryAction: Link;
    readonly availability: string;
  };
  readonly about: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly paragraphs: readonly string[];
    readonly stats: readonly Stat[];
    readonly portrait: Portrait;
  };
  readonly projects: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly items: readonly Project[];
  };
  readonly skills: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly groups: readonly SkillGroup[];
  };
  readonly experience: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly employer: string;
    readonly roles: readonly Role[];
    readonly education: readonly Education[];
  };
  readonly contact: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly lede: string;
    readonly email: string;
    readonly links: readonly ContactLink[];
    readonly cv: {
      readonly label: string;
      /** Public path of the CV file, for example `/nuno-marques-cv.pdf`. */
      readonly file: Pending<string>;
    };
  };
  readonly footer: {
    readonly copyright: string;
  };
}

const githubProfile = 'https://github.com/nunomarques97';
const email = 'nuno.d.o.marques1997@gmail.com';

export const portfolio: Portfolio = {
  site: {
    lang: 'en',
    title: 'Nuno Marques · Senior Full Stack Developer',
    description:
      'Nuno Marques, Senior Full Stack Developer in Porto. I build banking software with Angular and .NET, ' +
      'and autonomous AI agents that build software.',
    author: 'Nuno Marques',
  },
  ui: {
    skipLink: 'Skip to content',
    navLabel: 'Sections',
    menuButton: 'Menu',
    hudTitle: 'NM / Signal field',
    hudSection: 'Section',
    opensInNewTab: '(opens in a new tab)',
    comingSoon: 'Coming soon',
    projectLink: (title) => `View ${title} on GitHub`,
  },
  sections: [
    { id: 'hero', hudState: 'Core online' },
    { id: 'about', navLabel: 'About', hudState: 'Signal acquired' },
    { id: 'projects', navLabel: 'Projects', hudState: 'Constellation' },
    { id: 'skills', navLabel: 'Stack', hudState: 'Lattice' },
    { id: 'experience', navLabel: 'Experience', hudState: 'Signal stream' },
    { id: 'contact', navLabel: 'Contact', hudState: 'Beacon' },
  ],
  hero: {
    name: 'Nuno Marques',
    title: 'Senior Full Stack Developer',
    location: 'Porto',
    tagline: 'I build banking software with Angular and .NET, and autonomous AI agents that build software.',
    primaryAction: { label: 'View projects', href: '#projects' },
    secondaryAction: { label: 'Get in touch', href: '#contact' },
    availability: 'Open to remote work and relocation across Europe',
  },
  about: {
    eyebrow: 'About',
    heading: 'End to end, database to pixel.',
    paragraphs: [
      'For over five years at Natixis I have delivered Angular and .NET features for banking, owning each one from ' +
        'database design through frontend integration.',
      "I built an internal RAG knowledge system over the team's documentation, integrated with Jira, and wrote the " +
        'reusable skills and practices that helped the team adopt AI assistants.',
      'Outside work I designed FORJA, an autonomous agent system that plans, implements and independently reviews ' +
        'software, and I use it to ship my own applications from start to finish.',
    ],
    stats: [
      { value: '5+', label: 'Years at Natixis' },
      { value: 'Senior', label: 'Intern 2021 → Senior 2026' },
      { value: '6', label: 'Public projects' },
    ],
    portrait: {
      photo: placeholder(
        'Add the photo as src/assets/portrait/nuno-marques.jpg (4:5, at least 704 × 880 px) and set this to that ' +
          'path; its alt text is about.portrait.alt.',
      ),
      alt: 'Portrait of Nuno Marques',
      caption: 'ID / NM-01',
      placeholderInitials: 'NM',
      placeholderCaption: 'Portrait coming soon',
    },
  },
  projects: {
    eyebrow: 'Selected projects',
    heading: 'Things I built.',
    items: [
      {
        repo: 'forja',
        title: 'FORJA',
        pitch:
          'Turns Claude Code into a small autonomous software team: a controller that plans, develops, runs checks ' +
          'and gets every task independently reviewed.',
        tags: ['JavaScript', 'Node.js', 'Zero dependencies'],
        url: `${githubProfile}/forja`,
        featured: true,
      },
      {
        repo: 'crypto-radar',
        title: 'Crypto Radar',
        pitch:
          'Local-first crypto market radar: deterministic Kraken analysis with a local model as advisor. ' +
          'It never places orders.',
        tags: ['Python', 'Local LLM'],
        url: `${githubProfile}/crypto-radar`,
        featured: true,
      },
      {
        repo: 'jarvis',
        title: 'Jarvis',
        pitch: 'Offline voice assistant that hands spoken commands to Claude Code sessions. No paid cloud.',
        tags: ['Python', 'Speech', 'Offline'],
        url: `${githubProfile}/jarvis`,
        featured: true,
      },
      {
        repo: 'velora-poker',
        title: 'Velora Poker',
        pitch: 'Local-only Windows desktop poker HUD.',
        tags: ['Rust', 'Tauri 2', 'React'],
        url: `${githubProfile}/velora-poker`,
        featured: true,
      },
      {
        repo: 'seekai',
        title: 'SeekAI',
        pitch:
          'Windows tray launcher for filename, full-text and local semantic search. ' +
          'No cloud AI, accounts or telemetry.',
        tags: ['C#', 'WPF', '.NET 10', 'SQLite FTS5', 'Ollama'],
        url: `${githubProfile}/seekai`,
        featured: true,
      },
      {
        repo: 'sextant',
        title: 'Sextant',
        pitch:
          'Quantitative crypto research system: pre-registered studies, costs always included and walk-forward ' +
          'validation only. Places no real orders.',
        tags: ['Python', 'Research'],
        url: `${githubProfile}/sextant`,
        featured: true,
      },
      {
        repo: 'gearlift-legal',
        title: 'Gearlift Legal',
        pitch: 'Legal pages for the Gearlift app.',
        tags: ['HTML'],
        url: `${githubProfile}/gearlift-legal`,
        featured: false,
      },
    ],
  },
  skills: {
    eyebrow: 'Stack',
    heading: 'Tools I work with.',
    groups: [
      { title: 'Frontend', items: ['Angular', 'TypeScript', 'RxJS', 'NgRx', 'HTML', 'CSS', 'React'] },
      { title: 'Backend', items: ['.NET / C#', 'REST APIs', 'SQL Server', 'MongoDB', 'Python', 'Rust'] },
      { title: 'Applied AI', items: ['RAG', 'AI agents', 'Claude Code', 'Ollama', 'Jira API'] },
      {
        title: 'Quality & delivery',
        items: ['xUnit', 'NUnit', 'Cypress', 'Jenkins', 'XL Release / Deploy', 'Docker', 'Git'],
      },
    ],
  },
  experience: {
    eyebrow: 'Experience',
    heading: 'Natixis, Porto.',
    employer: 'Natixis',
    roles: [
      {
        period: 'Feb 2026 — Present',
        title: 'Senior Full Stack Developer',
        current: true,
        highlights: [
          'Angular and .NET (C#) features, from database design to frontend integration',
          'RAG system over internal documentation with Jira integration',
          'Reusable AI skills and practices for the team; code review and mentoring',
        ],
      },
      {
        period: 'Feb 2023',
        title: 'Developer',
        current: false,
        summary: 'REST APIs, SQL optimisation under heavy load, CI/CD with Jenkins and XL Release/Deploy.',
      },
      {
        period: 'Nov 2022',
        title: 'Junior Developer',
        current: false,
        summary: 'Automated tests with xUnit, NUnit and Cypress; batch jobs for critical financial workflows.',
      },
      {
        period: 'Feb 2021 — Nov 2022',
        title: 'Curricular Intern → Intern',
        current: false,
        summary: 'Joined the team while finishing my degree.',
      },
    ],
    education: [
      {
        period: '2015 — 2021',
        degree: 'BSc Informatics Engineering',
        school: 'Instituto Superior de Engenharia do Porto (ISEP)',
      },
    ],
  },
  contact: {
    eyebrow: 'Contact',
    heading: "Let's talk.",
    lede: 'Open to full stack and applied AI roles, remote or with relocation across Europe.',
    email,
    links: [
      { kind: 'email', label: 'Email', display: email, href: `mailto:${email}`, external: false },
      {
        kind: 'linkedin',
        label: 'LinkedIn',
        display: 'linkedin.com/in/ndomarques',
        href: 'https://www.linkedin.com/in/ndomarques',
        external: true,
      },
      {
        kind: 'github',
        label: 'GitHub',
        display: 'github.com/nunomarques97',
        href: githubProfile,
        external: true,
      },
    ],
    cv: {
      label: 'Download CV',
      file: placeholder(
        'Add the CV as public/nuno-marques-cv.pdf and set this to "/nuno-marques-cv.pdf". ' +
          'Until then the row renders as non-interactive "Coming soon" text.',
      ),
    },
  },
  footer: {
    copyright: '© 2026 Nuno Marques',
  },
};
