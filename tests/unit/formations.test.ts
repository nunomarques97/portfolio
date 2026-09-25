import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { portfolio } from '../../src/content/portfolio';
import {
  buildFormations,
  CLUSTER_COUNT,
  clusterCenter,
  CORE,
  createRandom,
  FORMATION,
  LATTICE,
  SECTION_STATES,
  STREAM,
  type Vec3,
} from '../../src/scene/formations';

const COUNT = 6_000;
const formations = buildFormations(COUNT);
const theme = readFileSync(new URL('../../src/styles/theme.css', import.meta.url), 'utf8');

const point = (positions: Float32Array, i: number): Vec3 => [
  positions[i * 3] as number,
  positions[i * 3 + 1] as number,
  positions[i * 3 + 2] as number,
];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const indices = Array.from({ length: COUNT }, (_, i) => i);
const share = (predicate: (i: number) => boolean) => indices.filter(predicate).length / COUNT;

describe('section states', () => {
  it('has one keyframe per page section, in page order', () => {
    expect(SECTION_STATES.map((state) => state.id)).toEqual(portfolio.sections.map((section) => section.id));
  });

  it('follows the choreography table in DESIGN.md', () => {
    expect(SECTION_STATES.map(({ id, morph, camera, target }) => ({ id, morph, camera, target }))).toEqual([
      { id: 'hero', morph: FORMATION.core, camera: [0, 0, 7.2], target: [0, 0, 0] },
      { id: 'about', morph: FORMATION.core, camera: [3.2, 1.4, 5.4], target: [0, 0, 0] },
      { id: 'projects', morph: FORMATION.constellation, camera: [3.6, 0.6, 7.4], target: [0, 0.2, 0] },
      { id: 'skills', morph: FORMATION.lattice, camera: [-3.6, 3.2, 5.6], target: [0, 0, 0] },
      { id: 'experience', morph: FORMATION.stream, camera: [-4.6, 1.2, 4.8], target: [-1, 0, 0] },
      { id: 'contact', morph: FORMATION.stream, camera: [4.4, 0.5, 2.6], target: [2.6, 0, 0] },
    ]);
  });

  it('takes both particle colours of every section from theme.css', () => {
    for (const state of SECTION_STATES) {
      for (const variable of state.colors) {
        expect(theme, variable).toMatch(new RegExp(`${variable}:\\s*#[0-9a-f]{6};`));
      }
    }
  });
});

describe('formations', () => {
  it('is deterministic for a given seed', () => {
    const again = buildFormations(COUNT);
    expect(again.core).toEqual(formations.core);
    expect(again.stream).toEqual(formations.stream);
    expect(buildFormations(COUNT, createRandom(7)).core).not.toEqual(formations.core);
  });

  it('allocates every attribute for the particle count, with finite values', () => {
    for (const key of ['core', 'constellation', 'lattice', 'stream'] as const) {
      expect(formations[key]).toHaveLength(COUNT * 3);
      expect(formations[key].every(Number.isFinite)).toBe(true);
    }
    for (const key of ['seed', 'cluster', 'beacon'] as const) expect(formations[key]).toHaveLength(COUNT);
    expect(formations.seed.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('rejects an invalid particle count', () => {
    expect(() => buildFormations(0)).toThrow(RangeError);
    expect(() => buildFormations(1.5)).toThrow(RangeError);
  });

  it('builds the core from a shell, an inner core and a ring', () => {
    const radius = (i: number) => distance(point(formations.core, i), [0, 0, 0]);
    expect(share((i) => Math.abs(radius(i) - CORE.shellRadius) < 0.2)).toBeCloseTo(0.72, 1);
    expect(share((i) => radius(i) <= CORE.innerRadius)).toBeCloseTo(0.12, 1);
    expect(share((i) => Math.abs(radius(i) - CORE.ringRadius) < 0.25)).toBeCloseTo(0.16, 1);
  });

  it('places one cluster per featured project on the descending helix', () => {
    expect(CLUSTER_COUNT).toBe(portfolio.projects.items.filter((project) => project.featured).length);
    expect(clusterCenter(0)).toEqual([0, 2.6, 1.1]);
    expect(clusterCenter(5)[1]).toBeCloseTo(2.6 - 1.05 * 5);
    for (let k = 0; k < CLUSTER_COUNT; k += 1) {
      const members = indices.filter((i) => formations.cluster[i] === k);
      expect(members.length).toBeGreaterThan(COUNT / CLUSTER_COUNT - 2);
      // Most members sit near their own centre; the rest are the wide halo and the link to the next cluster.
      const near = members.filter((i) => distance(point(formations.constellation, i), clusterCenter(k)) < 1.2);
      expect(near.length / members.length).toBeGreaterThan(0.75);
    }
  });

  it('lays the lattice on three planes of grid lines', () => {
    const onLine = (value: number) => Math.abs(value / LATTICE.spacing - Math.round(value / LATTICE.spacing)) < 1e-4;
    for (const i of indices) {
      const [x, y, z] = point(formations.lattice, i);
      expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(LATTICE.extent + 1e-4);
      expect(onLine(x) || onLine(y)).toBe(true);
      expect(LATTICE.planes.some((plane) => Math.abs(z - plane) < 0.06)).toBe(true);
    }
  });

  it('runs the stream toward the beacon, which holds 14% of the particles', () => {
    const beacon = indices.filter((i) => formations.beacon[i] === 1);
    expect(beacon.length / COUNT).toBeCloseTo(STREAM.beaconShare, 1);
    for (const i of beacon) expect(distance(point(formations.stream, i), [STREAM.endX, 0, 0])).toBeLessThan(1);
    for (const i of indices.filter((index) => formations.beacon[index] === 0)) {
      const [x, y, z] = point(formations.stream, i);
      expect(x).toBeGreaterThanOrEqual(STREAM.startX - 1e-4);
      expect(x).toBeLessThanOrEqual(STREAM.endX + 1e-4);
      expect(Math.hypot(y, z)).toBeLessThanOrEqual(STREAM.radius + 0.05);
    }
  });
});
