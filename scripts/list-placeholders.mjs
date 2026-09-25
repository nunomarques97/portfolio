#!/usr/bin/env node
// Lists every placeholder left in the content file, with its path and editing hint.
//   node scripts/list-placeholders.mjs
// Remaining placeholders are expected until the facts arrive, so the exit code is 0; it is 1 only when the
// content file cannot be loaded. The file is transpiled with TypeScript and imported from memory, which works on
// every supported Node version and requires the content file to have no runtime imports.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentPath = 'src/content/portfolio.ts';

async function loadContent(file) {
  const source = readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  return import(url);
}

async function main() {
  const content = await loadContent(path.join(root, contentPath));
  const found = content.findPlaceholders(content.portfolio);
  if (found.length === 0) {
    console.log(`No placeholders left in ${contentPath}.`);
    return;
  }
  console.log(`${found.length} placeholder${found.length === 1 ? '' : 's'} left in ${contentPath}:`);
  for (const { path: at, hint } of found) {
    console.log(`- ${at}`);
    console.log(`  ${hint}`);
  }
}

main().catch((error) => {
  console.error(`Could not list placeholders: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
