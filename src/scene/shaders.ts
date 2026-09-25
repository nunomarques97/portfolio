// GLSL for the particle field (see "3D scene concept" in docs/design/DESIGN.md). three.js prepends the version,
// precision and the attribute/varying/gl_FragColor compatibility defines for WebGL 2.

export const vertexShader = /* glsl */ `
attribute vec3 aConstellation;
attribute vec3 aLattice;
attribute vec3 aStream;
attribute float aSeed;
attribute float aCluster;
attribute float aBeacon;

uniform float uMorph;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uActive;
uniform float uActiveAmount;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec3 vColor;
varying float vAlpha;

// Progress of the morph out of formation k, staggered per particle by its seed.
float stage(float k) {
  float t = clamp((uMorph - k) * 1.5 - aSeed * 0.5, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  vec3 pos = position;
  pos = mix(pos, aConstellation, stage(0.0));
  pos = mix(pos, aLattice, stage(1.0));
  pos = mix(pos, aStream, stage(2.0));

  // Outward turbulence while between formations, and a slow shimmer.
  float between = sin(fract(uMorph) * 3.14159265);
  pos += normalize(pos + 0.0001) * between * (0.25 + aSeed * 0.6);
  pos += 0.035 * sin(uTime * 0.7 + aSeed * 40.0 + pos.yzx * 1.7);

  // The core spins slowly; the spin fades out as it leaves the core formation.
  float spin = uTime * 0.08 * (1.0 - clamp(uMorph, 0.0, 1.0));
  pos.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * pos.xz;

  float constellation = 1.0 - abs(clamp(uMorph, 0.0, 2.0) - 1.0);
  float highlight = step(abs(aCluster - uActive), 0.1) * uActiveAmount * constellation;
  float beacon = aBeacon * clamp(uMorph - 2.0, 0.0, 1.0);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float size = uSize * (0.35 + aSeed * 0.9) * (1.0 + highlight * 0.5 + beacon * 1.5);
  gl_PointSize = size * uPixelRatio / -mvPosition.z;

  vec3 color = mix(uColorA, uColorB, aSeed);
  color = mix(color, vec3(1.0), highlight * 0.3);
  vColor = mix(color, vec3(1.0, 0.78, 0.3), beacon);
  float dim = constellation * 0.45 * uActiveAmount * (1.0 - highlight);
  vAlpha = (0.5 + 0.5 * aSeed) * (1.0 - dim) + beacon * 0.5;
}
`;

export const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.0, d);
  alpha = alpha * alpha * 0.9 + smoothstep(0.12, 0.0, d) * 0.6;
  gl_FragColor = vec4(vColor * 1.35, alpha * vAlpha);
}
`;
