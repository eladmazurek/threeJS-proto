/**
 * H3 Grid System
 *
 * Density heatmap using Uber's H3 hexagonal grid system.
 * Features:
 * - Web Worker for background H3 calculations
 * - Chunked geometry building to prevent frame drops
 * - Cell popup with unit counts
 * - Selection highlight
 */

import * as THREE from "three";
import * as h3 from "h3-js";
import {
  EARTH_RADIUS,
  H3_PAN_THRESHOLD,
  H3_MAX_CELLS,
  H3_VERTS_PER_CELL,
  H3_CELLS_PER_CHUNK,
  POPUP_UPDATE_INTERVAL,
} from "../constants";
import { state } from "../state";
import type { ShipState, AircraftState, SatelliteState } from "../types";

// =============================================================================
// PARAMETERS
// =============================================================================

export const h3Params = {
  enabled: false,
  showDensity: true,
  opacity: 0.6,
  resolution: 1,
  updateInterval: 2.0,
};

// =============================================================================
// DEPENDENCIES (set via setH3Dependencies)
// =============================================================================

interface H3Dependencies {
  getEarth: () => THREE.Mesh;
  getCamera: () => THREE.Camera;
  getCanvas: () => HTMLCanvasElement;
  getShipSimState: () => ShipState[];
  getAircraftSimState: () => AircraftState[];
  getSatelliteSimState: () => SatelliteState[];
  getUnitCountParams: () => {
    showShips: boolean;
    showAircraft: boolean;
    showSatellites: boolean;
  };
}

let deps: H3Dependencies | null = null;

/**
 * Set dependencies for H3 grid system
 */
export function setH3Dependencies(dependencies: H3Dependencies): void {
  deps = dependencies;
}

// =============================================================================
// WEB WORKER
// =============================================================================

const h3Worker = new Worker(new URL("../h3Worker.js", import.meta.url), {
  type: "module",
});

h3Worker.onmessage = function (e) {
  const { type, data } = e.data;
  if (type === "densityResult") {
    state.h3.workerBusy = false;
    applyH3DensityResult(data);

    if (state.h3.pendingUpdate) {
      state.h3.pendingUpdate = false;
      requestH3Update();
    }
  }
};

// =============================================================================
// MESH STATE
// =============================================================================

let h3Mesh: THREE.Mesh | null = null;
let h3Geometry: THREE.BufferGeometry | null = null;
let h3LineMesh: THREE.LineSegments | null = null;
let h3LineGeometry: THREE.BufferGeometry | null = null;
let h3HighlightMesh: THREE.LineSegments | null = null;
let h3HighlightGeometry: THREE.BufferGeometry | null = null;

// Pre-allocated buffers
const h3PositionBuffer = new Float32Array(H3_MAX_CELLS * H3_VERTS_PER_CELL * 3);
const h3ColorBuffer = new Float32Array(H3_MAX_CELLS * H3_VERTS_PER_CELL * 3);
const h3LineBuffer = new Float32Array(H3_MAX_CELLS * 12 * 3);

// Materials
export const h3Material = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
  depthWrite: false,
});

export const h3LineMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.25,
});

const h3HighlightMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 1.0,
  depthTest: false,
});

// =============================================================================
// COLOR GRADIENT
// =============================================================================

const EMPTY_CELL_COLOR = new THREE.Color(0x2a3a5e);

function getDensityColor(density: number, _maxDensity: number): THREE.Color {
  if (density === 0) return EMPTY_CELL_COLOR;

  const logDensity = Math.log10(density + 1);
  const t = Math.min(logDensity / 2.5, 1);

  if (t < 0.25) {
    return new THREE.Color(0x1e40af).lerp(new THREE.Color(0x06b6d4), t * 4);
  } else if (t < 0.5) {
    return new THREE.Color(0x06b6d4).lerp(
      new THREE.Color(0x22c55e),
      (t - 0.25) * 4
    );
  } else if (t < 0.75) {
    return new THREE.Color(0x22c55e).lerp(
      new THREE.Color(0xeab308),
      (t - 0.5) * 4
    );
  } else {
    return new THREE.Color(0xeab308).lerp(
      new THREE.Color(0xef4444),
      (t - 0.75) * 4
    );
  }
}

