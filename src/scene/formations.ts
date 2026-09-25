// Particle formations and per-section scene states (see "3D scene concept" and "Scroll choreography" in
// docs/design/DESIGN.md). Pure data and maths: no three.js, so it stays out of the initial bundle and is unit tested.

export type Vec3 = readonly [number, number, number];

/** One cluster per featured project, in card order. */
export const CLUSTER_COUNT = 6;

/** Formation indices, as blended by the `uMorph` uniform. */
export const FORMATION = { core: 0, constellation: 1, lattice: 2, stream: 3 } as const;

export interface SectionState {
  readonly id: string;
  /** Target value of the `uMorph` uniform. */
  readonly morph: number;
  readonly camera: Vec3;
  readonly target: Vec3;
  /** CSS custom properties in theme.css holding the section's two particle colours. */
  readonly colors: readonly [string, string];
}

const state = (id: string, morph: number, camera: Vec3, target: Vec3): SectionState => ({
  id,
  morph,
  camera,
  target,
  colors: [`--scene-${id}-a`, `--scene-${id}-b`],
});

/** Scene keyframe per page section, in page order. */
export const SECTION_STATES: readonly SectionState[] = [
  state('hero', FORMATION.core, [0, 0, 7.2], [0, 0, 0]),
  state('about', FORMATION.core, [3.2, 1.4, 5.4], [0, 0, 0]),
  state('projects', FORMATION.constellation, [3.6, 0.6, 7.4], [0, 0.2, 0]),
  state('skills', FORMATION.lattice, [-3.6, 3.2, 5.6], [0, 0, 0]),
  state('experience', FORMATION.stream, [-4.6, 1.2, 4.8], [-1, 0, 0]),
  state('contact', FORMATION.stream, [4.4, 0.5, 2.6], [2.6, 0, 0]),
];

/** Centre of project cluster k on the descending helix. */
export function clusterCenter(k: number): Vec3 {
  return [Math.sin(1.15 * k) * 1.5, 2.6 - 1.05 * k, Math.cos(1.15 * k) * 1.1];
}

export const CORE = { shellRadius: 1.8, innerRadius: 0.55, ringRadius: 2.7, ringFlatten: 0.22, ringTilt: 0.45 };
export const CONSTELLATION = { spread: 0.32, wideSpread: 0.57, wideShare: 0.2, linkShare: 0.15 };
export const LATTICE = { planes: [-1.1, 0, 1.1], spacing: 0.5, extent: 2.5 };
export const STREAM = { startX: -5, endX: 2.6, radius: 1.7, beaconShare: 0.14, beaconSigma: 0.16 };

export interface Formations {
  readonly count: number;
  /** xyz per particle for each formation: core, constellation, lattice, stream + beacon. */
  readonly core: Float32Array;
  readonly constellation: Float32Array;
  readonly lattice: Float32Array;
  readonly stream: Float32Array;
  /** Per-particle random seed in [0, 1): morph stagger, size and colour mix. */
  readonly seed: Float32Array;
  /** Project cluster index, 0 to CLUSTER_COUNT - 1. */
  readonly cluster: Float32Array;
  /** 1 for particles that form the beacon, otherwise 0. */
  readonly beacon: Float32Array;
}

