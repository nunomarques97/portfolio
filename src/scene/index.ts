// Scene loader and lifecycle. Part of the initial bundle, so it stays small and never imports three.js statically:
// after the page is interactive it checks for WebGL 2, then imports ./particles (three.js) on demand.
// State is published on html[data-scene]: loading, running, reduced or unavailable (see docs/design/DESIGN.md).
import {
  chooseTier,
  createContext,
  NARROW_QUERY,
  pixelRatioFor,
  readDeviceProfile,
  REDUCED_MOTION_QUERY,
} from './capabilities';
import type { ParticleScene } from './particles';

export type SceneState = 'loading' | 'running' | 'reduced' | 'unavailable';

/**
 * Test observation point. Only when a test defines `window.__PORTFOLIO_SCENE_PROBE__` before the page loads does the
 * scene count frames and expose its lifecycle; normal visits have no probe, so nothing is counted or exposed.
 */
export interface SceneProbe {
  /** Animation frames rendered. */
  frames: number;
  /** Still frames rendered (reduced motion). */
  stills: number;
  tier?: string;
  particles?: number;
  init?: () => void;
  teardown?: () => void;
}

const PROBE_KEY = '__PORTFOLIO_SCENE_PROBE__';
const RESIZE_DEBOUNCE_MS = 120;
const IDLE_TIMEOUT_MS = 1500;
/** Longest frame step fed to the glides, so a stalled tab does not jump. */
const MAX_FRAME_SECONDS = 0.05;

type Teardown = () => void;
let active: Teardown | null = null;

/** Index of the section containing `y` (document coordinates), from ascending section tops. */
export function sectionIndexAt(tops: readonly number[], y: number): number {
  let index = 0;
  while (index < tops.length - 1 && (tops[index + 1] as number) <= y) index += 1;
  return index;
}

/** Calls `callback` once the page has loaded and the main thread is idle. Returns a cancel function. */
function whenInteractive(win: Window, callback: () => void): () => void {
  let idle = 0;
  let timer = 0;
  const schedule = () => {
    if (typeof win.requestIdleCallback === 'function') idle = win.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    else timer = win.setTimeout(callback, 0);
  };
  if (win.document.readyState === 'complete') schedule();
  else win.addEventListener('load', schedule, { once: true });
  return () => {
    win.removeEventListener('load', schedule);
    if (idle) win.cancelIdleCallback(idle);
    if (timer) win.clearTimeout(timer);
  };
}

/** Starts the scene once. Calling it again while it is set up returns the same teardown. */
export function initScene(win: Window = window): Teardown {
  if (active) return active;
  const stop = start(win);
  const teardown = () => {
    if (active !== teardown) return;
    active = null;
    stop();
  };
  active = teardown;
  return teardown;
}

/** Stops the scene, removes its canvas and listeners, and clears html[data-scene]. Safe to call at any time. */
export function teardownScene(): void {
  active?.();
}

