/**
 * Unit Labels System
 *
 * GPU-instanced SDF text rendering with flat buffer architecture.
 * Uses a canvas-generated font atlas and worker-based H3 spatial indexing.
 */

import * as THREE from "three";
import {
  EARTH_RADIUS,
  SHIP_ALTITUDE,
  AIRCRAFT_ALTITUDE,
  DEG_TO_RAD,
} from "../constants";
import type {
  ShipState,
  AircraftState,
  SatelliteState,
  DroneState,
  LabelParams,
  LabelVisibility,
  LabelAssignments,
} from "../types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum characters per label (2 lines of 12 chars) */
export const MAX_LABEL_CHARS = 24;

/** Characters per line in multi-line layout */
export const CHARS_PER_LINE = 12;

/** Character set for the font atlas */
export const CHAR_SET = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ|.-/";

/** Font atlas texture size */
export const ATLAS_SIZE = 512;

/** Size of each character cell in atlas */
export const ATLAS_CHAR_SIZE = 32;

// =============================================================================
// CHARACTER LOOKUP TABLES
// =============================================================================

/** Character to atlas index lookup (O(1) encoding) */
const CHAR_TO_INDEX = new Uint8Array(128);
CHAR_SET.split("").forEach((c, i) => {
  CHAR_TO_INDEX[c.charCodeAt(0)] = i;
});

/** UV lookup tables - flat arrays indexed by character index */
const CHAR_UV_U = new Float32Array(CHAR_SET.length);
const CHAR_UV_V = new Float32Array(CHAR_SET.length);
const CHAR_UV_W = ATLAS_CHAR_SIZE / ATLAS_SIZE;
const CHAR_UV_H = ATLAS_CHAR_SIZE / ATLAS_SIZE;

// Pre-compute UV coordinates for each character
const charsPerRow = Math.floor(ATLAS_SIZE / ATLAS_CHAR_SIZE);
for (let i = 0; i < CHAR_SET.length; i++) {
  const col = i % charsPerRow;
  const row = Math.floor(i / charsPerRow);
  CHAR_UV_U[i] = (col * ATLAS_CHAR_SIZE) / ATLAS_SIZE;
  CHAR_UV_V[i] = (row * ATLAS_CHAR_SIZE) / ATLAS_SIZE;
}

// =============================================================================
// FONT ATLAS
// =============================================================================

/**
 * Generate the font atlas texture.
 */
