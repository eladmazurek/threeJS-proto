/**
 * Particle Flow System - Trail-based Streamlines
 *
 * GPU-accelerated particle system for visualizing wind and ocean currents.
 * Renders continuous streamlines using trail history for each particle.
 */

import * as THREE from "three";
import {
  EARTH_RADIUS,
  PARTICLE_ALTITUDE,
  MAX_PARTICLES,
  PARTICLE_TEXTURE_WIDTH,
  PARTICLE_TEXTURE_HEIGHT,
  TRAIL_POSITIONS,
} from "../constants";
import {
  getWindTexture,
  getOceanTexture,
  requestWindData,
  requestOceanData,
  onWindData,
  onOceanData,
  initWeatherWorker,
} from "./vector-field";

// Import shaders
import advectionShader from "./shaders/advection.glsl";
import trailVertexShader from "./shaders/trail-vertex.glsl";
import trailFragmentShader from "./shaders/trail-fragment.glsl";

// =============================================================================
// TYPES
// =============================================================================

export type FlowType = "wind" | "ocean" | "both";

export interface ParticleParams {
  enabled: boolean;
  flowType: FlowType;
  particleCount: number;
  speedScale: number;
  opacity: number;
  maxAge: number;
  lineWidth: number;
}

interface ParticleSystemState {
  // Ping-pong render targets for particle state (includes trail history)
  stateTextures: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  currentIndex: 0 | 1;

  // Advection pass (render to texture)
  advectionMaterial: THREE.ShaderMaterial;
  advectionScene: THREE.Scene;
  advectionCamera: THREE.OrthographicCamera;
  advectionQuad: THREE.Mesh;

  // Rendering pass - line segments for trails
  trailMesh: THREE.LineSegments;
  trailMaterial: THREE.ShaderMaterial;
  trailGeometry: THREE.BufferGeometry;

  // Placeholder texture
  placeholderTexture: THREE.DataTexture;
}

// =============================================================================
// PARAMS & STATE
// =============================================================================

export const particleParams: ParticleParams = {
  enabled: false,
  flowType: "wind",
  particleCount: MAX_PARTICLES,
  speedScale: 1.0,
  opacity: 0.8,
  maxAge: 6.0, // seconds
  lineWidth: 2.0,
};

let systemState: ParticleSystemState | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let isInitialized = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Create initial particle state with trail history
 * Layout: each particle has TRAIL_POSITIONS consecutive texels
 * Each texel: (lon, lat, age, speed)
 */
function createInitialParticleState(): Float32Array {
  const texelCount = PARTICLE_TEXTURE_WIDTH * PARTICLE_TEXTURE_HEIGHT;
  const data = new Float32Array(texelCount * 4);

  const particlesPerRow = Math.floor(PARTICLE_TEXTURE_WIDTH / TRAIL_POSITIONS);

  for (let row = 0; row < PARTICLE_TEXTURE_HEIGHT; row++) {
    for (let p = 0; p < particlesPerRow; p++) {
      // Random starting position for this particle
      const lon = Math.random();
      const lat = Math.random();
      const age = Math.random(); // Stagger ages

      // Fill all trail positions with same initial position
      for (let t = 0; t < TRAIL_POSITIONS; t++) {
        const texelIdx = row * PARTICLE_TEXTURE_WIDTH + p * TRAIL_POSITIONS + t;
        const idx = texelIdx * 4;

        data[idx] = lon;
        data[idx + 1] = lat;
        data[idx + 2] = age + t * 0.01; // Slight age offset along trail
        data[idx + 3] = 0; // Speed
      }
    }
  }

  return data;
}

/**
 * Create a 1x1 placeholder texture
 */
