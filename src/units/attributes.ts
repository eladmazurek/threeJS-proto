/**
 * Unit Attributes System
 *
 * Updates instanced mesh attribute buffers for ships, aircraft, satellites, and drones.
 * Uses partial buffer uploads for performance optimization.
 */

import * as THREE from "three";
import { MAX_SHIPS, MAX_AIRCRAFT, MAX_SATELLITES, MAX_DRONES } from "../constants";
import { state } from "../state";
import type { ShipState, AircraftState, SatelliteState, DroneState } from "../types";

// =============================================================================
// PARAMETERS
// =============================================================================

/** Icon scale parameters for GUI control */
export const iconScaleParams = {
  multiplier: 1.0,
};

// =============================================================================
// GEOMETRY REFERENCES (set via dependency injection)
// =============================================================================

interface GeometryUserData {
  latArray: Float32Array;
  lonArray: Float32Array;
  headingArray: Float32Array;
  scaleArray: Float32Array;
  latAttr: THREE.InstancedBufferAttribute;
  lonAttr: THREE.InstancedBufferAttribute;
  headingAttr: THREE.InstancedBufferAttribute;
  scaleAttr: THREE.InstancedBufferAttribute;
}

interface AttributeDependencies {
  shipGeometry: THREE.InstancedBufferGeometry;
  aircraftGeometry: THREE.InstancedBufferGeometry;
  satelliteGeometry: THREE.InstancedBufferGeometry;
  droneGeometry: THREE.InstancedBufferGeometry;
  getShipSimState: () => ShipState[];
  getAircraftSimState: () => AircraftState[];
  getSatelliteSimState: () => SatelliteState[];
  getDroneSimState: () => DroneState[];
}

let deps: AttributeDependencies | null = null;

/**
 * Set dependencies for attribute updates
 */
