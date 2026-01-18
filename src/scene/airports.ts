/**
 * Airport Markers System
 *
 * Renders airport markers and labels on the globe with camera-distance-based scaling.
 */

import * as THREE from "three";
import { EARTH_RADIUS } from "../constants";
import { AIRPORTS } from "../data/airports";
import type { AirportParams, Airport } from "../types";

// =============================================================================
// STATE
// =============================================================================

/** Airport display parameters */
export const airportParams: AirportParams = {
  visible: true,
  showLabels: true,
  markerSize: 0.06, // Default size (also controls label size)
};

/** Group to hold all airport markers */
export const airportGroup = new THREE.Group();
airportGroup.renderOrder = 5;

/** Cached lists of objects for fast per-frame updates (avoid traverse) */
const scaleableMarkers: THREE.Object3D[] = [];
const scaleableLabels: THREE.Object3D[] = [];

// =============================================================================
// MARKER CREATION
// =============================================================================

/**
 * Create a single airport marker with label
 */
function createAirportMarker(airport: Airport): THREE.Group {
  const { lat, lon, iata } = airport;
  const group = new THREE.Group();

  // Calculate position on globe
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const radius = EARTH_RADIUS + 0.02; // Above surface (raised higher to clear 3D tiles terrain)

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  // Create marker (small diamond/dot)
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 32;
  canvas.height = 32;

  // Draw diamond shape
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.moveTo(16, 4); // top
  ctx.lineTo(28, 16); // right
  ctx.lineTo(16, 28); // bottom
  ctx.lineTo(4, 16); // left
  ctx.closePath();
  ctx.fill();

  // Add subtle border
  ctx.strokeStyle = "rgba(100, 200, 255, 0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const markerTexture = new THREE.CanvasTexture(canvas);
  const markerMaterial = new THREE.SpriteMaterial({
    map: markerTexture,
    transparent: true,
    depthWrite: false,
  });

  const marker = new THREE.Sprite(markerMaterial);
  marker.position.set(x, y, z);
  marker.scale.set(airportParams.markerSize, airportParams.markerSize, 1);
  group.add(marker);

  // Create label
  const labelCanvas = document.createElement("canvas");
  const labelCtx = labelCanvas.getContext("2d")!;
  labelCanvas.width = 128;
  labelCanvas.height = 48;

  // Draw label background (subtle)
  labelCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
  labelCtx.roundRect(10, 8, 108, 32, 4);
  labelCtx.fill();

  // Draw text
  labelCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
  labelCtx.font = "bold 22px 'SF Mono', Monaco, monospace";
  labelCtx.textAlign = "center";
  labelCtx.textBaseline = "middle";
  labelCtx.fillText(iata, 64, 24);

  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const labelMaterial = new THREE.SpriteMaterial({
    map: labelTexture,
    transparent: true,
    depthWrite: false,
  });

  const label = new THREE.Sprite(labelMaterial);
  // Position label to the right of the marker (tangent to surface)
  const normal = new THREE.Vector3(x, y, z).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, normal).normalize();
  // Handle poles
  if (right.length() < 0.001) {
    right.set(1, 0, 0);
  }
  // Store base position and offset direction for dynamic positioning
  const baseOffset = 0.06;
  label.position.set(
    x + right.x * baseOffset,
    y + right.y * baseOffset,
    z + right.z * baseOffset
  );
  label.scale.set(0.12, 0.045, 1); // Base size (3x increase to match marker)
  label.userData.isLabel = true;
  label.userData.baseScale = { x: 0.12, y: 0.045 };
  label.userData.basePosition = { x, y, z }; // Marker position
  label.userData.offsetDirection = { x: right.x, y: right.y, z: right.z };
  label.userData.baseOffset = baseOffset;
  group.add(label);

  // Store marker base scale for dynamic sizing
  marker.userData.baseScale = airportParams.markerSize;

  return group;
}

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Build all airport markers
 */
export function buildAirportMarkers(): void {
  // Clear existing markers and caches
  while (airportGroup.children.length > 0) {
    const child = airportGroup.children[0];
    child.traverse((obj) => {
      if (obj instanceof THREE.Sprite) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    airportGroup.remove(child);
  }
  scaleableMarkers.length = 0;
  scaleableLabels.length = 0;

  // Create markers for each airport
  for (const airport of AIRPORTS) {
    const marker = createAirportMarker(airport);
    airportGroup.add(marker);
  }

  // Cache scaleable objects for fast per-frame updates (avoid traverse)
  airportGroup.traverse((obj) => {
    if (obj.userData && obj.userData.baseScale) {
      if (obj.userData.isLabel) {
        scaleableLabels.push(obj);
      } else {
        scaleableMarkers.push(obj);
      }
    }
  });

  // Update visibility
  airportGroup.visible = airportParams.visible;
  updateAirportLabels();
}

/**
 * Toggle airport label visibility
 */
export function updateAirportLabels(): void {
  airportGroup.traverse((obj) => {
    if (obj.userData && obj.userData.isLabel) {
      obj.visible = airportParams.showLabels;
    }
  });
}

/**
 * Update airport marker and label scales based on camera distance.
 * Keeps them at a consistent screen size regardless of zoom.
 * Uses cached object lists for O(n) instead of traverse overhead.
 */
export function updateAirportScales(cameraDistance: number): void {
  // Scale factor: same as icons
  const baseDistance = 13;
  const scaleFactor = cameraDistance / baseDistance;

  // Clamp scale to reasonable range
  const clampedScale = Math.max(0.3, Math.min(2.0, scaleFactor));

  // Use markerSize param as multiplier
  const sizeMultiplier = airportParams.markerSize / 0.06; // Normalize to default size

  // Update markers (simple scale)
  const markerSize = airportParams.markerSize * clampedScale;
  for (let i = 0; i < scaleableMarkers.length; i++) {
    const obj = scaleableMarkers[i];
    obj.scale.set(markerSize, markerSize, 1);
  }

  // Update labels (scale + position)
  const labelScale = clampedScale * sizeMultiplier;
  for (let i = 0; i < scaleableLabels.length; i++) {
    const obj = scaleableLabels[i];
    const ud = obj.userData;
    obj.scale.set(
      ud.baseScale.x * labelScale,
      ud.baseScale.y * labelScale,
      1
    );
    // Update label position to maintain constant visual distance from marker
    if (ud.basePosition && ud.offsetDirection) {
      const bp = ud.basePosition;
      const od = ud.offsetDirection;
      const scaledOffset = ud.baseOffset * clampedScale;
      obj.position.set(
        bp.x + od.x * scaledOffset,
        bp.y + od.y * scaledOffset,
        bp.z + od.z * scaledOffset
      );
    }
  }
}

/**
 * Initialize airport system - adds group to scene and builds markers
 */
export function initAirports(scene: THREE.Scene): void {
  scene.add(airportGroup);
  buildAirportMarkers();
}

/**
 * Set airport rotation to match earth rotation
 */
export function setAirportRotation(rotationY: number): void {
  airportGroup.rotation.y = rotationY;
}
