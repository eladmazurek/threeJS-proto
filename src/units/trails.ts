/**
 * Unit Trails
 *
 * Fading dot trails showing recent positions for ships and aircraft.
 * Uses ring buffers for efficient history tracking.
 */

import * as THREE from "three";
import { EARTH_RADIUS, SHIP_ALTITUDE, AIRCRAFT_ALTITUDE } from "../constants";
import type { ShipState, AircraftState, TrailParams } from "../types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Number of trail points per unit */
export const TRAIL_LENGTH = 6;

/** Total trail points (limits memory usage) */
export const MAX_TRAIL_POINTS = 60000;

/** Milliseconds between trail position captures */
export const TRAIL_UPDATE_INTERVAL = 400;

/** Minimum distance (degrees) before adding new trail point */
export const MIN_TRAIL_DISTANCE = 0.15;

// =============================================================================
// TRAIL SHADERS
// =============================================================================

/** Trail vertex shader - positions dots at lat/lon with altitude */
const TRAIL_VERTEX_SHADER = `
  attribute float aLat;
  attribute float aLon;
  attribute float aOpacity;
  attribute float aAltitude;

  uniform float uEarthRadius;
  uniform float uPointSize;

  varying float vOpacity;

  const float PI = 3.141592653589793;
  const float DEG_TO_RAD = PI / 180.0;

  void main() {
    vOpacity = aOpacity;

    // Convert lat/lon to 3D position
    float phi = (90.0 - aLat) * DEG_TO_RAD;
    float theta = (aLon + 180.0) * DEG_TO_RAD;
    float radius = uEarthRadius + aAltitude;

    vec3 worldPosition = vec3(
      -radius * sin(phi) * cos(theta),
      radius * cos(phi),
      radius * sin(phi) * sin(theta)
    );

    vec4 mvPosition = modelViewMatrix * vec4(worldPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Scale with distance - smaller when zoomed out, larger when zoomed in
    gl_PointSize = clamp(uPointSize * (6.0 / -mvPosition.z), 1.0, uPointSize);
  }
`;