function start(win: Window): Teardown {
  const doc = win.document;
  const root = doc.documentElement;
  const layer = doc.querySelector<HTMLElement>('[data-scene-layer]');
  const probe = (win as unknown as Record<string, SceneProbe | undefined>)[PROBE_KEY];
  if (probe) {
    probe.init = () => void initScene(win);
    probe.teardown = teardownScene;
  }
  if (!layer) return () => {};

  const reducedMotion = win.matchMedia(REDUCED_MOTION_QUERY);
  const narrow = win.matchMedia(NARROW_QUERY);
  const listeners: Teardown[] = [];
  const listen = (target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) => {
    target.addEventListener(type, listener, options);
    listeners.push(() => target.removeEventListener(type, listener, options));
  };

  let finished = false;
  let canvas: HTMLCanvasElement | null = null;
  let scene: ParticleScene | null = null;
  let raf = 0;
  let lastTime = 0;
  let resizeTimer = 0;
  let sectionTops: number[] = [];
  let section = -1;
  let stillPending = 0;

  const setState = (state: SceneState) => {
    root.dataset.scene = state;
  };

  const stopLoop = () => {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
  };

  const release = () => {
    finished = true;
    cancelInteractive();
    stopLoop();
    if (stillPending) win.cancelAnimationFrame(stillPending);
    stillPending = 0;
    win.clearTimeout(resizeTimer);
    while (listeners.length) listeners.pop()?.();
    const current = scene;
    scene = null;
    try {
      current?.dispose();
    } catch {
      // A lost context can make disposal fail; the canvas is dropped either way.
    }
    canvas?.remove();
  };

  /** WebGL, three.js or the context failed: drop the canvas and keep the CSS fallback. */
  const fail = () => {
    if (finished) return;
    release();
    setState('unavailable');
  };

  const measureSections = () => {
    sectionTops = Array.from(doc.querySelectorAll<HTMLElement>('main > section'), (element) =>
      Math.round(element.getBoundingClientRect().top + win.scrollY),
    );
  };

  /** Moves the field to the section at the viewport's vertical centre. Returns whether it changed. */
  const trackSection = () => {
    const index = sectionIndexAt(sectionTops, win.scrollY + win.innerHeight / 2);
    if (index === section) return false;
    section = index;
    scene?.setSection(index);
    return true;
  };

  const renderStill = () => {
    stillPending = 0;
    if (!scene) return;
    trackSection();
    scene.renderStill();
    if (probe) probe.stills += 1;
  };

  const frame = (now: number) => {
    raf = win.requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    trackSection();
    scene?.frame(dt);
    if (probe) probe.frames += 1;
  };

  const startLoop = () => {
    if (raf || !scene || doc.hidden || reducedMotion.matches) return;
    lastTime = win.performance.now();
    raf = win.requestAnimationFrame(frame);
  };

  /** Running animates continuously; reduced motion renders one still frame and then only on section change. */
  const applyMode = () => {
    if (!scene) return;
    stopLoop();
    if (reducedMotion.matches) {
      setState('reduced');
      renderStill();
    } else {
      setState('running');
      startLoop();
    }
  };

  const resize = () => {
    if (!scene) return;
    scene.resize(win.innerWidth, win.innerHeight, narrow.matches);
    measureSections();
  };

  const mount = (module: typeof import('./particles'), context: WebGL2RenderingContext, target: HTMLCanvasElement) => {
    const tier = chooseTier(readDeviceProfile(win));
    const rootStyle = win.getComputedStyle(root);
    scene = module.createParticleScene({
      canvas: target,
      context,
      tier,
      pixelRatio: pixelRatioFor(tier, win.devicePixelRatio),
      cssVariable: (name) => rootStyle.getPropertyValue(name),
    });
    target.dataset.sceneTier = tier.name;
    if (probe) {
      probe.tier = tier.name;
      probe.particles = scene.particles;
    }
    resize();
    trackSection();
    layer.insertBefore(target, layer.querySelector('.scene-scrim'));

    listen(win, 'resize', () => {
      win.clearTimeout(resizeTimer);
      resizeTimer = win.setTimeout(() => {
        resize();
        if (reducedMotion.matches) renderStill();
      }, RESIZE_DEBOUNCE_MS);
    });
    listen(win, 'scroll', () => {
      if (reducedMotion.matches && !stillPending && !finished) {
        stillPending = win.requestAnimationFrame(() => {
          stillPending = 0;
          if (trackSection()) renderStill();
        });
      }
    }, { passive: true });
    listen(reducedMotion, 'change', applyMode);
    listen(doc, 'visibilitychange', () => (doc.hidden ? stopLoop() : startLoop()));
    applyMode();
  };

  const load = () => {
    if (finished) return;
    const target = doc.createElement('canvas');
    target.className = 'scene-canvas';
    target.setAttribute('aria-hidden', 'true');
    const context = createContext(target);
    if (!context) {
      fail();
      return;
    }
    canvas = target;
    listen(target, 'webglcontextlost', fail);
    import('./particles').then(
      (module) => {
        if (finished) return;
        try {
          mount(module, context, target);
        } catch {
          fail();
        }
      },
      () => fail(),
    );
  };

  setState('loading');
  const cancelInteractive = whenInteractive(win, load);

  return () => {
    if (finished) {
      // Already fell back; only the attribute remains to clear.
      delete root.dataset.scene;
      return;
    }
    // Remove the listeners first, so the deliberate context release below is not reported as a failure.
    const context = scene ? null : canvas?.getContext('webgl2');
    release();
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    delete root.dataset.scene;
  };
}
