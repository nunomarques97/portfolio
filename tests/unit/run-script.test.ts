import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCommand, resolveScript } from '../../scripts/run-script.mjs';

const runner = fileURLToPath(new URL('../../scripts/run-script.mjs', import.meta.url));

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Starts the runner exactly as a check does: `node scripts/run-script.mjs ...`, with no shell involved. */
function run(cwd: string, ...args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(process.execPath, [runner, ...args], { cwd, shell: false }, (error, stdout, stderr) => {
      const code = error ? Number((error as NodeJS.ErrnoException).code ?? 1) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

let fixture: string;

beforeAll(() => {
  fixture = mkdtempSync(path.join(tmpdir(), 'run-script-'));
  const write = (rel: string, content: string) => {
    mkdirSync(path.dirname(path.join(fixture, rel)), { recursive: true });
    writeFileSync(path.join(fixture, rel), content);
  };
  write('print-args.mjs', 'console.log(JSON.stringify(process.argv.slice(2)));\n');
  write('exit-with.mjs', 'process.exit(Number(process.argv[2]));\n');
  write(
    'node_modules/fake-tool/package.json',
    JSON.stringify({ name: 'fake-tool', version: '1.0.0', bin: { 'fake-tool': 'cli.js' } }),
  );
  write('node_modules/fake-tool/cli.js', "console.log('fake-tool ' + JSON.stringify(process.argv.slice(2)));\n");
  write(
    'package.json',
    JSON.stringify({
      name: 'fixture',
      private: true,
      devDependencies: { 'fake-tool': '1.0.0' },
      scripts: {
        args: 'node print-args.mjs "quoted word" plain',
        fail: 'node exit-with.mjs 7',
        ok: 'node exit-with.mjs 0',
        tool: 'fake-tool --from-script',
        chained: 'node print-args.mjs && node exit-with.mjs 1',
        env: 'NODE_ENV=production node print-args.mjs',
      },
    }),
  );
  mkdirSync(path.join(fixture, 'nested', 'dir'), { recursive: true });
});

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe('parseCommand', () => {
  it('splits on whitespace and keeps quoted words together', () => {
    expect(parseCommand(`node  a.mjs "b c" 'd e' f"g h"`)).toEqual(['node', 'a.mjs', 'b c', 'd e', 'fg h']);
  });

  it('keeps an empty quoted argument', () => {
    expect(parseCommand('tool ""')).toEqual(['tool', '']);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCommand('node "a')).toThrow(/unterminated/);
  });
});

describe('resolveScript', () => {
  it('starts local package binaries with the current Node executable', () => {
    const resolved = resolveScript('tool', ['--extra'], fixture);
    expect(resolved.command).toBe(process.execPath);
    expect(resolved.args).toEqual([path.join(fixture, 'node_modules', 'fake-tool', 'cli.js'), '--from-script', '--extra']);
    expect(resolved.cwd).toBe(fixture);
  });
});

describe('run-script.mjs', () => {
  it('runs a script and forwards the remaining argv verbatim', async () => {
    const result = await run(fixture, 'args', 'extra one', '--flag=x');
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['quoted word', 'plain', 'extra one', '--flag=x']);
  });

  it('propagates a non-zero exit code', async () => {
    expect((await run(fixture, 'fail')).code).toBe(7);
  });

  it('exits 0 when the script succeeds', async () => {
    expect((await run(fixture, 'ok')).code).toBe(0);
  });

  it('resolves a package binary without a shell and forwards argv to it', async () => {
    const result = await run(fixture, 'tool', 'a b');
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('fake-tool ["--from-script","a b"]');
  });

  it('finds package.json from a nested working directory', async () => {
    const result = await run(path.join(fixture, 'nested', 'dir'), 'ok');
    expect(result.code).toBe(0);
  });

  it('fails with a clear message for an unknown script', async () => {
    const result = await run(fixture, 'missing');
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('unknown script "missing"');
    expect(result.stderr).toContain('Available scripts: args, fail, ok, tool');
  });

  it('fails with a clear message when no script name is given', async () => {
    const result = await run(fixture);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('no script name given');
  });

  it('rejects shell operators and environment prefixes instead of guessing', async () => {
    for (const name of ['chained', 'env']) {
      const result = await run(fixture, name);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('uses shell syntax');
      expect(result.stdout).toBe('');
    }
  });
});
