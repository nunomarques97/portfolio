import { describe, expect, it } from 'vitest';
import { chooseTier, pixelRatioFor, TIERS } from '../../src/scene/capabilities';
import { sectionIndexAt } from '../../src/scene/index';

const desktop = { narrow: false, coarsePointer: false, cores: 8, memory: 8 };

describe('device tiers', () => {
  it('uses the full tier on a capable wide device', () => {
    expect(chooseTier(desktop)).toBe(TIERS.full);
    expect(chooseTier({ narrow: false, coarsePointer: false })).toBe(TIERS.full);
  });

  it.each([
    ['a narrow viewport', { narrow: true }],
    ['a coarse pointer', { coarsePointer: true }],
    ['four cores or fewer', { cores: 4 }],
    ['4 GiB of memory or less', { memory: 4 }],
  ])('uses the lite tier for %s', (_, change) => {
    expect(chooseTier({ ...desktop, ...change })).toBe(TIERS.lite);
  });

  it('matches the particle counts and pixel ratio caps in DESIGN.md', () => {
    expect(TIERS.full).toMatchObject({ particles: 26_000, maxPixelRatio: 2, pointSize: 30 });
    expect(TIERS.lite).toMatchObject({ particles: 9_000, maxPixelRatio: 1.5, pointSize: 34 });
  });

  it('caps the device pixel ratio by tier and tolerates invalid values', () => {
    expect(pixelRatioFor(TIERS.full, 3)).toBe(2);
    expect(pixelRatioFor(TIERS.full, 1.25)).toBe(1.25);
    expect(pixelRatioFor(TIERS.lite, 3)).toBe(1.5);
    expect(pixelRatioFor(TIERS.lite, Number.NaN)).toBe(1);
    expect(pixelRatioFor(TIERS.lite, 0)).toBe(1);
  });
});

describe('sectionIndexAt', () => {
  const tops = [0, 900, 2000, 3500];

  it('returns the last section whose top is at or above the position', () => {
    expect(sectionIndexAt(tops, -10)).toBe(0);
    expect(sectionIndexAt(tops, 899)).toBe(0);
    expect(sectionIndexAt(tops, 900)).toBe(1);
    expect(sectionIndexAt(tops, 2500)).toBe(2);
    expect(sectionIndexAt(tops, 99_999)).toBe(3);
    expect(sectionIndexAt([], 100)).toBe(0);
  });
});
