# Portfolio

Personal portfolio of Nuno Marques, Senior Full Stack Developer. A single-page static site built with
[Astro](https://astro.build) and TypeScript.

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

All copy and data live in one typed file, `src/content/portfolio.ts`. Components only render it, so changing a
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

### Remaining placeholders

```sh
npm run placeholders
```

lists every placeholder left, with its path and what to supply. There are none at the moment: the portrait is
`src/assets/portrait/nuno-marques.png` (a larger 4:5 photo, at least 704 × 880 px, would be sharper) and the CV is
`public/nuno-marques-cv.pdf`.

## Test

```sh
npm run lint        # ESLint for .ts, .mjs and .astro files
npm run typecheck   # astro check (TypeScript strict)
npm test            # unit tests (Vitest)
npm run test:e2e    # browser tests (Playwright) against a fresh production build on a free port
npm run budget      # gzip size budgets of the production build (initial JS, scene chunk, CSS, fonts)
npm run fps         # frame rate while scrolling, in a headed browser with the GPU (1440 and 390 tiers)
npm run placeholders
node scripts/guard-keys.mjs --all
```

`tests/e2e/matrix.spec.ts` checks the whole page at 1440 and 390 px in four modes (default, reduced motion preference,
WebGL off, JavaScript disabled): every section and its content visible, no serious or critical axe violations, no
horizontal overflow, no console errors and no request that leaves the site origin. It also walks the page with the
keyboard from the skip link to the last contact link. Run it alone with `npx playwright test tests/e2e/matrix.spec.ts`.

The frame rate script needs a hardware GPU: it fails rather than report a measurement taken with a software
renderer. Its results describe the machine it runs on.

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
