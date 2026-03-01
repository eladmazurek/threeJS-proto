/**
 * Weather Data Worker
 *
 * Fetches and processes wind and ocean current data in the background.
 * Converts API responses to flat Float32Arrays for efficient transfer.
 */

import { OCEAN_VECTOR_RANGE, WIND_VECTOR_RANGE } from "../constants";

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

const PI = Math.PI;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function wrapLongitudeDelta(delta: number): number {
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

function gaussian(offset: number, width: number): number {
  const normalized = offset / width;
  return Math.exp(-(normalized * normalized));
}

function lonGaussian(lon: number, center: number, width: number): number {
  return gaussian(wrapLongitudeDelta(lon - center), width);
}

function latGaussian(lat: number, center: number, width: number): number {
  return gaussian(lat - center, width);
}

function encodeVectorComponent(value: number, range: number): number {
  return clamp01(0.5 + value / (2 * range));
}

function encodeMagnitude(value: number, range: number): number {
  return clamp01(value / range);
}

function smoothNoise(lon: number, lat: number, time: number, seed: number): number {
  const lonRad = (lon + seed * 37) * PI / 180;
  const latRad = (lat - seed * 19) * PI / 180;

  return (
    Math.sin(lonRad * 1.15 + time * 0.016 + seed) * Math.cos(latRad * 1.7 - seed * 0.7) +
    0.6 * Math.sin(lonRad * 2.35 - time * 0.024 + seed * 1.3) * Math.sin(latRad * 0.9 + seed * 0.4) +
    0.3 * Math.cos(lonRad * 4.2 + latRad * 2.1 - time * 0.031)
  ) / 1.9;
}

function vortexFlow(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
  radius: number,
  strength: number
): { u: number; v: number } {
  const deltaLon = wrapLongitudeDelta(lon - centerLon);
  const deltaLat = lat - centerLat;
  const falloff = gaussian(Math.hypot(deltaLon, deltaLat), radius);

  return {
    u: (-deltaLat / radius) * strength * falloff,
    v: (deltaLon / radius) * strength * falloff,
  };
}

function ellipseContains(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
  radiusLon: number,
  radiusLat: number
): boolean {
  const dx = wrapLongitudeDelta(lon - centerLon) / radiusLon;
  const dy = (lat - centerLat) / radiusLat;
  return dx * dx + dy * dy <= 1;
}

function isApproxLand(lon: number, lat: number): boolean {
  if (lat < -68) return true;

  const northAmerica =
    ellipseContains(lon, lat, -104, 48, 36, 24) ||
    ellipseContains(lon, lat, -96, 24, 20, 11);
  const southAmerica = ellipseContains(lon, lat, -60, -16, 19, 30);
  const greenland = ellipseContains(lon, lat, -42, 73, 12, 10);
  const africa = ellipseContains(lon, lat, 20, 4, 20, 29);
  const eurasia =
    ellipseContains(lon, lat, 68, 50, 80, 28) ||
    ellipseContains(lon, lat, 110, 28, 44, 20);
  const arabia = ellipseContains(lon, lat, 46, 23, 10, 9);
  const india = ellipseContains(lon, lat, 79, 22, 11, 11);
  const southeastAsia = ellipseContains(lon, lat, 107, 12, 20, 14);
  const australia = ellipseContains(lon, lat, 134, -25, 17, 12);

  return (
    northAmerica ||
    southAmerica ||
    greenland ||
    africa ||
    eurasia ||
    arabia ||
    india ||
    southeastAsia ||
    australia
  );
}

function getWindVector(lon: number, lat: number, time: number): { u: number; v: number } {
  const absLat = Math.abs(lat);
  const latRad = lat * PI / 180;
  const lonRad = lon * PI / 180;

  const tradeBand = latGaussian(absLat, 15, 14);
  const westerlyBand = latGaussian(absLat, 45, 12);
  const polarBand = latGaussian(absLat, 70, 10);
  const jetBand = latGaussian(absLat, 40, 6);

  let u = 0;
  let v = 0;

  u += -10 * tradeBand * (0.75 + 0.25 * Math.cos(latRad));
  u += 15 * westerlyBand;
  u += -5 * polarBand;

  v += (lat >= 0 ? -1 : 1) * 2.5 * tradeBand;
  v += Math.sin(lonRad * 2.0 + time * 0.03) * 3.0 * westerlyBand;
  v += Math.cos(lonRad * 1.7 - time * 0.025) * 1.4 * polarBand;

  u += 18 * jetBand * (0.65 + 0.35 * Math.cos(lonRad * 1.5 - time * 0.02));
  v += 2.2 * jetBand * Math.sin(lonRad * 3.2 + time * 0.04);

  u += smoothNoise(lon, lat, time, 0.6) * 4.0;
  v += smoothNoise(lon + 35, lat - 8, time, 1.4) * 3.0;

  const atlanticStorm = vortexFlow(
    lon,
    lat,
    -45 + Math.sin(time * 0.01) * 10,
    38,
    22,
    11
  );
  const pacificStorm = vortexFlow(
    lon,
    lat,
    160 + Math.cos(time * 0.008) * 12,
    34,
    24,
    -10
  );
  const southernStorm = vortexFlow(
    lon,
    lat,
    30 + Math.sin(time * 0.006) * 20,
    -46,
    26,
    8
  );

  u += atlanticStorm.u + pacificStorm.u + southernStorm.u;
  v += atlanticStorm.v + pacificStorm.v + southernStorm.v;

  return { u, v };
}

function getOceanVector(
  lon: number,
  lat: number,
  time: number
): { u: number; v: number; isOcean: boolean } {
  if (isApproxLand(lon, lat) || lat > 84) {
    return { u: 0, v: 0, isOcean: false };
  }

  const absLat = Math.abs(lat);
  const lonRad = lon * PI / 180;
  const latRad = lat * PI / 180;
  const hemisphere = lat >= 0 ? 1 : -1;

  let u = 0;
  let v = 0;

  if (absLat < 12) {
    u += -0.8 * (0.8 + 0.2 * Math.cos(latRad * 3.0));
    v += 0.12 * Math.sin(lonRad * 2.4);
  }

  const subtropicalBand = latGaussian(absLat, 27, 12);
  const subpolarBand = latGaussian(absLat, 52, 10);

  u += hemisphere * 0.45 * subtropicalBand * Math.cos((lon + 35) * PI / 110);
  v += -hemisphere * 0.35 * subtropicalBand * Math.sin((lon + 35) * PI / 110);

  u += -hemisphere * 0.22 * subpolarBand * Math.cos((lon - 10) * PI / 80);
  v += hemisphere * 0.16 * subpolarBand * Math.sin((lon - 10) * PI / 80);

  if (lat < -42 && lat > -60) {
    u += 1.25 * (0.8 + 0.2 * Math.cos(lonRad * 2.0));
  }

  const gulfStream = latGaussian(lat, 36, 7) * lonGaussian(lon, -55, 18);
  u += gulfStream * 1.8;
  v += gulfStream * 0.55;

  const kuroshio = latGaussian(lat, 32, 8) * lonGaussian(lon, 145, 18);
  u += kuroshio * 1.6;
  v += kuroshio * 0.45;

  const agulhas = latGaussian(lat, -34, 7) * lonGaussian(lon, 28, 12);
  u += agulhas * 1.1;
  v += agulhas * -0.35;

  const brazilCurrent = latGaussian(lat, -28, 8) * lonGaussian(lon, -42, 14);
  u += brazilCurrent * 0.9;
  v += brazilCurrent * -0.3;

  const eastAustralia = latGaussian(lat, -28, 8) * lonGaussian(lon, 155, 14);
  u += eastAustralia * 1.0;
  v += eastAustralia * -0.25;

  u += smoothNoise(lon, lat, time, 2.1) * 0.12;
  v += smoothNoise(lon - 18, lat + 10, time, 3.4) * 0.09;

  return { u, v, isOcean: true };
}

// =============================================================================
// WIND DATA FETCHING
// =============================================================================

/**
 * Generate a smooth synthetic global wind field.
 */
async function fetchWindData(): Promise<Float32Array> {
  const buffer = new Float32Array(GRID_WIDTH * GRID_HEIGHT * 4);

  const time = Date.now() / 1000;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const lat = -90 + y;

    for (let x = 0; x < GRID_WIDTH; x++) {
      const lon = x - 180;
      const idx = (y * GRID_WIDTH + x) * 4;
      const { u, v } = getWindVector(lon, lat, time);

      const magnitude = Math.sqrt(u * u + v * v);

      buffer[idx] = encodeVectorComponent(u, WIND_VECTOR_RANGE);
      buffer[idx + 1] = encodeVectorComponent(v, WIND_VECTOR_RANGE);
      buffer[idx + 2] = encodeMagnitude(magnitude, WIND_VECTOR_RANGE);
      buffer[idx + 3] = 1.0;
    }
  }

  return buffer;
}

// =============================================================================
// OCEAN CURRENT DATA FETCHING
// =============================================================================

/**
 * Generate a smooth synthetic global ocean-current field.
 */
async function fetchOceanData(): Promise<Float32Array> {
  const buffer = new Float32Array(GRID_WIDTH * GRID_HEIGHT * 4);

  const time = Date.now() / 1000;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const lat = -90 + y;

    for (let x = 0; x < GRID_WIDTH; x++) {
      const lon = x - 180;
      const idx = (y * GRID_WIDTH + x) * 4;
      const { u, v, isOcean } = getOceanVector(lon, lat, time);

      const magnitude = Math.sqrt(u * u + v * v);

      buffer[idx] = encodeVectorComponent(u, OCEAN_VECTOR_RANGE);
      buffer[idx + 1] = encodeVectorComponent(v, OCEAN_VECTOR_RANGE);
      buffer[idx + 2] = encodeMagnitude(magnitude, OCEAN_VECTOR_RANGE);
      buffer[idx + 3] = isOcean ? 1.0 : 0.0;
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
