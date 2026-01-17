/**
 * Selection Visuals System
 *
 * Visual feedback for selected units including:
 * - Selection ring (pulsing highlight around selected unit)
 * - Orbit line (for satellites)
 * - Patrol circle (for drones)
 * - Observation line (from drone to target)
 * - Target marker (ground target indicator)
 */

import * as THREE from "three";
import {
  EARTH_RADIUS,
  PATROL_CIRCLE_SEGMENTS,
  ORBIT_LINE_SEGMENTS,
  SHIP_ALTITUDE,
  AIRCRAFT_ALTITUDE,
} from "../constants";
import { AIRPORTS } from "../data/airports";
import { SELECTION_COLORS } from "./index";
import { state } from "../state";
import { iconScaleParams } from "../units/attributes";
import type { ShipState, AircraftState, SatelliteState, DroneState } from "../types";

// =============================================================================
// DEPENDENCIES (set via setVisualsDependencies)
// =============================================================================

interface VisualsDependencies {
  getEarthRotationY: () => number;
  getCameraDistance: () => number;
  getShipState: (index: number) => ShipState | undefined;
  getAircraftState: (index: number) => AircraftState | undefined;
  getSatelliteState: (index: number) => SatelliteState | undefined;
  getDroneState: (index: number) => DroneState | undefined;
}

let deps: VisualsDependencies | null = null;

/**
 * Set dependencies for selection visuals
 */
export function setVisualsDependencies(dependencies: VisualsDependencies): void {
  deps = dependencies;
}

// =============================================================================
// PATROL CIRCLE (Drone)
// =============================================================================

const patrolCircleMaterial = new THREE.LineBasicMaterial({
  color: 0x84cc16, // Lime green to match drone
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
});

const patrolCircleGeometry = new THREE.BufferGeometry();
const patrolCirclePositions = new Float32Array(PATROL_CIRCLE_SEGMENTS * 3);
patrolCircleGeometry.setAttribute('position', new THREE.BufferAttribute(patrolCirclePositions, 3));

export const patrolCircle = new THREE.LineLoop(patrolCircleGeometry, patrolCircleMaterial);
patrolCircle.visible = false;
patrolCircle.renderOrder = 5;

// =============================================================================
// OBSERVATION LINE (Drone to Target)
// =============================================================================

const observationLineMaterial = new THREE.LineDashedMaterial({
  color: 0xff4444, // Red for target lock
  transparent: true,
  opacity: 0.8,
  dashSize: 0.01,
  gapSize: 0.005,
  depthTest: false, // Always visible, even through Earth
  depthWrite: false,
});

const observationLineGeometry = new THREE.BufferGeometry();
const observationLinePositions = new Float32Array(6); // 2 points
observationLineGeometry.setAttribute('position', new THREE.BufferAttribute(observationLinePositions, 3));

export const observationLine = new THREE.Line(observationLineGeometry, observationLineMaterial);
observationLine.visible = false;
observationLine.renderOrder = 5;

// =============================================================================
// TARGET MARKER (Ground target indicator)
// =============================================================================

const targetMarkerGeometry = new THREE.RingGeometry(0.008, 0.012, 4);
targetMarkerGeometry.rotateX(-Math.PI / 2);
targetMarkerGeometry.rotateZ(Math.PI / 4); // Rotate to diamond orientation

const targetMarkerMaterial = new THREE.MeshBasicMaterial({
  color: 0xff4444,
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
  depthTest: false, // Always visible
  depthWrite: false,
});

export const targetMarker = new THREE.Mesh(targetMarkerGeometry, targetMarkerMaterial);
targetMarker.visible = false;
targetMarker.renderOrder = 6;

// =============================================================================
// SELECTION RING
// =============================================================================

const selectionRingGeometry = new THREE.RingGeometry(0.025, 0.032, 32);
selectionRingGeometry.rotateX(-Math.PI / 2); // Lay flat on surface

