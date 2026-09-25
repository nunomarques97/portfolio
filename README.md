# Portfolio

Personal portfolio of Nuno Marques, Senior Full Stack Developer. A single-page static site built with
[Astro](https://astro.build) and TypeScript.

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

## Test

```sh
npm run lint        # ESLint for .ts, .mjs and .astro files
npm run typecheck   # astro check (TypeScript strict)
npm test            # unit tests (Vitest)
npm run test:e2e    # browser tests (Playwright) against a fresh production build on a free port
npm run fps         # frame rate while scrolling, in a headed browser with the GPU (1440 and 390 tiers)
```

Every script also runs without npm or a shell, which is useful on Windows and in automation:

```sh
node scripts/run-script.mjs <script> [args...]
```

## Screenshots

```sh
npm run capture
npm run capture -- --motion reduce   # emulate prefers-reduced-motion
npm run capture -- --webgl off       # launch the browser with WebGL disabled
```

The capture script builds the site, serves it on a free port and saves viewport screenshots at 1440×900 and
390×844 of the page top and of every section in `main`, to
`test-results/screenshots/<mode>/<width>-<section>.png`. It prints each path and a JSON manifest (also written
to `manifest.json` in the same folder) and exits with a non-zero code if any capture fails.

## Secret guard

A pre-commit hook blocks commits that contain keys or credentials. Enable it once per clone:

```sh
git config core.hooksPath .githooks
```

`node scripts/guard-keys.mjs --all` scans the whole working tree.
