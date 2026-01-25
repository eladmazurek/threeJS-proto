/**
 * GIBS Overlay
 *
 * Renders NASA GIBS weather imagery as a spherical overlay on the globe.
 * Supports cloud cover and precipitation layers with crossfade transitions.
 */

import * as THREE from "three";
import { EARTH_RADIUS, GIBS_ALTITUDE } from "../constants";
import gibsVertexShader from "./shaders/gibs-vertex.glsl";
import gibsFragmentShader from "./shaders/gibs-fragment.glsl";
import {
  fetchGibsTile,
  getGibsTexture,
  getPendingGibsTexture,
  commitPendingTexture,
  scheduleGibsRefresh,
  stopGibsRefresh,
  getGibsStatus,
  gibsLoadingState,
  type GibsLayer,
} from "./gibs-feed";

// =============================================================================
// TYPES
// =============================================================================

export interface GibsOverlayRefs {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

export interface GibsParams {
  enabled: boolean;
  layer: GibsLayer;
  opacity: number;
  autoRefresh: boolean;
}

// =============================================================================
// STATE
// =============================================================================

export const gibsParams: GibsParams = {
  enabled: false,
  layer: "clouds",
  opacity: 0.8,
  autoRefresh: true,
};

let overlayRefs: GibsOverlayRefs | null = null;
let crossfadeProgress = 0;
let isCrossfading = false;

// Placeholder texture (1x1 transparent)
let placeholderTexture: THREE.DataTexture | null = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Create placeholder texture for initial state
 */
function getPlaceholderTexture(): THREE.DataTexture {
  if (!placeholderTexture) {
    const data = new Uint8Array([0, 0, 0, 0]);
    placeholderTexture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    placeholderTexture.needsUpdate = true;
  }
  return placeholderTexture;
}

/**
 * Create the GIBS overlay mesh and material
 */
export function createGibsOverlay(sunDirection: THREE.Vector3): GibsOverlayRefs {
  // Sphere geometry slightly above Earth surface
  const radius = EARTH_RADIUS + GIBS_ALTITUDE;
  const geometry = new THREE.SphereGeometry(radius, 64, 32);

  // Shader material
  const material = new THREE.ShaderMaterial({
    vertexShader: gibsVertexShader,
    fragmentShader: gibsFragmentShader,
    uniforms: {
      uGibsTexture: { value: getPlaceholderTexture() },
      uPendingTexture: { value: getPlaceholderTexture() },
      uHasPendingTexture: { value: false },
      uOpacity: { value: gibsParams.opacity },
      uCrossfade: { value: 0.0 },
      uSunDirection: { value: sunDirection },
    },
    transparent: true,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "GibsOverlay";
  mesh.visible = false; // Hidden until data loads
  mesh.renderOrder = 1.1; // Between earth and clouds

  overlayRefs = { mesh, material };
  return overlayRefs;
}

// =============================================================================
// TEXTURE MANAGEMENT
// =============================================================================

/**
 * Update the overlay with a new texture
 */
function applyTexture(texture: THREE.Texture): void {
  if (!overlayRefs) return;

  const { material } = overlayRefs;

  // Direct replacement (no crossfade for simplicity)
  material.uniforms.uGibsTexture.value = texture;
  material.uniforms.uHasPendingTexture.value = false;
  material.uniforms.uCrossfade.value = 0;
  isCrossfading = false;
  crossfadeProgress = 0;
}

/**
 * Load GIBS data for the current layer
 */
export async function loadGibsLayer(): Promise<void> {
  if (!gibsParams.enabled) return;

  try {
    const texture = await fetchGibsTile(gibsParams.layer);
    applyTexture(texture);

    // Show mesh once we have data
    if (overlayRefs) {
      overlayRefs.mesh.visible = true;
    }
  } catch (error) {
    console.error("[GibsOverlay] Failed to load layer:", error);
  }
}

// =============================================================================
// UPDATE LOOP
// =============================================================================

/**
 * Update GIBS overlay (call each frame)
 */
export function updateGibsOverlay(deltaTime: number): void {
  if (!overlayRefs) return;

  const { mesh, material } = overlayRefs;

  // Handle enabled state
  if (!gibsParams.enabled) {
    mesh.visible = false;
    return;
  }

  // Show loading state if no texture yet
  const texture = getGibsTexture();
  if (!texture && !gibsLoadingState.loading) {
    // Trigger initial load
    loadGibsLayer();
    return;
  }

  // Update opacity
  material.uniforms.uOpacity.value = gibsParams.opacity;

  // Handle crossfade animation (currently disabled - using direct replacement)
  if (isCrossfading) {
    crossfadeProgress += deltaTime * 2; // 0.5 second crossfade

    if (crossfadeProgress >= 1) {
      // Crossfade complete
      const pendingTexture = getPendingGibsTexture();
      if (pendingTexture) {
        material.uniforms.uGibsTexture.value = pendingTexture;
        commitPendingTexture();
      }
      material.uniforms.uHasPendingTexture.value = false;
      material.uniforms.uCrossfade.value = 0;
      isCrossfading = false;
      crossfadeProgress = 0;
    } else {
      material.uniforms.uCrossfade.value = crossfadeProgress;
    }
  }

  // Show mesh if we have data
  mesh.visible = texture !== null;
}

// =============================================================================
// LAYER SWITCHING
// =============================================================================

// Track the currently loaded layer (separate from gibsParams which GUI updates directly)
let loadedLayer: GibsLayer | null = null;

/**
 * Switch to a different GIBS layer
 */
export async function setGibsLayer(layer: GibsLayer): Promise<void> {
  // Check against what's actually loaded, not gibsParams (which GUI updates before onChange)
  if (loadedLayer === layer) return;

  gibsParams.layer = layer;

  if (gibsParams.enabled) {
    // Stop existing refresh and reload
    stopGibsRefresh();
    await loadGibsLayer();
    loadedLayer = layer;

    // Restart auto-refresh if enabled
    if (gibsParams.autoRefresh) {
      scheduleGibsRefresh(layer);
    }
  }
}

/**
 * Enable/disable GIBS overlay
 */
export async function setGibsEnabled(enabled: boolean): Promise<void> {
  gibsParams.enabled = enabled;

  if (enabled) {
    // Load data and start refresh
    await loadGibsLayer();
    loadedLayer = gibsParams.layer;
    if (gibsParams.autoRefresh) {
      scheduleGibsRefresh(gibsParams.layer);
    }
  } else {
    // Hide and stop refresh
    loadedLayer = null;
    if (overlayRefs) {
      overlayRefs.mesh.visible = false;
    }
    stopGibsRefresh();
  }
}

/**
 * Set overlay opacity
 */
export function setGibsOpacity(opacity: number): void {
  gibsParams.opacity = opacity;
  if (overlayRefs) {
    overlayRefs.material.uniforms.uOpacity.value = opacity;
  }
}

// =============================================================================
// STATUS
// =============================================================================

/**
 * Get current status for GUI display
 */
export function getOverlayStatus(): string {
  return getGibsStatus();
}

/**
 * Check if GIBS is currently loading
 */
export function isGibsLoading(): boolean {
  return gibsLoadingState.loading;
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Dispose of overlay resources
 */
export function disposeGibsOverlay(): void {
  if (overlayRefs) {
    overlayRefs.mesh.geometry?.dispose();
    overlayRefs.material.dispose();
    overlayRefs = null;
  }

  if (placeholderTexture) {
    placeholderTexture.dispose();
    placeholderTexture = null;
  }

  stopGibsRefresh();
}
