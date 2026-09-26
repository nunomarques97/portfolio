// Scene loader and lifecycle. Part of the initial bundle, so it stays small and never imports three.js statically:
// after the page is interactive it checks for WebGL 2, then imports ./particles (three.js) on demand.
// State is published on html[data-scene]: loading, running or unavailable (see docs/design/DESIGN.md). Motion always
// plays: the site does not follow prefers-reduced-motion.
// The scroll tracker runs from the start, independently of WebGL, and publishes html[data-section].
import {
  chooseTier,
  createContext,
  NARROW_QUERY,
  pixelRatioFor,
  readDeviceProfile,
} from './capabilities';
import type { ParticleScene } from './particles';
import { createScrollTracker, type ScrollState, type ScrollTracker } from './scroll-progress';

export { sectionIndexAt } from './scroll-progress';

export type SceneState = 'loading' | 'running' | 'unavailable';

/**
 * Test observation point. Only when a test defines `window.__PORTFOLIO_SCENE_PROBE__` before the page loads does the
 * scene count frames and expose its lifecycle; normal visits have no probe, so nothing is counted or exposed.
 */
export interface SceneProbe {
  /** Animation frames rendered. */
  frames: number;
  tier?: string;
  particles?: number;
  /** Scroll progress of the viewport centre, and the progress the field currently shows (it trails while gliding). */
  progress?: number;
  displayed?: number;
  /** Whether the field has finished gliding to the state in view. */
  settled?: boolean;
  /** Section index in view and the active project cluster (-1 for none). */
  section?: number;
  cluster?: number;
  /** Whether the camera retargets to the active cluster and follows the pointer (off in the mobile variant). */
  retarget?: boolean;
  parallax?: boolean;
  init?: () => void;
  teardown?: () => void;
}

const PROBE_KEY = '__PORTFOLIO_SCENE_PROBE__';
const RESIZE_DEBOUNCE_MS = 120;
const IDLE_TIMEOUT_MS = 1500;
/** Longest frame step fed to the glides, so a stalled tab does not jump. */
const MAX_FRAME_SECONDS = 0.05;
/** Pointer parallax needs a precise hovering pointer; the mobile layout never gets it. */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

type Teardown = () => void;
let active: Teardown | null = null;

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
  const tracker: ScrollTracker = createScrollTracker(win);
  const report = (state: ScrollState) => {
    if (!probe) return;
    probe.progress = state.progress;
    probe.section = state.index;
    probe.cluster = state.cluster;
  };
  const unreport = tracker.subscribe(report);
  report(tracker.state);
  const stopTracking = () => {
    unreport();
    tracker.dispose();
  };
  if (!layer) return stopTracking;

  const narrow = win.matchMedia(NARROW_QUERY);
  const finePointer = win.matchMedia(FINE_POINTER_QUERY);
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

  const frame = (now: number) => {
    raf = win.requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!scene) return;
    scene.frame(dt);
    if (probe) {
      probe.displayed = scene.choreography.displayed;
      probe.settled = scene.choreography.settled;
      probe.frames += 1;
    }
  };

  const startLoop = () => {
    if (raf || !scene || doc.hidden) return;
    lastTime = win.performance.now();
    raf = win.requestAnimationFrame(frame);
  };

  const applyChoreographyMode = () => {
    const desktop = !narrow.matches;
    const mode = { retarget: desktop, parallax: desktop && finePointer.matches };
    scene?.choreography.setMode(mode);
    if (probe) Object.assign(probe, mode);
  };

  /** Starts the animation loop from the state in view (a reload mid-page), never from the hero. */
  const run = () => {
    if (!scene) return;
    setState('running');
    const { progress, cluster } = tracker.state;
    scene.choreography.setGoal(progress, cluster);
    scene.choreography.settle();
    startLoop();
  };

  const onScroll = (state: ScrollState) => {
    scene?.choreography.setGoal(state.progress, state.cluster);
  };

  const resize = () => {
    if (!scene) return;
    scene.resize(win.innerWidth, win.innerHeight, narrow.matches);
    applyChoreographyMode();
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
    layer.insertBefore(target, layer.querySelector('.scene-scrim'));

    listeners.push(tracker.subscribe(onScroll));
    listen(win, 'resize', () => {
      win.clearTimeout(resizeTimer);
      resizeTimer = win.setTimeout(resize, RESIZE_DEBOUNCE_MS);
    });
    listen(win, 'pointermove', ((event: PointerEvent) => {
      scene?.choreography.setPointer(event.clientX / win.innerWidth - 0.5, event.clientY / win.innerHeight - 0.5);
    }) as EventListener, { passive: true });
    listen(finePointer, 'change', applyChoreographyMode);
    listen(narrow, 'change', applyChoreographyMode);
    listen(doc, 'visibilitychange', () => (doc.hidden ? stopLoop() : startLoop()));
    run();
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
    stopTracking();
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
