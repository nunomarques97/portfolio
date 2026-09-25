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
import { createChoreography, type Choreography } from './choreography';
import { buildFormations, SECTION_STATES, type SectionState } from './formations';
import { fragmentShader, vertexShader } from './shaders';

/** On desktop the field sits to the right of the content column. */
const DESKTOP_OFFSET_X = 2;
/** On mobile the field sits in the upper half of the screen, above the text blocks. */
const MOBILE_OFFSET_Y = 1.1;
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
  /** Scroll choreography that drives the pose; the loader feeds it scroll progress, the pointer and the mode. */
  readonly choreography: Choreography;
  resize(width: number, height: number, narrow: boolean): void;
  /** Advances the choreography and the clock by dt seconds, then renders. */
  frame(dt: number): void;
  /**
   * Renders section `index` as a still with project cluster `cluster` highlighted (-1 for none): no glide and a
   * frozen clock (reduced motion).
   */
  renderStill(index: number, cluster: number): void;
  dispose(): void;
}

interface Keyframe {
  readonly colorA: Color;
  readonly colorB: Color;
}

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
    colorA: color(state.colors[0]),
    colorB: color(state.colors[1]),
  }));
  const first = keyframes[0] as Keyframe;
  const choreography = createChoreography(SECTION_STATES);

  const uniforms = {
    uMorph: { value: 0 },
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
  const cameraTarget = new Vector3();

  /** Applies the choreography's pose to the uniforms and the camera, then draws. */
  const render = () => {
    const { pose } = choreography;
    const from = keyframes[pose.from] ?? first;
    const to = keyframes[pose.to] ?? first;
    uniforms.uMorph.value = pose.morph;
    uniforms.uColorA.value.copy(from.colorA).lerp(to.colorA, pose.blend);
    uniforms.uColorB.value.copy(from.colorB).lerp(to.colorB, pose.blend);
    uniforms.uActive.value = pose.cluster;
    uniforms.uActiveAmount.value = pose.highlight;
    camera.position.set(...pose.camera);
    cameraTarget.set(...pose.target);
    camera.lookAt(cameraTarget);
    renderer.render(scene, camera);
  };

  return {
    particles: formations.count,
    choreography,

    resize(width, height, narrow) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      group.position.x = narrow ? 0 : DESKTOP_OFFSET_X;
      group.position.y = narrow ? MOBILE_OFFSET_Y : 0;
    },

    frame(dt) {
      choreography.step(dt);
      uniforms.uTime.value += dt;
      render();
    },

    renderStill(index, cluster) {
      choreography.still(index, cluster);
      uniforms.uTime.value = 0;
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
