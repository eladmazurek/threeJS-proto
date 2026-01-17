/**
 * Coordinate Utilities
 *
 * Functions for converting between geographic coordinates (lat/lon)
 * and 3D world positions in the Three.js scene.
 */

import * as THREE from "three";
import { EARTH_RADIUS, DEG_TO_RAD, RAD_TO_DEG } from "../constants";

/**
 * Convert latitude/longitude to 3D position on or above the Earth surface.
 *
 * Uses ECEF (Earth-Centered Earth-Fixed) coordinate system:
 * - X axis points towards 0°N, 0°E (Gulf of Guinea)
 * - Y axis points towards North Pole
 * - Z axis points towards 0°N, 90°E (Bay of Bengal)
 *
 * @param lat - Latitude in degrees (-90 to 90)
 * @param lon - Longitude in degrees (-180 to 180)
 * @param altitude - Height above Earth surface in scene units (default: 0)
 * @returns THREE.Vector3 position in world space
 */
export function latLonToPosition(
  lat: number,
  lon: number,
  altitude: number = 0
): THREE.Vector3 {
  const phi = (90 - lat) * DEG_TO_RAD; // Colatitude (angle from North Pole)
  const theta = (lon + 180) * DEG_TO_RAD; // Longitude offset for texture alignment

  const radius = EARTH_RADIUS + altitude;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Convert latitude/longitude to 3D position, writing to an existing Vector3.
 * More efficient for per-frame updates (avoids allocations).
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param altitude - Height above Earth surface
 * @param earthRotY - Current Earth rotation around Y axis
 * @param outVec - Vector3 to write result to
 */
export function latLonToWorld(
  lat: number,
  lon: number,
  altitude: number,
  earthRotY: number,
  outVec: THREE.Vector3
): void {
  const phi = (90 - lat) * DEG_TO_RAD;
  const theta = (lon + 180) * DEG_TO_RAD;
  const radius = EARTH_RADIUS + altitude;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  // Position in earth-fixed coordinates
  const x = -radius * sinPhi * cosTheta;
  const y = radius * cosPhi;
  const z = radius * sinPhi * sinTheta;

  // Apply Earth rotation
  const cosR = Math.cos(earthRotY);
  const sinR = Math.sin(earthRotY);

  outVec.set(x * cosR - z * sinR, y, x * sinR + z * cosR);
}

/**
 * Convert 3D position back to latitude/longitude.
 *
 * @param position - 3D position in world space
 * @returns Object with lat and lon in degrees
 */
export function positionToLatLon(position: THREE.Vector3): {
  lat: number;
  lon: number;
} {
  const radius = position.length();
  const lat = 90 - Math.acos(position.y / radius) * RAD_TO_DEG;
  const lon =
    Math.atan2(position.z, -position.x) * RAD_TO_DEG - 180;

  return { lat, lon: ((lon + 540) % 360) - 180 }; // Normalize longitude to -180..180
}

/**
 * Get the lat/lon that the camera is currently looking at (Earth center).
 * Accounts for Earth rotation.
 *
 * @param camera - The Three.js camera
 * @param earthRotationY - Current Earth rotation around Y axis
 * @returns Object with lat, lon, and distance from Earth center
 */
export function getCameraLatLon(
  camera: THREE.Camera,
  earthRotationY: number
): { lat: number; lon: number; distance: number } {
  const camPos = camera.position;
  const camDist = camPos.length();

  // Undo earth rotation to get earth-fixed coordinates
  const cosR = Math.cos(-earthRotationY);
  const sinR = Math.sin(-earthRotationY);
  const camX = camPos.x * cosR + camPos.z * sinR;
  const camY = camPos.y;
  const camZ = -camPos.x * sinR + camPos.z * cosR;

  // Convert to lat/lon
  const lat = Math.asin(camY / camDist) * RAD_TO_DEG;
  const lon = Math.atan2(camZ, -camX) * RAD_TO_DEG - 180;

  return {
    lat,
    lon: ((lon + 540) % 360) - 180, // Normalize to -180..180
    distance: camDist,
  };
}

/**
 * Calculate the great-circle distance between two lat/lon points.
 * Uses the Haversine formula.
 *
 * @param lat1 - First point latitude in degrees
 * @param lon1 - First point longitude in degrees
 * @param lat2 - Second point latitude in degrees
 * @param lon2 - Second point longitude in degrees
 * @returns Distance in scene units
 */
export function greatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Calculate heading from one lat/lon point to another.
 *
 * @param lat1 - Starting latitude in degrees
 * @param lon1 - Starting longitude in degrees
 * @param lat2 - Ending latitude in degrees
 * @param lon2 - Ending longitude in degrees
 * @returns Heading in degrees (0-360, clockwise from North)
 */
export function calculateHeading(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const heading = Math.atan2(y, x) * RAD_TO_DEG;
  return (heading + 360) % 360;
}

/**
 * Bounding box for geographic queries.
 */
export interface GeoBoundingBox {
  lamin: number; // min latitude
  lamax: number; // max latitude
  lomin: number; // min longitude
  lomax: number; // max longitude
}

/**
 * Calculate the approximate viewport bounding box visible to the camera.
 * Uses camera distance to estimate visible arc on Earth's surface.
 *
 * @param camera - The Three.js camera
 * @param earthRotationY - Current Earth rotation around Y axis
 * @param padding - Extra padding in degrees (default: 5)
 * @returns Bounding box or null if entire Earth is visible
 */
export function getViewportBoundingBox(
  camera: THREE.Camera,
  earthRotationY: number,
  padding: number = 5
): GeoBoundingBox | null {
  const { lat, lon, distance } = getCameraLatLon(camera, earthRotationY);

  // Calculate the angular radius of what's visible
  // At distance d from center, visible arc angle ≈ asin(EARTH_RADIUS / d) * 2
  // But we need to account for the camera FOV too

  // Get camera FOV (assume perspective camera)
  const perspCamera = camera as THREE.PerspectiveCamera;
  const fovRad = (perspCamera.fov || 75) * DEG_TO_RAD;

  // Calculate visible arc based on camera distance
  // When camera is at distance d, the visible "cap" has angular radius θ where:
  // cos(θ) = EARTH_RADIUS / d (angle from camera to horizon)
  const distanceRatio = EARTH_RADIUS / distance;

  if (distanceRatio >= 1) {
    // Camera is inside Earth (shouldn't happen, but return null)
    return null;
  }

  // Angle from camera to horizon
  const horizonAngle = Math.acos(distanceRatio) * RAD_TO_DEG;

  // Account for FOV - what we can actually see
  const effectiveFov = (fovRad / 2) * RAD_TO_DEG;

  // Use the smaller of horizon angle or FOV, plus padding
  const visibleRadius = Math.min(horizonAngle, effectiveFov * 1.5) + padding;

  // If visible radius is large (> 80 degrees), return null (whole Earth visible)
  if (visibleRadius >= 80) {
    return null;
  }

  // Calculate bounding box
  // Latitude bounds are straightforward
  let lamin = lat - visibleRadius;
  let lamax = lat + visibleRadius;

  // Clamp latitude
  lamin = Math.max(-90, lamin);
  lamax = Math.min(90, lamax);

  // Longitude bounds need to account for latitude (meridians converge at poles)
  // At higher latitudes, same degree range covers less distance
  const latFactor = Math.cos(Math.abs(lat) * DEG_TO_RAD);
  const lonRadius = latFactor > 0.1 ? visibleRadius / latFactor : 180;

  let lomin = lon - lonRadius;
  let lomax = lon + lonRadius;

  // Handle wrap-around
  if (lomin < -180) lomin = -180;
  if (lomax > 180) lomax = 180;

  return { lamin, lamax, lomin, lomax };
}
