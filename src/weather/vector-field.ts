/**
 * Vector Field
 *
 * Manages wind and ocean current data as GPU textures for particle advection.
 * Uses a web worker to fetch data without blocking the main thread.
 */

import * as THREE from "three";
import { VECTOR_FIELD_WIDTH, VECTOR_FIELD_HEIGHT } from "../constants";

// =============================================================================
// TYPES
// =============================================================================

export type VectorFieldType = "wind" | "ocean";

export interface VectorFieldState {
  loading: boolean;
  error: string | null;
  lastUpdate: number;
}

interface WorkerMessage {
  type: "windData" | "oceanData" | "error";
  buffer?: Float32Array;
  timestamp?: number;
  source?: string;
  message?: string;
}

// =============================================================================
// STATE
// =============================================================================

export const windFieldState: VectorFieldState = {
  loading: false,
  error: null,
  lastUpdate: 0,
};

export const oceanFieldState: VectorFieldState = {
  loading: false,
  error: null,
  lastUpdate: 0,
};

let worker: Worker | null = null;
let windTexture: THREE.DataTexture | null = null;
let oceanTexture: THREE.DataTexture | null = null;

// Callbacks for when data arrives
let onWindDataCallback: ((texture: THREE.DataTexture) => void) | null = null;
let onOceanDataCallback: ((texture: THREE.DataTexture) => void) | null = null;

// =============================================================================
// WORKER MANAGEMENT
// =============================================================================

/**
 * Initialize the weather data worker
 */
export function initWeatherWorker(): void {
  if (worker) return;

  worker = new Worker(
    new URL("../workers/weather-worker.ts", import.meta.url),
    { type: "module" }
  );

  worker.onmessage = handleWorkerMessage;

  worker.onerror = (error) => {
    console.error("[VectorField] Worker error:", error);
    windFieldState.error = "Worker error";
    oceanFieldState.error = "Worker error";
  };
}

/**
 * Handle messages from the worker
 */
function handleWorkerMessage(e: MessageEvent<WorkerMessage>): void {
  const { type, buffer, timestamp, source, message } = e.data;

  if (type === "windData" && buffer) {
    windFieldState.loading = false;
    windFieldState.lastUpdate = timestamp || Date.now();
    windFieldState.error = null;

    // Create/update texture
    windTexture = createVectorFieldTexture(buffer, windTexture);

    // Notify listener
    if (onWindDataCallback) {
      onWindDataCallback(windTexture);
    }

    console.log("[VectorField] Wind data received and texture updated");

  } else if (type === "oceanData" && buffer) {
    oceanFieldState.loading = false;
    oceanFieldState.lastUpdate = timestamp || Date.now();
    oceanFieldState.error = null;

    oceanTexture = createVectorFieldTexture(buffer, oceanTexture);

    if (onOceanDataCallback) {
      onOceanDataCallback(oceanTexture);
    }

    console.log("[VectorField] Ocean data received and texture updated");

  } else if (type === "error") {
    const errorMsg = message || "Unknown error";
    if (source === "wind") {
      windFieldState.loading = false;
      windFieldState.error = errorMsg;
    } else if (source === "ocean") {
      oceanFieldState.loading = false;
      oceanFieldState.error = errorMsg;
    }
    console.error(`[VectorField] ${source} error:`, errorMsg);
  }
}

// =============================================================================
// TEXTURE CREATION
// =============================================================================

/**
 * Create or update a DataTexture from vector field buffer
 */
function createVectorFieldTexture(
  buffer: Float32Array,
  existingTexture?: THREE.DataTexture | null
): THREE.DataTexture {
  if (existingTexture) {
    // Update existing texture data
    const data = existingTexture.image.data as Float32Array;
    data.set(buffer);
    existingTexture.needsUpdate = true;
    return existingTexture;
  }

  // Create new texture
  const texture = new THREE.DataTexture(
    buffer,
    VECTOR_FIELD_WIDTH,
    VECTOR_FIELD_HEIGHT,
    THREE.RGBAFormat,
    THREE.FloatType
  );

  // Critical: enable wrapping for longitude continuity
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // Linear filtering for smooth interpolation
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  texture.needsUpdate = true;

  return texture;
}