export const selectionRingMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xffffff) },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      // Pulsing glow effect
      float pulse = 0.7 + 0.3 * sin(uTime * 4.0);
      // Radial gradient for soft edges
      float dist = length(vUv - 0.5) * 2.0;
      float alpha = pulse * smoothstep(1.0, 0.5, dist);
      gl_FragColor = vec4(uColor, alpha);
    }
  `,
  transparent: true,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
});

export const selectionRing = new THREE.Mesh(selectionRingGeometry, selectionRingMaterial);
selectionRing.visible = false;
selectionRing.renderOrder = 10; // Render on top

// =============================================================================
// ORBIT LINE (Satellite)
// =============================================================================

const orbitLineMaterial = new THREE.LineBasicMaterial({
  color: 0xaa88ff, // Violet to match satellite color
  transparent: true,
  opacity: 0.6,
  depthTest: false,
  depthWrite: false,
});

const orbitLineGeometry = new THREE.BufferGeometry();
const orbitLinePositions = new Float32Array(ORBIT_LINE_SEGMENTS * 3);
orbitLineGeometry.setAttribute('position', new THREE.BufferAttribute(orbitLinePositions, 3));

export const orbitLine = new THREE.LineLoop(orbitLineGeometry, orbitLineMaterial);
orbitLine.visible = false;
orbitLine.renderOrder = 5;

// =============================================================================
// UPDATE FUNCTIONS
// =============================================================================

/**
 * Update observation line from drone to ground target
 */
export function updateObservationLine(drone: DroneState): void {
  if (!drone || !deps) return;

  const positions = observationLineGeometry.attributes.position.array as Float32Array;
  const earthRotY = deps.getEarthRotationY();
  const cosR = Math.cos(earthRotY);
  const sinR = Math.sin(earthRotY);

  // Drone position (unrotated)
  const dronePhi = (90 - drone.lat) * (Math.PI / 180);
  const droneTheta = (drone.lon + 180) * (Math.PI / 180);
  const droneR = EARTH_RADIUS + drone.altitude;

  let droneX = -droneR * Math.sin(dronePhi) * Math.cos(droneTheta);
  const droneY = droneR * Math.cos(dronePhi);
  let droneZ = droneR * Math.sin(dronePhi) * Math.sin(droneTheta);

  // Apply earth rotation to drone position
  positions[0] = droneX * cosR + droneZ * sinR;
  positions[1] = droneY;
  positions[2] = -droneX * sinR + droneZ * cosR;

  // Target position (on ground at patrol center)
  const targetLat = drone.targetLat;
  const targetLon = drone.targetLon;
  const targetPhi = (90 - targetLat) * (Math.PI / 180);
  const targetTheta = (targetLon + 180) * (Math.PI / 180);
  const targetR = EARTH_RADIUS + 0.001; // Just above surface

  let targetX = -targetR * Math.sin(targetPhi) * Math.cos(targetTheta);
  const targetY = targetR * Math.cos(targetPhi);
  let targetZ = targetR * Math.sin(targetPhi) * Math.sin(targetTheta);

  // Apply earth rotation to target position
  positions[3] = targetX * cosR + targetZ * sinR;
  positions[4] = targetY;
  positions[5] = -targetX * sinR + targetZ * cosR;

  observationLineGeometry.attributes.position.needsUpdate = true;
  observationLine.computeLineDistances(); // Required for dashed lines
  observationLine.visible = true;

  // Update target marker position (rotated)
  targetMarker.position.set(positions[3], positions[4], positions[5]);

  // Orient marker to face outward from Earth
  const surfaceNormal = targetMarker.position.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, surfaceNormal);
  targetMarker.quaternion.copy(quat);

  targetMarker.visible = true;
}

/**
 * Update drone patrol circle visualization
 */
export function updatePatrolCircle(drone: DroneState | null): void {
  if (!drone || !deps) {
    patrolCircle.visible = false;
    observationLine.visible = false;
    targetMarker.visible = false;
    return;
  }

  const positions = patrolCircleGeometry.attributes.position.array as Float32Array;
  const centerLat = drone.patrolCenterLat;
  const centerLon = drone.patrolCenterLon;
  const radius = drone.patrolRadius;

  // Get earth rotation for position transformation
  const earthRotY = deps.getEarthRotationY();
  const cosR = Math.cos(earthRotY);
  const sinR = Math.sin(earthRotY);

  // Generate circle points around patrol center
  for (let i = 0; i < PATROL_CIRCLE_SEGMENTS; i++) {
    const angle = (i / PATROL_CIRCLE_SEGMENTS) * Math.PI * 2;

    // Offset in lat/lon (approximate for small circles)
    const latOffset = Math.sin(angle) * radius * (180 / Math.PI) / EARTH_RADIUS;
    const lonOffset = Math.cos(angle) * radius * (180 / Math.PI) / EARTH_RADIUS / Math.cos(centerLat * Math.PI / 180);

    const lat = centerLat + latOffset;
    const lon = centerLon + lonOffset;

    // Convert to 3D (unrotated)
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const r = EARTH_RADIUS + drone.altitude;

    const x = -r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);

    // Apply earth rotation
    positions[i * 3] = x * cosR + z * sinR;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = -x * sinR + z * cosR;
  }

  patrolCircleGeometry.attributes.position.needsUpdate = true;
  patrolCircle.visible = true;

  // Update observation line (from drone to target)
  updateObservationLine(drone);
}

/**
 * Compute orbital path points for a satellite
 */
export function updateOrbitLine(sat: SatelliteState | null): void {
  if (!sat) {
    orbitLine.visible = false;
    return;
  }

  const positions = orbitLineGeometry.attributes.position.array as Float32Array;
  const inclinationRad = sat.inclination * (Math.PI / 180);
  const radius = EARTH_RADIUS + sat.altitude;

  for (let i = 0; i < ORBIT_LINE_SEGMENTS; i++) {
    const phase = (i / ORBIT_LINE_SEGMENTS) * 360;
    const phaseRad = phase * (Math.PI / 180);

    // Same calculations as updateSatelliteMotion
    const xOrbit = Math.cos(phaseRad);
    const yOrbit = Math.sin(phaseRad);

    // Compute lat/lon
    const lat = Math.asin(yOrbit * Math.sin(inclinationRad)) * (180 / Math.PI);
    const lonInOrbit = Math.atan2(yOrbit * Math.cos(inclinationRad), xOrbit) * (180 / Math.PI);
    const lon = sat.ascendingNode + lonInOrbit;

    // Convert to 3D position
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    positions[i * 3] = -radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }

  orbitLineGeometry.attributes.position.needsUpdate = true;
  orbitLine.visible = true;
}

// Reusable objects for updateSelectionRing
const _ringUp = new THREE.Vector3(0, 1, 0);
const _ringQuat = new THREE.Quaternion();

/**
 * Update selection ring position to follow selected unit
 */
export function updateSelectionRing(): void {
  if (!state.selectedUnit || !deps) {
    selectionRing.visible = false;
    return;
  }

  const { type, index } = state.selectedUnit;
  let lat: number, lon: number, altitude: number;

  if (type === "ship") {
    const unitData = deps.getShipState(index);
    if (!unitData) { selectionRing.visible = false; return; }
    lat = unitData.lat;
    lon = unitData.lon;
    altitude = SHIP_ALTITUDE;
  } else if (type === "aircraft") {
    const unitData = deps.getAircraftState(index);
    if (!unitData) { selectionRing.visible = false; return; }
    lat = unitData.lat;
    lon = unitData.lon;
    altitude = AIRCRAFT_ALTITUDE;
  } else if (type === "satellite") {
    const unitData = deps.getSatelliteState(index);
    if (!unitData) { selectionRing.visible = false; return; }
    lat = unitData.lat;
    lon = unitData.lon;
    altitude = unitData.altitude;
  } else if (type === "drone") {
    const unitData = deps.getDroneState(index);
    if (!unitData) { selectionRing.visible = false; return; }
    lat = unitData.lat;
    lon = unitData.lon;
    altitude = unitData.altitude;
  } else if (type === "airport") {
    const airport = AIRPORTS[index];
    if (!airport) { selectionRing.visible = false; return; }
    lat = airport.lat;
    lon = airport.lon;
    altitude = 0.008; // Same as airport markers
  } else {
    selectionRing.visible = false;
    return;
  }

  // Convert lat/lon to 3D position (same formula as shader)
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const radius = EARTH_RADIUS + altitude;

  let x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  let z = radius * Math.sin(phi) * Math.sin(theta);

  // Apply earth rotation to position (rotate around world Y axis)
  const earthRotY = deps.getEarthRotationY();
  const cosR = Math.cos(earthRotY);
  const sinR = Math.sin(earthRotY);
  const rx = x * cosR + z * sinR;
  const rz = -x * sinR + z * cosR;

  selectionRing.position.set(rx, y, rz);

  // Orient ring perpendicular to surface (face outward from Earth center)
  const surfaceNormal = selectionRing.position.clone().normalize();
  _ringQuat.setFromUnitVectors(_ringUp, surfaceNormal);
  selectionRing.quaternion.copy(_ringQuat);

  // Set color based on unit type
  selectionRingMaterial.uniforms.uColor.value.setHex(SELECTION_COLORS[type] || 0xffffff);

  // Scale ring to match icon scaling (including user multiplier)
  const cameraDistance = deps.getCameraDistance();
  const baseDistance = 13;
  const ringScale = Math.max(0.3, Math.min(2.0, cameraDistance / baseDistance)) * iconScaleParams.multiplier;
  selectionRing.scale.setScalar(ringScale);

  selectionRing.visible = true;

  // Update type-specific visuals
  if (type === "satellite") {
    const satData = deps.getSatelliteState(index);
    updateOrbitLine(satData || null);
    // Hide drone visuals
    patrolCircle.visible = false;
    observationLine.visible = false;
    targetMarker.visible = false;
  } else if (type === "drone") {
    const droneData = deps.getDroneState(index);
    updatePatrolCircle(droneData || null);
    updateObservationLine(droneData || null);
    // Hide satellite visuals
    orbitLine.visible = false;
  } else {
    // Hide both satellite and drone visuals
    orbitLine.visible = false;
    patrolCircle.visible = false;
    observationLine.visible = false;
    targetMarker.visible = false;
  }
}

/**
 * Initialize selection visuals - add meshes to scene
 */
export function initSelectionVisuals(scene: THREE.Scene): void {
  scene.add(patrolCircle);
  scene.add(observationLine);
  scene.add(targetMarker);
  scene.add(selectionRing);
  scene.add(orbitLine);
}

/**
 * Hide all selection visuals (called on deselect)
 */
export function hideAllSelectionVisuals(): void {
  selectionRing.visible = false;
  orbitLine.visible = false;
  patrolCircle.visible = false;
  observationLine.visible = false;
  targetMarker.visible = false;
}

/**
 * Set orbit line Y rotation to match earth
 */
export function setOrbitLineRotation(rotationY: number): void {
  orbitLine.rotation.y = rotationY;
}
