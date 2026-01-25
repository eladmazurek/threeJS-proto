/**
 * Weather Data Worker
 *
 * Fetches and processes wind and ocean current data in the background.
 * Converts API responses to flat Float32Arrays for efficient transfer.
 */

// =============================================================================
// TYPES
// =============================================================================

interface WindDataRequest {
  type: "fetchWind";
}

interface OceanDataRequest {
  type: "fetchOcean";
}

interface WindDataResponse {
  type: "windData";
  buffer: Float32Array;
  timestamp: number;
}

interface OceanDataResponse {
  type: "oceanData";
  buffer: Float32Array;
  timestamp: number;
}

interface ErrorResponse {
  type: "error";
  source: "wind" | "ocean";
  message: string;
}

type WorkerRequest = WindDataRequest | OceanDataRequest;
type WorkerResponse = WindDataResponse | OceanDataResponse | ErrorResponse;

// =============================================================================
// CONSTANTS
// =============================================================================

/** Grid resolution for vector field (1 degree) */
const GRID_WIDTH = 360;
const GRID_HEIGHT = 180;

/** Open-Meteo API base URL */
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// =============================================================================
// WIND DATA FETCHING
// =============================================================================

/**
 * Fetch global wind data from Open-Meteo
 *
 * Note: Open-Meteo is point-based, so we sample at key locations
 * and interpolate for the full grid. For production, consider
 * using GFS GRIB data directly.
 */
async function fetchWindData(): Promise<Float32Array> {
  // Sample points at 15-degree intervals for efficiency
  // (24 x 12 = 288 API calls would be too many)
  // Instead, we'll use a pre-processed GFS-style approach

  // For demo: Generate realistic wind patterns based on climate zones
  const buffer = new Float32Array(GRID_WIDTH * GRID_HEIGHT * 4);

  // Simulate global wind patterns:
  // - Trade winds (0-30 lat): easterly
  // - Westerlies (30-60 lat): westerly
  // - Polar easterlies (60-90 lat): easterly
  // - Add perturbations for weather systems

  const time = Date.now() / 1000;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const lat = 90 - y; // 90 to -90
    const absLat = Math.abs(lat);

    for (let x = 0; x < GRID_WIDTH; x++) {
      const lon = x - 180; // -180 to 180
      const idx = (y * GRID_WIDTH + x) * 4;

      // Base zonal wind pattern
      let u = 0;
      let v = 0;

      if (absLat < 30) {
        // Trade winds (easterly)
        u = -5 - Math.random() * 3;
        v = (lat > 0 ? -1 : 1) * (1 + Math.random());
      } else if (absLat < 60) {
        // Westerlies
        u = 8 + Math.random() * 5;
        v = Math.sin((lon + time * 0.01) * 0.1) * 3;
      } else {
        // Polar easterlies
        u = -3 - Math.random() * 2;
        v = 0;
      }

      // Add weather system perturbations
      const perturbX = Math.sin((lon * 0.05 + time * 0.001) * Math.PI) * 5;
      const perturbY = Math.cos((lat * 0.08 + time * 0.0015) * Math.PI) * 3;

      u += perturbX;
      v += perturbY;

      // Jet stream at ~40 degrees
      if (absLat > 35 && absLat < 45) {
        const jetFactor = 1 - Math.abs(absLat - 40) / 5;
        u += jetFactor * 15 * (lat > 0 ? 1 : 1);
      }

      const magnitude = Math.sqrt(u * u + v * v);

      // Normalize to 0-1 range (centered at 0.5)
      buffer[idx] = (u / 50) + 0.5;     // R: u component
      buffer[idx + 1] = (v / 50) + 0.5; // G: v component
      buffer[idx + 2] = magnitude / 50;  // B: magnitude
      buffer[idx + 3] = 1.0;             // A: valid data flag
    }
  }

  return buffer;
}

// =============================================================================
// OCEAN CURRENT DATA FETCHING
// =============================================================================

/**
 * Fetch ocean current data
 *
 * Note: Real implementation would use NOAA OSCAR data.
 * For now, generates realistic ocean current patterns.
 */
