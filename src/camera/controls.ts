/**
 * Camera Controls Module
 *
 * Manages camera tilt and view angle parameters.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EARTH_RADIUS } from "../constants";
import type { CameraParams } from "../types";

// =============================================================================
// STATE
// =============================================================================

/** Camera/view parameters */
export const cameraParams: CameraParams = {
  tiltAngle: 0, // Default tilt in degrees (0 = looking at center, 90 = looking at horizon)
  autoRotate: false,
  autoRotateSpeed: 0.5,
};

// Module-level references (set via initCameraModule)
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the camera module with references to camera and controls.
 * Must be called after camera and controls are created.
 */
export function initCameraModule(
  cameraRef: THREE.PerspectiveCamera,
  controlsRef: OrbitControls
): void {
  camera = cameraRef;
  controls = controlsRef;
}

// =============================================================================
// CAMERA FUNCTIONS
// =============================================================================

/**
 * Set camera tilt angle (view angle).
 *
 * @param degrees - Tilt angle (0 = looking at center, 90 = looking toward horizon)
 *
 * 0 = looking straight at Earth center (default globe view)
 * 90 = looking toward horizon (good for watching aircraft fly by)
 *
 * Works by offsetting the OrbitControls target from Earth center.
 */
export function setCameraTilt(degrees: number): void {
  if (!camera || !controls) {
    console.warn("Camera module not initialized. Call initCameraModule first.");
    return;
  }

  // Clamp to valid range
  const tilt = Math.max(0, Math.min(85, degrees));
  cameraParams.tiltAngle = tilt;

  // Calculate target offset based on tilt
  // At tilt=0, look at center. At tilt=90, look at a point near surface level
  const tiltFactor = tilt / 90;

  // Get direction from Earth center to camera
  const cameraDir = camera.position.clone().normalize();

  // Calculate a "up" vector tangent to Earth surface at camera's ground point
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, cameraDir).normalize();
  const surfaceUp = new THREE.Vector3().crossVectors(cameraDir, right).normalize();

  // Offset target upward (in surface tangent direction) based on tilt
  // More tilt = look higher toward horizon
  const targetOffset = surfaceUp.multiplyScalar(tiltFactor * EARTH_RADIUS * 1.5);

  // Set new target
  controls.target.copy(targetOffset);
  controls.update();
}

/**
 * Tilt presets for quick access
 */
export const tiltPresets = {
  Center: () => setCameraTilt(0),
  "Slight Tilt": () => setCameraTilt(30),
  Tracking: () => setCameraTilt(55),
  Horizon: () => setCameraTilt(80),
};

// =============================================================================
// DYNAMIC CONTROL SPEEDS
// =============================================================================

// Rotate speed bounds
// MIN_ROTATE_SPEED: Floor to prevent "stuck" feeling at very low altitudes (100m - 10km)
// MAX_ROTATE_SPEED: Ceiling to prevent overly sensitive panning at extreme zoom out
const MIN_ROTATE_SPEED = 0.2;
const MAX_ROTATE_SPEED = 1.5;

// Base multiplier for distance-proportional rotation.
// At distance = EARTH_RADIUS (surface), this gives rotateSpeed = 0.08 * 1 = 0.08
// At distance = 10 * EARTH_RADIUS (~57,000 km), gives rotateSpeed = 0.08 * 10 = 0.8
const ROTATE_SPEED_FACTOR = 0.08;

// Zoom speed boost threshold (km altitude)
// Below this altitude, zoom speed increases to help user "escape" low altitude
const ZOOM_BOOST_THRESHOLD_KM = 50;

// Maximum zoom speed when boosted at very low altitude
const MAX_ZOOM_SPEED = 2.0;

// Normal zoom speed at altitude above threshold
const BASE_ZOOM_SPEED = 1.0;

// Conversion factor: scene units to kilometers
// EARTH_RADIUS = 2.0 scene units = 6371 km, so 1 scene unit = 3185.5 km
const SCENE_UNITS_TO_KM = 3185.5;

/**
 * Update camera control speeds based on current altitude.
 *
 * Rotate speed: Scales with distance so panning feels consistent at all zoom levels.
 * - Close to surface: slower rotation for precise control
 * - Far from surface: faster rotation to cover the visible area
 *
 * Zoom speed: Boosted at very low altitudes to prevent "stuck" feeling.
 * - Below 50km: progressively faster zoom to help escape
 * - Above 50km: normal zoom speed
 *
 * Call this once per frame from the render loop.
 */
export function updateCameraControlSpeeds(): void {
  if (!camera || !controls) return;

  const distance = camera.position.length();

  // Rotate speed: proportional to distance, clamped to usable range
  const rawRotateSpeed = ROTATE_SPEED_FACTOR * (distance / EARTH_RADIUS);
  controls.rotateSpeed = Math.max(MIN_ROTATE_SPEED, Math.min(MAX_ROTATE_SPEED, rawRotateSpeed));

  // Zoom speed: boost when very close to help escape low altitude
  const altitudeKm = (distance - EARTH_RADIUS) * SCENE_UNITS_TO_KM;
  if (altitudeKm < ZOOM_BOOST_THRESHOLD_KM) {
    // Linear ramp: 2.0 at 0km, 1.0 at 50km
    const boostFactor = (ZOOM_BOOST_THRESHOLD_KM - altitudeKm) / ZOOM_BOOST_THRESHOLD_KM;
    controls.zoomSpeed = Math.min(MAX_ZOOM_SPEED, BASE_ZOOM_SPEED + boostFactor);
  } else {
    controls.zoomSpeed = BASE_ZOOM_SPEED;
  }
}
