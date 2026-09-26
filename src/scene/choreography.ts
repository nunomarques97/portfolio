// Scroll choreography (see "Scroll choreography" and "Motion principles" in docs/design/DESIGN.md): turns section
// progress into the formation morph, camera path, colour blend and project-cluster highlight. Pure maths with no
// three.js and no per-frame allocation, so it stays unit testable and cheap to run every frame.
import { clusterCenter, SECTION_STATES, type SectionState, type Vec3 } from './formations';

/** Damping rate of every glide: 1 - e^(-rate * dt) per frame. */
export const DAMPING = 3.2;
/**
 * Furthest the displayed progress may trail the scroll progress, in sections. A jump (anchor, Home/End, dragging the
 * scrollbar) therefore glides in from the neighbouring state instead of sweeping through every section in between.
 */
export const MAX_LAG = 0.5;
/** Share of the way the camera target moves toward the active project cluster (desktop only). */
export const FOCUS_SHARE = 0.8;
/** Pointer parallax in world units for a pointer at the viewport edge (desktop fine pointer only). */
export const PARALLAX = { x: 0.8, y: 0.6 } as const;
/** Below this distance a glide counts as settled and snaps to its goal. */
const SETTLE = 1e-4;

export interface Pose {
  /** Value of the `uMorph` uniform. */
  morph: number;
  readonly camera: [number, number, number];
  readonly target: [number, number, number];
  /** The two section keyframes whose colours blend, and the blend weight toward `to`. */
  from: number;
  to: number;
  blend: number;
  /** Highlighted project cluster (-1 for none) and its strength from 0 to 1. */
  cluster: number;
  highlight: number;
}

export interface ChoreographyMode {
  /** Move the camera target toward the active project cluster. Off in the mobile variant. */
  readonly retarget: boolean;
  /** Offset the camera by the pointer position. Only with a fine pointer on desktop. */
  readonly parallax: boolean;
}

