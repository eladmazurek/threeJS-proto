/**
 * Cloud Layer
 *
 * Renders clouds as a separate transparent layer for proper depth ordering.
 * Ships appear below clouds, aircraft appear above them.
 */

import * as THREE from "three";
import { EARTH_RADIUS } from "../constants";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Cloud altitude above Earth surface (between ships and aircraft) */
export const CLOUD_ALTITUDE = 0.008;

// =============================================================================
// CLOUD SHADERS
// =============================================================================

/** Cloud layer vertex shader */
const CLOUD_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Cloud layer fragment shader */
const CLOUD_FRAGMENT_SHADER = `
  uniform sampler2D uCloudsTexture;
  uniform float uCloudsIntensity;
  uniform vec3 uSunDirection;

  varying vec2 vUv;

  void main() {
    // Sample cloud coverage from green channel
    float clouds = texture2D(uCloudsTexture, vUv).g;

    // Calculate basic day/night based on normal (approximate from UV)
    vec3 normal = normalize(vec3(
      -sin(vUv.y * 3.14159) * cos(vUv.x * 6.28318),
      cos(vUv.y * 3.14159),
      sin(vUv.y * 3.14159) * sin(vUv.x * 6.28318)
    ));
    float dayMix = smoothstep(-0.2, 0.4, dot(normal, uSunDirection));

    // Clouds only visible on day side
    float cloudAlpha = clouds * uCloudsIntensity * dayMix * 0.9;

    gl_FragColor = vec4(1.0, 1.0, 1.0, cloudAlpha);
  }
`;

// =============================================================================
// CLOUD MESH
// =============================================================================

/** Cloud mesh references */
export interface CloudMeshRefs {
  geometry: THREE.SphereGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
}

/**
 * Create the cloud layer mesh.
 */
export function createCloudLayer(
  cloudsTexture: THREE.Texture,
  sunDirection: THREE.Vector3,
  intensity: number = 0.08
): CloudMeshRefs {
  const geometry = new THREE.SphereGeometry(
    EARTH_RADIUS + CLOUD_ALTITUDE,
    64,
    64
  );

  const material = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERTEX_SHADER,
    fragmentShader: CLOUD_FRAGMENT_SHADER,
    uniforms: {
      uCloudsTexture: { value: cloudsTexture },
      uCloudsIntensity: { value: intensity },
      uSunDirection: { value: sunDirection.clone().normalize() },
    },
    transparent: true,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1.5; // Between ships (1) and aircraft (2)

  return { geometry, material, mesh };
}

/**
 * Update cloud intensity.
 */
export function setCloudIntensity(
  material: THREE.ShaderMaterial,
  intensity: number
): void {
  material.uniforms.uCloudsIntensity.value = intensity;
}

/**
 * Sync cloud layer sun direction.
 */
export function syncCloudSun(
  material: THREE.ShaderMaterial,
  sunDirection: THREE.Vector3
): void {
  material.uniforms.uSunDirection.value = sunDirection.clone().normalize();
}

/**
 * Update cloud texture.
 */
export function setCloudTexture(
  material: THREE.ShaderMaterial,
  texture: THREE.Texture
): void {
  material.uniforms.uCloudsTexture.value = texture;
}
