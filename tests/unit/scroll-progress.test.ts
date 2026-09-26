import { describe, expect, it } from 'vitest';
import { createChoreography, DAMPING, FOCUS_SHARE, MAX_LAG, PARALLAX } from '../../src/scene/choreography';
import { clusterCenter, SECTION_STATES } from '../../src/scene/formations';
import {
  activeClusterAt,
  CARD_BAND,
  HOLD_SHARE,
  progressAt,
  scrollStateAt,
  smoothstep,
  type ScrollLayout,
} from '../../src/scene/scroll-progress';

/** Six sections of 1000 px each, as on a 1000 px tall viewport, with two project cards in the third section. */
const layout: ScrollLayout = {
  tops: [0, 1000, 2000, 3000, 4000, 5000],
  heights: [1000, 1000, 1000, 1000, 1000, 1000],
  cards: [
    { top: 2200, bottom: 2480, cluster: 0 },
    { top: 2500, bottom: 2780, cluster: 1 },
  ],
  maxScroll: 5200,
};
const PROJECTS = SECTION_STATES.findIndex((state) => state.id === 'projects');
/** The keyframe of section `index`; fails the test instead of returning undefined. */
const stateAt = (index: number) => {
  const state = SECTION_STATES[index];
  if (!state) throw new RangeError(`no section state at ${index}`);
  return state;
};
const frames = (seconds: number, step: (dt: number) => void, fps = 60) => {
  for (let i = 0; i < Math.round(seconds * fps); i += 1) step(1 / fps);
};

describe('progressAt', () => {
  it('holds each section for its first 60% and then eases into the next one', () => {
    expect(progressAt(layout, 0)).toBe(0);
    expect(progressAt(layout, 1000 + HOLD_SHARE * 1000)).toBe(1);
    expect(progressAt(layout, 1000 + 0.59 * 1000)).toBe(1);
    expect(progressAt(layout, 1800)).toBeCloseTo(1.5, 10);
    expect(progressAt(layout, 1999)).toBeGreaterThan(1.99);
    expect(progressAt(layout, 2000)).toBe(2);
  });

  it('is continuous and never decreases while scrolling down', () => {
    let previous = -1;
    for (let y = 0; y <= 6000; y += 7) {
      const value = progressAt(layout, y);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value - previous < 0.05 || previous < 0).toBe(true);
      previous = value;
    }
  });

  it('never passes the last section and handles positions outside the page', () => {
    expect(progressAt(layout, 99_999)).toBe(5);
    expect(progressAt(layout, -500)).toBe(0);
    expect(progressAt({ tops: [], heights: [] }, 100)).toBe(0);
    expect(progressAt({ tops: [0, 0], heights: [0, 0] }, 0)).toBe(1);
  });

  it('smoothstep clamps and eases', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(2)).toBe(1);
  });
});

describe('activeClusterAt', () => {
  const band = 1000 * CARD_BAND;

  it('picks the card crossing the viewport centre', () => {
    expect(activeClusterAt(layout.cards, 2300, 1000)).toBe(0);
    expect(activeClusterAt(layout.cards, 2600, 1000)).toBe(1);
  });

  it('counts a card within the ±5% band and prefers the nearer card in a gap', () => {
    expect(activeClusterAt(layout.cards, 2200 - band + 1, 1000)).toBe(0);
    expect(activeClusterAt(layout.cards, 2200 - band - 1, 1000)).toBe(-1);
    expect(activeClusterAt(layout.cards, 2485, 1000)).toBe(0);
    expect(activeClusterAt(layout.cards, 2495, 1000)).toBe(1);
  });

  it('returns -1 outside the cards or without cards', () => {
    expect(activeClusterAt(layout.cards, 500, 1000)).toBe(-1);
    expect(activeClusterAt([], 2300, 1000)).toBe(-1);
  });
});

describe('scrollStateAt', () => {
  it('measures at the viewport centre and reports page progress', () => {
    const state = scrollStateAt(layout, 1800, 1000);
    expect(state.index).toBe(2);
    expect(state.progress).toBe(2);
    expect(state.cluster).toBe(0);
    expect(state.page).toBeCloseTo(1800 / 5200, 10);
    expect(scrollStateAt(layout, 99_999, 1000)).toMatchObject({ index: 5, progress: 5, page: 1 });
    expect(scrollStateAt({ ...layout, maxScroll: 0 }, 0, 1000).page).toBe(0);
  });
});