export function generateFontAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  ctx.fillStyle = "white";
  ctx.font = `bold ${ATLAS_CHAR_SIZE - 4}px "SF Mono", Monaco, "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < CHAR_SET.length; i++) {
    const col = i % charsPerRow;
    const row = Math.floor(i / charsPerRow);
    const x = col * ATLAS_CHAR_SIZE + ATLAS_CHAR_SIZE / 2;
    const y = row * ATLAS_CHAR_SIZE + ATLAS_CHAR_SIZE / 2;
    ctx.fillText(CHAR_SET[i], x, y);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

// =============================================================================
// LABEL BUFFER
// =============================================================================

/** Label buffer for GPU instanced rendering */
export interface LabelBuffer {
  positions: Float32Array;
  charUVs: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  charIndices: Float32Array;
  activeCount: number;
}

/**
 * Create a label buffer for GPU instanced rendering.
 */
export function createLabelBuffer(maxLabels: number): LabelBuffer {
  const totalInstances = maxLabels * MAX_LABEL_CHARS;

  const buffer: LabelBuffer = {
    positions: new Float32Array(totalInstances * 3),
    charUVs: new Float32Array(totalInstances * 4),
    colors: new Float32Array(totalInstances * 3),
    scales: new Float32Array(totalInstances),
    charIndices: new Float32Array(totalInstances),
    activeCount: 0,
  };

  // Pre-fill character indices (static - never changes)
  for (let label = 0; label < maxLabels; label++) {
    for (let char = 0; char < MAX_LABEL_CHARS; char++) {
      buffer.charIndices[label * MAX_LABEL_CHARS + char] = char;
    }
  }

  return buffer;
}

// =============================================================================
// TEXT ENCODING
// =============================================================================

/**
 * Encode text directly into UV buffer (zero-allocation).
 */
export function encodeTextToBuffer(
  text: string,
  labelIdx: number,
  charUVs: Float32Array
): void {
  const baseIdx = labelIdx * MAX_LABEL_CHARS * 4;

  for (let c = 0; c < MAX_LABEL_CHARS; c++) {
    const charCode = c < text.length ? text.charCodeAt(c) : 32; // space
    const charIdx = charCode < 128 ? CHAR_TO_INDEX[charCode] : 0;

    charUVs[baseIdx + c * 4] = CHAR_UV_U[charIdx];
    charUVs[baseIdx + c * 4 + 1] = CHAR_UV_V[charIdx];
    charUVs[baseIdx + c * 4 + 2] = CHAR_UV_W;
    charUVs[baseIdx + c * 4 + 3] = CHAR_UV_H;
  }
}

// =============================================================================
// LABEL FORMATTING
// =============================================================================

/**
 * Format ship label text (2 lines).
 * Line 1: Ship name (12 chars)
 * Line 2: Speed info (12 chars)
 */
export function formatShipLabel(unit: ShipState): string {
  const name = (unit.name || "UNKNOWN")
    .substring(0, CHARS_PER_LINE)
    .toUpperCase()
    .padEnd(CHARS_PER_LINE);
  const speed = unit.sog ? unit.sog.toFixed(1) + " KT" : "0.0 KT";
  const line2 = speed.padEnd(CHARS_PER_LINE).substring(0, CHARS_PER_LINE);
  return name + line2;
}

/**
 * Format aircraft label text (2 lines).
 * Line 1: Callsign (12 chars)
 * Line 2: Alt + Speed (12 chars)
 */
export function formatAircraftLabel(unit: AircraftState): string {
  const callsign = (unit.callsign || "N/A")
    .substring(0, CHARS_PER_LINE)
    .toUpperCase()
    .padEnd(CHARS_PER_LINE);
  const alt = unit.altitude ? Math.round(unit.altitude / 1000) + "K" : "0K";
  const spd = unit.groundSpeed ? unit.groundSpeed + "KT" : "0KT";
  const line2 = (alt + " " + spd)
    .padEnd(CHARS_PER_LINE)
    .substring(0, CHARS_PER_LINE);
  return callsign + line2;
}

/**
 * Format drone/UAV label text (2 lines) - tactical style.
 * Line 1: Designation + status (12 chars)
 * Line 2: Alt + mission type (12 chars)
 */
export function formatDroneLabel(unit: DroneState, index: number): string {
  const types = ["MQ9", "RQ4", "MQ1", "RQ7"];
  const type = types[index % types.length];
  const num = String((index % 99) + 1).padStart(2, "0");
  const status = "ACTV";
  const line1 = (type + "-" + num + " " + status)
    .padEnd(CHARS_PER_LINE)
    .substring(0, CHARS_PER_LINE);

  // Altitude in thousands + mission
  const altFt = Math.round((unit.altitude * 6371) / EARTH_RADIUS) * 3281;
  const altK = Math.round(altFt / 1000) + "K";
  const mission = "ISR";
  const line2 = ("FL" + altK + " " + mission)
    .padEnd(CHARS_PER_LINE)
    .substring(0, CHARS_PER_LINE);

  return line1 + line2;
}

/**
 * Format satellite label text (2 lines).
 * Line 1: Name (12 chars)
 * Line 2: Orbit type + altitude (12 chars)
 */
export function formatSatelliteLabel(unit: SatelliteState): string {
  const name = (unit.name || "UNKNOWN")
    .substring(0, CHARS_PER_LINE)
    .toUpperCase()
    .padEnd(CHARS_PER_LINE);
  const altKm = Math.round((unit.altitude * 6371) / EARTH_RADIUS);
  const altStr = altKm >= 1000 ? Math.round(altKm / 1000) + "KKM" : altKm + "KM";
  const orbit = unit.orbitTypeLabel || "LEO";
  const line2 = (orbit + " " + altStr)
    .padEnd(CHARS_PER_LINE)
    .substring(0, CHARS_PER_LINE);
  return name + line2;
}

// =============================================================================
// LABEL COLORS
// =============================================================================

/** Unit type colors for labels */
export const LABEL_COLORS = {
  ship: { r: 0.18, g: 0.83, b: 0.75 }, // Teal
  aircraft: { r: 0.98, g: 0.75, b: 0.14 }, // Amber
  drone: { r: 0.52, g: 0.8, b: 0.09 }, // Lime green
  satellite: { r: 0.3, g: 0.7, b: 1.0 }, // Cyan/blue (commercial)
  satelliteMilitary: { r: 1.0, g: 0.35, b: 0.25 }, // Red/orange
};

// =============================================================================
// LABEL SHADERS
// =============================================================================

/** Label vertex shader */
export const LABEL_VERTEX_SHADER = `
  attribute vec3 aLabelPos;
  attribute float aCharIndex;
  attribute vec4 aCharUV;
  attribute vec3 aColor;
  attribute float aScale;

  uniform float uCharWidth;
  uniform float uCharHeight;
  uniform float uCharsPerLine;
  uniform float uCameraDistance;
  uniform float uLabelOffset;

  varying vec2 vUV;
  varying vec3 vColor;

  void main() {
    vColor = aColor;

    // GPU Semantic Zoom: scale based on camera distance
    float zoomScale = clamp(uCameraDistance * 0.15, 0.3, 2.0);
    float finalScale = aScale * zoomScale;

    // Billboard vectors from view matrix
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    // Multi-line layout: which line and column is this character?
    float lineNum = floor(aCharIndex / uCharsPerLine);
    float colNum = mod(aCharIndex, uCharsPerLine);

    // Character offset (left to right from viewer's perspective)
    float charOffsetX = colNum * uCharWidth * finalScale;
    float charOffsetY = -lineNum * uCharHeight * finalScale * 1.2;

    // Quad position
    float qx = position.x * uCharWidth * finalScale;
    float qy = position.y * uCharHeight * finalScale;

    // Position label to the right of unit in screen-space
    vec3 worldPos = aLabelPos
      + camRight * (qx + charOffsetX + uLabelOffset)
      + camUp * (qy + charOffsetY);

    // UV mapping - flip V to correct upside-down characters
    vUV = aCharUV.xy + vec2(position.x + 0.5, 0.5 - position.y) * aCharUV.zw;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

/** Label fragment shader */
export const LABEL_FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D uAtlas;
  uniform float uSmoothing;
  uniform float uDebugMode;
  varying vec2 vUV;
  varying vec3 vColor;

  void main() {
    // Debug mode 3: solid color (geometry test)
    if (uDebugMode > 2.5) {
      gl_FragColor = vec4(vColor, 1.0);
      return;
    }

    // Debug mode 1: visualize UV coordinates
    if (uDebugMode > 0.5 && uDebugMode < 1.5) {
      gl_FragColor = vec4(vUV.x, vUV.y, 0.0, 1.0);
      return;
    }

    // Sample font atlas
    vec4 texSample = texture2D(uAtlas, vUV);
    float dist = texSample.r;

    // Debug mode 2: visualize raw texture value
    if (uDebugMode > 1.5 && uDebugMode < 2.5) {
      gl_FragColor = vec4(dist, dist, dist, 1.0);
      return;
    }

    // Normal rendering: threshold for canvas-rendered text
    float alpha = smoothstep(0.1, 0.5, dist);

    // Safety: if texture returns 0, show faint outline instead of discard
    if (dist < 0.01) {
      gl_FragColor = vec4(vColor * 0.3, 0.2);
      return;
    }

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(vColor, alpha);
  }
`;

// =============================================================================
// LABEL MESH
// =============================================================================

/** Label mesh references */
export interface LabelMeshRefs {
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  buffer: LabelBuffer;
  posAttr: THREE.InstancedBufferAttribute;
  uvAttr: THREE.InstancedBufferAttribute;
  colorAttr: THREE.InstancedBufferAttribute;
  scaleAttr: THREE.InstancedBufferAttribute;
}

/**
 * Create the label instancing system.
 */
export function createLabelSystem(
  fontAtlasTexture: THREE.Texture,
  maxLabels: number = 10,
  labelOffset: number = 0.025
): LabelMeshRefs {
  const buffer = createLabelBuffer(maxLabels);
  const geometry = new THREE.InstancedBufferGeometry();

  // Base quad vertices (2 triangles)
  const quadPositions = new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5,
    0.5, 0,
  ]);
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(quadPositions, 3)
  );

  // Create instanced buffer attributes
  const posAttr = new THREE.InstancedBufferAttribute(buffer.positions, 3);
  const uvAttr = new THREE.InstancedBufferAttribute(buffer.charUVs, 4);
  const colorAttr = new THREE.InstancedBufferAttribute(buffer.colors, 3);
  const scaleAttr = new THREE.InstancedBufferAttribute(buffer.scales, 1);
  const charIdxAttr = new THREE.InstancedBufferAttribute(
    buffer.charIndices,
    1
  );

  posAttr.setUsage(THREE.DynamicDrawUsage);
  uvAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  scaleAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute("aLabelPos", posAttr);
  geometry.setAttribute("aCharUV", uvAttr);
  geometry.setAttribute("aColor", colorAttr);
  geometry.setAttribute("aScale", scaleAttr);
  geometry.setAttribute("aCharIndex", charIdxAttr);

  const material = new THREE.ShaderMaterial({
    vertexShader: LABEL_VERTEX_SHADER,
    fragmentShader: LABEL_FRAGMENT_SHADER,
    uniforms: {
      uAtlas: { value: fontAtlasTexture },
      uCharWidth: { value: 0.7 },
      uCharHeight: { value: 1.0 },
      uCharsPerLine: { value: CHARS_PER_LINE },
      uCameraDistance: { value: 5.0 },
      uLabelOffset: { value: labelOffset },
      uAtlasSize: { value: new THREE.Vector2(ATLAS_SIZE, ATLAS_SIZE) },
      uSmoothing: { value: 0.2 },
      uOutlineWidth: { value: 0.1 },
      uOutlineColor: { value: new THREE.Color(0x000000) },
      uDebugMode: { value: 0.0 },
    },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;

  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10);

  return {
    geometry,
    material,
    mesh,
    buffer,
    posAttr,
    uvAttr,
    colorAttr,
    scaleAttr,
  };
}

/**
 * Update camera distance uniform for GPU semantic zoom.
 */
export function updateLabelCameraDistance(
  material: THREE.ShaderMaterial,
  distance: number
): void {
  material.uniforms.uCameraDistance.value = distance;
}

/**
 * Set label system visibility.
 */
export function setLabelVisibility(mesh: THREE.Mesh, visible: boolean): void {
  mesh.visible = visible;
}

/**
 * Set label debug mode (0=normal, 1=UV, 2=texture, 3=solid).
 */
export function setLabelDebugMode(
  material: THREE.ShaderMaterial,
  mode: number
): void {
  material.uniforms.uDebugMode.value = mode;
}

// =============================================================================
// COORDINATE HELPERS
// =============================================================================

/** Temporary vector for position calculations */
const _tempVec = new THREE.Vector3();

/**
 * Convert lat/lon to world position with earth rotation.
 */
export function latLonToWorldPosition(
  lat: number,
  lon: number,
  altitude: number,
  earthRotationY: number,
  outVec: THREE.Vector3
): void {
  const phi = (90 - lat) * DEG_TO_RAD;
  const theta = (lon + 180) * DEG_TO_RAD;
  const radius = EARTH_RADIUS + altitude;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  const x = -radius * sinPhi * cosTheta;
  const y = radius * cosPhi;
  const z = radius * sinPhi * sinTheta;

  // Apply earth rotation
  const cosR = Math.cos(earthRotationY);
  const sinR = Math.sin(earthRotationY);

  outVec.x = x * cosR + z * sinR;
  outVec.y = y;
  outVec.z = -x * sinR + z * cosR;
}

// =============================================================================
// LABEL BUFFER FILLING
// =============================================================================

/** Unit type enum for label buffer */
export const UNIT_TYPE = {
  SHIP: 0,
  AIRCRAFT: 1,
  DRONE: 2,
  SATELLITE: 3,
} as const;

export type UnitTypeValue = (typeof UNIT_TYPE)[keyof typeof UNIT_TYPE];

/**
 * Fill label buffer for a single label (text, color, scale - NOT position).
 */
export function fillLabelBuffer(
  buffer: LabelBuffer,
  labelIdx: number,
  unitType: UnitTypeValue,
  unit: ShipState | AircraftState | DroneState | SatelliteState,
  unitIndex?: number,
  fontSize: number = 0.015
): void {
  // Format text based on unit type
  let text: string;
  if (unitType === UNIT_TYPE.SHIP) {
    text = formatShipLabel(unit as ShipState);
  } else if (unitType === UNIT_TYPE.AIRCRAFT) {
    text = formatAircraftLabel(unit as AircraftState);
  } else if (unitType === UNIT_TYPE.DRONE) {
    text = formatDroneLabel(unit as DroneState, unitIndex || 0);
  } else {
    text = formatSatelliteLabel(unit as SatelliteState);
  }

  // Encode text to UVs
  encodeTextToBuffer(text, labelIdx, buffer.charUVs);

  // Determine color
  let r: number, g: number, b: number;
  if (unitType === UNIT_TYPE.SHIP) {
    r = LABEL_COLORS.ship.r;
    g = LABEL_COLORS.ship.g;
    b = LABEL_COLORS.ship.b;
  } else if (unitType === UNIT_TYPE.AIRCRAFT) {
    r = LABEL_COLORS.aircraft.r;
    g = LABEL_COLORS.aircraft.g;
    b = LABEL_COLORS.aircraft.b;
  } else if (unitType === UNIT_TYPE.DRONE) {
    r = LABEL_COLORS.drone.r;
    g = LABEL_COLORS.drone.g;
    b = LABEL_COLORS.drone.b;
  } else if ((unit as SatelliteState).isMilitary) {
    r = LABEL_COLORS.satelliteMilitary.r;
    g = LABEL_COLORS.satelliteMilitary.g;
    b = LABEL_COLORS.satelliteMilitary.b;
  } else {
    r = LABEL_COLORS.satellite.r;
    g = LABEL_COLORS.satellite.g;
    b = LABEL_COLORS.satellite.b;
  }

  // Fill all character instances for this label
  const baseColor = labelIdx * MAX_LABEL_CHARS * 3;
  const baseScale = labelIdx * MAX_LABEL_CHARS;

  for (let c = 0; c < MAX_LABEL_CHARS; c++) {
    const ci = baseColor + c * 3;
    buffer.colors[ci] = r;
    buffer.colors[ci + 1] = g;
    buffer.colors[ci + 2] = b;
    buffer.scales[baseScale + c] = fontSize;
  }
}

/**
 * Update label positions based on current unit positions.
 * This runs every frame to ensure smooth label following.
 */
export function updateLabelPositions(
  buffer: LabelBuffer,
  assignments: Array<{ type: UnitTypeValue; unitIndex: number }>,
  count: number,
  ships: ShipState[],
  aircraft: AircraftState[],
  drones: DroneState[],
  satellites: SatelliteState[],
  earthRotationY: number
): void {
  if (count === 0) return;

  for (let labelIdx = 0; labelIdx < count; labelIdx++) {
    const assignment = assignments[labelIdx];
    if (!assignment) continue;

    let unit: { lat: number; lon: number; altitude?: number } | undefined;
    let altitude: number;

    if (assignment.type === UNIT_TYPE.SHIP) {
      unit = ships[assignment.unitIndex];
      altitude = SHIP_ALTITUDE;
    } else if (assignment.type === UNIT_TYPE.AIRCRAFT) {
      unit = aircraft[assignment.unitIndex];
      altitude = AIRCRAFT_ALTITUDE;
    } else if (assignment.type === UNIT_TYPE.DRONE) {
      unit = drones[assignment.unitIndex];
      altitude = unit?.altitude ?? AIRCRAFT_ALTITUDE;
    } else {
      unit = satellites[assignment.unitIndex];
      altitude = unit?.altitude ?? 0.1;
    }

    if (!unit) continue;

    // Get world position with current earth rotation
    latLonToWorldPosition(
      unit.lat,
      unit.lon,
      altitude,
      earthRotationY,
      _tempVec
    );

    // Fill position for all character instances
    const basePos = labelIdx * MAX_LABEL_CHARS * 3;
    for (let c = 0; c < MAX_LABEL_CHARS; c++) {
      const pi = basePos + c * 3;
      buffer.positions[pi] = _tempVec.x;
      buffer.positions[pi + 1] = _tempVec.y;
      buffer.positions[pi + 2] = _tempVec.z;
    }
  }
}
