/**
 * Lat/Lon Grid System
 *
 * Renders latitude and longitude grid lines on the globe with configurable intervals.
 */

import * as THREE from "three";
import { EARTH_RADIUS, GRID_ALTITUDE, GRID_SEGMENTS } from "../constants";
import { latLonToPosition } from "../utils/coordinates";
import type { GridParams } from "../types";

// =============================================================================
// STATE
// =============================================================================

/** Grid display parameters */
export const gridParams: GridParams = {
  visible: true,
  opacity: 0.3,
  latInterval: 30, // Degrees between latitude lines
  lonInterval: 30, // Degrees between longitude lines
};

/** Container for all grid elements (for easy visibility toggling) */
export const gridGroup = new THREE.Group();
gridGroup.name = "latLonGrid";

/** Material for grid lines - subtle and semi-transparent */
export const gridLineMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: gridParams.opacity,
  depthWrite: false,
});

// =============================================================================
// LINE CREATION
// =============================================================================

/**
 * Create a latitude line (circle parallel to equator)
 * @param lat - Latitude in degrees (-90 to 90)
 */
function createLatitudeLine(lat: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  const phi = (90 - lat) * (Math.PI / 180);
  const radius = (EARTH_RADIUS + GRID_ALTITUDE) * Math.sin(phi);
  const y = (EARTH_RADIUS + GRID_ALTITUDE) * Math.cos(phi);

  for (let i = 0; i <= GRID_SEGMENTS; i++) {
    const theta = (i / GRID_SEGMENTS) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        radius * Math.cos(theta),
        y,
        radius * Math.sin(theta)
      )
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, gridLineMaterial);
  return line;
}

/**
 * Create a longitude line (great circle from pole to pole)
 * @param lon - Longitude in degrees (-180 to 180)
 */
function createLongitudeLine(lon: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  const theta = (lon + 180) * (Math.PI / 180);

  for (let i = 0; i <= GRID_SEGMENTS; i++) {
    const phi = (i / GRID_SEGMENTS) * Math.PI;
    const radius = EARTH_RADIUS + GRID_ALTITUDE;
    points.push(
      new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      )
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, gridLineMaterial);
  return line;
}

/**
 * Create a text sprite for lat/lon labels
 * @param text - Label text
 * @param position - Position on the globe
 */
function createTextLabel(text: string, position: THREE.Vector3): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  canvas.width = 128;
  canvas.height = 64;

  // Draw text
  context.fillStyle = "rgba(255, 255, 255, 0.6)";
  context.font = "bold 24px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 64, 32);

  // Create sprite
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(0.15, 0.075, 1);

  return sprite;
}

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Build the complete grid with lines and labels
 */
export function buildGrid(): void {
  // Clear existing grid
  while (gridGroup.children.length > 0) {
    const child = gridGroup.children[0];
    if ((child as THREE.Line).geometry) (child as THREE.Line).geometry.dispose();
    if ((child as THREE.Line | THREE.Sprite).material) {
      const mat = (child as THREE.Line | THREE.Sprite).material as THREE.Material & { map?: THREE.Texture };
      if (mat.map) mat.map.dispose();
      mat.dispose();
    }
    gridGroup.remove(child);
  }

  const latInterval = gridParams.latInterval;
  const lonInterval = gridParams.lonInterval;

  // Create latitude lines
  for (let lat = -90 + latInterval; lat < 90; lat += latInterval) {
    const line = createLatitudeLine(lat);
    gridGroup.add(line);

    // Add label at prime meridian (lon = 0)
    const labelPos = latLonToPosition(lat, 0, GRID_ALTITUDE + 0.02);
    const label = createTextLabel(`${lat}°`, labelPos);
    gridGroup.add(label);
  }

  // Create longitude lines
  for (let lon = -180; lon < 180; lon += lonInterval) {
    const line = createLongitudeLine(lon);
    gridGroup.add(line);

    // Add label at equator
    if (lon !== 0) { // Skip 0° to avoid overlap with lat labels
      const labelPos = latLonToPosition(0, lon, GRID_ALTITUDE + 0.02);
      const label = createTextLabel(`${lon}°`, labelPos);
      gridGroup.add(label);
    }
  }

  // Add equator label
  const equatorLabel = createTextLabel("0°", latLonToPosition(0, 0, GRID_ALTITUDE + 0.02));
  gridGroup.add(equatorLabel);
}

/**
 * Initialize grid system - adds group to earth and builds grid
 */
export function initGrid(earth: THREE.Mesh): void {
  earth.add(gridGroup);
  buildGrid();
}

/**
 * Update grid visibility
 */
export function updateGridVisibility(): void {
  gridGroup.visible = gridParams.visible;
}

/**
 * Update grid line opacity
 */
export function updateGridOpacity(): void {
  gridLineMaterial.opacity = gridParams.opacity;
}
