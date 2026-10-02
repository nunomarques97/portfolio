#!/usr/bin/env node
// Audits a case-study page with Lighthouse in the mobile and desktop presets.
//   node scripts/lighthouse.mjs [slug]   (default: tollwise)
// Builds the site, serves it on a free port and runs Lighthouse against projects/<slug>/ in the installed browser
// that browserChannel() selects (Edge on Windows by default), so no browser download is needed. Prints every category
// score per preset, the audits that cost points in a failing category, and writes the HTML reports to
// test-results/lighthouse/<slug>-<preset>.html. Exits non-zero when performance, accessibility, best practices or
// SEO scores below 95 in either preset.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { browserChannel, buildSite, freePort, root, startPreview } from './site-server.mjs';

const DEFAULT_SLUG = 'tollwise';
const MIN_SCORE = 95;
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
// Lighthouse's own default config is the mobile preset (emulated phone, simulated slow 4G and 4x CPU slowdown).
const PRESETS = [
  { name: 'mobile', config: undefined },
  { name: 'desktop', config: desktopConfig },
];
const reportDir = path.join(root, 'test-results', 'lighthouse');

const toPosix = (file) => path.relative(root, file).split(path.sep).join('/');

function usage(message) {
  console.error(`lighthouse: ${message}`);
  console.error('usage: node scripts/lighthouse.mjs [slug]');
  process.exit(2);
}

function parseArgs(argv) {
  if (argv.length > 1) usage(`expected at most one slug, got: ${argv.join(' ')}`);
  const slug = argv[0] ?? DEFAULT_SLUG;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) usage(`invalid slug: ${slug}`);
  return { slug };
}

/** Category scores (0 to 100) and the audits that cost points in each category, from a Lighthouse result. */
function summarize(lhr) {
  const categories = {};
  for (const id of CATEGORIES) {
    const category = lhr.categories[id];
    const score = category && category.score !== null ? Math.round(category.score * 100) : null;
    const losses = (category?.auditRefs ?? [])
      .filter((ref) => ref.weight > 0)
      .map((ref) => lhr.audits[ref.id])
      .filter((audit) => audit && audit.score !== null && audit.score < 1)
      .map((audit) => `${audit.id} (${Math.round(audit.score * 100)}): ${audit.title}`);
    categories[id] = { score, losses };
  }
  return { categories, warnings: lhr.runWarnings ?? [], error: lhr.runtimeError?.message ?? null };
}

async function audit(url, port, preset, slug) {
  const result = await lighthouse(
    url,
    { port, output: 'html', logLevel: 'error', onlyCategories: CATEGORIES },
    preset.config,
  );
  if (!result) throw new Error(`${preset.name}: Lighthouse returned no result`);
  const file = path.join(reportDir, `${slug}-${preset.name}.html`);
  writeFileSync(file, Array.isArray(result.report) ? result.report[0] : result.report);
  return { preset: preset.name, report: toPosix(file), ...summarize(result.lhr) };
}

async function main() {
  const { slug } = parseArgs(process.argv.slice(2));
  const resources = [];
  const cleanup = async () => {
    while (resources.length) await resources.pop()().catch(() => {});
  };
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(130);
  });

  const failures = [];
  const runs = [];
  try {
    await buildSite();
    if (!existsSync(path.join(root, 'dist', 'projects', slug, 'index.html'))) {
      throw new Error(`no case study is built for "${slug}" (dist/projects/${slug}/index.html is missing)`);
    }
    const server = await startPreview(await freePort());
    resources.push(server.stop);
    const url = new URL(`projects/${slug}/`, server.url).href;
    const port = await freePort();
    const browser = await chromium.launch({ channel: browserChannel(), args: [`--remote-debugging-port=${port}`] });
    resources.push(() => browser.close());
    mkdirSync(reportDir, { recursive: true });
    console.log(`lighthouse: ${url} in ${browserChannel()} ${browser.version()}`);
    // One preset at a time: parallel audits in the same browser would distort each other's timings.
    for (const preset of PRESETS) runs.push(await audit(url, port, preset, slug));
  } catch (error) {
    failures.push(error.message);
  } finally {
    await cleanup();
  }

  for (const run of runs) {
    console.log(`\n${run.preset} (report: ${run.report})`);
    if (run.error) failures.push(`${run.preset}: ${run.error}`);
    for (const warning of run.warnings) console.log(`  warning: ${warning}`);
    for (const [id, { score, losses }] of Object.entries(run.categories)) {
      const pass = score !== null && score >= MIN_SCORE;
      console.log(`  ${id.padEnd(15)} ${String(score ?? 'n/a').padStart(3)} ${pass ? 'ok' : `below ${MIN_SCORE}`}`);
      if (!pass) {
        failures.push(`${run.preset} ${id}: ${score ?? 'no score'}`);
        for (const loss of losses) console.log(`    - ${loss}`);
      }
    }
  }
  if (failures.length || runs.length !== PRESETS.length) {
    for (const failure of failures) console.error(`lighthouse: failed: ${failure}`);
    process.exit(1);
  }
  console.log(`\nlighthouse: every category scores ${MIN_SCORE} or more in both presets`);
}

main().catch((error) => {
  console.error(`lighthouse: ${error.stack ?? error.message}`);
  process.exit(1);
});