function createPlaceholderTexture(): THREE.DataTexture {
  const data = new Float32Array([0.5, 0.5, 0, 0]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Create ping-pong render targets for particle state
 */
function createStateRenderTargets(): [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] {
  const options: THREE.RenderTargetOptions = {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthBuffer: false,
    stencilBuffer: false,
  };

  const target0 = new THREE.WebGLRenderTarget(
    PARTICLE_TEXTURE_WIDTH,
    PARTICLE_TEXTURE_HEIGHT,
    options
  );

  const target1 = new THREE.WebGLRenderTarget(
    PARTICLE_TEXTURE_WIDTH,
    PARTICLE_TEXTURE_HEIGHT,
    options
  );

  return [target0, target1];
}

/**
 * Initialize the first render target with particle positions
 */
function initializeStateTexture(target: THREE.WebGLRenderTarget): void {
  const data = createInitialParticleState();
  const dataTexture = new THREE.DataTexture(
    data,
    PARTICLE_TEXTURE_WIDTH,
    PARTICLE_TEXTURE_HEIGHT,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  dataTexture.needsUpdate = true;

  const copyMaterial = new THREE.ShaderMaterial({
    uniforms: { uTexture: { value: dataTexture } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(uTexture, vUv);
      }
    `,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  renderer!.setRenderTarget(target);
  renderer!.render(scene, camera);
  renderer!.setRenderTarget(null);

  copyMaterial.dispose();
  quad.geometry.dispose();
  dataTexture.dispose();
}

/**
 * Create advection materials and scene
 */
function createAdvectionPass(placeholder: THREE.DataTexture): {
  material: THREE.ShaderMaterial;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  quad: THREE.Mesh;
} {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uParticleState: { value: null },
      uVectorField: { value: placeholder },
      uDeltaTime: { value: 0.016 },
      uSpeedScale: { value: particleParams.speedScale },
      uMaxAge: { value: particleParams.maxAge },
      uRespawnRate: { value: 0.01 },
      uTime: { value: 0 },
      uFieldScale: { value: new THREE.Vector2(50, 50) },
      uTrailPositions: { value: TRAIL_POSITIONS },
      uTextureWidth: { value: PARTICLE_TEXTURE_WIDTH },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: advectionShader,
    depthTest: false,
    depthWrite: false,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);

  const scene = new THREE.Scene();
  scene.add(quad);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return { material, scene, camera, quad };
}

/**
 * Create line-based trail rendering geometry and material
 */
function createTrailRenderer(placeholder: THREE.DataTexture): {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.LineSegments;
} {
  const geometry = new THREE.BufferGeometry();

  // Each particle has TRAIL_POSITIONS points, connected by TRAIL_POSITIONS-1 segments
  // For LineSegments, we need 2 vertices per segment
  const segmentsPerParticle = TRAIL_POSITIONS - 1;
  const totalSegments = MAX_PARTICLES * segmentsPerParticle;
  const totalVertices = totalSegments * 2;

  // Attributes: particle index and trail position index
  const particleIndices = new Float32Array(totalVertices);
  const trailIndices = new Float32Array(totalVertices);

  let vertIdx = 0;
  for (let p = 0; p < MAX_PARTICLES; p++) {
    for (let t = 0; t < segmentsPerParticle; t++) {
      // Start of segment
      particleIndices[vertIdx] = p;
      trailIndices[vertIdx] = t;
      vertIdx++;

      // End of segment
      particleIndices[vertIdx] = p;
      trailIndices[vertIdx] = t + 1;
      vertIdx++;
    }
  }

  geometry.setAttribute("aParticleIndex", new THREE.BufferAttribute(particleIndices, 1));
  geometry.setAttribute("aTrailIndex", new THREE.BufferAttribute(trailIndices, 1));

  // Dummy position attribute (required by Three.js)
  const positions = new Float32Array(totalVertices * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  // Material
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uParticleState: { value: placeholder },
      uEarthRadius: { value: EARTH_RADIUS },
      uParticleAltitude: { value: PARTICLE_ALTITUDE },
      uTextureWidth: { value: PARTICLE_TEXTURE_WIDTH },
      uTextureHeight: { value: PARTICLE_TEXTURE_HEIGHT },
      uTrailPositions: { value: TRAIL_POSITIONS },
      uColorSlow: { value: new THREE.Color(0x66bbff) },  // Bright cyan-blue
      uColorFast: { value: new THREE.Color(0xffffff) },  // White
      uMaxSpeed: { value: 0.3 },
      uOpacity: { value: particleParams.opacity },
      uMaxAge: { value: particleParams.maxAge },
    },
    vertexShader: trailVertexShader,
    fragmentShader: trailFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.LineSegments(geometry, material);
  mesh.name = "FlowTrails";
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 1.15;

  return { geometry, material, mesh };
}

/**
 * Initialize the particle system
 */
export function initParticleSystem(webglRenderer: THREE.WebGLRenderer): THREE.LineSegments {
  if (isInitialized && systemState) {
    return systemState.trailMesh;
  }

  renderer = webglRenderer;

  initWeatherWorker();

  const placeholder = createPlaceholderTexture();
  const stateTextures = createStateRenderTargets();

  initializeStateTexture(stateTextures[0]);
  initializeStateTexture(stateTextures[1]);

  const advection = createAdvectionPass(placeholder);
  const trails = createTrailRenderer(placeholder);

  systemState = {
    stateTextures,
    currentIndex: 0,
    advectionMaterial: advection.material,
    advectionScene: advection.scene,
    advectionCamera: advection.camera,
    advectionQuad: advection.quad,
    trailMesh: trails.mesh,
    trailMaterial: trails.material,
    trailGeometry: trails.geometry,
    placeholderTexture: placeholder,
  };

  onWindData((texture) => {
    if (particleParams.flowType === "wind" || particleParams.flowType === "both") {
      systemState!.advectionMaterial.uniforms.uVectorField.value = texture;
      systemState!.advectionMaterial.uniforms.uFieldScale.value.set(50, 50);
    }
  });

  onOceanData((texture) => {
    if (particleParams.flowType === "ocean") {
      systemState!.advectionMaterial.uniforms.uVectorField.value = texture;
      systemState!.advectionMaterial.uniforms.uFieldScale.value.set(5, 5);
    }
  });

  isInitialized = true;
  console.log("[ParticleSystem] Initialized with", MAX_PARTICLES, "particles,", TRAIL_POSITIONS, "trail positions each");

  return systemState.trailMesh;
}

// =============================================================================
// UPDATE LOOP
// =============================================================================

let lastTime = 0;

/**
 * Update particle system (call each frame)
 */
export function updateParticleSystem(elapsedTime: number): void {
  if (!systemState || !renderer || !particleParams.enabled) {
    if (systemState) {
      systemState.trailMesh.visible = false;
    }
    return;
  }

  const deltaTime = Math.min(elapsedTime - lastTime, 0.05);
  lastTime = elapsedTime;

  const windTexture = getWindTexture();
  const oceanTexture = getOceanTexture();

  const needsWind = particleParams.flowType === "wind" || particleParams.flowType === "both";
  const needsOcean = particleParams.flowType === "ocean" || particleParams.flowType === "both";

  if (needsWind && !windTexture) {
    requestWindData();
    systemState.trailMesh.visible = false;
    return;
  }

  if (needsOcean && !oceanTexture) {
    requestOceanData();
    systemState.trailMesh.visible = false;
    return;
  }

  if (particleParams.flowType === "wind" && windTexture) {
    systemState.advectionMaterial.uniforms.uVectorField.value = windTexture;
    systemState.advectionMaterial.uniforms.uFieldScale.value.set(50, 50);
  } else if (particleParams.flowType === "ocean" && oceanTexture) {
    systemState.advectionMaterial.uniforms.uVectorField.value = oceanTexture;
    systemState.advectionMaterial.uniforms.uFieldScale.value.set(5, 5);
  }

  // Ping-pong advection
  const readIndex = systemState.currentIndex;
  const writeIndex = readIndex === 0 ? 1 : 0;

  const readTarget = systemState.stateTextures[readIndex];
  const writeTarget = systemState.stateTextures[writeIndex];

  systemState.advectionMaterial.uniforms.uParticleState.value = readTarget.texture;
  systemState.advectionMaterial.uniforms.uDeltaTime.value = deltaTime;
  systemState.advectionMaterial.uniforms.uSpeedScale.value = particleParams.speedScale;
  systemState.advectionMaterial.uniforms.uMaxAge.value = particleParams.maxAge;
  systemState.advectionMaterial.uniforms.uTime.value = elapsedTime;

  renderer.setRenderTarget(writeTarget);
  renderer.render(systemState.advectionScene, systemState.advectionCamera);
  renderer.setRenderTarget(null);

  systemState.currentIndex = writeIndex as 0 | 1;

  // Update trail rendering
  systemState.trailMaterial.uniforms.uParticleState.value = writeTarget.texture;
  systemState.trailMaterial.uniforms.uOpacity.value = particleParams.opacity;
  systemState.trailMaterial.uniforms.uMaxAge.value = particleParams.maxAge;

  systemState.trailMesh.visible = true;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

export function setParticlesEnabled(enabled: boolean): void {
  particleParams.enabled = enabled;

  if (enabled) {
    if (particleParams.flowType === "wind" || particleParams.flowType === "both") {
      if (!getWindTexture()) requestWindData();
    }
    if (particleParams.flowType === "ocean" || particleParams.flowType === "both") {
      if (!getOceanTexture()) requestOceanData();
    }
  } else if (systemState) {
    systemState.trailMesh.visible = false;
  }
}

export function setFlowType(flowType: FlowType): void {
  particleParams.flowType = flowType;

  if (particleParams.enabled) {
    if (flowType === "wind" || flowType === "both") {
      if (!getWindTexture()) requestWindData();
    }
    if (flowType === "ocean" || flowType === "both") {
      if (!getOceanTexture()) requestOceanData();
    }
  }
}

export function setParticleColors(slow: THREE.Color, fast: THREE.Color): void {
  if (systemState) {
    systemState.trailMaterial.uniforms.uColorSlow.value = slow;
    systemState.trailMaterial.uniforms.uColorFast.value = fast;
  }
}

// =============================================================================
// STATUS
// =============================================================================

export function isParticleSystemReady(): boolean {
  if (!isInitialized || !systemState) return false;

  const needsWind = particleParams.flowType === "wind" || particleParams.flowType === "both";
  const needsOcean = particleParams.flowType === "ocean" || particleParams.flowType === "both";

  if (needsWind && !getWindTexture()) return false;
  if (needsOcean && !getOceanTexture()) return false;

  return true;
}

export function getParticleMesh(): THREE.LineSegments | null {
  return systemState?.trailMesh || null;
}

// =============================================================================
// CLEANUP
// =============================================================================

export function disposeParticleSystem(): void {
  if (!systemState) return;

  systemState.stateTextures[0].dispose();
  systemState.stateTextures[1].dispose();
  systemState.advectionMaterial.dispose();
  systemState.advectionQuad.geometry.dispose();
  systemState.trailMaterial.dispose();
  systemState.trailGeometry.dispose();
  systemState.placeholderTexture.dispose();

  systemState = null;
  isInitialized = false;
}