export function setAttributeDependencies(dependencies: AttributeDependencies): void {
  deps = dependencies;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Helper to mark buffer attribute for partial update
 * Uses addUpdateRange for Three.js r144+
 */
function markAttributeForUpdate(attr: THREE.InstancedBufferAttribute, count: number): void {
  if ((attr as any).clearUpdateRanges && (attr as any).addUpdateRange) {
    (attr as any).clearUpdateRanges();
    (attr as any).addUpdateRange(0, count);
  }
  attr.needsUpdate = true;
}

// =============================================================================
// UPDATE FUNCTIONS
// =============================================================================

/**
 * Update icon scale based on camera distance
 */
export function updateIconScale(cameraDistance: number): void {
  const baseDistance = 13;
  state.currentIconScale = (cameraDistance / baseDistance) * iconScaleParams.multiplier;
}

/**
 * Update ship instances by writing directly to GPU attribute buffers
 */
export function updateShipAttributes(): void {
  if (!deps) return;

  const userData = deps.shipGeometry.userData as GeometryUserData;
  const { latArray, lonArray, headingArray, scaleArray, latAttr, lonAttr, headingAttr, scaleAttr } = userData;
  const shipSimState = deps.getShipSimState();
  const count = Math.min(shipSimState.length, MAX_SHIPS);

  for (let i = 0; i < count; i++) {
    const ship = shipSimState[i];
    latArray[i] = ship.lat;
    lonArray[i] = ship.lon;
    headingArray[i] = ship.heading;
    scaleArray[i] = ship.scale * state.currentIconScale;
  }

  // Mark for partial update (only upload active units)
  markAttributeForUpdate(latAttr, count);
  markAttributeForUpdate(lonAttr, count);
  markAttributeForUpdate(headingAttr, count);
  markAttributeForUpdate(scaleAttr, count);

  deps.shipGeometry.instanceCount = count;
}

/**
 * Update aircraft instances by writing directly to GPU attribute buffers
 */
export function updateAircraftAttributes(): void {
  if (!deps) return;

  const userData = deps.aircraftGeometry.userData as GeometryUserData;
  const { latArray, lonArray, headingArray, scaleArray, latAttr, lonAttr, headingAttr, scaleAttr } = userData;
  const aircraftSimState = deps.getAircraftSimState();
  const count = Math.min(aircraftSimState.length, MAX_AIRCRAFT);

  for (let i = 0; i < count; i++) {
    const aircraft = aircraftSimState[i];
    latArray[i] = aircraft.lat;
    lonArray[i] = aircraft.lon;
    headingArray[i] = aircraft.heading;
    scaleArray[i] = aircraft.scale * state.currentIconScale;
  }

  // Mark for partial update (only upload active units)
  markAttributeForUpdate(latAttr, count);
  markAttributeForUpdate(lonAttr, count);
  markAttributeForUpdate(headingAttr, count);
  markAttributeForUpdate(scaleAttr, count);

  deps.aircraftGeometry.instanceCount = count;
}

/**
 * Update satellite instances by writing directly to GPU attribute buffers
 */
export function updateSatelliteAttributes(): void {
  if (!deps) return;

  const userData = deps.satelliteGeometry.userData as GeometryUserData;
  const { latArray, lonArray, headingArray, scaleArray, latAttr, lonAttr, headingAttr, scaleAttr } = userData;
  const satelliteSimState = deps.getSatelliteSimState();
  const count = Math.min(satelliteSimState.length, MAX_SATELLITES);

  for (let i = 0; i < count; i++) {
    const sat = satelliteSimState[i];
    latArray[i] = sat.lat;
    lonArray[i] = sat.lon;
    headingArray[i] = sat.heading;
    // Encode altitude and display scale in a single float:
    // Integer part: display scale * 10 (includes camera scaling)
    // Fractional part: altitude / 0.5 (normalized to 0-1 range)
    const scaledDisplay = sat.scale * state.currentIconScale;
    const normalizedAlt = sat.altitude / 0.5; // altitude 0-0.5 -> 0-1
    scaleArray[i] = Math.floor(scaledDisplay * 10) + Math.min(0.99, normalizedAlt);
  }

  // Mark for partial update (only upload active units)
  markAttributeForUpdate(latAttr, count);
  markAttributeForUpdate(lonAttr, count);
  markAttributeForUpdate(headingAttr, count);
  markAttributeForUpdate(scaleAttr, count);

  deps.satelliteGeometry.instanceCount = count;
}

/**
 * Update drone instances by writing directly to GPU attribute buffers
 */
export function updateDroneAttributes(): void {
  if (!deps) return;

  const userData = deps.droneGeometry.userData as GeometryUserData;
  const { latArray, lonArray, headingArray, scaleArray, latAttr, lonAttr, headingAttr, scaleAttr } = userData;
  const droneSimState = deps.getDroneSimState();
  const count = Math.min(droneSimState.length, MAX_DRONES);

  for (let i = 0; i < count; i++) {
    const drone = droneSimState[i];
    latArray[i] = drone.lat;
    lonArray[i] = drone.lon;
    headingArray[i] = drone.heading;
    // Encode scale and altitude like satellites do:
    // Integer part: display scale * 10 (includes camera scaling)
    // Fractional part: altitude / 0.5 (normalized to 0-1 range)
    const scaledDisplay = drone.scale * state.currentIconScale;
    const normalizedAlt = drone.altitude / 0.5;
    scaleArray[i] = Math.floor(scaledDisplay * 10) + Math.min(0.99, normalizedAlt);
  }

  // Mark for partial update (only upload active units)
  markAttributeForUpdate(latAttr, count);
  markAttributeForUpdate(lonAttr, count);
  markAttributeForUpdate(headingAttr, count);
  markAttributeForUpdate(scaleAttr, count);

  deps.droneGeometry.instanceCount = count;
}

/**
 * Update all unit attributes (called after motion simulation)
 */
export function updateAllAttributes(): void {
  updateShipAttributes();
  updateAircraftAttributes();
  updateSatelliteAttributes();
  updateDroneAttributes();
}