describe('choreography', () => {
  it('matches each section keyframe when settled', () => {
    const choreography = createChoreography();
    SECTION_STATES.forEach((state, index) => {
      choreography.setGoal(index, -1);
      choreography.settle();
      expect(choreography.pose.morph).toBe(state.morph);
      expect(choreography.pose.camera).toEqual([...state.camera]);
      expect(choreography.pose.target).toEqual([...state.target]);
      expect(choreography.pose.from).toBe(index);
      expect(choreography.pose.blend).toBe(0);
    });
  });

  it('interpolates camera, morph and colour weight between keyframes', () => {
    const choreography = createChoreography();
    choreography.setGoal(2.5, -1);
    choreography.settle();
    const [a, b] = [stateAt(2), stateAt(3)];
    expect(choreography.pose.morph).toBeCloseTo((a.morph + b.morph) / 2, 10);
    expect(choreography.pose.camera[0]).toBeCloseTo((a.camera[0] + b.camera[0]) / 2, 10);
    expect(choreography.pose).toMatchObject({ from: 2, to: 3, blend: 0.5 });
  });

  it('damps toward the goal at 1 - e^(-3.2 dt)', () => {
    const choreography = createChoreography();
    choreography.setGoal(0.4, -1);
    choreography.step(0.1);
    expect(choreography.displayed).toBeCloseTo(0.4 * (1 - Math.exp(-DAMPING * 0.1)), 10);
    frames(4, (dt) => choreography.step(dt));
    expect(choreography.displayed).toBe(0.4);
  });

  it('a jump across sections glides in from the neighbouring state instead of sweeping through them', () => {
    const choreography = createChoreography();
    choreography.setGoal(5, -1);
    choreography.step(1 / 60);
    expect(choreography.displayed).toBeGreaterThanOrEqual(5 - MAX_LAG);
    expect(choreography.pose.from).toBe(4);
    frames(4, (dt) => choreography.step(dt));
    expect(choreography.displayed).toBe(5);

    choreography.setGoal(0, -1);
    choreography.step(1 / 60);
    expect(choreography.displayed).toBeLessThanOrEqual(MAX_LAG);
  });

  it('never leaves the section range or accepts invalid input', () => {
    const choreography = createChoreography();
    choreography.setGoal(Number.NaN, 2.5);
    choreography.settle();
    expect(choreography.displayed).toBe(0);
    expect(choreography.pose.cluster).toBe(-1);
    choreography.setGoal(42, -1);
    choreography.settle();
    expect(choreography.displayed).toBe(SECTION_STATES.length - 1);
    expect(() => createChoreography([])).toThrow(RangeError);
  });

  it('on desktop moves the target 80% toward the active cluster and the camera follows its height', () => {
    const choreography = createChoreography();
    choreography.setMode({ retarget: true, parallax: false });
    choreography.setGoal(PROJECTS, 4);
    choreography.settle();
    const center = clusterCenter(4);
    const base = stateAt(PROJECTS);
    for (let axis = 0; axis < 3; axis += 1) {
      const expected = (base.target[axis] as number) + ((center[axis] as number) - (base.target[axis] as number)) * FOCUS_SHARE;
      expect(choreography.pose.target[axis]).toBeCloseTo(expected, 10);
    }
    expect(choreography.pose.camera[1]).toBeCloseTo(base.camera[1] + (center[1] - base.target[1]) * FOCUS_SHARE, 10);
    expect(choreography.pose).toMatchObject({ cluster: 4, highlight: 1 });
  });

  it('switching cards glides the focus and fades the new cluster in from zero', () => {
    const choreography = createChoreography();
    choreography.setGoal(PROJECTS, 0);
    choreography.settle();
    const before = choreography.pose.target[1];
    choreography.setGoal(PROJECTS, 1);
    choreography.step(1 / 60);
    expect(choreography.pose.cluster).toBe(1);
    expect(choreography.pose.highlight).toBeGreaterThan(0);
    expect(choreography.pose.highlight).toBeLessThan(0.1);
    const moved = choreography.pose.target[1] - before;
    expect(moved).toBeLessThan(0);
    expect(Math.abs(moved)).toBeLessThan(0.1);
    frames(4, (dt) => choreography.step(dt));
    expect(choreography.pose.highlight).toBe(1);

    choreography.setGoal(PROJECTS + 1, -1);
    frames(4, (dt) => choreography.step(dt));
    expect(choreography.pose.highlight).toBe(0);
  });

  it('the mobile variant keeps the highlight but never retargets the camera or applies parallax', () => {
    const choreography = createChoreography();
    choreography.setMode({ retarget: false, parallax: false });
    choreography.setPointer(0.5, 0.5);
    choreography.setGoal(PROJECTS, 3);
    choreography.settle();
    const base = stateAt(PROJECTS);
    expect(choreography.pose.target).toEqual([...base.target]);
    expect(choreography.pose.camera).toEqual([...base.camera]);
    expect(choreography.pose).toMatchObject({ cluster: 3, highlight: 1 });
  });

  it('pointer parallax offsets the camera by at most ±0.8 / 0.6 units', () => {
    const choreography = createChoreography();
    choreography.setMode({ retarget: true, parallax: true });
    choreography.setPointer(5, -5);
    choreography.setGoal(0, -1);
    choreography.settle();
    const base = stateAt(0);
    expect(choreography.pose.camera[0]).toBeCloseTo(base.camera[0] + 0.5 * PARALLAX.x, 10);
    expect(choreography.pose.camera[1]).toBeCloseTo(base.camera[1] + 0.5 * PARALLAX.y, 10);
  });
});

describe('choreography settling', () => {
  it('reports settled only once every glide has reached its goal', () => {
    const choreography = createChoreography();
    expect(choreography.settled).toBe(true);
    choreography.setGoal(PROJECTS, 1);
    choreography.step(1 / 60);
    expect(choreography.settled).toBe(false);
    frames(6, (dt) => choreography.step(dt));
    expect(choreography.settled).toBe(true);
    choreography.setMode({ retarget: true, parallax: true });
    choreography.setPointer(0.3, 0);
    expect(choreography.settled).toBe(false);
    choreography.settle();
    expect(choreography.settled).toBe(true);
  });
});
