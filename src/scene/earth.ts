/**
 * Earth Rendering
 *
 * Creates and configures the Earth sphere, atmosphere, and textures.
 */

import * as THREE from "three";
import { EARTH_RADIUS, ATMOSPHERE_SCALE } from "../constants";

// Import shaders (compiled by vite-plugin-glsl)
import earthVertexShader from "../shaders/earth/vertex.glsl";
import earthFragmentShader from "../shaders/earth/fragment.glsl";

// =============================================================================
// TEXTURE PRESETS
// =============================================================================

/** Texture preset definition */
export interface TexturePreset {
  day: string;
  night: string;
  specularClouds: string;
  description: string;
}

/** Available texture presets */
export const TEXTURE_PRESETS: Record<string, TexturePreset> = {
  Standard: {
    day: "earth/day.jpg",
    night: "earth/night.jpg",
    specularClouds: "earth/specularClouds.jpg",
    description: "Default Earth textures",
  },
  "Black Marble (NASA)": {
    day: "earth/blackmarble_night.jpg",
    night: "earth/blackmarble_night.jpg",
    specularClouds: "earth/specularClouds.jpg",
    description: "NASA night imagery - city lights",
  },
  "Blue Marble (NASA)": {
    day: "earth/bluemarble_day.jpg",
    night: "earth/night.jpg",
    specularClouds: "earth/specularClouds.jpg",
    description: "NASA true color day imagery",
  },
  "Topo + Bathymetry": {
    day: "earth/topo_bathymetry.jpg",
    night: "earth/night.jpg",
    specularClouds: "earth/specularClouds.jpg",
    description: "Elevation + ocean depth",
  },
};

// =============================================================================
// TEXTURE LOADING
// =============================================================================

const textureLoader = new THREE.TextureLoader();
const textureCache: Record<string, THREE.Texture> = {};

/**
 * Load a texture with caching.
 */
export function loadTexture(path: string, isSRGB = true): THREE.Texture {
  if (textureCache[path]) {
    return textureCache[path];
  }

  // Prepend base URL for deployment
  const fullPath = import.meta.env.BASE_URL + path;

  const texture = textureLoader.load(
    fullPath,
    (tex) => {
      console.log(`Loaded texture: ${path}`);
    },
    undefined,
    (err) => {
      console.warn(`Failed to load texture: ${path}. Using fallback.`);
    }
  );

  if (isSRGB) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }

  textureCache[path] = texture;
  return texture;
}

// =============================================================================
// EARTH PARAMETERS
// =============================================================================

/** Earth rendering parameters (GUI-controlled) */
export interface EarthParams {
  atmosphereDayColor: string;
  atmosphereTwilightColor: string;
  atmosphereIntensity: number;
  cloudsIntensity: number;
  sunDirectionX: number;
  sunDirectionY: number;
  sunDirectionZ: number;
  specularIntensity: number;
  specularSharpness: number;
  specularGlowSize: number;
}

/** Default earth parameters */
export const DEFAULT_EARTH_PARAMS: EarthParams = {
  atmosphereDayColor: "#4a90c2",
  atmosphereTwilightColor: "#1a3a5c",
  atmosphereIntensity: 0.12,
  cloudsIntensity: 0.08,
  sunDirectionX: -1.0,
  sunDirectionY: 0.5,
  sunDirectionZ: 1.0,
  specularIntensity: 0.3,
  specularSharpness: 800.0,
  specularGlowSize: 200.0,
};

// =============================================================================
// EARTH MESH
// =============================================================================

/** Earth mesh references */
export interface EarthMeshRefs {
  geometry: THREE.SphereGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  dayTexture: THREE.Texture;
  nightTexture: THREE.Texture;
  specularCloudsTexture: THREE.Texture;
}

/**
 * Create the Earth mesh with shader material.
 */
export function createEarth(params: EarthParams = DEFAULT_EARTH_PARAMS): EarthMeshRefs {
  // Load initial textures
  const dayTexture = loadTexture("earth/day.jpg", true);
  const nightTexture = loadTexture("earth/night.jpg", true);
  const specularCloudsTexture = loadTexture("earth/specularClouds.jpg", false);

  // Create sphere geometry
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);

  // Create shader material
  const material = new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    uniforms: {
      uDayTexture: { value: dayTexture },
      uNightTexture: { value: nightTexture },
      uSpecularCloudsTexture: { value: specularCloudsTexture },
      uSunDirection: {
        value: new THREE.Vector3(
          params.sunDirectionX,
          params.sunDirectionY,
          params.sunDirectionZ
        ).normalize(),
      },
      uAtmosphereDayColor: { value: new THREE.Color(params.atmosphereDayColor) },
      uAtmosphereTwilightColor: { value: new THREE.Color(params.atmosphereTwilightColor) },
      uAtmosphereDayMix: { value: 0.1 },
      uAtmosphereTwilightMix: { value: 0.15 },
      uCloudsIntensity: { value: params.cloudsIntensity },
      uSpecularIntensity: { value: params.specularIntensity },
      uSpecularSharpness: { value: params.specularSharpness },
      uSpecularGlowSize: { value: params.specularGlowSize },
      uColorMode: { value: 0 },
      uNightBlend: { value: 1.0 },
      uOpacity: { value: 1.0 },
    },
    transparent: true,
  });

  const mesh = new THREE.Mesh(geometry, material);

  return {
    geometry,
    material,
    mesh,
    dayTexture,
    nightTexture,
    specularCloudsTexture,
  };
}

