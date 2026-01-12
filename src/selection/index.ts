/**
 * Unit Selection System
 *
 * Handles unit selection, selection ring visualization,
 * orbit line display, and drone patrol visualization.
 */

import * as THREE from "three";
import {
  EARTH_RADIUS,
  SHIP_ALTITUDE,
  AIRCRAFT_ALTITUDE,
  ORBIT_LINE_SEGMENTS,
  PATROL_CIRCLE_SEGMENTS,
  DEG_TO_RAD,
} from "../constants";
import type { SelectedUnit, UnitType, SatelliteState, DroneState } from "../types";

// =============================================================================
// SELECTION STATE
// =============================================================================

/** Currently selected unit */
export let selectedUnit: SelectedUnit | null = null;

/**
 * Set the selected unit.
 */
export function setSelectedUnit(unit: SelectedUnit | null): void {
  selectedUnit = unit;
}

/**
 * Get the currently selected unit.
 */
export function getSelectedUnit(): SelectedUnit | null {
  return selectedUnit;
}

/**
 * Clear the selection.
 */
export function clearSelection(): void {
  selectedUnit = null;
}

// =============================================================================
// SELECTION RING
// =============================================================================

/** Selection ring shader - vertex */
const SELECTION_RING_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Selection ring shader - fragment */
const SELECTION_RING_FRAGMENT = `
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
`;

/** Selection ring colors by unit type */
export const SELECTION_COLORS: Record<UnitType, number> = {
  ship: 0x00ffff, // Teal
  aircraft: 0xffa500, // Amber
  satellite: 0xaa88ff, // Violet
  drone: 0x84cc16, // Lime green
  airport: 0xffffff, // White
};

/** Selection ring references */
export interface SelectionRingRefs {
  geometry: THREE.RingGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
}

/**
 * Create the selection ring mesh.
 */
export function createSelectionRing(): SelectionRingRefs {
  const geometry = new THREE.RingGeometry(0.025, 0.032, 32);
  geometry.rotateX(-Math.PI / 2); // Lay flat on surface

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uTime: { value: 0 },
    },
    vertexShader: SELECTION_RING_VERTEX,
    fragmentShader: SELECTION_RING_FRAGMENT,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 10;

  return { geometry, material, mesh };
}

// Reusable vectors for ring orientation
const _ringUp = new THREE.Vector3(0, 1, 0);
const _ringQuat = new THREE.Quaternion();

/**
 * Update selection ring position to follow selected unit.
 */
export function updateSelectionRing(
  refs: SelectionRingRefs,
  selected: SelectedUnit | null,
  getUnitPosition: (
    type: UnitType,
    index: number
  ) => { lat: number; lon: number; altitude: number } | null,
  earthRotationY: number,
  cameraDistance: number,
  iconScaleMultiplier: number
): void {
  if (!selected) {
    refs.mesh.visible = false;
    return;
  }

  const position = getUnitPosition(selected.type, selected.index);
  if (!position) {
    refs.mesh.visible = false;
    return;
  }

  const { lat, lon, altitude } = position;

  // Convert lat/lon to 3D position
  const phi = (90 - lat) * DEG_TO_RAD;
  const theta = (lon + 180) * DEG_TO_RAD;
  const radius = EARTH_RADIUS + altitude;

  let x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  let z = radius * Math.sin(phi) * Math.sin(theta);

  // Apply earth rotation
  const cosR = Math.cos(earthRotationY);
  const sinR = Math.sin(earthRotationY);
  const rx = x * cosR + z * sinR;
  const rz = -x * sinR + z * cosR;

  refs.mesh.position.set(rx, y, rz);

  // Orient ring perpendicular to surface
  const surfaceNormal = refs.mesh.position.clone().normalize();
  _ringQuat.setFromUnitVectors(_ringUp, surfaceNormal);
  refs.mesh.quaternion.copy(_ringQuat);

  // Set color based on unit type
  refs.material.uniforms.uColor.value.setHex(
    SELECTION_COLORS[selected.type] || 0xffffff
  );

  // Scale ring based on camera distance
  const baseDistance = 13;
  const ringScale =
    Math.max(0.3, Math.min(2.0, cameraDistance / baseDistance)) *
    iconScaleMultiplier;
  refs.mesh.scale.setScalar(ringScale);

  refs.mesh.visible = true;
}