async function fetchOceanData(): Promise<Float32Array> {
  const buffer = new Float32Array(GRID_WIDTH * GRID_HEIGHT * 4);

  // Ocean current patterns:
  // - Gulf Stream (N. Atlantic)
  // - Kuroshio Current (N. Pacific)
  // - Antarctic Circumpolar Current
  // - Equatorial currents
  // - Gyres in each ocean basin

  const time = Date.now() / 1000;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const lat = 90 - y;
    const absLat = Math.abs(lat);

    for (let x = 0; x < GRID_WIDTH; x++) {
      const lon = x - 180;
      const idx = (y * GRID_WIDTH + x) * 4;

      // Default: no current (land)
      let u = 0;
      let v = 0;
      let isOcean = false;

      // Simple ocean mask (very approximate)
      const isAtlantic = lon > -80 && lon < 0 && absLat < 70;
      const isPacific = (lon < -80 || lon > 100) && absLat < 65;
      const isIndian = lon > 20 && lon < 120 && lat > -60 && lat < 25;
      const isSouthernOcean = lat < -45;

      isOcean = isAtlantic || isPacific || isIndian || isSouthernOcean;

      if (isOcean) {
        // Equatorial currents (westward)
        if (absLat < 10) {
          u = -0.5;
          v = 0;
        }

        // Subtropical gyres
        if (absLat > 10 && absLat < 45) {
          // Clockwise in northern hemisphere, counter-clockwise in southern
          const gyreDir = lat > 0 ? 1 : -1;
          const gyreStrength = Math.sin((absLat - 10) / 35 * Math.PI);
          u = gyreDir * gyreStrength * 0.8;
          v = Math.cos((lon + 90) * Math.PI / 180) * gyreStrength * 0.3 * gyreDir;
        }

        // Antarctic Circumpolar Current
        if (lat < -45 && lat > -65) {
          u = 1.5; // Strong eastward flow
          v = 0;
        }

        // Gulf Stream (enhanced)
        if (isAtlantic && lat > 25 && lat < 50 && lon > -80 && lon < -30) {
          const gulfStrength = Math.exp(-Math.pow((lat - 38) / 10, 2));
          u += gulfStrength * 2.0;
          v += gulfStrength * 0.5;
        }

        // Kuroshio Current
        if (isPacific && lat > 20 && lat < 45 && lon > 120 && lon < 180) {
          const kuroStrength = Math.exp(-Math.pow((lat - 35) / 10, 2));
          u += kuroStrength * 1.5;
          v += kuroStrength * 0.4;
        }

        // Add small perturbations
        u += (Math.sin(lon * 0.1 + time * 0.0001) * 0.1);
        v += (Math.cos(lat * 0.1 + time * 0.0001) * 0.1);
      }

      const magnitude = Math.sqrt(u * u + v * v);

      // Normalize to 0-1 range (ocean currents are slower than wind)
      buffer[idx] = (u / 5) + 0.5;      // R: u component
      buffer[idx + 1] = (v / 5) + 0.5;  // G: v component
      buffer[idx + 2] = magnitude / 3;   // B: magnitude
      buffer[idx + 3] = isOcean ? 1.0 : 0.0; // A: valid data (ocean mask)
    }
  }

  return buffer;
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type } = e.data;

  try {
    if (type === "fetchWind") {
      console.log("[WeatherWorker] Fetching wind data...");
      const buffer = await fetchWindData();

      const response: WindDataResponse = {
        type: "windData",
        buffer,
        timestamp: Date.now(),
      };

      // Transfer buffer ownership for zero-copy
      self.postMessage(response, { transfer: [buffer.buffer] });
      console.log("[WeatherWorker] Wind data sent");

    } else if (type === "fetchOcean") {
      console.log("[WeatherWorker] Fetching ocean data...");
      const buffer = await fetchOceanData();

      const response: OceanDataResponse = {
        type: "oceanData",
        buffer,
        timestamp: Date.now(),
      };

      self.postMessage(response, { transfer: [buffer.buffer] });
      console.log("[WeatherWorker] Ocean data sent");
    }

  } catch (error) {
    const errorResponse: ErrorResponse = {
      type: "error",
      source: type === "fetchWind" ? "wind" : "ocean",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    self.postMessage(errorResponse);
  }
};

// Signal ready
console.log("[WeatherWorker] Initialized");