/** Deterministic PRNG (mulberry32), so every build and every visit draws the same field. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box-Muller). */
function gaussian(random: () => number): number {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Uniform direction on the unit sphere, scaled by `radius`, written at `offset`. */
function onSphere(out: Float32Array, offset: number, radius: number, random: () => number, cx = 0): void {
  const phi = Math.acos(1 - 2 * random());
  const theta = random() * Math.PI * 2;
  out[offset] = cx + radius * Math.sin(phi) * Math.cos(theta);
  out[offset + 1] = radius * Math.sin(phi) * Math.sin(theta);
  out[offset + 2] = radius * Math.cos(phi);
}

export function buildFormations(count: number, random: () => number = createRandom(0x51_6e_41_4c)): Formations {
  if (!Number.isInteger(count) || count <= 0) throw new RangeError(`particle count must be a positive integer: ${count}`);
  const core = new Float32Array(count * 3);
  const constellation = new Float32Array(count * 3);
  const lattice = new Float32Array(count * 3);
  const stream = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const cluster = new Float32Array(count);
  const beacon = new Float32Array(count);
  const centers = Array.from({ length: CLUSTER_COUNT }, (_, k) => clusterCenter(k));
  const tiltCos = Math.cos(CORE.ringTilt);
  const tiltSin = Math.sin(CORE.ringTilt);
  const gridSteps = Math.round((LATTICE.extent * 2) / LATTICE.spacing);

  for (let i = 0; i < count; i += 1) {
    const o = i * 3;
    const r = random();
    seed[i] = r;

    // Core: 72% sphere shell, 12% dense inner core, 16% flattened tilted ring.
    if (r < 0.72) {
      onSphere(core, o, CORE.shellRadius + gaussian(random) * 0.04, random);
    } else if (r < 0.84) {
      onSphere(core, o, random() ** 2 * CORE.innerRadius, random);
    } else {
      const angle = random() * Math.PI * 2;
      const radius = CORE.ringRadius + gaussian(random) * 0.05;
      const y = Math.sin(angle) * radius * CORE.ringFlatten;
      const z = Math.sin(angle) * radius;
      core[o] = Math.cos(angle) * radius;
      core[o + 1] = y * tiltCos - z * tiltSin;
      core[o + 2] = y * tiltSin + z * tiltCos;
    }

    // Constellation: one Gaussian cluster per project; a share of each cluster links it to the next one.
    const k = i % CLUSTER_COUNT;
    cluster[i] = k;
    const c = centers[k] as Vec3;
    if (random() >= CONSTELLATION.linkShare) {
      const spread = random() < CONSTELLATION.wideShare ? CONSTELLATION.wideSpread : CONSTELLATION.spread;
      constellation[o] = c[0] + gaussian(random) * spread;
      constellation[o + 1] = c[1] + gaussian(random) * spread;
      constellation[o + 2] = c[2] + gaussian(random) * spread;
    } else {
      const d = centers[(k + 1) % CLUSTER_COUNT] as Vec3;
      const t = random();
      constellation[o] = c[0] + (d[0] - c[0]) * t + gaussian(random) * 0.02;
      constellation[o + 1] = c[1] + (d[1] - c[1]) * t + gaussian(random) * 0.02;
      constellation[o + 2] = c[2] + (d[2] - c[2]) * t + gaussian(random) * 0.02;
    }

    // Lattice: grid lines at a fixed spacing on three parallel planes.
    const plane = LATTICE.planes[i % LATTICE.planes.length] as number;
    const line = Math.round(random() * gridSteps) * LATTICE.spacing - LATTICE.extent;
    const along = (random() * 2 - 1) * LATTICE.extent;
    const horizontal = random() < 0.5;
    lattice[o] = horizontal ? along : line;
    lattice[o + 1] = horizontal ? line : along;
    lattice[o + 2] = plane + gaussian(random) * 0.01;

    // Stream: a narrowing three-strand spiral that ends in the beacon.
    if (random() < STREAM.beaconShare) {
      beacon[i] = 1;
      onSphere(stream, o, Math.abs(gaussian(random)) * STREAM.beaconSigma, random, STREAM.endX);
    } else {
      const t = random() ** 0.75;
      const radius = (1 - t) * STREAM.radius + 0.03;
      const angle = t * 16 + random() * 0.6 + (i % 3) * ((Math.PI * 2) / 3);
      stream[o] = STREAM.startX + t * (STREAM.endX - STREAM.startX);
      stream[o + 1] = Math.sin(angle) * radius;
      stream[o + 2] = Math.cos(angle) * radius;
    }
  }

  return { count, core, constellation, lattice, stream, seed, cluster, beacon };
}