// =============================================================================
// DATA FETCHING
// =============================================================================

/**
 * Request wind data from worker
 */
export function requestWindData(): void {
  if (!worker) {
    initWeatherWorker();
  }

  if (windFieldState.loading) {
    console.log("[VectorField] Wind request already in progress");
    return;
  }

  windFieldState.loading = true;
  windFieldState.error = null;
  worker!.postMessage({ type: "fetchWind" });
}

/**
 * Request ocean current data from worker
 */
export function requestOceanData(): void {
  if (!worker) {
    initWeatherWorker();
  }

  if (oceanFieldState.loading) {
    console.log("[VectorField] Ocean request already in progress");
    return;
  }

  oceanFieldState.loading = true;
  oceanFieldState.error = null;
  worker!.postMessage({ type: "fetchOcean" });
}

// =============================================================================
// TEXTURE ACCESS
// =============================================================================

/**
 * Get wind vector field texture
 */
export function getWindTexture(): THREE.DataTexture | null {
  return windTexture;
}

/**
 * Get ocean current vector field texture
 */
export function getOceanTexture(): THREE.DataTexture | null {
  return oceanTexture;
}

/**
 * Set callback for when wind data arrives
 */
export function onWindData(callback: (texture: THREE.DataTexture) => void): void {
  onWindDataCallback = callback;

  // If texture already exists, call immediately
  if (windTexture) {
    callback(windTexture);
  }
}

/**
 * Set callback for when ocean data arrives
 */
export function onOceanData(callback: (texture: THREE.DataTexture) => void): void {
  onOceanDataCallback = callback;

  if (oceanTexture) {
    callback(oceanTexture);
  }
}

// =============================================================================
// STATUS
// =============================================================================

/**
 * Get loading status string for GUI
 */
export function getVectorFieldStatus(type: VectorFieldType): string {
  const state = type === "wind" ? windFieldState : oceanFieldState;

  if (state.loading) {
    return `Loading ${type}...`;
  }
  if (state.error) {
    return `Error: ${state.error.slice(0, 20)}`;
  }
  if (state.lastUpdate > 0) {
    const ago = Math.round((Date.now() - state.lastUpdate) / 60000);
    return `Updated ${ago}m ago`;
  }
  return "Not loaded";
}

/**
 * Check if any vector field data is available
 */
export function hasVectorFieldData(): boolean {
  return windTexture !== null || oceanTexture !== null;
}

// =============================================================================
// SCHEDULED REFRESH
// =============================================================================

let windRefreshInterval: ReturnType<typeof setInterval> | null = null;
let oceanRefreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Schedule periodic wind data refresh
 */
export function scheduleWindRefresh(intervalMs: number = 60 * 60 * 1000): void {
  if (windRefreshInterval) {
    clearInterval(windRefreshInterval);
  }

  windRefreshInterval = setInterval(() => {
    requestWindData();
  }, intervalMs);
}

/**
 * Schedule periodic ocean data refresh
 */
export function scheduleOceanRefresh(intervalMs: number = 24 * 60 * 60 * 1000): void {
  if (oceanRefreshInterval) {
    clearInterval(oceanRefreshInterval);
  }

  oceanRefreshInterval = setInterval(() => {
    requestOceanData();
  }, intervalMs);
}

/**
 * Stop all scheduled refreshes
 */
export function stopVectorFieldRefresh(): void {
  if (windRefreshInterval) {
    clearInterval(windRefreshInterval);
    windRefreshInterval = null;
  }
  if (oceanRefreshInterval) {
    clearInterval(oceanRefreshInterval);
    oceanRefreshInterval = null;
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Dispose of resources
 */
export function disposeVectorField(): void {
  stopVectorFieldRefresh();

  if (worker) {
    worker.terminate();
    worker = null;
  }

  if (windTexture) {
    windTexture.dispose();
    windTexture = null;
  }

  if (oceanTexture) {
    oceanTexture.dispose();
    oceanTexture = null;
  }

  onWindDataCallback = null;
  onOceanDataCallback = null;
}