// =============================================================================
// CELL BOUNDARY CACHE
// =============================================================================

const cellPointsCache = new Map<string, THREE.Vector3[]>();

/**
 * Convert H3 cell boundary to 3D points on sphere (cached)
 */
function cellTo3DPoints(cellIndex: string): THREE.Vector3[] {
  if (cellPointsCache.has(cellIndex)) {
    return cellPointsCache.get(cellIndex)!;
  }

  const boundary = h3.cellToBoundary(cellIndex);

  // Fix antimeridian crossing
  const lngs = boundary.map(([, lng]) => lng);
  let needsNormalization = false;
  for (let i = 0; i < lngs.length; i++) {
    const nextI = (i + 1) % lngs.length;
    if (Math.abs(lngs[nextI] - lngs[i]) > 180) {
      needsNormalization = true;
      break;
    }
  }

  const normalizedBoundary = needsNormalization
    ? boundary.map(([lat, lng]) => [lat, lng < 0 ? lng + 360 : lng] as [number, number])
    : boundary;

  const points = normalizedBoundary.map(([lat, lng]) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const radius = EARTH_RADIUS + 0.003;
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  });

  if (cellPointsCache.size < 50000) {
    cellPointsCache.set(cellIndex, points);
  }

  return points;
}

// =============================================================================
// CELL HIGHLIGHT
// =============================================================================

function updateH3CellHighlight(cellIndex: string | null): void {
  if (!cellIndex || !deps) {
    if (h3HighlightMesh) {
      h3HighlightMesh.visible = false;
    }
    return;
  }

  try {
    const points = cellTo3DPoints(cellIndex);
    if (!points || points.length < 3) return;

    const linePositions: number[] = [];
    const altitudeOffsets = [0.008, 0.01, 0.012];

    for (const altitudeOffset of altitudeOffsets) {
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i]
          .clone()
          .normalize()
          .multiplyScalar(EARTH_RADIUS + altitudeOffset);
        const p2 = points[(i + 1) % points.length]
          .clone()
          .normalize()
          .multiplyScalar(EARTH_RADIUS + altitudeOffset);
        linePositions.push(p1.x, p1.y, p1.z);
        linePositions.push(p2.x, p2.y, p2.z);
      }
    }

    if (!h3HighlightGeometry) {
      h3HighlightGeometry = new THREE.BufferGeometry();
    }
    h3HighlightGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3)
    );

    if (!h3HighlightMesh) {
      h3HighlightMesh = new THREE.LineSegments(
        h3HighlightGeometry,
        h3HighlightMaterial
      );
      h3HighlightMesh.renderOrder = 10;
      deps.getEarth().add(h3HighlightMesh);
    }

    h3HighlightMesh.visible = true;
  } catch (e) {
    console.warn("Error updating H3 highlight:", e);
  }
}

// =============================================================================
// CAMERA VIEW UTILITIES
// =============================================================================

// Reusable objects to avoid GC pressure
const _h3Raycaster = new THREE.Raycaster();
const _h3ToEarth = new THREE.Vector3();
const _h3CamPos = new THREE.Vector3();

// Cache for view center (avoid raycast every frame)
let _cachedViewCenter = { lat: 0, lon: 0 };
let _lastViewCenterTime = 0;
const VIEW_CENTER_CACHE_MS = 50; // Only recalc every 50ms

function getCameraViewCenter(): { lat: number; lon: number } {
  if (!deps) return { lat: 0, lon: 0 };

  // Return cached value if recent
  const now = performance.now();
  if (now - _lastViewCenterTime < VIEW_CENTER_CACHE_MS) {
    return _cachedViewCenter;
  }
  _lastViewCenterTime = now;

  const camera = deps.getCamera();
  const earth = deps.getEarth();
  _h3CamPos.copy(camera.position);
  _h3ToEarth.set(0, 0, 0).sub(_h3CamPos).normalize();
  _h3Raycaster.set(_h3CamPos, _h3ToEarth);
  const intersects = _h3Raycaster.intersectObject(earth, false);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    const localPoint = point
      .clone()
      .applyMatrix4(earth.matrixWorld.clone().invert());
    const r = localPoint.length();
    const lat = 90 - Math.acos(localPoint.y / r) * (180 / Math.PI);
    const lon =
      Math.atan2(localPoint.z, -localPoint.x) * (180 / Math.PI) - 180;
    _cachedViewCenter = { lat, lon };
    return _cachedViewCenter;
  }

  return { lat: 0, lon: 0 };
}