export interface Choreography {
  readonly pose: Pose;
  /** The progress the pose currently shows, which trails the scroll progress while it glides. */
  readonly displayed: number;
  /** Whether every glide has reached its goal, so the pose only changes when the goal does. */
  readonly settled: boolean;
  /** Where the field should head: scroll progress and the active project cluster (-1 for none). */
  setGoal(progress: number, cluster: number): void;
  /** Pointer position relative to the viewport centre, from -0.5 to 0.5 on each axis. */
  setPointer(x: number, y: number): void;
  setMode(mode: ChoreographyMode): void;
  /** Advances every glide by dt seconds. */
  step(dt: number): void;
  /** Jumps every glide to its goal: the settled state for the current goal, with no tween. */
  settle(): void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function createChoreography(states: readonly SectionState[] = SECTION_STATES): Choreography {
  if (states.length === 0) throw new RangeError('the choreography needs at least one section state');
  const last = states.length - 1;
  const projects = states.findIndex((state) => state.id === 'projects');
  const centers: Vec3[] = [];
  const centerOf = (cluster: number): Vec3 => (centers[cluster] ??= clusterCenter(cluster));

  let mode: ChoreographyMode = { retarget: true, parallax: false };
  let goal = 0;
  let goalCluster = -1;
  let displayed = 0;
  let pointerX = 0;
  let pointerY = 0;
  let parallaxX = 0;
  let parallaxY = 0;
  /** Weight of the camera retarget, and the point it heads for (a cluster centre, glided between clusters). */
  let focus = 0;
  const focusPoint: [number, number, number] = [0, 0, 0];

  const pose: Pose = { morph: 0, camera: [0, 0, 0], target: [0, 0, 0], from: 0, to: 0, blend: 0, cluster: -1, highlight: 0 };

  const clampProgress = (value: number) => (Number.isFinite(value) ? Math.min(last, Math.max(0, value)) : 0);
  const approach = (value: number, to: number, ease: number) =>
    Math.abs(to - value) < SETTLE ? to : value + (to - value) * ease;

  const compose = () => {
    const from = Math.min(last, Math.floor(displayed));
    const to = Math.min(last, from + 1);
    const blend = displayed - from;
    const a = states[from] as SectionState;
    const b = states[to] as SectionState;
    pose.morph = lerp(a.morph, b.morph, blend);
    pose.from = from;
    pose.to = to;
    pose.blend = blend;
    for (let axis = 0; axis < 3; axis += 1) {
      pose.camera[axis] = lerp(a.camera[axis] as number, b.camera[axis] as number, blend);
      pose.target[axis] = lerp(a.target[axis] as number, b.target[axis] as number, blend);
    }
    // In the projects section the camera looks toward the cluster of the card being read and follows its height.
    const onProjects = projects < 0 ? 0 : 1 - Math.min(1, Math.abs(displayed - projects));
    const weight = onProjects * FOCUS_SHARE * focus;
    if (weight > 0) {
      const baseY = (states[projects] as SectionState).target[1];
      for (let axis = 0; axis < 3; axis += 1) {
        pose.target[axis] = lerp(pose.target[axis] as number, focusPoint[axis] as number, weight);
      }
      pose.camera[1] += (focusPoint[1] - baseY) * weight;
    }
    pose.camera[0] += parallaxX * PARALLAX.x;
    pose.camera[1] -= parallaxY * PARALLAX.y;
  };

  const aimFocus = (cluster: number, ease: number) => {
    const center = centerOf(cluster);
    // Starting from no focus, aim straight at the cluster rather than sweeping in from a stale one.
    const t = focus < SETTLE ? 1 : ease;
    for (let axis = 0; axis < 3; axis += 1) focusPoint[axis] = lerp(focusPoint[axis] as number, center[axis] as number, t);
  };

  compose();

  return {
    pose,
    get displayed() {
      return displayed;
    },
    get settled() {
      const aim = mode.retarget && goalCluster >= 0 ? 1 : 0;
      const parallaxGoalX = mode.parallax ? pointerX : 0;
      const parallaxGoalY = mode.parallax ? pointerY : 0;
      return (
        displayed === goal &&
        focus === aim &&
        pose.highlight === (goalCluster >= 0 ? 1 : 0) &&
        parallaxX === parallaxGoalX &&
        parallaxY === parallaxGoalY
      );
    },

    setGoal(progress, cluster) {
      goal = clampProgress(progress);
      goalCluster = Number.isInteger(cluster) && cluster >= 0 ? cluster : -1;
    },

    setPointer(x, y) {
      pointerX = Number.isFinite(x) ? Math.min(0.5, Math.max(-0.5, x)) : 0;
      pointerY = Number.isFinite(y) ? Math.min(0.5, Math.max(-0.5, y)) : 0;
    },

    setMode(next) {
      mode = next;
    },

    step(dt) {
      const ease = 1 - Math.exp(-DAMPING * Math.max(0, dt));
      displayed = approach(Math.min(goal + MAX_LAG, Math.max(goal - MAX_LAG, displayed)), goal, ease);

      const aim = mode.retarget && goalCluster >= 0;
      if (aim) aimFocus(goalCluster, ease);
      focus = approach(focus, aim ? 1 : 0, ease);

      // A new card fades its cluster in from zero; leaving the cards fades the last one out.
      if (goalCluster >= 0 && goalCluster !== pose.cluster) {
        pose.cluster = goalCluster;
        pose.highlight = 0;
      }
      pose.highlight = approach(pose.highlight, goalCluster >= 0 ? 1 : 0, ease);

      parallaxX = approach(parallaxX, mode.parallax ? pointerX : 0, ease);
      parallaxY = approach(parallaxY, mode.parallax ? pointerY : 0, ease);
      compose();
    },

    settle() {
      displayed = goal;
      const aim = mode.retarget && goalCluster >= 0;
      if (aim) aimFocus(goalCluster, 1);
      focus = aim ? 1 : 0;
      if (goalCluster >= 0) pose.cluster = goalCluster;
      pose.highlight = goalCluster >= 0 ? 1 : 0;
      parallaxX = mode.parallax ? pointerX : 0;
      parallaxY = mode.parallax ? pointerY : 0;
      compose();
    },
  };
}
