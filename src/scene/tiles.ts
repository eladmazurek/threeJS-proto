/**
 * Google Photorealistic 3D Tiles System
 *
 * Streams Google's 3D tile data when zoomed in for high-resolution terrain.
 * Handles coordinate transformation from ECEF (Z-up) to Three.js (Y-up).
 */

import * as THREE from "three";
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
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
  forceShow: false, // When true, show tiles at any altitude
};

/** Transition altitude in scene units (derived from tilesParams.transitionAltitude) */
export let TILES_TRANSITION_ALTITUDE = 0.628; // ~2000km in scene units

/** The tiles renderer instance */
export let tilesRenderer: TilesRenderer | null = null;

/** Parent group for Y rotation (syncs with Earth's rotation) */
export let tilesGroup: THREE.Group | null = null;

/** Minimum altitude above the ellipsoid when tiles are enabled. */
const MIN_ALTITUDE_WITH_TILES = 0.1 * (EARTH_RADIUS / 6371); // ~100m
const TILE_COLLISION_BUFFER = 10 * (EARTH_RADIUS / 6371000); // ~10m
const TILE_COLLISION_CHECK_ALTITUDE_KM = 25;
const SCENE_UNITS_TO_KM = 6371 / EARTH_RADIUS;
const collisionRaycaster = new THREE.Raycaster();
const collisionHits: THREE.Intersection[] = [];
const collisionDirection = new THREE.Vector3();

function hasVisibleTileContent(): boolean {
  if (!tilesRenderer) return false;
  return tilesRenderer.visibleTiles.size > 0 || tilesRenderer.stats.visible > 0;
}

function setEarthMaterialTransparent(transparent: boolean): void {
  if (!earthMaterial || earthMaterial.transparent === transparent) return;

  earthMaterial.transparent = transparent;
  earthMaterial.depthWrite = !transparent;
  earthMaterial.needsUpdate = true;
}

export function updateTilesRenderer(): void {
  tilesRenderer?.update();
}

export function getMinCameraDistanceToLoadedTiles(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3
): number | null {
  if (!tilesParams.enabled || !tilesRenderer || !tilesGroup || !hasVisibleTileContent()) {
    return null;
  }

  const altitudeKm = (camera.position.length() - EARTH_RADIUS) * SCENE_UNITS_TO_KM;
  if (altitudeKm > TILE_COLLISION_CHECK_ALTITUDE_KM) {
    return null;
  }

  collisionDirection.copy(target).sub(camera.position);
  if (collisionDirection.lengthSq() < 1e-10) {
    collisionDirection.copy(camera.position).normalize().negate();
  } else {
    collisionDirection.normalize();
  }
  collisionRaycaster.set(camera.position, collisionDirection);
  collisionRaycaster.near = 0;
  collisionRaycaster.far = Math.max(
    camera.position.distanceTo(target) + EARTH_RADIUS,
    camera.position.length()
  );
  (collisionRaycaster as any).firstHitOnly = true;

  tilesGroup.updateMatrixWorld(true);
  collisionHits.length = 0;
  collisionRaycaster.intersectObject(tilesGroup, true, collisionHits);

  const hit = collisionHits[0];
  if (!hit) {
    return null;
  }

  return hit.point.length() + TILE_COLLISION_BUFFER;
}

/**
 * Estimate local camera clearance above the loaded tile surface directly below.
 * This keeps low-altitude pan speed tied to nearby terrain, not to a distant
 * horizon intersection when the camera is tilted.
 */
export function getCameraSurfaceClearance(camera: THREE.PerspectiveCamera): number {
  collisionDirection.copy(camera.position).normalize().negate();

  if (tilesParams.enabled && tilesRenderer && tilesGroup && hasVisibleTileContent()) {
    collisionRaycaster.set(camera.position, collisionDirection);
    collisionRaycaster.near = 0;
    collisionRaycaster.far = camera.position.length() + EARTH_RADIUS;
    (collisionRaycaster as any).firstHitOnly = true;

    tilesGroup.updateMatrixWorld(true);
    collisionHits.length = 0;
    collisionRaycaster.intersectObject(tilesGroup, true, collisionHits);

    const tileHit = collisionHits[0];
    if (tileHit) {
      return Math.max(tileHit.distance, MIN_ALTITUDE_WITH_TILES);
    }
  }

  return Math.max(camera.position.length() - EARTH_RADIUS, MIN_ALTITUDE_WITH_TILES);
}

