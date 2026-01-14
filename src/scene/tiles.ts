/**
 * Google Photorealistic 3D Tiles System
 *
 * Streams Google's 3D tile data when zoomed in for high-resolution terrain.
 * Handles coordinate transformation from ECEF (Z-up) to Three.js (Y-up).
 */

import * as THREE from "three";
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import { EARTH_RADIUS, TILES_SCALE_FACTOR, TILES_TRANSITION_RANGE } from "../constants";
import { state } from "../state";
import type { TilesParams } from "../types";

// =============================================================================
// STATE
// =============================================================================

/** Tiles parameters for GUI control */
export const tilesParams: TilesParams = {
  enabled: false,
  transitionAltitude: 2000, // km, for GUI display
};

/** Transition altitude in scene units (derived from tilesParams.transitionAltitude) */
export let TILES_TRANSITION_ALTITUDE = 0.628; // ~2000km in scene units

/** The tiles renderer instance */
export let tilesRenderer: TilesRenderer | null = null;

/** Parent group for Y rotation (syncs with Earth's rotation) */
export let tilesGroup: THREE.Group | null = null;

// Dependencies that must be set via setTilesDependencies
let earthMesh: THREE.Mesh | null = null;
let earthMaterial: THREE.ShaderMaterial | null = null;
let cloudMesh: THREE.Mesh | null = null;
let atmosphereMesh: THREE.Mesh | null = null;
let cameraRef: THREE.PerspectiveCamera | null = null;

// =============================================================================
// COORDINATE CONVERSION
// =============================================================================

/**
 * Convert WGS84 lat/lon to scene coordinates
 * Handles ECEF (Z-up) to Three.js (Y-up) transformation
 */
export function wgs84ToScene(lat: number, lon: number, altitude: number = 0): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const radius = EARTH_RADIUS + altitude;

  // Standard spherical to cartesian (Y-up)
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Set dependencies that are created after tiles initialization
 */
export function setTilesDependencies(deps: {
  earth: THREE.Mesh;
  earthMaterial: THREE.ShaderMaterial;
  cloud?: THREE.Mesh;
  atmosphere: THREE.Mesh;
  camera: THREE.PerspectiveCamera;
}): void {
  earthMesh = deps.earth;
  earthMaterial = deps.earthMaterial;
  cloudMesh = deps.cloud || null;
  atmosphereMesh = deps.atmosphere;
  cameraRef = deps.camera;
}

/**
 * Initialize Google Photorealistic 3D Tiles
 * Handles coordinate transformation from ECEF (Z-up) to Three.js (Y-up)
 */
export function initGoogleTiles(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  apiKey: string | undefined
): void {
  if (!apiKey) {
    console.warn('Google Tiles API key not found. Set VITE_GOOGLE_TILES_API_KEY in .env.local');
    return;
  }

  cameraRef = camera;

  // Create tiles renderer
  tilesRenderer = new TilesRenderer();

  // Register Google authentication plugin for session management
  tilesRenderer.registerPlugin(new GoogleCloudAuthPlugin({
    apiToken: apiKey,
    autoRefreshToken: true,
  }));

  // Configure renderer with camera and resolution
  tilesRenderer.setCamera(camera);
  tilesRenderer.setResolutionFromRenderer(camera, renderer);

  // =========================================================================
  // COORDINATE TRANSFORMATION: ECEF (Z-up) -> Three.js (Y-up)
  // =========================================================================
  // Use two nested groups to handle rotations correctly:
  // - Parent group (tilesGroup): Y rotation to sync with Earth's rotation
  // - Child group (tilesRenderer.group): X rotation for ECEF to Y-up conversion
  // This avoids Euler angle order issues.
  // =========================================================================

  // Create parent group for Y rotation (syncs with Earth's rotation)
  tilesGroup = new THREE.Group();
  tilesGroup.name = "tilesRotationGroup";
  scene.add(tilesGroup);

  // Add tiles renderer group as child
  tilesGroup.add(tilesRenderer.group);

  // Apply X rotation on the inner group: -90° to convert ECEF Z-up to Y-up
  tilesRenderer.group.rotation.x = -Math.PI / 2;

  // Apply uniform scale from meters to scene units on the inner group
  tilesRenderer.group.scale.setScalar(TILES_SCALE_FACTOR);

  // =========================================================================
  // RENDERER SETTINGS FOR TINY SCALE
  // =========================================================================
  // At our tiny scale (1:3,185,500), we need to adjust several settings:
  // - Error thresholds for LOD selection
  // - Frustum culling behavior
  // - Memory management for tile caching
  // =========================================================================

  // Error target in pixels - lower = sharper/higher detail tiles (default is 6)
  tilesRenderer.errorTarget = 10;

  // Don't use errorMultiplier with scale - it's already factored into screen-space error
  // The renderer calculates screen-space error which accounts for camera distance

  // Increase max depth to allow loading more detailed tiles
  tilesRenderer.maxDepth = 30;

  // Load more tiles in parallel for better coverage
  tilesRenderer.downloadQueue.maxJobs = 10;
  tilesRenderer.parseQueue.maxJobs = 4;

  // Increase cache size for smoother navigation
  tilesRenderer.lruCache.maxSize = 800;
  tilesRenderer.lruCache.minSize = 400;

  // Initially hidden until transition threshold
  tilesGroup.visible = false;

  // Listen for root tileset load
  tilesRenderer.addEventListener('load-tileset', () => {
    state.tilesLoaded = true;
    console.log('Google 3D Tiles root tileset loaded');
  });

  // Error handling
  tilesRenderer.addEventListener('load-error', (error) => {
    console.error('Google 3D Tiles load error:', error);
  });

  console.log('Google 3D Tiles initialized with ECEF->Y-up transformation');
}

