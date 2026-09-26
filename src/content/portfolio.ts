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

/** A link whose target may not be supplied yet; a placeholder renders as non-interactive text. */
export interface PendingLink {
  readonly label: string;
  readonly href: Pending<string>;
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
  /** Two or three sentences on what the project does and how. */
  readonly description: string;
  readonly tags: readonly string[];
  /** The public GitHub repository, or null when the repository is private. */
  readonly url: Pending<string> | null;
  /** Further links after the repository, such as a live demo or a store listing. */
  readonly links?: readonly Link[];
  /** Featured projects are rendered, in array order. */
  readonly featured: boolean;
}

/** Every link a project card renders, in order: the public repository (when there is one), then its other links. */
export function projectHrefs(project: Project): string[] {
  const repo = project.url === null || isPlaceholder(project.url) ? [] : [project.url];
  return [...repo, ...(project.links ?? []).map((link) => link.href)];
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
  readonly kind: 'email' | 'phone' | 'linkedin' | 'github';
  readonly label: string;
  readonly display: string;
  readonly href: Pending<string>;
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
    readonly privateRepository: string;
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
    /** Link to the full GitHub profile, after the featured projects. */
    readonly profileLink: PendingLink;
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
      'Nuno Marques, Senior Full Stack Developer in Porto. Five years building banking software with Angular and ' +
      '.NET at Natixis. In my own time I build AI agents, developer tools and apps.',
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
    privateRepository: 'Private repository',
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
    tagline:
      'I have spent five years at Natixis building banking software with Angular and .NET. In my own time I build ' +
      'AI agents, developer tools and apps.',
    primaryAction: { label: 'View projects', href: '#projects' },
    secondaryAction: { label: 'Get in touch', href: '#contact' },
    availability: 'Open to remote or hybrid work, and to relocation across Europe',
  },
  about: {
    eyebrow: 'About',
    heading: 'What I do.',
    paragraphs: [
      'I joined Natixis in Porto as an intern in 2021 and was promoted three times, to senior full stack developer ' +
        'in 2026. I build Angular front ends and C# / .NET REST APIs on SQL Server, and I am the technical owner of ' +
        "most of the team's front-end projects. I also write SQL for heavy load, automated tests and CI/CD pipelines.",
      'I upgraded our application from Angular 13 to Angular 22 and moved our .NET services to .NET 10. Both ' +
        'upgrades are finished and in production.',
      'I also built a RAG system over our internal documentation, connected to Jira cards and release notes. ' +
        'I review code and mentor the junior developers and interns who join the team.',
      'In my own time I build my own software. FORJA runs an LLM coding agent as a small software team: it plans the work, ' +
        'writes the code, runs the checks and has every task reviewed separately. I use it to build my other ' +
        'projects, including Tollwise, an Android workout app, WhatsApp automations for small businesses and ' +
        'Windows tools. Most of them run on your own machine, with no account and no telemetry.',
    ],
    stats: [
      { value: '5+', label: 'Years at Natixis' },
      { value: 'Senior', label: 'Intern in 2021, promoted three times' },
      { value: '10', label: 'Projects below' },
    ],
    portrait: {
      photo: 'src/assets/portrait/nuno-marques.png',
      alt: 'Portrait of Nuno Marques',
      caption: 'ID / NM-01',
      placeholderInitials: 'NM',
      placeholderCaption: 'Portrait coming soon',
    },
  },
  projects: {
    eyebrow: 'Selected projects',
    heading: 'What I build in my own time.',
    items: [
      {
        repo: 'forja',
        title: 'FORJA',
        pitch:
          'Runs an LLM coding agent as a small software team. It plans, writes the code, runs the checks and gets every ' +
          'task independently reviewed.',
        description:
          'A Node.js command-line orchestrator for work in an existing Git project. Each phase starts a fresh ' +
          'coding-agent session, while a small controller owns task state, executed checks, retry ' +
          'limits and recovery, and no task finishes without an independent review.',
        tags: ['JavaScript', 'Node.js', 'Zero dependencies'],
        url: `${githubProfile}/forja`,
        featured: true,
      },
      {
        repo: 'tollwise',
        title: 'Tollwise',
        pitch:
          'Local proxy for the OpenAI and Anthropic SDKs that sends each request to the cheapest provider able to ' +
          'serve it, and shows what you saved.',
        description:
          'Your code keeps the official SDK and changes only its base URL. Tollwise checks what each request needs ' +
          '(tools, JSON mode, vision, streaming, context length), picks the cheapest, fastest or most balanced ' +
          'provider that has all of it, translates between the two API formats when nothing is lost, and reports ' +
          'cost and savings in response headers and a local dashboard.',
        tags: ['TypeScript', 'Node.js', 'LLM APIs'],
        url: `${githubProfile}/tollwise`,
        links: [{ label: 'Live demo', href: 'https://nunomarques97.github.io/tollwise/demo/' }],
        featured: true,
      },
      {
        repo: 'gearlift',
        title: 'Gearlift',
        pitch:
          'Android workout app that builds a session from the equipment you have and the muscles you want to train.',
        description:
          'Pick your equipment, the muscles to train and your preferences, and Gearlift builds a workout from a ' +
          'public-domain library of 800+ exercises. Swap exercises, follow timed sets with audio cues, log every ' +
          'set and keep your history and stats synced to the cloud. Built with React Native and Expo on Firebase, ' +
          'with Google sign-in, workouts shared by QR code and scheduled reminders. The code is private.',
        tags: ['React Native', 'Expo', 'Firebase', 'TypeScript'],
        url: null,
        links: [
          { label: 'Get it on Google Play', href: 'https://play.google.com/store/apps/details?id=com.gearlift.app' },
        ],
        featured: true,
      },
      {
        repo: 'automacoes-n8n',
        title: 'Repcastr',
        pitch:
          'n8n automations for small businesses: appointment reminders, no-show tracking, client recall and ' +
          'WhatsApp confirmations.',
        description:
          'Four workflows on a self-hosted n8n: a reminder the day before each appointment, a daily no-show log with ' +
          'the monthly rate, a recall of clients who have not been back in months with the revenue at stake, and ' +
          'WhatsApp confirmations with reply buttons. Businesses onboard themselves from an invite link and a form, ' +
          'and one clients table drives every workflow. The repository is private.',
        tags: ['n8n', 'JavaScript', 'WhatsApp API', 'Astro'],
        url: null,
        links: [{ label: 'repcastr.com', href: 'https://repcastr.com' }],
        featured: true,
      },
      {
        repo: 'crypto-radar',
        title: 'Crypto Radar',
        pitch:
          'Watches Kraken crypto markets with deterministic rules and asks a local model for a second opinion. ' +
          'It never places orders.',
        description:
          'Watches public Kraken spot and perpetual markets and narrows them down through four deterministic ' +
          'layers: universe, anomaly scores, market structure and order-book detail. Only then does a local ' +
          'Ollama model give an advisory second opinion before a human is alerted. No credentials, paid APIs or ' +
          'cloud inference.',
        tags: ['Python', 'Local LLM'],
        url: `${githubProfile}/crypto-radar`,
        featured: true,
      },
      {
        repo: 'jarvis',
        title: 'Jarvis',
        pitch: 'Offline voice assistant that turns spoken commands into tasks for an AI coding agent. It uses no paid cloud service.',
        description:
          'Listens for "hey jarvis", transcribes speech on the local GPU with faster-whisper and routes it ' +
          'through a fixed allow-list: small local actions run directly and everything else goes to an AI ' +
          'coding agent. It answers aloud with Piper, and no audio ever leaves the PC.',
        tags: ['Python', 'Speech', 'Offline'],
        url: `${githubProfile}/jarvis`,
        featured: true,
      },
      {
        repo: 'statehop',
        title: 'Statehop',
        pitch:
          'Local-first Windows app that learns your work contexts, such as Development or Gaming, and helps you ' +
          'switch between them.',
        description:
          'Observes the foreground app, running processes and idle time, groups them into sessions and infers the ' +
          'context you are in, then suggests how to prepare, restore or clean it up. It acts on its own only with ' +
          'actions you already approved. A native WinUI 3 app on .NET 10 with local SQLite storage, in development.',
        tags: ['C#', 'WinUI 3', '.NET 10', 'SQLite'],
        url: `${githubProfile}/statehop`,
        featured: true,
      },
      {
        repo: 'velora-poker',
        title: 'Velora Poker',
        pitch: 'Local-only Windows desktop poker HUD.',
        description:
          'Watches the PokerStars hand-history folder, imports every new hand into SQLite and computes 18 ' +
          'statistics per opponent. A transparent, click-through overlay follows each open table and shows them ' +
          'on the seats, with no accounts, cloud or network calls.',
        tags: ['Rust', 'Tauri 2', 'React'],
        url: `${githubProfile}/velora-poker`,
        featured: true,
      },
      {
        repo: 'seekai',
        title: 'SeekAI',
        pitch:
          'Windows tray launcher that searches your files by name, by content and by meaning. It runs on your ' +
          'machine, with no cloud AI, account or telemetry.',
        description:
          'A Windows tray launcher, opened with Ctrl + Space, that searches the folders you choose by filename, ' +
          'by full text with SQLite FTS5 and by meaning with local Ollama embeddings. A native WPF app on .NET ' +
          '10 that never scans drives on its own.',
        tags: ['C#', 'WPF', '.NET 10', 'SQLite FTS5', 'Ollama'],
        url: `${githubProfile}/seekai`,
        featured: true,
      },
      {
        repo: 'sextant',
        title: 'Sextant',
        pitch:
          'Research system that tests whether crypto trading strategies still make money after costs. It places no ' +
          'real orders.',
        description:
          'Asks whether any family of crypto strategies keeps a robust edge after costs, across Binance and ' +
          'Kraken. Every study is pre-registered, costs are always included, only walk-forward results count, ' +
          'and live trading stays locked behind explicit criteria.',
        tags: ['Python', 'Research'],
        url: `${githubProfile}/sextant`,
        featured: true,
      },
      {
        repo: 'gearlift-legal',
        title: 'Gearlift Legal',
        pitch: 'Legal pages for the Gearlift app.',
        description:
          'Static HTML pages with the public privacy policy and terms of use of the Gearlift app.',
        tags: ['HTML'],
        url: `${githubProfile}/gearlift-legal`,
        featured: false,
      },
    ],
    profileLink: { label: 'All projects on GitHub', href: githubProfile },
  },
  skills: {
    eyebrow: 'Stack',
    heading: 'Languages, frameworks and tools.',
    groups: [
      {
        title: 'Frontend',
        items: ['Angular', 'TypeScript', 'RxJS', 'NgRx', 'HTML', 'CSS', 'React', 'React Native / Expo'],
      },
      {
        title: 'Backend',
        items: ['.NET / C#', 'REST APIs', 'SQL Server', 'MongoDB', 'Node.js', 'Firebase', 'Python', 'Rust'],
      },
      { title: 'Applied AI', items: ['RAG', 'AI agents', 'AI-assisted development', 'LLM APIs', 'Ollama', 'n8n', 'Jira API'] },
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
          'Angular front ends and C# / .NET REST APIs on SQL Server',
          'Upgraded the application from Angular 13 to 22 and the .NET services to .NET 10',
          "Technical owner of most of the team's front-end projects",
          'RAG system over internal documentation with Jira integration',
          'Code review and mentoring of junior developers and interns',
        ],
      },
      {
        period: 'Feb 2023 — Feb 2026',
        title: 'Developer',
        current: false,
        summary: 'REST APIs, SQL optimisation under heavy load, CI/CD with Jenkins and XL Release/Deploy.',
      },
      {
        period: 'Nov 2022 — Feb 2023',
        title: 'Junior Developer',
        current: false,
        summary: 'Automated tests with xUnit, NUnit and Cypress; batch jobs for critical financial workflows.',
      },
      {
        period: 'Feb 2021 — Nov 2022',
        title: 'Intern',
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
    heading: 'Get in touch.',
    lede: 'I am open to full stack and applied AI roles, remote or hybrid. I can also relocate within Europe.',
    email,
    links: [
      { kind: 'email', label: 'Email', display: email, href: `mailto:${email}`, external: false },
      { kind: 'phone', label: 'Phone', display: '+351 911 022 458', href: 'tel:+351911022458', external: false },
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
      file: '/nuno-marques-cv.pdf',
    },
  },
  footer: {
    copyright: '© 2026 Nuno Marques',
  },
};