/**
 * Update Earth sun direction.
 */
export function updateSunDirection(
  material: THREE.ShaderMaterial,
  x: number,
  y: number,
  z: number
): void {
  const sunDir = new THREE.Vector3(x, y, z).normalize();
  material.uniforms.uSunDirection.value = sunDir;
}

/**
 * Update Earth opacity (for 3D tiles crossfade).
 */
export function updateEarthOpacity(
  material: THREE.ShaderMaterial,
  opacity: number
): void {
  material.uniforms.uOpacity.value = opacity;
}

// =============================================================================
// ATMOSPHERE MESH
// =============================================================================

/** Atmosphere mesh references */
export interface AtmosphereMeshRefs {
  geometry: THREE.SphereGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
}

/** Atmosphere vertex shader (inline for simplicity) */
const ATMOSPHERE_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Atmosphere fragment shader (inline for simplicity) */
const ATMOSPHERE_FRAGMENT_SHADER = `
  uniform vec3 uSunDirection;
  uniform vec3 uDayColor;
  uniform vec3 uTwilightColor;
  uniform float uIntensity;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    vec3 normal = normalize(vNormal);

    // Soft fresnel - gradual glow at edges
    float fresnel = 1.0 - dot(viewDirection, normal);
    fresnel = pow(fresnel, 4.0);
    fresnel = smoothstep(0.0, 1.0, fresnel);

    // Sun orientation for color mixing
    float sunOrientation = dot(normal, uSunDirection);
    float colorMix = smoothstep(-0.3, 0.6, sunOrientation);

    // Blend between twilight and day colors
    vec3 atmosphereColor = mix(uTwilightColor, uDayColor, colorMix);

    // Soft visibility falloff
    float visibility = 0.5 + 0.5 * smoothstep(-0.5, 0.3, sunOrientation);

    float alpha = fresnel * uIntensity * visibility;

    gl_FragColor = vec4(atmosphereColor, alpha);
  }
`;

/**
 * Create the atmosphere glow mesh.
 */
export function createAtmosphere(
  params: EarthParams = DEFAULT_EARTH_PARAMS
): AtmosphereMeshRefs {
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS * ATMOSPHERE_SCALE, 64, 64);

  const material = new THREE.ShaderMaterial({
    vertexShader: ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
    uniforms: {
      uSunDirection: {
        value: new THREE.Vector3(
          params.sunDirectionX,
          params.sunDirectionY,
          params.sunDirectionZ
        ).normalize(),
      },
      uDayColor: { value: new THREE.Color(params.atmosphereDayColor) },
      uTwilightColor: { value: new THREE.Color(params.atmosphereTwilightColor) },
      uIntensity: { value: params.atmosphereIntensity },
    },
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);

  return { geometry, material, mesh };
}

/**
 * Sync atmosphere sun direction with earth.
 */
export function syncAtmosphereSun(
  atmosphereMaterial: THREE.ShaderMaterial,
  sunDirection: THREE.Vector3
): void {
  atmosphereMaterial.uniforms.uSunDirection.value = sunDirection.clone();
}

// =============================================================================
// TEXTURE PRESET SWITCHING
// =============================================================================

/**
 * Switch to a different texture preset.
 */
export function switchTexturePreset(
  presetName: string,
  earthMaterial: THREE.ShaderMaterial,
  cloudMaterial?: THREE.ShaderMaterial,
  renderer?: THREE.WebGLRenderer
): void {
  const preset = TEXTURE_PRESETS[presetName];
  if (!preset) {
    console.warn(`Unknown texture preset: ${presetName}`);
    return;
  }

  console.log(`Switching to texture preset: ${presetName}`);

  // Load and apply textures
  const dayTex = loadTexture(preset.day, true);
  const nightTex = loadTexture(preset.night, true);
  const specCloudsTex = loadTexture(preset.specularClouds, false);

  // Update Earth material uniforms
  earthMaterial.uniforms.uDayTexture.value = dayTex;
  earthMaterial.uniforms.uNightTexture.value = nightTex;
  earthMaterial.uniforms.uSpecularCloudsTexture.value = specCloudsTex;

  // Update cloud layer if provided
  if (cloudMaterial) {
    cloudMaterial.uniforms.uCloudsTexture.value = specCloudsTex;
  }

  // Update anisotropic filtering
  if (renderer) {
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    dayTex.anisotropy = maxAniso;
    nightTex.anisotropy = maxAniso;
    specCloudsTex.anisotropy = maxAniso;
  }
}

// =============================================================================
// COLOR MODES
// =============================================================================

/** Available color modes */
export const COLOR_MODES = {
  normal: 0,
  grayscale: 1,
  nightVision: 2,
  thermal: 3,
  hologram: 4,
} as const;

export type ColorMode = keyof typeof COLOR_MODES;

/**
 * Set the color mode on the Earth material.
 */
export function setColorMode(
  material: THREE.ShaderMaterial,
  mode: ColorMode
): void {
  material.uniforms.uColorMode.value = COLOR_MODES[mode];
}

/**
 * Set night blend value (0 = day only, 1 = day/night blend).
 */
export function setNightBlend(
  material: THREE.ShaderMaterial,
  blend: number
): void {
  material.uniforms.uNightBlend.value = blend;
}
