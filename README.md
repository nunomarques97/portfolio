# Portfolio

Personal portfolio of Nuno Marques, Senior Full Stack Developer. A static site built with
[Astro](https://astro.build) and TypeScript: one home page, plus a case-study page for each featured project.

Live at <https://nunomarques97.github.io/portfolio/>. Every push to `main` is deployed by
`.github/workflows/pages.yml`.

## Requirements

- Node.js 22.13 or later (see `.nvmrc`; the supported range is in `package.json` under `engines`).
- For the browser tests and screenshots: Microsoft Edge (the default on Windows) or Google Chrome (the default
  elsewhere). Playwright drives the installed browser, so no browser download is needed. To use another
  channel, set `PLAYWRIGHT_BROWSER_CHANNEL` (for example `chrome`, `msedge`, or `chromium` for Playwright's own
  build installed with `npx playwright install chromium`).

## Install

```sh
npm ci
```

## Run

```sh
npm run dev       # development server with live reload
npm run build     # static production build in dist/
npm run preview   # serve the production build
```

## Edit the content

The home page copy and data live in one typed file, `src/content/portfolio.ts`. Components only render it, so changing a
text, link, project, skill or role never needs a component change:

- **Hero and About:** `hero` (name, title, location, tagline, the two actions) and `about` (paragraphs, stats and
  the portrait).
- **Projects:** `projects.items`. Cards render the entries with `featured: true`, in array order; entries with
  `featured: false` stay in the file but are not shown. The scene draws one cluster per featured project, so when the
  number of featured projects changes, update `CLUSTER_COUNT` in `src/scene/formations.ts` (a unit test checks that
  they match).
- **Stack:** `skills.groups`. **Experience:** `experience.roles` (newest first) and `experience.education`.
- **Contact:** `contact.email`, `contact.links` and `contact.cv`.
- **Page metadata and interface labels:** `site` and `ui`.

A value that is not available yet is written as `placeholder('what to put here')`. Placeholders never render as
links: a pending link shows as non-interactive text and the pending portrait as a decorative frame. Keep the file in English. The only
approved private details are the contact email, phone number and LinkedIn; the unit tests reject any other phone
number.

### Case studies

Each featured project has a case study at `projects/<slug>/`, linked from its card. Its text lives in
`src/content/case-studies/<slug>.ts`, one file per project; `src/content/case-studies/index.ts` lists them in card
order and defines their types. The page title, pitch, tags and links come from the project's entry in
`src/content/portfolio.ts`, so they are never repeated. A case-study file has:

- `repo` (the project's `repo` in `portfolio.ts`) and `slug` (the URL segment);
- `problem` (paragraphs), `constraints`, `results` and `nextSteps` (list items);
- `diagram`: the architecture diagram as data. Nodes are drawn top to bottom in array order, each with a `kind`
  (`client`, `component`, `store` or `external`), a `label`, an optional one-line `detail` and an optional `group`
  (the nodes of a group must be consecutive). An edge to the next node becomes a straight arrow with its label; any
  other edge runs along the side. The page also lists every node and edge as text under the drawing.
- `decisions`: each with the `decision`, the `rejected` alternative and the `reason`.

Every featured project must have exactly one case study, and only featured projects may have one: the build and the
unit tests fail otherwise. When a project is added to or removed from the featured cards, add or remove its file and
its entry in `index.ts`. Any field can be `placeholder('what to put here')` until the fact is known; it shows as a
marked "Coming soon" note with that hint, never as a link. The unit tests reject em-dashes, the employer's name,
phone numbers, email addresses, `http://` links and links other than site pages and the project's own links in
`portfolio.ts`, and the names of other local repositories.

### Remaining placeholders

```sh
npm run placeholders
```

lists every placeholder left, with its path and what to supply: first those in `src/content/portfolio.ts`, then
those in the case studies, with paths such as `caseStudies.tollwise.results[5]`. The main content file has none at
the moment: the portrait is `src/assets/portrait/nuno-marques.png` (a larger 4:5 photo, at least 704 × 880 px, would
be sharper) and the CV is `public/nuno-marques-cv.pdf`.

## Test

```sh
npm run lint        # ESLint for .ts, .mjs and .astro files
npm run typecheck   # astro check (TypeScript strict)
npm test            # unit tests (Vitest)
npm run test:e2e    # browser tests (Playwright) against a fresh production build on a free port
npm run budget      # gzip size budgets of the production build (initial JS, scene chunk, CSS, fonts)
npm run fps         # frame rate while scrolling, in a headed browser with the GPU (1440 and 390 tiers)
npm run lighthouse  # Lighthouse audit of a case study (tollwise by default; npm run lighthouse -- sextant)
npm run placeholders
node scripts/guard-keys.mjs --all
```

`tests/e2e/matrix.spec.ts` checks the whole page at 1440 and 390 px in four modes (default, reduced motion preference,
WebGL off, JavaScript disabled): every section and its content visible, no serious or critical axe violations, no
horizontal overflow, no console errors and no request that leaves the site origin. It also walks the page with the
keyboard from the skip link to the last contact link. Run it alone with `npx playwright test tests/e2e/matrix.spec.ts`.

`tests/e2e/case-studies.spec.ts` checks every case-study page: its route and title, the link from its card, axe in
the light and dark schemes at 1440 and 390 px, a keyboard walk, no script and no request off the site, no motion
under reduced motion, content without JavaScript, diagram labels of at least 12 px and no horizontal overflow at 320,
390 and 1440 px. It saves full-page screenshots of the Tollwise case study at 1440×900 and 390×844 in both schemes to
`test-results/screenshots/case-study/tollwise-<width>-<scheme>.png` and prints their paths.

The frame rate script needs a hardware GPU: it fails rather than report a measurement taken with a software
renderer. Its results describe the machine it runs on.

The Lighthouse script builds the site, serves it on a free port and audits `projects/<slug>/` in the same installed
browser as the browser tests, first with Lighthouse's mobile preset (emulated phone, simulated slow network and CPU)
and then with its desktop preset. It prints the performance, accessibility, best practices and SEO scores of each
preset, lists the audits that cost points in any category under 95, writes the HTML reports to
`test-results/lighthouse/<slug>-<preset>.html` and exits with a non-zero code if any of those scores is below 95.

Every script also runs without npm or a shell, which is useful on Windows and in automation:

```sh
node scripts/run-script.mjs <script> [args...]
```

## Screenshots

```sh
npm run capture
npm run capture -- --motion reduce   # emulate prefers-reduced-motion (the site ignores it on purpose)
npm run capture -- --webgl off       # launch the browser with WebGL disabled
```

The capture script builds the site, serves it on a free port and saves viewport screenshots at 1440×900 and
390×844 of the page top and of every section in `main`, to
`test-results/screenshots/<mode>/<width>-<section>.png`. It prints each path and a JSON manifest (also written
to `manifest.json` in the same folder) and exits with a non-zero code if any capture fails.

## Visit counter

The deployed site counts visits with [GoatCounter](https://www.goatcounter.com): no cookies and nothing shown on the
page. The deploy workflow sets `GOATCOUNTER_ENDPOINT`; without it (local builds and tests) the counter script is not
included. The dashboard is private to its owner.

## Secret guard

A pre-commit hook blocks commits that contain keys or credentials. Enable it once per clone:

```sh
git config core.hooksPath .githooks
```

`node scripts/guard-keys.mjs --all` scans the whole working tree.

## License

The source code is released under the [MIT License](LICENSE). The written content and images describing Nuno
Marques (text in `src/content/`, photos in `src/assets/portrait/`) are not covered by it and may not be reused.
