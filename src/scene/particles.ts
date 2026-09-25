// The three.js particle field. Loaded only by dynamic import from ./index.ts, after WebGL 2 is confirmed, so three.js
// never reaches the initial bundle. One Points draw call; formations are blended on the GPU by `uMorph`.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Tier } from './capabilities';
import { buildFormations, SECTION_STATES, type SectionState, type Vec3 } from './formations';
import { fragmentShader, vertexShader } from './shaders';

/** Damping rate of the morph, camera and colour glides: 1 - e^(-rate * dt) per frame. */
const DAMPING = 3.2;
/** On desktop the field sits to the right of the content column. */
const DESKTOP_OFFSET_X = 2;
const FALLBACK_COLOR = '#22d3ee';

export interface ParticleSceneOptions {
  readonly canvas: HTMLCanvasElement;
  readonly context: WebGL2RenderingContext;
  readonly tier: Tier;
  readonly pixelRatio: number;
  /** Resolves a CSS custom property of the document root, for the section colours in theme.css. */
  readonly cssVariable: (name: string) => string;
}

export interface ParticleScene {
  readonly particles: number;
  /** Sets the section whose keyframe the field moves toward. */
  setSection(index: number): void;
  resize(width: number, height: number, narrow: boolean): void;
  /** Advances the glides and the clock by dt seconds, then renders. */
  frame(dt: number): void;
  /** Renders the current section's keyframe as a still: no glide and a frozen clock (reduced motion). */
  renderStill(): void;
  dispose(): void;
}

interface Keyframe {
  readonly morph: number;
  readonly camera: Vector3;
  readonly target: Vector3;
  readonly colorA: Color;
  readonly colorB: Color;
}

const vector = ([x, y, z]: Vec3) => new Vector3(x, y, z);

export function createParticleScene(options: ParticleSceneOptions): ParticleScene {
  const { canvas, context, tier, pixelRatio, cssVariable } = options;
  const renderer = new WebGLRenderer({
    canvas,
    context,
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const formations = buildFormations(tier.particles);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(formations.core, 3));
  geometry.setAttribute('aConstellation', new BufferAttribute(formations.constellation, 3));
  geometry.setAttribute('aLattice', new BufferAttribute(formations.lattice, 3));
  geometry.setAttribute('aStream', new BufferAttribute(formations.stream, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(formations.seed, 1));
  geometry.setAttribute('aCluster', new BufferAttribute(formations.cluster, 1));
  geometry.setAttribute('aBeacon', new BufferAttribute(formations.beacon, 1));

  const color = (name: string) => new Color(cssVariable(name).trim() || FALLBACK_COLOR);
  const keyframes: Keyframe[] = SECTION_STATES.map((state: SectionState) => ({
    morph: state.morph,
    camera: vector(state.camera),
    target: vector(state.target),
    colorA: color(state.colors[0]),
    colorB: color(state.colors[1]),
  }));
  const first = keyframes[0] as Keyframe;

  const uniforms = {
    uMorph: { value: first.morph },
    uTime: { value: 0 },
    uSize: { value: tier.pointSize },
    uPixelRatio: { value: pixelRatio },
    uActive: { value: -1 },
    uActiveAmount: { value: 0 },
    uColorA: { value: first.colorA.clone() },
    uColorB: { value: first.colorB.clone() },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const scene = new Scene();
  const group = new Group();
  const points = new Points(geometry, material);
  // Every vertex moves in the shader, so the CPU bounding sphere would be wrong.
  points.frustumCulled = false;
  group.add(points);
  scene.add(group);

  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  const cameraTarget = first.target.clone();
  camera.position.copy(first.camera);
  let goal = first;

  const render = () => {
    camera.lookAt(cameraTarget);
    renderer.render(scene, camera);
  };

  return {
    particles: formations.count,

    setSection(index) {
      goal = keyframes[Math.max(0, Math.min(keyframes.length - 1, index))] ?? first;
    },

    resize(width, height, narrow) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      group.position.x = narrow ? 0 : DESKTOP_OFFSET_X;
    },

    frame(dt) {
      const ease = 1 - Math.exp(-DAMPING * dt);
      uniforms.uMorph.value += (goal.morph - uniforms.uMorph.value) * ease;
      uniforms.uTime.value += dt;
      uniforms.uColorA.value.lerp(goal.colorA, ease);
      uniforms.uColorB.value.lerp(goal.colorB, ease);
      camera.position.lerp(goal.camera, ease);
      cameraTarget.lerp(goal.target, ease);
      render();
    },

    renderStill() {
      uniforms.uMorph.value = goal.morph;
      uniforms.uTime.value = 0;
      uniforms.uColorA.value.copy(goal.colorA);
      uniforms.uColorB.value.copy(goal.colorB);
      camera.position.copy(goal.camera);
      cameraTarget.copy(goal.target);
      render();
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      // Browsers cap live contexts per page, so release this one now rather than at garbage collection.
      if (!context.isContextLost()) renderer.forceContextLoss();
    },
  };
}
