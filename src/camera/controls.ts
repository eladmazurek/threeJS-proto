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
