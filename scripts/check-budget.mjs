#!/usr/bin/env node
// Builds the site, then checks the gzip size budgets of docs/design/DESIGN.md ("Performance budget") against dist/.
//   node scripts/check-budget.mjs [--no-build]
// Initial JS is every script the HTML runs (inline and external) plus its static imports. The scene chunk is what
// those scripts load by dynamic import, plus its own static imports. Exits non-zero when a budget is exceeded or the
// scene is not split out of the initial bundle.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildSite, root } from './site-server.mjs';

const KB = 1024;
export const BUDGETS = {
  initialJs: 12 * KB,
  sceneChunk: 170 * KB,
  css: 20 * KB,
  fonts: 120 * KB,
};

const dist = path.join(root, 'dist');
const gzipSize = (content) => gzipSync(content, { level: 9 }).length;

/** Resolves a URL path from the site (absolute or relative to `from`) to a file in dist/. */
function distFile(url, from = '/') {
  const pathname = new URL(url, `http://site${from}`).pathname;
  return path.join(dist, decodeURIComponent(pathname));
}

const urlOf = (file) => `/${path.relative(dist, file).split(path.sep).join('/')}`;

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(Boolean);

/** Module specifiers in a JS file: static imports and re-exports, and dynamic imports. */
export function moduleSpecifiers(source) {
  const quoted = String.raw`(?:"([^"]+)"|'([^']+)'|\x60([^\x60$]+)\x60)`;
  const first = (match) => match.slice(1).find(Boolean);
  const staticRe = new RegExp(String.raw`(?:^|[;}\s])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?${quoted}`, 'g');
  const dynamicRe = new RegExp(String.raw`\bimport\s*\(\s*${quoted}\s*\)`, 'g');
  return {
    static: [...source.matchAll(staticRe)].map(first),
    dynamic: [...source.matchAll(dynamicRe)].map(first),
  };
}

/** Follows static imports from the given files. Returns the closure and the dynamic imports it found. */
function closure(files) {
  const seen = new Set();
  const dynamic = new Set();
  const queue = [...files];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`missing module ${urlOf(file)}`);
    seen.add(file);
    const specifiers = moduleSpecifiers(readFileSync(file, 'utf8'));
    for (const specifier of specifiers.static) queue.push(distFile(specifier, urlOf(file)));
    for (const specifier of specifiers.dynamic) dynamic.add(distFile(specifier, urlOf(file)));
  }
  return { files: seen, dynamic };
}

export function measure() {
  const inlineScripts = [];
  const entries = new Set();
  const stylesheets = new Set();
  const inlineStyles = [];
  const dynamicFromInline = new Set();
  for (const html of htmlFiles(dist)) {
    const source = readFileSync(html, 'utf8');
    for (const [, tag, body] of source.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script>/gi)) {
      const type = attribute(tag, 'type') ?? '';
      if (/json|importmap/i.test(type)) continue;
      const src = attribute(tag, 'src');
      if (src) {
        entries.add(distFile(src, urlOf(html)));
      } else if (body.trim()) {
        inlineScripts.push(body);
        const specifiers = moduleSpecifiers(body);
        for (const specifier of specifiers.static) entries.add(distFile(specifier, urlOf(html)));
        for (const specifier of specifiers.dynamic) dynamicFromInline.add(distFile(specifier, urlOf(html)));
      }
    }
    for (const [tag] of source.matchAll(/<link\b[^>]*>/gi)) {
      if (/stylesheet/i.test(attribute(tag, 'rel') ?? '')) stylesheets.add(distFile(attribute(tag, 'href'), urlOf(html)));
    }
    for (const [, body] of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) inlineStyles.push(body);
  }

  const initial = closure(entries);
  const sceneEntries = [...initial.dynamic, ...dynamicFromInline].filter((file) => !initial.files.has(file));
  const scene = closure(sceneEntries);
  const sceneFiles = [...scene.files].filter((file) => !initial.files.has(file));

  const cssSources = [...[...stylesheets].map((file) => readFileSync(file, 'utf8')), ...inlineStyles];
  const fonts = new Set();
  for (const [index, css] of cssSources.entries()) {
    const base = index < stylesheets.size ? urlOf([...stylesheets][index]) : '/';
    for (const [, url] of css.matchAll(/url\(\s*["']?([^"')]+\.woff2)(?:[?#][^"')]*)?["']?\s*\)/gi)) {
      fonts.add(distFile(url, base));
    }
  }

  const fileSize = (file) => gzipSize(readFileSync(file));
  const initialJs =
    [...initial.files].reduce((sum, file) => sum + fileSize(file), 0) +
    inlineScripts.reduce((sum, body) => sum + gzipSize(body), 0);
  const initialText = [...[...initial.files].map((file) => readFileSync(file, 'utf8')), ...inlineScripts].join('\n');

  return {
    initialJs,
    sceneChunk: sceneFiles.reduce((sum, file) => sum + fileSize(file), 0),
    css: cssSources.reduce((sum, css) => sum + gzipSize(css), 0),
    fonts: [...fonts].reduce((sum, file) => sum + fileSize(file), 0),
    files: {
      initial: [...initial.files].map(urlOf),
      scene: sceneFiles.map(urlOf),
      stylesheets: [...stylesheets].map(urlOf),
      fonts: [...fonts].map(urlOf),
    },
    // three.js keeps its class names in its error messages, so this finds it even in minified code.
    threeInInitial: /WebGLRenderer/.test(initialText),
  };
}

const format = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

async function main() {
  if (!process.argv.includes('--no-build')) await buildSite();
  const result = measure();
  const failures = [];
  const labels = { initialJs: 'Initial page JS', sceneChunk: 'Scene chunk', css: 'CSS', fonts: 'Fonts (WOFF2)' };
  for (const [key, limit] of Object.entries(BUDGETS)) {
    const size = result[key];
    const ok = size <= limit;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${labels[key].padEnd(16)} ${format(size).padStart(9)} / ${format(limit)} gzip`);
    if (!ok) failures.push(`${labels[key]} is ${format(size)}, over its ${format(limit)} budget`);
  }
  console.log(JSON.stringify(result.files, null, 2));
  if (result.files.scene.length === 0) failures.push('no dynamically imported scene chunk was found');
  if (result.threeInInitial) failures.push('three.js is part of the initial page JS');
  if (result.files.fonts.length === 0) failures.push('no WOFF2 font was found in the CSS');
  if (failures.length) {
    for (const failure of failures) console.error(`budget: ${failure}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`budget: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}