// =============================================================================
// CHUNKED GEOMETRY BUILDING
// =============================================================================

let pendingH3Cells: string[] | null = null;
let pendingH3CameraDistance = 0;

function startChunkedH3Build(
  allCells: string[],
  densityMap: Map<string, number>,
  maxDensity: number
): void {
  state.h3.buildState = {
    allCells,
    densityMap,
    maxDensity,
    cellIndex: 0,
    posIdx: 0,
    colorIdx: 0,
    lineIdx: 0,
    cellCount: Math.min(allCells.length, H3_MAX_CELLS),
  };
}

/**
 * Process a chunk of H3 cells (called each frame)
 * Returns true when complete
 */
export function processH3BuildChunk(): boolean {
  if (!state.h3.buildState || !deps) return true;

  const { allCells, densityMap, maxDensity, cellCount } = state.h3.buildState;
  let { cellIndex, posIdx, colorIdx, lineIdx } = state.h3.buildState;

  const endIndex = Math.min(cellIndex + H3_CELLS_PER_CHUNK, cellCount);

  for (let c = cellIndex; c < endIndex; c++) {
    const cell = allCells[c];
    const density = densityMap.get(cell) || 0;
    const points = cellTo3DPoints(cell);
    const color = getDensityColor(density, maxDensity);

    // Calculate center for fan triangulation
    let cx = 0,
      cy = 0,
      cz = 0;
    for (let i = 0; i < points.length; i++) {
      cx += points[i].x;
      cy += points[i].y;
      cz += points[i].z;
    }
    cx /= points.length;
    cy /= points.length;
    cz /= points.length;

    // Normalize center to sphere surface
    const centerLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (centerLen > 0) {
      const targetRadius = points[0]
        ? Math.sqrt(
            points[0].x ** 2 + points[0].y ** 2 + points[0].z ** 2
          )
        : 1;
      cx = (cx / centerLen) * targetRadius;
      cy = (cy / centerLen) * targetRadius;
      cz = (cz / centerLen) * targetRadius;
    }

    // Create triangle fan
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      h3PositionBuffer[posIdx++] = cx;
      h3PositionBuffer[posIdx++] = cy;
      h3PositionBuffer[posIdx++] = cz;
      h3PositionBuffer[posIdx++] = p1.x;
      h3PositionBuffer[posIdx++] = p1.y;
      h3PositionBuffer[posIdx++] = p1.z;
      h3PositionBuffer[posIdx++] = p2.x;
      h3PositionBuffer[posIdx++] = p2.y;
      h3PositionBuffer[posIdx++] = p2.z;

      h3ColorBuffer[colorIdx++] = color.r;
      h3ColorBuffer[colorIdx++] = color.g;
      h3ColorBuffer[colorIdx++] = color.b;
      h3ColorBuffer[colorIdx++] = color.r;
      h3ColorBuffer[colorIdx++] = color.g;
      h3ColorBuffer[colorIdx++] = color.b;
      h3ColorBuffer[colorIdx++] = color.r;
      h3ColorBuffer[colorIdx++] = color.g;
      h3ColorBuffer[colorIdx++] = color.b;

      h3LineBuffer[lineIdx++] = p1.x;
      h3LineBuffer[lineIdx++] = p1.y;
      h3LineBuffer[lineIdx++] = p1.z;
      h3LineBuffer[lineIdx++] = p2.x;
      h3LineBuffer[lineIdx++] = p2.y;
      h3LineBuffer[lineIdx++] = p2.z;
    }
  }

  // Save progress
  state.h3.buildState.cellIndex = endIndex;
  state.h3.buildState.posIdx = posIdx;
  state.h3.buildState.colorIdx = colorIdx;
  state.h3.buildState.lineIdx = lineIdx;

  // Check if complete
  if (endIndex >= cellCount) {
    const earth = deps.getEarth();

    if (!h3Geometry) {
      h3Geometry = new THREE.BufferGeometry();
      h3Geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(h3PositionBuffer, 3)
      );
      h3Geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(h3ColorBuffer, 3)
      );
    }
    h3Geometry.setDrawRange(0, posIdx / 3);
    h3Geometry.attributes.position.needsUpdate = true;
    h3Geometry.attributes.color.needsUpdate = true;

    if (!h3LineGeometry) {
      h3LineGeometry = new THREE.BufferGeometry();
      h3LineGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(h3LineBuffer, 3)
      );
    }
    h3LineGeometry.setDrawRange(0, lineIdx / 3);
    h3LineGeometry.attributes.position.needsUpdate = true;

    if (!h3Mesh) {
      h3Mesh = new THREE.Mesh(h3Geometry, h3Material);
      h3Mesh.renderOrder = 4;
      earth.add(h3Mesh);
    }
    h3Mesh.visible = true;

    if (!h3LineMesh) {
      h3LineMesh = new THREE.LineSegments(h3LineGeometry, h3LineMaterial);
      h3LineMesh.renderOrder = 5;
      earth.add(h3LineMesh);
    }
    h3LineMesh.visible = true;

    h3Material.opacity = h3Params.opacity * 0.85;
    h3LineMaterial.opacity = h3Params.opacity * 0.4;

    state.h3.buildState = null;
    return true;
  }

  return false;
}

