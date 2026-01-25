/**
 * NASA GIBS Feed
 *
 * Fetches real weather imagery from NASA Global Imagery Browse Services.
 * Supports cloud cover (MODIS) and precipitation (IMERG) layers.
 */

import * as THREE from "three";

// =============================================================================
// TYPES
// =============================================================================

export type GibsLayer = "clouds" | "precipitation";

export interface GibsConfig {
  layer: GibsLayer;
  resolution: 2048 | 4096;
  refreshInterval: number; // ms
}

export interface GibsLoadingState {
  loading: boolean;
  error: string | null;
  lastUpdate: number;
  layer: GibsLayer | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** GIBS WMS endpoint */
const GIBS_WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

/** Layer IDs for NASA GIBS */
const GIBS_LAYER_IDS: Record<GibsLayer, string> = {
  // VIIRS NOAA-20 - wider swaths, fewer gaps than MODIS
  clouds: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  // IMERG precipitation rate (near real-time, ~6 hour latency)
  precipitation: "IMERG_Precipitation_Rate",
};

/** Default refresh intervals (ms) */
const REFRESH_INTERVALS: Record<GibsLayer, number> = {
  clouds: 3 * 60 * 60 * 1000, // 3 hours
  precipitation: 30 * 60 * 1000, // 30 minutes (near real-time)
};

// =============================================================================
// STATE
// =============================================================================

export const gibsLoadingState: GibsLoadingState = {
  loading: false,
  error: null,
  lastUpdate: 0,
  layer: null,
};

let currentTexture: THREE.Texture | null = null;
let pendingTexture: THREE.Texture | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

// =============================================================================
// URL BUILDING
// =============================================================================

/**
 * Build GIBS WMS URL for a specific layer and date
 */
function buildGibsUrl(layer: GibsLayer, resolution: number, date?: Date): string {
  const layerId = GIBS_LAYER_IDS[layer];
  const targetDate = date || new Date();

  // Different layers have different latencies:
  // - VIIRS/MODIS: ~2-3 days
  // - IMERG precipitation: ~6 hours (use yesterday for reliability)
  const isPrecipitation = layer === "precipitation";
  const daysAgo = isPrecipitation ? 1 : 2;
  const dateStr = new Date(targetDate.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  console.log(`[GIBS] Requesting ${layerId} for date ${dateStr}`);

  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layerId,
    FORMAT: "image/png",
    TRANSPARENT: "true",
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: String(resolution),
    HEIGHT: String(resolution / 2),
    TIME: dateStr,
  });

  return `${GIBS_WMS_URL}?${params.toString()}`;
}

// =============================================================================
// TEXTURE LOADING
// =============================================================================

/**
 * Load an image as a Three.js texture
 */
async function loadTextureFromUrl(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();

    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        resolve(texture);
      },
      undefined,
      (error) => {
        reject(new Error(`Failed to load GIBS texture: ${error}`));
      }
    );
  });
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Fetch a GIBS tile for the specified layer
 */
export async function fetchGibsTile(
  layer: GibsLayer,
  resolution: 2048 | 4096 = 2048
): Promise<THREE.Texture> {
  // Update loading state
  gibsLoadingState.loading = true;
  gibsLoadingState.error = null;
  gibsLoadingState.layer = layer;

  try {
    const url = buildGibsUrl(layer, resolution);
    console.log(`[GIBS] Fetching ${layer} tile...`);

    const texture = await loadTextureFromUrl(url);

    // Store as pending (for crossfade) or current
    if (currentTexture) {
      pendingTexture = texture;
    } else {
      currentTexture = texture;
    }

    gibsLoadingState.loading = false;
    gibsLoadingState.lastUpdate = Date.now();

    console.log(`[GIBS] ${layer} tile loaded successfully`);
    return texture;

  } catch (error) {
    gibsLoadingState.loading = false;
    gibsLoadingState.error = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GIBS] Failed to fetch ${layer}:`, error);
    throw error;
  }
}

/**
 * Get the current GIBS texture (or null if not loaded)
 */
export function getGibsTexture(): THREE.Texture | null {
  return currentTexture;
}

/**
 * Get the pending texture for crossfade (or null)
 */
export function getPendingGibsTexture(): THREE.Texture | null {
  return pendingTexture;
}

/**
 * Complete crossfade transition - swap pending to current
 */
export function commitPendingTexture(): void {
  if (pendingTexture) {
    if (currentTexture) {
      currentTexture.dispose();
    }
    currentTexture = pendingTexture;
    pendingTexture = null;
  }
}

/**
 * Schedule automatic refresh of GIBS tiles
 */
export function scheduleGibsRefresh(
  layer: GibsLayer,
  resolution: 2048 | 4096 = 2048,
  customInterval?: number
): void {
  // Clear existing refresh
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }

  const interval = customInterval || REFRESH_INTERVALS[layer];

  const doRefresh = async () => {
    try {
      await fetchGibsTile(layer, resolution);
    } catch {
      // Error already logged, continue scheduling
    }

    // Schedule next refresh
    refreshTimeout = setTimeout(doRefresh, interval);
  };

  // Schedule first refresh
  refreshTimeout = setTimeout(doRefresh, interval);
}

/**
 * Stop automatic refresh
 */
export function stopGibsRefresh(): void {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }
}

/**
 * Get loading status string for GUI
 */
export function getGibsStatus(): string {
  if (gibsLoadingState.loading) {
    return `Loading ${gibsLoadingState.layer}...`;
  }
  if (gibsLoadingState.error) {
    return `Error: ${gibsLoadingState.error.slice(0, 30)}`;
  }
  if (gibsLoadingState.lastUpdate > 0) {
    const ago = Math.round((Date.now() - gibsLoadingState.lastUpdate) / 60000);
    return `Updated ${ago}m ago`;
  }
  return "Not loaded";
}

/**
 * Dispose of all textures and cleanup
 */
export function disposeGibs(): void {
  stopGibsRefresh();

  if (currentTexture) {
    currentTexture.dispose();
    currentTexture = null;
  }
  if (pendingTexture) {
    pendingTexture.dispose();
    pendingTexture = null;
  }
}