/**
 * Update selection ring animation time.
 */
export function updateSelectionRingTime(
  material: THREE.ShaderMaterial,
  time: number
): void {
  material.uniforms.uTime.value = time;
}

// =============================================================================
// ORBIT LINE (for satellites)
// =============================================================================

/** Orbit line references */
export interface OrbitLineRefs {
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
  mesh: THREE.LineLoop;
  positions: Float32Array;
}

/**
 * Create the satellite orbit line.
 */
export function createOrbitLine(): OrbitLineRefs {
  const material = new THREE.LineBasicMaterial({
    color: 0xaa88ff, // Violet to match satellite color
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(ORBIT_LINE_SEGMENTS * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mesh = new THREE.LineLoop(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 5;

  return { geometry, material, mesh, positions };
}

/**
 * Update orbit line to show satellite's orbital path.
 */
export function updateOrbitLine(
  refs: OrbitLineRefs,
  sat: SatelliteState | null
): void {
  if (!sat) {
    refs.mesh.visible = false;
    return;
  }

  const positions = refs.geometry.attributes.position.array as Float32Array;
  const inclinationRad = sat.inclination * DEG_TO_RAD;
  const radius = EARTH_RADIUS + sat.altitude;

  for (let i = 0; i < ORBIT_LINE_SEGMENTS; i++) {
    const phase = (i / ORBIT_LINE_SEGMENTS) * 360;
    const phaseRad = phase * DEG_TO_RAD;

    const xOrbit = Math.cos(phaseRad);
    const yOrbit = Math.sin(phaseRad);

    const lat = Math.asin(yOrbit * Math.sin(inclinationRad)) * (180 / Math.PI);
    const lonInOrbit =
      Math.atan2(yOrbit * Math.cos(inclinationRad), xOrbit) * (180 / Math.PI);
    const lon = sat.ascendingNode + lonInOrbit;

    const phi = (90 - lat) * DEG_TO_RAD;
    const theta = (lon + 180) * DEG_TO_RAD;

    positions[i * 3] = -radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }

  refs.geometry.attributes.position.needsUpdate = true;
  refs.mesh.visible = true;
}

// =============================================================================
// PATROL CIRCLE (for drones)
// =============================================================================

/** Patrol circle references */
export interface PatrolCircleRefs {
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
  mesh: THREE.LineLoop;
}

/**
 * Create the drone patrol circle.
 */
export function createPatrolCircle(): PatrolCircleRefs {
  const material = new THREE.LineBasicMaterial({
    color: 0x84cc16, // Lime green
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PATROL_CIRCLE_SEGMENTS * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mesh = new THREE.LineLoop(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 5;

  return { geometry, material, mesh };
}

/**
 * Update patrol circle to show drone's patrol area.
 */
export function updatePatrolCircle(
  refs: PatrolCircleRefs,
  drone: DroneState | null,
  earthRotationY: number
): void {
  if (!drone) {
    refs.mesh.visible = false;
    return;
  }

  const positions = refs.geometry.attributes.position.array as Float32Array;
  const altitude = drone.altitude;
  const radius = EARTH_RADIUS + altitude;

  for (let i = 0; i < PATROL_CIRCLE_SEGMENTS; i++) {
    const angle = (i / PATROL_CIRCLE_SEGMENTS) * Math.PI * 2;

    // Position on patrol circle
    const lat =
      drone.patrolCenterLat +
      (drone.patrolRadius * Math.cos(angle) * 180) / Math.PI;
    const lon =
      drone.patrolCenterLon +
      ((drone.patrolRadius * Math.sin(angle) * 180) / Math.PI) *
        Math.cos(drone.patrolCenterLat * DEG_TO_RAD);

    const phi = (90 - lat) * DEG_TO_RAD;
    const theta = (lon + 180) * DEG_TO_RAD;

    let x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    let z = radius * Math.sin(phi) * Math.sin(theta);

    // Apply earth rotation
    const cosR = Math.cos(earthRotationY);
    const sinR = Math.sin(earthRotationY);
    positions[i * 3] = x * cosR + z * sinR;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = -x * sinR + z * cosR;
  }

  refs.geometry.attributes.position.needsUpdate = true;
  refs.mesh.visible = true;
}

// =============================================================================
// OBSERVATION LINE (for drones)
// =============================================================================

/** Observation line references */
export interface ObservationLineRefs {
  geometry: THREE.BufferGeometry;
  material: THREE.LineDashedMaterial;
  mesh: THREE.Line;
}

/**
 * Create the drone observation line (drone to target).
 */
export function createObservationLine(): ObservationLineRefs {
  const material = new THREE.LineDashedMaterial({
    color: 0xff4444, // Red
    transparent: true,
    opacity: 0.7,
    dashSize: 0.01,
    gapSize: 0.01,
    depthWrite: false,
  });

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(6); // 2 points
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mesh = new THREE.Line(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 5;

  return { geometry, material, mesh };
}

/**
 * Update observation line from drone to target.
 */
export function updateObservationLine(
  refs: ObservationLineRefs,
  drone: DroneState | null,
  earthRotationY: number
): void {
  if (!drone) {
    refs.mesh.visible = false;
    return;
  }

  const positions = refs.geometry.attributes.position.array as Float32Array;

  // Drone position
  const droneRadius = EARTH_RADIUS + drone.altitude;
  const dronePhi = (90 - drone.lat) * DEG_TO_RAD;
  const droneTheta = (drone.lon + 180) * DEG_TO_RAD;

  let dx = -droneRadius * Math.sin(dronePhi) * Math.cos(droneTheta);
  const dy = droneRadius * Math.cos(dronePhi);
  let dz = droneRadius * Math.sin(dronePhi) * Math.sin(droneTheta);

  // Target position (on surface)
  const targetRadius = EARTH_RADIUS + 0.001;
  const targetPhi = (90 - drone.targetLat) * DEG_TO_RAD;
  const targetTheta = (drone.targetLon + 180) * DEG_TO_RAD;

  let tx = -targetRadius * Math.sin(targetPhi) * Math.cos(targetTheta);
  const ty = targetRadius * Math.cos(targetPhi);
  let tz = targetRadius * Math.sin(targetPhi) * Math.sin(targetTheta);

  // Apply earth rotation
  const cosR = Math.cos(earthRotationY);
  const sinR = Math.sin(earthRotationY);

  positions[0] = dx * cosR + dz * sinR;
  positions[1] = dy;
  positions[2] = -dx * sinR + dz * cosR;

  positions[3] = tx * cosR + tz * sinR;
  positions[4] = ty;
  positions[5] = -tx * sinR + tz * cosR;

  refs.geometry.attributes.position.needsUpdate = true;
  refs.mesh.computeLineDistances(); // Required for dashed lines
  refs.mesh.visible = true;
}

// =============================================================================
// TARGET MARKER (for drones)
// =============================================================================

/** Target marker references */
export interface TargetMarkerRefs {
  geometry: THREE.RingGeometry;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
}

/**
 * Create the drone target marker.
 */
export function createTargetMarker(): TargetMarkerRefs {
  const geometry = new THREE.RingGeometry(0.008, 0.012, 4); // Diamond shape
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateZ(Math.PI / 4); // 45 degrees to make diamond

  const material = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 5;

  return { geometry, material, mesh };
}

/**
 * Update target marker position.
 */
export function updateTargetMarker(
  refs: TargetMarkerRefs,
  drone: DroneState | null,
  earthRotationY: number
): void {
  if (!drone) {
    refs.mesh.visible = false;
    return;
  }

  const radius = EARTH_RADIUS + 0.002;
  const phi = (90 - drone.targetLat) * DEG_TO_RAD;
  const theta = (drone.targetLon + 180) * DEG_TO_RAD;

  let x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  let z = radius * Math.sin(phi) * Math.sin(theta);

  // Apply earth rotation
  const cosR = Math.cos(earthRotationY);
  const sinR = Math.sin(earthRotationY);
  refs.mesh.position.set(x * cosR + z * sinR, y, -x * sinR + z * cosR);

  // Orient perpendicular to surface
  const surfaceNormal = refs.mesh.position.clone().normalize();
  _ringQuat.setFromUnitVectors(_ringUp, surfaceNormal);
  refs.mesh.quaternion.copy(_ringQuat);

  refs.mesh.visible = true;
}