// =============================================================================
// WORKER COMMUNICATION
// =============================================================================

function requestH3Update(): void {
  if (!deps) return;

  if (state.h3.workerBusy) {
    state.h3.pendingUpdate = true;
    return;
  }

  const resolution = h3Params.resolution;
  const center = getCameraViewCenter();
  const visibleRadius = Math.min(90, pendingH3CameraDistance * 12);

  const shipSimState = deps.getShipSimState();
  const aircraftSimState = deps.getAircraftSimState();
  const satelliteSimState = deps.getSatelliteSimState();
  const unitCountParams = deps.getUnitCountParams();

  const ships = new Float32Array(shipSimState.length * 2);
  for (let i = 0; i < shipSimState.length; i++) {
    ships[i * 2] = shipSimState[i].lat;
    ships[i * 2 + 1] = shipSimState[i].lon;
  }

  const aircraft = new Float32Array(aircraftSimState.length * 2);
  for (let i = 0; i < aircraftSimState.length; i++) {
    aircraft[i * 2] = aircraftSimState[i].lat;
    aircraft[i * 2 + 1] = aircraftSimState[i].lon;
  }

  const satellites = new Float32Array(satelliteSimState.length * 2);
  for (let i = 0; i < satelliteSimState.length; i++) {
    satellites[i * 2] = satelliteSimState[i].lat;
    satellites[i * 2 + 1] = satelliteSimState[i].lon;
  }

  state.h3.workerBusy = true;
  h3Worker.postMessage(
    {
      type: "calculateDensity",
      data: {
        resolution,
        ships,
        aircraft,
        satellites,
        showShips: unitCountParams.showShips,
        showAircraft: unitCountParams.showAircraft,
        showSatellites: unitCountParams.showSatellites,
        viewCenter: center,
        visibleRadius,
      },
    },
    [ships.buffer, aircraft.buffer, satellites.buffer]
  );
}

function applyH3DensityResult(data: {
  densityEntries: [string, number][];
  cellCountEntries: [string, { ships: number; aircraft: number; satellites: number; total: number }][];
  allCells: string[];
}): void {
  const { densityEntries, cellCountEntries, allCells } = data;

  const densityMap = new Map(densityEntries);
  state.h3.currentCellCounts.clear();
  for (const [k, v] of cellCountEntries) {
    state.h3.currentCellCounts.set(k, v);
  }

  pendingH3Cells = allCells;
  if (!allCells || allCells.length === 0) {
    if (h3Mesh) h3Mesh.visible = false;
    if (h3LineMesh) h3LineMesh.visible = false;
    return;
  }

  const maxDensity =
    densityMap.size > 0 ? Math.max(...Array.from(densityMap.values()), 1) : 1;

  startChunkedH3Build(allCells, densityMap, maxDensity);
}

