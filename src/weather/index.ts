/**
 * Weather System
 *
 * Real weather data visualization with NASA GIBS imagery
 * and particle-based wind/ocean current flow visualization.
 *
 * Main exports:
 * - GIBS overlay (clouds, precipitation)
 * - Particle flow system (wind, ocean currents)
 */

import * as THREE from "three";

// GIBS Overlay
export {
  createGibsOverlay,
  updateGibsOverlay,
  setGibsEnabled,
  setGibsLayer,
  setGibsOpacity,
  loadGibsLayer,
  getOverlayStatus,
  isGibsLoading,
  disposeGibsOverlay,
  gibsParams,
  type GibsOverlayRefs,
  type GibsParams,
} from "./gibs-overlay";

export { type GibsLayer } from "./gibs-feed";

// Particle System
export {
  initParticleSystem,
  updateParticleSystem,
  setParticlesEnabled,
  setFlowType,
  setParticleColors,
  isParticleSystemReady,
  getParticleMesh,
  disposeParticleSystem,
  particleParams,
  type ParticleParams,
  type FlowType,
} from "./particle-system";

// Vector Field (for advanced use)
export {
  initWeatherWorker,
  requestWindData,
  requestOceanData,
  getWindTexture,
  getOceanTexture,
  getVectorFieldStatus,
  hasVectorFieldData,
  disposeVectorField,
  windFieldState,
  oceanFieldState,
} from "./vector-field";

// =============================================================================
// COMBINED STATUS
// =============================================================================

export interface WeatherSystemStatus {
  gibs: {
    enabled: boolean;
    loading: boolean;
    status: string;
  };
  particles: {
    enabled: boolean;
    ready: boolean;
    flowType: string;
  };
  wind: {
    loading: boolean;
    status: string;
  };
  ocean: {
    loading: boolean;
    status: string;
  };
}

// Import for local use (these are also re-exported above)
import { gibsParams, getOverlayStatus, isGibsLoading, createGibsOverlay, updateGibsOverlay, disposeGibsOverlay } from "./gibs-overlay";
import { particleParams, isParticleSystemReady, initParticleSystem, updateParticleSystem, disposeParticleSystem } from "./particle-system";
import { windFieldState, oceanFieldState, getVectorFieldStatus, disposeVectorField } from "./vector-field";

/**
 * Get combined status of all weather systems
 */
export function getWeatherSystemStatus(): WeatherSystemStatus {
  return {
    gibs: {
      enabled: gibsParams.enabled,
      loading: isGibsLoading(),
      status: getOverlayStatus(),
    },
    particles: {
      enabled: particleParams.enabled,
      ready: isParticleSystemReady(),
      flowType: particleParams.flowType,
    },
    wind: {
      loading: windFieldState.loading,
      status: getVectorFieldStatus("wind"),
    },
    ocean: {
      loading: oceanFieldState.loading,
      status: getVectorFieldStatus("ocean"),
    },
  };
}

/**
 * Check if any weather component is currently loading
 */
export function isWeatherLoading(): boolean {
  return (
    isGibsLoading() ||
    windFieldState.loading ||
    oceanFieldState.loading
  );
}

// =============================================================================
// INITIALIZATION HELPER
// =============================================================================

export interface WeatherSystemRefs {
  gibsOverlay: THREE.Mesh;
  particleMesh: THREE.LineSegments;
}

/**
 * Initialize the complete weather system
 *
 * @param renderer - WebGL renderer (needed for particle system)
 * @param sunDirection - Sun direction vector for GIBS day/night
 * @returns References to weather meshes
 */
export function initWeatherSystem(
  renderer: THREE.WebGLRenderer,
  sunDirection: THREE.Vector3
): WeatherSystemRefs {
  // Create GIBS overlay
  const { mesh: gibsOverlay } = createGibsOverlay(sunDirection);

  // Initialize particle system
  const particleMesh = initParticleSystem(renderer);

  console.log("[WeatherSystem] Initialized");

  return { gibsOverlay, particleMesh };
}

/**
 * Update weather system (call each frame)
 */
export function updateWeatherSystem(deltaTime: number, elapsedTime: number): void {
  // Update GIBS overlay (crossfade, etc.)
  updateGibsOverlay(deltaTime);

  // Update particle system (advection)
  updateParticleSystem(elapsedTime);
}

/**
 * Dispose of all weather resources
 */
export function disposeWeatherSystem(): void {
  disposeGibsOverlay();
  disposeParticleSystem();
  disposeVectorField();
  console.log("[WeatherSystem] Disposed");
}
