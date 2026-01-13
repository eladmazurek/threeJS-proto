/**
 * Telemetry Display Module
 *
 * Manages the SpaceX-style telemetry overlay and weather legend.
 */

import * as THREE from "three";
import { EARTH_RADIUS } from "../constants";
import { missionStartTime } from "./overlays";

// =============================================================================
// DOM ELEMENTS (lazy-loaded because overlay HTML is created dynamically)
// =============================================================================

// Cached DOM element references
let telAltitude: HTMLElement | null = null;
let telLat: HTMLElement | null = null;
let telLon: HTMLElement | null = null;
let telUnits: HTMLElement | null = null;
let telUtc: HTMLElement | null = null;
let metValue: HTMLElement | null = null;
let weatherLegend: HTMLElement | null = null;
let legendTitle: HTMLElement | null = null;
let legendBar: HTMLElement | null = null;
let legendLabels: HTMLElement | null = null;

/** Lazily get telemetry DOM elements */
function getTelemetryElements() {
  if (!telAltitude) {
    telAltitude = document.getElementById("tel-altitude");
    telLat = document.getElementById("tel-lat");
    telLon = document.getElementById("tel-lon");
    telUnits = document.getElementById("tel-units");
    telUtc = document.getElementById("tel-utc");
    metValue = document.getElementById("met-value");
  }
}

/** Lazily get weather legend DOM elements */
function getWeatherElements() {
  if (!weatherLegend) {
    weatherLegend = document.getElementById("weather-legend");
    legendTitle = document.getElementById("legend-title");
    legendBar = document.getElementById("legend-bar");
    legendLabels = document.getElementById("legend-labels");
  }
}

// =============================================================================
// WEATHER LEGEND
// =============================================================================

/**
 * Update weather legend based on current layer
 */
export function updateWeatherLegend(layerName: string, visible: boolean): void {
  getWeatherElements();
  if (!weatherLegend || !legendBar || !legendTitle || !legendLabels) return;

  if (!visible) {
    weatherLegend.classList.add("hidden");
    return;
  }

  weatherLegend.classList.remove("hidden");

  // Remove all layer classes
  legendBar.classList.remove("precipitation", "wind", "temperature", "pressure");

  // Set title and gradient based on layer
  const layerConfig: Record<string, { title: string; labels: [string, string]; barClass: string }> = {
    precipitation: {
      title: "PRECIPITATION",
      labels: ["LIGHT", "HEAVY"],
      barClass: "precipitation",
    },
    wind: {
      title: "WIND SPEED",
      labels: ["SLOW", "JET STREAM"],
      barClass: "wind",
    },
    temperature: {
      title: "TEMPERATURE",
      labels: ["COLD", "HOT"],
      barClass: "temperature",
    },
    pressure: {
      title: "PRESSURE",
      labels: ["LOW", "HIGH"],
      barClass: "pressure",
    },
  };

  const config = layerConfig[layerName] || layerConfig.precipitation;
  legendTitle.textContent = config.title;
  legendBar.classList.add(config.barClass);
  legendLabels.innerHTML = `<span>${config.labels[0]}</span><span>${config.labels[1]}</span>`;
}

// =============================================================================
// TELEMETRY UPDATE
// =============================================================================

/** Dependencies for telemetry update */
export interface TelemetryDeps {
  cameraDistance: number;
  cameraPosition: THREE.Vector3;
  earth: THREE.Mesh;
  unitCounts: {
    ships: number;
    aircraft: number;
    satellites: number;
    drones: number;
    showShips: boolean;
    showAircraft: boolean;
    showSatellites: boolean;
    showDrones: boolean;
  };
}

/**
 * Update telemetry display with current values
 */
export function updateTelemetry(deps: TelemetryDeps): void {
  getTelemetryElements();
  if (!telAltitude || !telLat || !telLon || !telUnits || !telUtc || !metValue) return;

  const { cameraDistance, cameraPosition, earth, unitCounts } = deps;

  // Altitude (scaled - assuming Earth radius = 6371km, our radius = 2)
  const scaleFactor = 6371 / EARTH_RADIUS;
  const altitudeKm = ((cameraDistance - EARTH_RADIUS) * scaleFactor).toFixed(0);
  telAltitude.textContent = Number(altitudeKm).toLocaleString();

  // Calculate view center lat/lon (accounts for Earth rotation)
  // Raycast from camera to Earth center to find what we're looking at
  const toEarth = new THREE.Vector3(0, 0, 0).sub(cameraPosition).normalize();
  const raycaster = new THREE.Raycaster(cameraPosition.clone(), toEarth);
  const intersects = raycaster.intersectObject(earth, false);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    // Apply inverse of Earth's rotation to get local coordinates
    const localPoint = point.clone().applyMatrix4(earth.matrixWorld.clone().invert());

    const r = localPoint.length();
    const lat = 90 - Math.acos(localPoint.y / r) * (180 / Math.PI);
    const lon = Math.atan2(localPoint.z, -localPoint.x) * (180 / Math.PI) - 180;
    const normalizedLon = lon < -180 ? lon + 360 : lon > 180 ? lon - 360 : lon;

    telLat.textContent = lat.toFixed(2) + "°";
    telLon.textContent = normalizedLon.toFixed(2) + "°";
  }

  // Unit counts (only visible units)
  let totalUnits = 0;
  if (unitCounts.showShips) totalUnits += unitCounts.ships;
  if (unitCounts.showAircraft) totalUnits += unitCounts.aircraft;
  if (unitCounts.showSatellites) totalUnits += unitCounts.satellites;
  if (unitCounts.showDrones) totalUnits += unitCounts.drones;
  telUnits.textContent = totalUnits.toLocaleString();

  // UTC time
  const now = new Date();
  telUtc.textContent = now.toISOString().substr(11, 8);

  // Mission elapsed time
  const elapsed = Math.floor((Date.now() - missionStartTime) / 1000);
  const hours = Math.floor(elapsed / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0");
  const seconds = (elapsed % 60).toString().padStart(2, "0");
  metValue.textContent = `${hours}:${minutes}:${seconds}`;
}
