// Capability detection and device tiers for the scene (see "Performance budget" in docs/design/DESIGN.md).
// Runs before three.js is requested, so it must not import it.

export interface Tier {
  readonly name: 'full' | 'lite';
  readonly particles: number;
  /** Upper bound for the renderer's device pixel ratio. */
  readonly maxPixelRatio: number;
  /** Base sprite size in pixels at unit depth, before the pixel ratio. */
  readonly pointSize: number;
}

export const TIERS = {
  full: { name: 'full', particles: 26_000, maxPixelRatio: 2, pointSize: 30 },
  lite: { name: 'lite', particles: 9_000, maxPixelRatio: 1.5, pointSize: 34 },
} as const satisfies Record<Tier['name'], Tier>;

/** Layout breakpoint: at or below it the page uses the mobile composition. */
export const NARROW_QUERY = '(max-width: 820px)';
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

export interface DeviceProfile {
  readonly narrow: boolean;
  readonly coarsePointer: boolean;
  /** navigator.hardwareConcurrency; undefined when the browser does not report it. */
  readonly cores?: number | undefined;
  /** navigator.deviceMemory in GiB; undefined when the browser does not report it. */
  readonly memory?: number | undefined;
}

/** Lite for narrow viewports, touch-first devices and low-capability hardware; full otherwise. */
export function chooseTier(device: DeviceProfile): Tier {
  const lowCores = device.cores !== undefined && device.cores > 0 && device.cores <= 4;
  const lowMemory = device.memory !== undefined && device.memory > 0 && device.memory <= 4;
  return device.narrow || device.coarsePointer || lowCores || lowMemory ? TIERS.lite : TIERS.full;
}

export function readDeviceProfile(win: Window): DeviceProfile {
  const nav = win.navigator as Navigator & { deviceMemory?: number };
  return {
    narrow: win.matchMedia(NARROW_QUERY).matches,
    coarsePointer: win.matchMedia(COARSE_POINTER_QUERY).matches,
    cores: nav.hardwareConcurrency || undefined,
    memory: nav.deviceMemory,
  };
}

/** The renderer pixel ratio: the device's, capped by the tier. */
export function pixelRatioFor(tier: Tier, devicePixelRatio: number): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, tier.maxPixelRatio);
}

export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false,
};

/**
 * Creates the WebGL 2 context the renderer will use (three.js requires WebGL 2). Returns null when WebGL is
 * unavailable or context creation fails, without throwing or logging, so the caller can fall back before
 * loading three.js.
 */
export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    const context = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
    return context && !context.isContextLost() ? context : null;
  } catch {
    return null;
  }
}