function createDracoLoader(): DRACOLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  dracoLoader.preload();
  return dracoLoader;
}

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
  state.tilesLoaded = false;

  // Create tiles renderer
  tilesRenderer = new TilesRenderer();

  // Google tiles are served as Draco-compressed glTF payloads.
  tilesRenderer.registerPlugin(new GLTFExtensionsPlugin({
    dracoLoader: createDracoLoader(),
  }));

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
  tilesRenderer.errorTarget = 12;

  // Keep parent LODs visible while higher-detail children refine to avoid holes.
  tilesRenderer.displayActiveTiles = true;

  // Don't use errorMultiplier with scale - it's already factored into screen-space error
  // The renderer calculates screen-space error which accounts for camera distance

  // Increase max depth to allow loading more detailed tiles
  tilesRenderer.maxDepth = 30;

  // Load more tiles in parallel for better coverage
  tilesRenderer.downloadQueue.maxJobs = 10;
  tilesRenderer.parseQueue.maxJobs = 4;

  // Increase cache size for smoother navigation
  tilesRenderer.lruCache.maxSize = 1600;
  tilesRenderer.lruCache.minSize = 800;

  // Initially hidden until transition threshold
  tilesGroup.visible = false;

  const handleTilesetLoaded = () => {
    state.tilesLoaded = true;
  };

  // Listen for root tileset load
  tilesRenderer.addEventListener('load-tileset', handleTilesetLoaded);
  tilesRenderer.addEventListener('load-root-tileset', handleTilesetLoaded);

  // Error handling
  tilesRenderer.addEventListener('load-error', (event: any) => {
    const err = event.error ?? event;
    console.error('Google 3D Tiles load error:', err, event.url ?? '(unknown)');
  });
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
    setEarthMaterialTransparent(false);
    if (earthMaterial) earthMaterial.uniforms.uOpacity.value = 1.0;
    if (tilesGroup) tilesGroup.visible = false;
    if (earthMesh) earthMesh.visible = true;
    if (cloudMesh) cloudMesh.visible = true;
    if (atmosphereMesh) atmosphereMesh.visible = true;
    return;
  }

  // When forceShow is true, instantly show tiles (factor = 1)
  // Otherwise use altitude-based transition
  const requestedFactor = tilesParams.forceShow ? 1.0 : getTilesTransitionFactor();
  const hasVisibleContent = hasVisibleTileContent();
  const factor = requestedFactor > 0 && hasVisibleContent ? requestedFactor : 0.0;

  // Globe texture opacity (inverse of transition)
  if (earthMaterial) {
    const useTransparentTransition = factor > 0 && factor < 1.0;
    setEarthMaterialTransparent(useTransparentTransition);
    earthMaterial.uniforms.uOpacity.value = useTransparentTransition ? 1.0 - factor : 1.0;
  }

  // Tiles visibility
  if (factor > 0) {
    if (tilesGroup) {
      tilesGroup.visible = true;

      // Sync Y rotation with Earth's rotation on the parent group
      // This keeps tiles aligned with the globe as it rotates
      if (earthMesh) {
        tilesGroup.rotation.y = earthMesh.rotation.y;
        tilesGroup.updateMatrixWorld(true);
      }
    }
  } else {
    if (tilesGroup) tilesGroup.visible = false;
  }

  // Hide the globe completely once tiles are fully active.
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

/** Minimum altitude when tiles are disabled (1000km in scene units) */
const MIN_ALTITUDE_WITHOUT_TILES = 1000 * (EARTH_RADIUS / 6371); // ~0.314 scene units

/**
 * Get minimum camera altitude based on tiles state
 * Returns very small value when tiles are enabled, 1000km otherwise
 */
export function getMinCameraAltitude(): number {
  if (tilesParams.enabled) {
    // Allow street-scale zoom while still keeping a small safety margin above the ellipsoid.
    return MIN_ALTITUDE_WITH_TILES;
  }
  // Tiles disabled - restrict to 1000km
  return MIN_ALTITUDE_WITHOUT_TILES;
}
