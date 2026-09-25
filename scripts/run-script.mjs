#!/usr/bin/env node
// Runs a package.json script without a shell, so it behaves the same from PowerShell, cmd.exe and POSIX shells.
//   node scripts/run-script.mjs <script> [args...]
// The script's command line is split into words (single and double quotes group words). The first word is
// `node` or the name of a binary declared by an installed package ("bin" in node_modules/<pkg>/package.json);
// both are started with the current Node executable. Any other name is started directly from PATH.
// Shell syntax (&&, ||, |, ;, redirects, VAR=value prefixes) is rejected rather than guessed.
// The remaining argv is appended to the script's words, and the child's exit code becomes this exit code.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL_OPERATORS = new Set(['&&', '||', '|', ';', '&', '>', '>>', '<', '2>', '2>&1']);

export class ScriptError extends Error {}

/** Splits a command line into words. Quotes group words and are removed; no variable expansion happens. */
export function parseCommand(commandLine) {
  const words = [];
  let current = '';
  let inWord = false;
  let quote = null;
  for (const char of commandLine) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inWord = true;
    } else if (/\s/.test(char)) {
      if (inWord) words.push(current);
      current = '';
      inWord = false;
    } else {
      current += char;
      inWord = true;
    }
  }
  if (quote) throw new ScriptError(`unterminated ${quote} quote in: ${commandLine}`);
  if (inWord) words.push(current);
  return words;
}

/** The nearest directory at or above `start` that holds a package.json. */
export function findPackageRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new ScriptError(`no package.json found at or above ${start}`);
    dir = parent;
  }
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function binsOf(packageDir) {
  const file = path.join(packageDir, 'package.json');
  if (!existsSync(file)) return {};
  const manifest = readJson(file);
  if (typeof manifest.bin === 'string') {
    const name = String(manifest.name ?? '').split('/').pop();
    return name ? { [name]: path.join(packageDir, manifest.bin) } : {};
  }
  const bins = {};
  for (const [name, target] of Object.entries(manifest.bin ?? {})) bins[name] = path.join(packageDir, target);
  return bins;
}

/** Absolute path of the JavaScript file behind a package binary, or null when no installed package declares it. */
export function resolveBin(name, root) {
  const modules = path.join(root, 'node_modules');
  if (!existsSync(modules)) return null;
  // Direct dependencies first: they are what the scripts are written against, and it avoids a full scan.
  const manifest = readJson(path.join(root, 'package.json'));
  const direct = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  for (const pkg of direct) {
    const target = binsOf(path.join(modules, pkg))[name];
    if (target) return target;
  }
  for (const entry of readdirSync(modules)) {
    if (entry.startsWith('.')) continue;
    const dirs = entry.startsWith('@')
      ? readdirSync(path.join(modules, entry)).map((child) => path.join(modules, entry, child))
      : [path.join(modules, entry)];
    for (const dir of dirs) {
      const target = binsOf(dir)[name];
      if (target) return target;
    }
  }
  return null;
}

/** The process to start for `scriptName`: { command, args, cwd }. Throws ScriptError with a readable message. */
export function resolveScript(scriptName, extraArgs = [], start = process.cwd()) {
  const root = findPackageRoot(start);
  const scripts = readJson(path.join(root, 'package.json')).scripts ?? {};
  if (!scriptName) {
    throw new ScriptError(`no script name given. Available scripts: ${Object.keys(scripts).join(', ') || '(none)'}`);
  }
  if (!Object.hasOwn(scripts, scriptName)) {
    throw new ScriptError(
      `unknown script "${scriptName}". Available scripts: ${Object.keys(scripts).join(', ') || '(none)'}`,
    );
  }
  const words = parseCommand(scripts[scriptName]);
  if (words.length === 0) throw new ScriptError(`script "${scriptName}" is empty`);
  const unsupported = words.find((word) => SHELL_OPERATORS.has(word));
  if (unsupported || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
    throw new ScriptError(
      `script "${scriptName}" uses shell syntax (${unsupported ?? words[0]}), which this runner does not support: ` +
        `move the logic into a Node script under scripts/`,
    );
  }
  const [program, ...args] = words;
  if (program === 'node') return { command: process.execPath, args: [...args, ...extraArgs], cwd: root };
  const bin = resolveBin(program, root);
  if (bin) return { command: process.execPath, args: [bin, ...args, ...extraArgs], cwd: root };
  return { command: program, args: [...args, ...extraArgs], cwd: root };
}

/** Environment for the child: local binaries on PATH, like npm run, and no Astro usage reporting. */
function childEnv(scriptName, root) {
  const env = { ...process.env, npm_lifecycle_event: scriptName };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = [path.join(root, 'node_modules', '.bin'), env[pathKey]].filter(Boolean).join(path.delimiter);
  env.ASTRO_TELEMETRY_DISABLED ??= '1';
  return env;
}

function main() {
  const [scriptName, ...extraArgs] = process.argv.slice(2);
  let resolved;
  try {
    resolved = resolveScript(scriptName, extraArgs);
  } catch (error) {
    if (!(error instanceof ScriptError)) throw error;
    console.error(`run-script: ${error.message}`);
    process.exit(1);
  }
  const child = spawn(resolved.command, resolved.args, {
    cwd: resolved.cwd,
    env: childEnv(scriptName, resolved.cwd),
    stdio: 'inherit',
  });
  // Ctrl+C reaches the child directly (same console); stay alive until it has exited.
  const forward = (signal) => () => child.kill(signal);
  process.on('SIGINT', () => {});
  process.on('SIGTERM', forward('SIGTERM'));
  child.on('error', (error) => {
    console.error(`run-script: could not start "${scriptName}": ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (signal) console.error(`run-script: "${scriptName}" was stopped by ${signal}`);
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