// =============================================================================
// MAIN UPDATE FUNCTION
// =============================================================================

/**
 * Update H3 grid visualization
 */
export function updateH3Grid(cameraDistance: number, elapsedTime: number): void {
  if (!h3Params.enabled || !deps) {
    if (h3Mesh) h3Mesh.visible = false;
    if (h3LineMesh) h3LineMesh.visible = false;
    if (h3HighlightMesh) h3HighlightMesh.visible = false;
    return;
  }

  const resolution = h3Params.resolution;
  const center = getCameraViewCenter();

  const panDistance = Math.sqrt(
    Math.pow(center.lat - state.h3.lastViewCenter.lat, 2) +
      Math.pow(center.lon - state.h3.lastViewCenter.lon, 2)
  );
  const panTriggersRebuild = resolution >= 3 && panDistance > H3_PAN_THRESHOLD;

  const unitCountParams = deps.getUnitCountParams();
  const hasVisibleUnits =
    unitCountParams.showShips ||
    unitCountParams.showAircraft ||
    unitCountParams.showSatellites;

  const timeSinceUpdate = elapsedTime - state.h3.lastUpdateTime;
  const resChanged = resolution !== state.h3.lastResolution;
  const timeTriggered =
    hasVisibleUnits && timeSinceUpdate > h3Params.updateInterval;
  const needsUpdate = resChanged || timeTriggered || panTriggersRebuild;

  if (!needsUpdate) {
    if (h3Mesh) h3Mesh.visible = true;
    if (h3LineMesh) h3LineMesh.visible = true;
    return;
  }

  if (resChanged) {
    cellPointsCache.clear();
  }

  state.h3.lastResolution = resolution;
  state.h3.lastUpdateTime = elapsedTime;
  state.h3.lastViewCenter = { lat: center.lat, lon: center.lon };
  state.h3.currentResolution = resolution;
  pendingH3CameraDistance = cameraDistance;

  requestH3Update();
}

// =============================================================================
// H3 CELL POPUP
// =============================================================================

const h3Popup = document.getElementById("h3-popup");
const h3PopupClose = document.querySelector(".h3-popup-close");
const currentH3CellCounts = state.h3.currentCellCounts;

function getH3CellAtClick(
  clientX: number,
  clientY: number
): { cellIndex: string; lat: number; lon: number } | null {
  if (!h3Params.enabled || !deps) return null;

  const canvas = deps.getCanvas();
  const camera = deps.getCamera();
  const earth = deps.getEarth();

  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(earth, false);

  if (intersects.length === 0) return null;

  const point = intersects[0].point;
  const localPoint = point
    .clone()
    .applyMatrix4(earth.matrixWorld.clone().invert());

  const r = localPoint.length();
  const lat = 90 - Math.acos(localPoint.y / r) * (180 / Math.PI);
  const lon = Math.atan2(localPoint.z, -localPoint.x) * (180 / Math.PI) - 180;

  try {
    const cellIndex = h3.latLngToCell(lat, lon, state.h3.currentResolution);
    return { cellIndex, lat, lon };
  } catch (e) {
    return null;
  }
}

function countUnitsInCell(cellIndex: string): {
  ships: number;
  aircraft: number;
  satellites: number;
  total: number;
} {
  const cached = currentH3CellCounts.get(cellIndex);
  if (cached) {
    return { ...cached };
  }
  return { ships: 0, aircraft: 0, satellites: 0, total: 0 };
}

function updateH3PopupCounts(cellIndex: string): void {
  const counts = countUnitsInCell(cellIndex);
  const totalEl = document.getElementById("h3-total-units");
  const shipEl = document.getElementById("h3-ship-count");
  const aircraftEl = document.getElementById("h3-aircraft-count");
  const satelliteEl = document.getElementById("h3-satellite-count");

  if (totalEl) totalEl.textContent = counts.total.toLocaleString();
  if (shipEl) shipEl.textContent = counts.ships.toLocaleString();
  if (aircraftEl) aircraftEl.textContent = counts.aircraft.toLocaleString();
  if (satelliteEl) satelliteEl.textContent = counts.satellites.toLocaleString();
}

