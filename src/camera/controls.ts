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
let surfaceInteractionDistance: number | null = null;

type OrbitControlsWithPanOverride = OrbitControls & {
  _pan?: (deltaX: number, deltaY: number) => void;
  _panLeft?: (distance: number, objectMatrix: THREE.Matrix4) => void;
  _panUp?: (distance: number, objectMatrix: THREE.Matrix4) => void;
  __surfacePanDistance?: number | null;
  __surfacePanPatchInstalled?: boolean;
};

function installSurfacePanPatch(controlsRef: OrbitControls): void {
  const patchedControls = controlsRef as OrbitControlsWithPanOverride;
  if (patchedControls.__surfacePanPatchInstalled || !patchedControls._pan) {
    return;
  }

  const originalPan = patchedControls._pan;

  patchedControls._pan = function (this: OrbitControls, deltaX: number, deltaY: number): void {
    const panControls = this as OrbitControlsWithPanOverride;
    const surfacePanDistance = panControls.__surfacePanDistance;

    if (
      !this.object.isPerspectiveCamera ||
      surfacePanDistance == null ||
      !Number.isFinite(surfacePanDistance) ||
      surfacePanDistance <= 0 ||
      !panControls._panLeft ||
      !panControls._panUp
    ) {
      originalPan.call(this, deltaX, deltaY);
      return;
    }

    const element = this.domElement;
    const viewDistance = surfacePanDistance * Math.tan((this.object.fov / 2) * Math.PI / 180.0);

    panControls._panLeft(2 * deltaX * viewDistance / element.clientHeight, this.object.matrix);
    panControls._panUp(2 * deltaY * viewDistance / element.clientHeight, this.object.matrix);
  };

  patchedControls.__surfacePanDistance = null;
  patchedControls.__surfacePanPatchInstalled = true;
}

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
  installSurfacePanPatch(controlsRef);
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
// MIN_ROTATE_SPEED: Global floor for normal orbiting
// MAX_ROTATE_SPEED: Ceiling to prevent overly sensitive panning at extreme zoom out
const MIN_ROTATE_SPEED = 0.02;
const MIN_LOCAL_ROTATE_SPEED = 0.004;
const MAX_ROTATE_SPEED = 1.5;
const ROTATE_REFERENCE_SCALE_FLOOR = 0.02;

// Base multiplier for distance-proportional rotation.
// At distance = EARTH_RADIUS (surface), this gives rotateSpeed = 0.08 * 1 = 0.08
// At distance = 10 * EARTH_RADIUS (~57,000 km), gives rotateSpeed = 0.08 * 10 = 0.8
const ROTATE_SPEED_FACTOR = 0.08;

// Low-altitude control tuning
// Zoom blends back to normal over a wide range.
// Pan uses a separate surface-distance override, so only a modest low-altitude
// speed reduction is needed here.
const LOW_ALTITUDE_CONTROL_RANGE_KM = 500;
const MIN_CLOSE_ZOOM_SPEED = 0.04;
const BASE_ZOOM_SPEED = 1.0;
const MIN_CLOSE_PAN_SPEED = 0.12;
const BASE_PAN_SPEED = 1.0;

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
 * Zoom speed: becomes progressively finer at low altitudes.
 * - Near the surface: smaller zoom deltas for precise close-in control
 * - Higher up: returns to normal speed
 *
 * Pan speed: stays modestly reduced at low altitude, while the actual pan
 * distance is overridden from the visible surface depth.
 *
 * Call this once per frame from the render loop.
 */
export function updateCameraControlSpeeds(): void {
  if (!camera || !controls) return;

  const distance = camera.position.length();

  // Rotate speed: proportional to distance, clamped to usable range
  const rawRotateSpeed = ROTATE_SPEED_FACTOR * (distance / EARTH_RADIUS);
  let rotateSpeed = Math.max(MIN_ROTATE_SPEED, Math.min(MAX_ROTATE_SPEED, rawRotateSpeed));

  if (surfaceInteractionDistance !== null && Number.isFinite(surfaceInteractionDistance) && surfaceInteractionDistance > 0) {
    const targetDistance = Math.max(camera.position.distanceTo(controls.target), surfaceInteractionDistance);
    const rotateReferenceScale = Math.max(
      ROTATE_REFERENCE_SCALE_FLOOR,
      Math.min(1, surfaceInteractionDistance / targetDistance)
    );
    rotateSpeed = Math.max(MIN_LOCAL_ROTATE_SPEED, rotateSpeed * rotateReferenceScale);
  }

  controls.rotateSpeed = rotateSpeed;

  const altitudeKm = (distance - EARTH_RADIUS) * SCENE_UNITS_TO_KM;
  const altitudeT = Math.max(0, Math.min(1, altitudeKm / LOW_ALTITUDE_CONTROL_RANGE_KM));
  const easedAltitudeT = altitudeT * altitudeT * (3 - 2 * altitudeT);

  controls.zoomSpeed = MIN_CLOSE_ZOOM_SPEED + (BASE_ZOOM_SPEED - MIN_CLOSE_ZOOM_SPEED) * easedAltitudeT;
  controls.panSpeed = MIN_CLOSE_PAN_SPEED + (BASE_PAN_SPEED - MIN_CLOSE_PAN_SPEED) * easedAltitudeT;
}

export function setCameraPanReferenceDistance(distance: number | null): void {
  if (!controls) return;
  const patchedControls = controls as OrbitControlsWithPanOverride;
  patchedControls.__surfacePanDistance = distance;
  surfaceInteractionDistance = distance;
}
