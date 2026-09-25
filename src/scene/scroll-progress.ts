// Native scroll → section progress (see "Scroll choreography" in docs/design/DESIGN.md). Part of the initial bundle,
// so it never imports three.js. It also keeps the page chrome in step with the section in view (HUD readout, nav
// `aria-current`, the active project card and the progress bar), with or without WebGL.

/** Share of a section that holds its formation before the morph toward the next one starts. */
export const HOLD_SHARE = 0.6;
/** Half-height of the band around the viewport centre in which a project card counts as read, as a viewport share. */
export const CARD_BAND = 0.05;

/** Document-coordinate geometry of the page, measured on setup, resize and content reflow only. */
export interface ScrollLayout {
  /** Section tops, ascending. */
  readonly tops: readonly number[];
  readonly heights: readonly number[];
  /** Project cards in page order, each mapped to its scene cluster. */
  readonly cards: readonly { readonly top: number; readonly bottom: number; readonly cluster: number }[];
  /** Largest scrollY. */
  readonly maxScroll: number;
}

export interface ScrollState {
  /** Index of the section containing the viewport's vertical centre. */
  readonly index: number;
  /** Continuous progress: `index + smoothstep` over the last 40% of the section, capped at the last section. */
  readonly progress: number;
  /** Cluster of the project card crossing the viewport centre, or -1. */
  readonly cluster: number;
  /** Page scroll from 0 to 1, for the progress bar. */
  readonly page: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/** Index of the section containing `y` (document coordinates), from ascending section tops. */
export function sectionIndexAt(tops: readonly number[], y: number): number {
  let index = 0;
  while (index < tops.length - 1 && (tops[index + 1] as number) <= y) index += 1;
  return index;
}

/** Continuous section progress at document position `y`. */
export function progressAt(layout: Pick<ScrollLayout, 'tops' | 'heights'>, y: number): number {
  const { tops, heights } = layout;
  if (tops.length === 0) return 0;
  const index = sectionIndexAt(tops, y);
  const top = tops[index] as number;
  const height = Math.max(1, heights[index] ?? 1);
  const fraction = clamp01((y - top) / height);
  return Math.min(tops.length - 1, index + smoothstep((fraction - HOLD_SHARE) / (1 - HOLD_SHARE)));
}

/**
 * Cluster of the card that crosses the band of ±`CARD_BAND` viewport heights around `y`. When two cards touch the
 * band, the one nearer the centre wins. Returns -1 when no card is in the band.
 */
export function activeClusterAt(cards: ScrollLayout['cards'], y: number, viewportHeight: number): number {
  const half = viewportHeight * CARD_BAND;
  let best = -1;
  let bestDistance = Infinity;
  for (const card of cards) {
    if (card.bottom < y - half || card.top > y + half) continue;
    const distance = y < card.top ? card.top - y : y > card.bottom ? y - card.bottom : 0;
    if (distance < bestDistance) {
      best = card.cluster;
      bestDistance = distance;
    }
  }
  return best;
}

export function scrollStateAt(layout: ScrollLayout, scrollY: number, viewportHeight: number): ScrollState {
  const y = scrollY + viewportHeight / 2;
  return {
    index: sectionIndexAt(layout.tops, y),
    progress: progressAt(layout, y),
    cluster: activeClusterAt(layout.cards, y, viewportHeight),
    page: layout.maxScroll > 0 ? clamp01(scrollY / layout.maxScroll) : 0,
  };
}

export interface ScrollTracker {
  /** The latest state; updated on every scroll event and after every remeasure. */
  readonly state: ScrollState;
  /** Section ids in page order. */
  readonly ids: readonly string[];
  /** Registers a listener for state changes and returns its removal. */
  subscribe(listener: (state: ScrollState) => void): () => void;
  dispose(): void;
}

/**
 * Follows native scroll: offsets are measured once and on resize, orientation change and content reflow, so a
 * scroll event only reads scrollY. Publishes html[data-section] and updates the HUD, nav and project cards when the
 * section or card changes.
 */
export function createScrollTracker(win: Window): ScrollTracker {
  const doc = win.document;
  const root = doc.documentElement;
  const sections = Array.from(doc.querySelectorAll<HTMLElement>('main > section'));
  const cards = Array.from(doc.querySelectorAll<HTMLElement>('main [data-cluster]'));
  const ids = sections.map((section) => section.id);
  const navLinks = Array.from(doc.querySelectorAll<HTMLAnchorElement>('[data-site-nav] a[href^="#"]'));
  const hudIndex = doc.querySelector<HTMLElement>('[data-hud-index]');
  const hudState = doc.querySelector<HTMLElement>('[data-hud-state]');
  const hudStates = parseStates(doc.querySelector<HTMLElement>('[data-hud-states]')?.dataset.hudStates);
  const bar = doc.querySelector<HTMLElement>('[data-scroll-progress]');
  const listeners = new Set<(state: ScrollState) => void>();
  const cleanups: (() => void)[] = [];

  let layout: ScrollLayout = { tops: [], heights: [], cards: [], maxScroll: 0 };
  let state: ScrollState = { index: -1, progress: 0, cluster: -1, page: 0 };
  let measurePending = 0;

  const publish = (next: ScrollState) => {
    const previous = state;
    state = next;
    if (bar) bar.style.transform = `scaleX(${next.page.toFixed(4)})`;
    if (next.index !== previous.index) {
      const id = ids[next.index] ?? '';
      root.dataset.section = id;
      if (hudIndex) hudIndex.textContent = String(next.index + 1).padStart(2, '0');
      const label = hudStates[next.index];
      if (hudState && label) hudState.textContent = label;
      for (const link of navLinks) {
        if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
    if (next.cluster !== previous.cluster) {
      for (const card of cards) {
        if (Number(card.dataset.cluster) === next.cluster) card.dataset.active = 'true';
        else delete card.dataset.active;
      }
    }
    if (next.index !== previous.index || next.cluster !== previous.cluster || next.progress !== previous.progress) {
      for (const listener of listeners) listener(next);
    }
  };

  const update = () => publish(scrollStateAt(layout, win.scrollY, win.innerHeight));

  const measure = () => {
    measurePending = 0;
    layout = {
      tops: sections.map(documentTop),
      heights: sections.map((section) => section.offsetHeight),
      cards: cards.map((card) => {
        const top = documentTop(card);
        return { top, bottom: top + card.offsetHeight, cluster: Number(card.dataset.cluster) };
      }),
      maxScroll: Math.max(0, root.scrollHeight - win.innerHeight),
    };
    update();
  };

  const scheduleMeasure = () => {
    if (!measurePending) measurePending = win.requestAnimationFrame(measure);
  };

  const listen = (target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) => {
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };

  listen(win, 'scroll', update, { passive: true });
  listen(win, 'resize', scheduleMeasure);
  listen(win, 'orientationchange', scheduleMeasure);
  listen(win, 'load', scheduleMeasure);
  // Font swaps and wrapping changes move the sections without a window resize.
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(scheduleMeasure);
    const main = doc.querySelector('main');
    if (main) observer.observe(main);
    cleanups.push(() => observer.disconnect());
  }
  measure();

  return {
    get state() {
      return state;
    },
    ids,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (measurePending) win.cancelAnimationFrame(measurePending);
      measurePending = 0;
      while (cleanups.length) cleanups.pop()?.();
      listeners.clear();
    },
  };
}

/** Layout top in document coordinates. Unlike a bounding box, it ignores transforms such as the active card's shift. */
function documentTop(element: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

function parseStates(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
