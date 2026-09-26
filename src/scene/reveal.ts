// Content reveal and heading decode (see "Motion principles" in docs/design/DESIGN.md). Part of the initial bundle.
// Content is visible by default: blocks are hidden only after this script marks them, and only while motion is
// allowed, so no-JS and reduced-motion visits show everything at once.
import { REDUCED_MOTION_QUERY } from './capabilities';

/** Blocks inside a section column whose children reveal one by one instead of as a whole. */
const GROUPS = '.about-header, .project-list, .skill-grid, .timeline, .contact-list';
const HEADINGS = 'h1, h2';
const GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEFXZ';
/** Share of a block that must be in view before it reveals. */
const THRESHOLD = 0.15;
const DECODE_MS = 900;

/** The blocks that reveal, in page order: each direct child of a section column, or the children of a group. */
export function revealTargets(doc: Document): HTMLElement[] {
  const targets: HTMLElement[] = [];
  for (const column of doc.querySelectorAll<HTMLElement>('main > section .section-inner')) {
    for (const child of Array.from(column.children) as HTMLElement[]) {
      if (child.matches(GROUPS)) targets.push(...(Array.from(child.children) as HTMLElement[]));
      else targets.push(child);
    }
  }
  return targets;
}

/** `text` with the characters after `share` of its length replaced by random glyphs; spaces are kept. */
export function scrambleText(text: string, share: number, random: () => number = Math.random): string {
  const chars = Array.from(text);
  return chars
    .map((char, index) =>
      /\s/.test(char) || index / chars.length < share ? char : (GLYPHS[Math.floor(random() * GLYPHS.length)] as string),
    )
    .join('');
}

/**
 * Plays the decode on one heading. The real text stays in the DOM, and in the accessibility tree, at zero opacity
 * under an `aria-hidden` copy that resolves left to right, so the accessible name and the layout never change.
 */
function decode(win: Window, heading: HTMLElement): void {
  const doc = win.document;
  const text = doc.createElement('span');
  text.className = 'decode-text';
  text.append(...Array.from(heading.childNodes));
  const overlay = doc.createElement('span');
  overlay.className = 'decode-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.append(text.cloneNode(true));
  for (const element of overlay.querySelectorAll('[id]')) element.removeAttribute('id');
  heading.append(text, overlay);
  heading.classList.add('decoding');

  const nodes: { node: Text; text: string }[] = [];
  const walker = doc.createTreeWalker(overlay, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, text: node.textContent ?? '' });
  }

  const start = win.performance.now();
  const tick = (now: number) => {
    const share = Math.min(1, (now - start) / DECODE_MS);
    for (const { node, text: original } of nodes) node.textContent = scrambleText(original, share);
    if (share < 1) {
      win.requestAnimationFrame(tick);
      return;
    }
    overlay.remove();
    heading.append(...Array.from(text.childNodes));
    text.remove();
    heading.classList.remove('decoding');
  };
  win.requestAnimationFrame(tick);
}

/** Starts the reveal and decode. Returns a teardown that shows everything. */
export function initReveal(win: Window = window): () => void {
  const doc = win.document;
  const root = doc.documentElement;
  const reducedMotion = win.matchMedia(REDUCED_MOTION_QUERY);
  if (reducedMotion.matches || typeof IntersectionObserver !== 'function') return () => {};

  const targets = revealTargets(doc);
  const show = (target: HTMLElement) => {
    if (target.dataset.reveal !== 'hidden') return;
    target.dataset.reveal = 'shown';
    observer.unobserve(target);
    if (reducedMotion.matches) return;
    const headings = target.matches(HEADINGS) ? [target] : Array.from(target.querySelectorAll<HTMLElement>(HEADINGS));
    for (const heading of headings) decode(win, heading);
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) show(entry.target as HTMLElement);
    },
    { threshold: THRESHOLD },
  );
  const showAll = () => {
    for (const target of targets) show(target);
  };
  // Keyboard focus, printing and a switch to reduced motion never wait for a block to scroll into view.
  const onFocus = (event: FocusEvent) => {
    const target = targets.find((item) => item.contains(event.target as Node));
    if (target) show(target);
  };

  for (const target of targets) {
    target.dataset.reveal = 'hidden';
    observer.observe(target);
  }
  root.classList.add('reveal');
  doc.addEventListener('focusin', onFocus);
  win.addEventListener('beforeprint', showAll);
  reducedMotion.addEventListener('change', showAll);

  return () => {
    observer.disconnect();
    doc.removeEventListener('focusin', onFocus);
    win.removeEventListener('beforeprint', showAll);
    reducedMotion.removeEventListener('change', showAll);
    root.classList.remove('reveal');
    for (const target of targets) delete target.dataset.reveal;
  };
}
