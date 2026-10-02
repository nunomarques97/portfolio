#!/usr/bin/env node
// Lists every placeholder left in the content, with its path and editing hint: first the main content file, then
// the case studies.
//   node scripts/list-placeholders.mjs
// Remaining placeholders are expected until the facts arrive, so the exit code is 0; it is 1 only when the content
// cannot be loaded. Each file is transpiled with TypeScript and imported from memory, which works on every supported
// Node version. Relative imports are loaded the same way, so content files may import each other; type-only imports
// disappear in transpilation.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentPath = 'src/content/portfolio.ts';
const caseStudiesPath = 'src/content/case-studies';

/** The file a relative specifier names, trying the extension and index forms TypeScript resolves. */
function resolveFile(specifier, from) {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  }
  throw new Error(`cannot resolve "${specifier}" from ${path.relative(root, from)}`);
}

/** Transpiles `file` and its relative imports into data: URLs, depth first. Returns the URL of `file`. */
function moduleUrl(file, urls = new Map(), loading = new Set()) {
  if (urls.has(file)) return urls.get(file);
  if (loading.has(file)) throw new Error(`circular runtime import through ${path.relative(root, file)}`);
  loading.add(file);
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  });
  const code = outputText.replace(
    /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
    (_match, keyword, quote, specifier) => `${keyword}${quote}${moduleUrl(resolveFile(specifier, file), urls, loading)}${quote}`,
  );
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  loading.delete(file);
  urls.set(file, url);
  return url;
}

const loadContent = (file) => import(moduleUrl(path.join(root, file)));

function report(found, where) {
  if (found.length === 0) {
    console.log(`No placeholders left in ${where}.`);
    return;
  }
  console.log(`${found.length} placeholder${found.length === 1 ? '' : 's'} left in ${where}:`);
  for (const { path: at, hint } of found) {
    console.log(`- ${at}`);
    console.log(`  ${hint}`);
  }
}

async function main() {
  const content = await loadContent(contentPath);
  report(content.findPlaceholders(content.portfolio), contentPath);
  const studies = await loadContent(path.join(caseStudiesPath, 'index.ts'));
  console.log('');
  report(content.findPlaceholders(studies.caseStudiesBySlug, 'caseStudies'), `${caseStudiesPath}/`);
}

main().catch((error) => {
  console.error(`Could not list placeholders: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
