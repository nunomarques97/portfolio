import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const css = readFileSync(path.join(root, 'src/styles/theme.css'), 'utf8');

type Rgba = [number, number, number, number];

const minimum = { body: 4.5, large: 3, ui: 3, focus: 3 } as const;
type Kind = keyof typeof minimum;

interface Pair {
  kind: Kind;
  foreground: string;
  layers: string[];
  source: string;
}

/** Returns the declarations of the first rule block that follows `selector` inside `text`. */
function blockAfter(text: string, selector: string): string {
  const start = text.indexOf(selector);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`Unclosed block for ${selector}`);
}

function declarations(block: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const match of block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(match[1] as string, (match[2] as string).trim());
  }
  return vars;
}

const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rootVars = declarations(blockAfter(withoutComments, ':root'));

function variable(name: string): string {
  const value = rootVars.get(name);
  if (value === undefined) throw new Error(`${name} is not declared in :root`);
  return value;
}

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1] as string, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  throw new Error(`Unsupported colour: ${value}`);
}

/** Alpha-composites `top` over an opaque `bottom` in sRGB space, which is how browsers blend layers. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => a * (top[i] as number) + (1 - a) * (bottom[i] as number)).concat(1) as Rgba;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves `--colour` or `--colour/--opacity` to a colour whose alpha includes the opacity. */
function layerColor(layer: string): Rgba {
  const [colorName, opacityName] = layer.split('/') as [string, string | undefined];
  const color = parseColor(variable(colorName));
  if (opacityName !== undefined) color[3] *= Number(variable(opacityName));
  return color;
}

function backdrop(layers: string[]): Rgba {
  const colors = layers.map(layerColor);
  let result = colors.pop() as Rgba;
  if (result[3] !== 1) throw new Error(`The bottom layer ${layers.at(-1)} must be opaque`);
  for (const color of colors.reverse()) result = over(color, result);
  return result;
}

const pairs: Pair[] = [...css.matchAll(/@pair\s+(\w+)\s+(--[\w-]+)\s+on\s+([^\n]+)/g)].map((m) => {
  const kind = m[1] as string;
  if (!(kind in minimum)) throw new Error(`Unknown pair kind: ${kind}`);
  return {
    kind: kind as Kind,
    foreground: m[2] as string,
    layers: (m[3] as string).trim().split(/\s+over\s+/),
    source: m[0].trim(),
  };
});

function ratioOf(pair: Pair): number {
  const bg = backdrop(pair.layers);
  return contrast(over(layerColor(pair.foreground), bg), bg);
}

describe('contrast helpers', () => {
  it('match the WCAG reference values', () => {
    expect(contrast(parseColor('#000000'), parseColor('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrast(parseColor('#777777'), parseColor('#ffffff'))).toBeCloseTo(4.48, 2);
  });

  it('flag a light scrim over bright particles', () => {
    const scrimmed = over([4, 6, 13, 0.35], parseColor('#ffffff'));
    expect(contrast(parseColor('#8fa3bf'), scrimmed)).toBeLessThan(4.5);
  });
});

describe('theme.css contrast pairs', () => {
  it('declares pairs', () => {
    expect(pairs.length).toBeGreaterThan(20);
  });

  it.each(pairs.map((p) => [p.source, p] as const))('%s', (_source, pair) => {
    expect(ratioOf(pair)).toBeGreaterThanOrEqual(minimum[pair.kind]);
  });

  const textColors = [...rootVars.keys()].filter((name) => name.startsWith('--text-') && variable(name).startsWith('#'));

  it('covers every text colour with a body pair', () => {
    expect(textColors.length).toBeGreaterThanOrEqual(6);
    for (const name of textColors) {
      expect(pairs.some((p) => p.kind === 'body' && p.foreground === name), name).toBe(true);
    }
  });

  it('checks every scene text colour over the desktop and mobile scrims at peak particle brightness', () => {
    for (const name of textColors.filter((n) => n !== '--text-on-accent')) {
      const scrimPairs = pairs.filter(
        (p) => p.kind === 'body' && p.foreground === name && p.layers.some((l) => l.split('/')[0] === '--color-particle-peak'),
      );
      expect(scrimPairs.some((p) => p.layers[0] === '--color-bg/--scrim-column-alpha'), name).toBe(true);
      expect(scrimPairs.some((p) => p.layers[0] === '--color-bg/--backing-mobile-alpha'), name).toBe(true);
    }
    expect(variable('--color-particle-peak')).toBe('#ffffff');
  });

  it('checks the display gradient, focus ring and control boundaries', () => {
    for (const name of ['--display-start', '--display-mid', '--display-end']) {
      expect(pairs.some((p) => p.kind === 'large' && p.foreground === name), name).toBe(true);
    }
    expect(pairs.filter((p) => p.kind === 'focus' && p.foreground === '--focus-ring').length).toBeGreaterThanOrEqual(3);
    expect(pairs.filter((p) => p.kind === 'ui' && p.foreground === '--border-control').length).toBeGreaterThanOrEqual(3);
  });
});

describe('theme.css motion', () => {
  const durations = [...rootVars.keys()].filter((name) => name.startsWith('--duration-'));

  it('declares motion durations', () => {
    expect(durations.length).toBeGreaterThanOrEqual(4);
  });
});

describe('theme.css fonts', () => {
  const imports = [...css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)].map((m) => m[1] as string);

  it('makes no requests to another origin', () => {
    expect(css).not.toMatch(/https?:|url\(\s*['"]?\/\//i);
    expect(css).not.toMatch(/fonts\.googleapis|gstatic|cdn/i);
  });

  it('imports only self-hosted @fontsource files that exist and reference local font files', () => {
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) {
      expect(spec).toMatch(/^@fontsource\/(space-grotesk|jetbrains-mono)\/[\w-]+\.css$/);
      const file = path.join(root, 'node_modules', spec);
      expect(existsSync(file), spec).toBe(true);
      const fontCss = readFileSync(file, 'utf8');
      for (const url of fontCss.matchAll(/url\(([^)]+)\)/g)) {
        const target = (url[1] as string).replace(/['"]/g, '');
        expect(target, spec).toMatch(/^\.\//);
        expect(existsSync(path.join(path.dirname(file), target)), target).toBe(true);
      }
    }
  });

  it('bundles every weight the type roles use', () => {
    const loaded = new Map<string, Set<number>>();
    for (const spec of imports) {
      const fontCss = readFileSync(path.join(root, 'node_modules', spec), 'utf8');
      const family = /font-family:\s*'([^']+)'/.exec(fontCss)?.[1] as string;
      const weight = Number(/font-weight:\s*(\d+)/.exec(fontCss)?.[1]);
      loaded.set(family, (loaded.get(family) ?? new Set()).add(weight));
    }
    const sans = /^'([^']+)'/.exec(variable('--font-sans'))?.[1] as string;
    const mono = /^'([^']+)'/.exec(variable('--font-mono'))?.[1] as string;
    expect(sans).toBe('Space Grotesk');
    expect(mono).toBe('JetBrains Mono');
    for (const w of ['--weight-regular', '--weight-medium', '--weight-bold']) {
      expect(loaded.get(sans)?.has(Number(variable(w))), `${sans} ${w}`).toBe(true);
    }
    for (const w of ['--weight-regular', '--weight-mono-strong']) {
      expect(loaded.get(mono)?.has(Number(variable(w))), `${mono} ${w}`).toBe(true);
    }
  });
});