/** Trail fragment shader - renders circular dots */
const TRAIL_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uBaseOpacity;

  varying float vOpacity;

  void main() {
    // Circular point
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    // Slight soft edge but mostly solid
    float alpha = smoothstep(0.5, 0.35, dist);
    alpha *= vOpacity * uBaseOpacity;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

// =============================================================================
// TRAIL GEOMETRY
// =============================================================================

/** Trail geometry references */
export interface TrailGeometryRefs {
  geometry: THREE.BufferGeometry;
  latArray: Float32Array;
  lonArray: Float32Array;
  opacityArray: Float32Array;
  altitudeArray: Float32Array;
  latAttr: THREE.BufferAttribute;
  lonAttr: THREE.BufferAttribute;
  opacityAttr: THREE.BufferAttribute;
  altitudeAttr: THREE.BufferAttribute;
}

/**
 * Create trail geometry with attribute buffers.
 */
export function createTrailGeometry(maxPoints: number): TrailGeometryRefs {
  const geometry = new THREE.BufferGeometry();

  const latArray = new Float32Array(maxPoints);
  const lonArray = new Float32Array(maxPoints);
  const opacityArray = new Float32Array(maxPoints);
  const altitudeArray = new Float32Array(maxPoints);

  const latAttr = new THREE.BufferAttribute(latArray, 1);
  const lonAttr = new THREE.BufferAttribute(lonArray, 1);
  const opacityAttr = new THREE.BufferAttribute(opacityArray, 1);
  const altitudeAttr = new THREE.BufferAttribute(altitudeArray, 1);

  latAttr.setUsage(THREE.DynamicDrawUsage);
  lonAttr.setUsage(THREE.DynamicDrawUsage);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  altitudeAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute("aLat", latAttr);
  geometry.setAttribute("aLon", lonAttr);
  geometry.setAttribute("aOpacity", opacityAttr);
  geometry.setAttribute("aAltitude", altitudeAttr);

  return {
    geometry,
    latArray,
    lonArray,
    opacityArray,
    altitudeArray,
    latAttr,
    lonAttr,
    opacityAttr,
    altitudeAttr,
  };
}

// =============================================================================
// TRAIL MESH
// =============================================================================

/** Trail mesh references */
export interface TrailMeshRefs {
  geometryRefs: TrailGeometryRefs;
  material: THREE.ShaderMaterial;
  mesh: THREE.Points;
}

/**
 * Create ship trail mesh.
 */
export function createShipTrailMesh(
  maxPoints: number = MAX_TRAIL_POINTS,
  opacity: number = 0.7
): TrailMeshRefs {
  const geometryRefs = createTrailGeometry(maxPoints);

  const material = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERTEX_SHADER,
    fragmentShader: TRAIL_FRAGMENT_SHADER,
    uniforms: {
      uEarthRadius: { value: EARTH_RADIUS },
      uPointSize: { value: 8.0 },
      uColor: { value: new THREE.Color(0x2dd4bf) }, // Teal (matches ships)
      uBaseOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const mesh = new THREE.Points(geometryRefs.geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0.5; // Just above shadows

  return { geometryRefs, material, mesh };
}

/**
 * Create aircraft trail mesh.
 */
export function createAircraftTrailMesh(
  maxPoints: number = MAX_TRAIL_POINTS,
  opacity: number = 0.7
): TrailMeshRefs {
  const geometryRefs = createTrailGeometry(maxPoints);

  const material = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERTEX_SHADER,
    fragmentShader: TRAIL_FRAGMENT_SHADER,
    uniforms: {
      uEarthRadius: { value: EARTH_RADIUS },
      uPointSize: { value: 8.0 },
      uColor: { value: new THREE.Color(0xfbbf24) }, // Amber (matches aircraft)
      uBaseOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const mesh = new THREE.Points(geometryRefs.geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1.8; // Just below aircraft

  return { geometryRefs, material, mesh };
}

// =============================================================================
// TRAIL HISTORY
// =============================================================================

/** Trail history entry for a single unit */
export interface TrailHistoryEntry {
  positions: Array<{ lat: number; lon: number }>;
  headIndex: number;
}

/** Trail history state */
export interface TrailHistoryState {
  shipHistory: TrailHistoryEntry[];
  aircraftHistory: TrailHistoryEntry[];
  activeShipCount: number;
  activeAircraftCount: number;
}

/**
 * Initialize trail history for units.
 */
export function initTrailHistory(
  shipCount: number,
  aircraftCount: number
): TrailHistoryState {
  const maxShipsWithTrails = Math.floor(MAX_TRAIL_POINTS / TRAIL_LENGTH / 2);
  const maxAircraftWithTrails = Math.floor(MAX_TRAIL_POINTS / TRAIL_LENGTH / 2);

  const shipHistory: TrailHistoryEntry[] = [];
  const aircraftHistory: TrailHistoryEntry[] = [];

  const actualShipCount = Math.min(shipCount, maxShipsWithTrails);
  for (let i = 0; i < actualShipCount; i++) {
    shipHistory.push({ positions: [], headIndex: 0 });
  }

  const actualAircraftCount = Math.min(aircraftCount, maxAircraftWithTrails);
  for (let i = 0; i < actualAircraftCount; i++) {
    aircraftHistory.push({ positions: [], headIndex: 0 });
  }

  return {
    shipHistory,
    aircraftHistory,
    activeShipCount: actualShipCount,
    activeAircraftCount: actualAircraftCount,
  };
}

/**
 * Calculate distance between two lat/lon points (simple approximation).
 */
function latLonDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Capture current positions into trail history.
 * Only adds new point if unit has moved enough from last captured position.
 */
export function captureTrailPositions(
  historyState: TrailHistoryState,
  ships: ShipState[],
  aircraft: AircraftState[]
): void {
  // Capture ship positions
  for (let i = 0; i < historyState.shipHistory.length; i++) {
    const ship = ships[i];
    if (!ship) continue;

    const trail = historyState.shipHistory[i];

    // Check if moved enough from last position
    let shouldAdd = true;
    if (trail.positions.length > 0) {
      const lastIdx =
        (trail.headIndex - 1 + trail.positions.length) % trail.positions.length;
      const last = trail.positions[lastIdx];
      if (
        latLonDistance(ship.lat, ship.lon, last.lat, last.lon) <
        MIN_TRAIL_DISTANCE
      ) {
        shouldAdd = false;
      }
    }

    if (shouldAdd) {
      if (trail.positions.length < TRAIL_LENGTH) {
        trail.positions.push({ lat: ship.lat, lon: ship.lon });
      } else {
        trail.positions[trail.headIndex] = { lat: ship.lat, lon: ship.lon };
        trail.headIndex = (trail.headIndex + 1) % TRAIL_LENGTH;
      }
    }
  }

  // Capture aircraft positions
  for (let i = 0; i < historyState.aircraftHistory.length; i++) {
    const ac = aircraft[i];
    if (!ac) continue;

    const trail = historyState.aircraftHistory[i];

    let shouldAdd = true;
    if (trail.positions.length > 0) {
      const lastIdx =
        (trail.headIndex - 1 + trail.positions.length) % trail.positions.length;
      const last = trail.positions[lastIdx];
      if (
        latLonDistance(ac.lat, ac.lon, last.lat, last.lon) < MIN_TRAIL_DISTANCE
      ) {
        shouldAdd = false;
      }
    }

    if (shouldAdd) {
      if (trail.positions.length < TRAIL_LENGTH) {
        trail.positions.push({ lat: ac.lat, lon: ac.lon });
      } else {
        trail.positions[trail.headIndex] = { lat: ac.lat, lon: ac.lon };
        trail.headIndex = (trail.headIndex + 1) % TRAIL_LENGTH;
      }
    }
  }
}

/**
 * Update ship trail GPU buffers from history.
 */
export function updateShipTrailAttributes(
  geometryRefs: TrailGeometryRefs,
  historyState: TrailHistoryState,
  enabled: boolean,
  showShipTrails: boolean
): void {
  if (!enabled || !showShipTrails) {
    geometryRefs.geometry.setDrawRange(0, 0);
    return;
  }

  let pointIndex = 0;

  for (let i = 0; i < historyState.shipHistory.length; i++) {
    const trail = historyState.shipHistory[i];
    const posCount = trail.positions.length;

    // Skip j=0 (newest) so trail starts behind the unit, not on it
    for (let j = 1; j < posCount; j++) {
      const ringIndex = (trail.headIndex - 1 - j + posCount) % posCount;
      const pos = trail.positions[ringIndex];
      const age = (j - 1) / (TRAIL_LENGTH - 1);

      geometryRefs.latArray[pointIndex] = pos.lat;
      geometryRefs.lonArray[pointIndex] = pos.lon;
      geometryRefs.opacityArray[pointIndex] = 1.0 - age * 0.6; // Bright to dim
      geometryRefs.altitudeArray[pointIndex] = SHIP_ALTITUDE * 0.5;
      pointIndex++;
    }
  }

  geometryRefs.latAttr.needsUpdate = true;
  geometryRefs.lonAttr.needsUpdate = true;
  geometryRefs.opacityAttr.needsUpdate = true;
  geometryRefs.altitudeAttr.needsUpdate = true;
  geometryRefs.geometry.setDrawRange(0, pointIndex);
}

/**
 * Update aircraft trail GPU buffers from history.
 */
export function updateAircraftTrailAttributes(
  geometryRefs: TrailGeometryRefs,
  historyState: TrailHistoryState,
  enabled: boolean,
  showAircraftTrails: boolean
): void {
  if (!enabled || !showAircraftTrails) {
    geometryRefs.geometry.setDrawRange(0, 0);
    return;
  }

  let pointIndex = 0;

  for (let i = 0; i < historyState.aircraftHistory.length; i++) {
    const trail = historyState.aircraftHistory[i];
    const posCount = trail.positions.length;

    for (let j = 1; j < posCount; j++) {
      const ringIndex = (trail.headIndex - 1 - j + posCount) % posCount;
      const pos = trail.positions[ringIndex];
      const age = (j - 1) / (TRAIL_LENGTH - 1);

      geometryRefs.latArray[pointIndex] = pos.lat;
      geometryRefs.lonArray[pointIndex] = pos.lon;
      geometryRefs.opacityArray[pointIndex] = 1.0 - age * 0.6;
      geometryRefs.altitudeArray[pointIndex] = AIRCRAFT_ALTITUDE * 0.5;
      pointIndex++;
    }
  }

  geometryRefs.latAttr.needsUpdate = true;
  geometryRefs.lonAttr.needsUpdate = true;
  geometryRefs.opacityAttr.needsUpdate = true;
  geometryRefs.altitudeAttr.needsUpdate = true;
  geometryRefs.geometry.setDrawRange(0, pointIndex);
}

/**
 * Set trail opacity.
 */
export function setTrailOpacity(
  material: THREE.ShaderMaterial,
  opacity: number
): void {
  material.uniforms.uBaseOpacity.value = opacity;
}