function showH3Popup(
  cellIndex: string,
  _lat: number,
  _lon: number,
  _clientX: number,
  _clientY: number
): void {
  state.h3.currentSelectedCell = cellIndex;
  state.h3.lastPopupTotal = -1;
  updateH3PopupCounts(cellIndex);

  const cellCenter = h3.cellToLatLng(cellIndex);
  const shortId = cellIndex.slice(2, 7).toUpperCase();

  const titleEl = document.getElementById("h3-popup-title");
  const centerEl = document.getElementById("h3-cell-center");

  if (titleEl) titleEl.textContent = `CELL ${shortId}`;
  if (centerEl) {
    centerEl.textContent = `${cellCenter[0].toFixed(2)}°, ${cellCenter[1].toFixed(2)}°`;
  }

  updateH3CellHighlight(cellIndex);

  if (h3Popup) h3Popup.classList.remove("hidden");
}

/**
 * Hide H3 cell popup
 */
export function hideH3Popup(): void {
  if (h3Popup) h3Popup.classList.add("hidden");
  state.h3.currentSelectedCell = null;
  updateH3CellHighlight(null);
}

/**
 * Refresh popup counts if visible
 */
export function refreshH3PopupIfVisible(): void {
  if (state.h3.currentSelectedCell && h3Popup && !h3Popup.classList.contains("hidden")) {
    updateH3PopupCounts(state.h3.currentSelectedCell);
  }
}

/**
 * Periodic update for popup counts
 */
export function updateH3PopupPeriodic(elapsedTime: number): void {
  if (!state.h3.currentSelectedCell || !h3Popup || h3Popup.classList.contains("hidden"))
    return;

  if (elapsedTime - state.h3.lastPopupUpdateTime < POPUP_UPDATE_INTERVAL) return;
  state.h3.lastPopupUpdateTime = elapsedTime;

  const counts = countUnitsInCell(state.h3.currentSelectedCell);
  if (counts.total !== state.h3.lastPopupTotal) {
    state.h3.lastPopupTotal = counts.total;
    updateH3PopupCounts(state.h3.currentSelectedCell);
  }
}

// Event handlers
h3PopupClose?.addEventListener("click", hideH3Popup);

/**
 * Initialize H3 click handler
 */
export function initH3ClickHandler(): void {
  if (!deps) return;

  const canvas = deps.getCanvas();
  canvas.addEventListener("click", (event) => {
    if (!h3Params.enabled) {
      hideH3Popup();
      return;
    }

    const cellData = getH3CellAtClick(event.clientX, event.clientY);
    if (cellData) {
      showH3Popup(
        cellData.cellIndex,
        cellData.lat,
        cellData.lon,
        event.clientX,
        event.clientY
      );
    } else {
      hideH3Popup();
    }
  });
}

// =============================================================================
// MESH VISIBILITY CONTROL
// =============================================================================

/**
 * Get H3 mesh for external visibility control
 */
export function getH3Mesh(): THREE.Mesh | null {
  return h3Mesh;
}

/**
 * Get H3 line mesh for external visibility control
 */
export function getH3LineMesh(): THREE.LineSegments | null {
  return h3LineMesh;
}

/**
 * Get H3 highlight mesh for external visibility control
 */
export function getH3HighlightMesh(): THREE.LineSegments | null {
  return h3HighlightMesh;
}

/**
 * Set H3 mesh visibility
 */
export function setH3MeshVisibility(visible: boolean): void {
  if (h3Mesh) h3Mesh.visible = visible;
  if (h3LineMesh) h3LineMesh.visible = visible;
  if (h3HighlightMesh) h3HighlightMesh.visible = visible;
}

/**
 * Get the H3 worker for external message handling
 */
export function getH3Worker(): Worker {
  return h3Worker;
}