// =============================================================================
// UPDATE FUNCTIONS
// =============================================================================

/**
 * Get camera altitude above Earth surface in scene units
 */
export function getCameraAltitudeForTiles(): number {
  if (!cameraRef) return Infinity;
  return cameraRef.position.length() - EARTH_RADIUS;
}

/**
 * Calculate transition factor for crossfade (0 = globe texture, 1 = tiles)
 * Uses quintic smoothstep for gradual, smooth blending
 */
export function getTilesTransitionFactor(): number {
  const altitude = getCameraAltitudeForTiles();

  // Above transition + range: show globe texture (factor 0)
  // Below transition: show tiles (factor 1)
  const transitionStart = TILES_TRANSITION_ALTITUDE + TILES_TRANSITION_RANGE;
  const transitionEnd = TILES_TRANSITION_ALTITUDE;

  if (altitude >= transitionStart) return 0;
  if (altitude <= transitionEnd) return 1;

  // Linear interpolation
  const t = 1 - (altitude - transitionEnd) / TILES_TRANSITION_RANGE;

  // Quintic smoothstep: 6t⁵ - 15t⁴ + 10t³ (zero velocity & acceleration at endpoints)
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Update crossfade between globe texture and 3D tiles
 */
export function updateTilesCrossfade(): void {
  if (!tilesParams.enabled || !tilesRenderer) {
    // Tiles disabled - show full globe
    if (earthMaterial) earthMaterial.uniforms.uOpacity.value = 1.0;
    if (tilesGroup) tilesGroup.visible = false;
    if (earthMesh) earthMesh.visible = true;
    return;
  }

  const factor = getTilesTransitionFactor();

  // Globe texture opacity (inverse of transition)
  if (earthMaterial) {
    earthMaterial.uniforms.uOpacity.value = 1.0 - factor;
  }

  // Tiles visibility
  if (factor > 0 && state.tilesLoaded) {
    if (tilesGroup) {
      tilesGroup.visible = true;

      // Sync Y rotation with Earth's rotation on the parent group
      // This keeps tiles aligned with the globe as it rotates
      if (earthMesh) {
        tilesGroup.rotation.y = earthMesh.rotation.y;
      }
    }
  } else {
    if (tilesGroup) tilesGroup.visible = false;
  }

  // Hide globe mesh completely when tiles are fully visible (optimization)
  if (earthMesh) {
    earthMesh.visible = factor < 1.0;
  }

  // Fade out overlays when tiles are dominant to prevent z-fighting
  if (cloudMesh) {
    cloudMesh.visible = factor < 0.5;
  }
  if (atmosphereMesh) {
    atmosphereMesh.visible = factor < 0.8;
  }
}

/**
 * Update Google Tiles attribution display
 */
export function updateTilesAttribution(): void {
  const attributionEl = document.getElementById('tiles-attribution');
  const textEl = document.getElementById('tiles-attribution-text');

  if (!attributionEl || !textEl) return;

  if (tilesParams.enabled && tilesGroup && tilesGroup.visible) {
    // Get attributions from tiles renderer
    const attributions = tilesRenderer ? tilesRenderer.getAttributions() : [];

    if (attributions && attributions.length > 0) {
      // Combine attribution strings
      const text = attributions
        .filter((attr: any) => attr.type === 'string' || typeof attr === 'string')
        .map((attr: any) => typeof attr === 'string' ? attr : attr.value)
        .join(' | ');

      textEl.textContent = text || 'Google';
    } else {
      textEl.textContent = 'Google';
    }
    attributionEl.classList.remove('hidden');
  } else {
    attributionEl.classList.add('hidden');
  }
}

/**
 * Update the transition altitude from GUI
 */
export function setTransitionAltitude(altitudeKm: number): void {
  tilesParams.transitionAltitude = altitudeKm;
  TILES_TRANSITION_ALTITUDE = altitudeKm * (EARTH_RADIUS / 6371);
}

/**
 * Get preload altitude threshold for tile loading
 */
export function getTilesPreloadAltitude(): number {
  return TILES_TRANSITION_ALTITUDE + TILES_TRANSITION_RANGE + 0.3; // ~1000km buffer
}
