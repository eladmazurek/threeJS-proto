/**
 * SpaceX-Style UI Overlays
 *
 * Manages the tactical UI elements: telemetry display, crosshair,
 * viewport border, LIVE indicator, unit info panel, etc.
 */

import * as THREE from "three";
import { EARTH_RADIUS } from "../constants";

// =============================================================================
// OVERLAY HTML TEMPLATE
// =============================================================================

const OVERLAY_HTML = `
  <!-- Viewport border -->
  <div id="viewport-border"></div>

  <!-- Crosshair/reticle at center -->
  <div id="crosshair">
    <div class="crosshair-h"></div>
    <div class="crosshair-v"></div>
    <div class="crosshair-circle"></div>
  </div>

  <!-- LIVE indicator top-left -->
  <div id="live-indicator">
    <span class="live-dot"></span>
    <span class="live-text">LIVE</span>
  </div>

  <!-- Telemetry overlay bottom-left -->
  <div id="telemetry">
    <div class="telemetry-row">
      <span class="telemetry-label">ALT</span>
      <span class="telemetry-value" id="tel-altitude">0.00</span>
      <span class="telemetry-unit">km</span>
    </div>
    <div class="telemetry-row">
      <span class="telemetry-label">LAT</span>
      <span class="telemetry-value" id="tel-lat">0.00°</span>
    </div>
    <div class="telemetry-row">
      <span class="telemetry-label">LON</span>
      <span class="telemetry-value" id="tel-lon">0.00°</span>
    </div>
    <div class="telemetry-row">
      <span class="telemetry-label">UNITS</span>
      <span class="telemetry-value" id="tel-units">0</span>
    </div>
    <div class="telemetry-row">
      <span class="telemetry-label">UTC</span>
      <span class="telemetry-value" id="tel-utc">00:00:00</span>
    </div>
  </div>

  <!-- Mission elapsed time top-center -->
  <div id="mission-time">
    <span class="mission-label">T+</span>
    <span class="mission-value" id="met-value">00:00:00</span>
  </div>

  <!-- Weather legend (bottom-right, above unit info) -->
  <div id="weather-legend" class="hidden">
    <div class="legend-header">
      <span class="legend-title" id="legend-title">PRECIPITATION</span>
    </div>
    <div class="legend-bar" id="legend-bar"></div>
    <div class="legend-labels" id="legend-labels">
      <span>LOW</span>
      <span>HIGH</span>
    </div>
  </div>

  <!-- Selected unit info panel (bottom-right) -->
  <div id="unit-info" class="hidden">
    <div class="unit-info-header">
      <span class="unit-info-type" id="unit-type">AIRCRAFT</span>
      <span class="unit-info-id" id="unit-id">#0000</span>
      <button class="unit-info-close" id="unit-close">×</button>
    </div>
    <div class="unit-info-body">
      <div class="unit-info-row">
        <span class="unit-info-label" id="unit-label-1">LAT</span>
        <span class="unit-info-value" id="unit-lat">0.00°</span>
      </div>
      <div class="unit-info-row">
        <span class="unit-info-label" id="unit-label-2">LON</span>
        <span class="unit-info-value" id="unit-lon">0.00°</span>
      </div>
      <div class="unit-info-row">
        <span class="unit-info-label" id="unit-label-3">HDG</span>
        <span class="unit-info-value" id="unit-hdg">000°</span>
      </div>
      <div class="unit-info-row">
        <span class="unit-info-label" id="unit-label-4">SPD</span>
        <span class="unit-info-value" id="unit-spd">0 kts</span>
      </div>
      <div class="unit-info-row">
        <span class="unit-info-label" id="unit-label-5">ALT</span>
        <span class="unit-info-value" id="unit-alt">0 ft</span>
      </div>
      <div class="unit-info-row" id="unit-row-6">
        <span class="unit-info-label" id="unit-label-6">TYPE</span>
        <span class="unit-info-value" id="unit-extra">—</span>
      </div>
    </div>
  </div>

  <!-- Drone video feed panel -->
  <div id="drone-feed" class="hidden">
    <div class="drone-feed-header">
      <span class="drone-feed-title">LIVE FEED</span>
      <span class="drone-feed-status">● REC</span>
    </div>
    <div class="drone-feed-video">
      <video id="drone-video" autoplay loop muted playsinline>
        <source src="./earth/UAV_recon_low.mp4" type="video/mp4">
      </video>
      <div class="drone-feed-overlay">
        <div class="drone-feed-coords" id="drone-feed-coords">TGT: 00.0000° 00.0000°</div>
      </div>
    </div>
    <div class="drone-feed-footer">
      <span class="drone-feed-mode">IR/EO</span>
      <span class="drone-feed-zoom">4.0x</span>
    </div>
  </div>
`;

// =============================================================================
// ELEMENT REFERENCES
// =============================================================================

/** Telemetry display elements */
export let telAltitude: HTMLElement | null = null;
export let telLat: HTMLElement | null = null;
export let telLon: HTMLElement | null = null;
export let telUnits: HTMLElement | null = null;
export let telUtc: HTMLElement | null = null;
export let metValue: HTMLElement | null = null;

/** Weather legend elements */
export let weatherLegend: HTMLElement | null = null;
export let legendTitle: HTMLElement | null = null;
export let legendBar: HTMLElement | null = null;
export let legendLabels: HTMLElement | null = null;

/** Unit info panel elements */
export let unitInfoPanel: HTMLElement | null = null;
export let unitTypeEl: HTMLElement | null = null;
export let unitIdEl: HTMLElement | null = null;
export let unitCloseBtn: HTMLElement | null = null;
export let unitLatEl: HTMLElement | null = null;
export let unitLonEl: HTMLElement | null = null;
export let unitHdgEl: HTMLElement | null = null;
export let unitSpdEl: HTMLElement | null = null;
export let unitAltEl: HTMLElement | null = null;
export let unitLabel1: HTMLElement | null = null;
export let unitLabel2: HTMLElement | null = null;
export let unitLabel3: HTMLElement | null = null;
export let unitLabel4: HTMLElement | null = null;
export let unitLabel5: HTMLElement | null = null;

/** Drone feed elements */
export let droneFeedPanel: HTMLElement | null = null;
export let droneFeedCoords: HTMLElement | null = null;
export let droneVideo: HTMLVideoElement | null = null;

/** Mission start time for elapsed time calculation */
export const missionStartTime = Date.now();

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the SpaceX-style UI overlays.
 * Creates DOM elements and caches references.
 */
export function initOverlays(): void {
  // Create main overlay container
  const overlay = document.createElement("div");
  overlay.id = "spacex-overlay";
  overlay.innerHTML = OVERLAY_HTML;
  document.body.appendChild(overlay);

  // Cache telemetry element references
  telAltitude = document.getElementById("tel-altitude");
  telLat = document.getElementById("tel-lat");
  telLon = document.getElementById("tel-lon");
  telUnits = document.getElementById("tel-units");
  telUtc = document.getElementById("tel-utc");
  metValue = document.getElementById("met-value");

  // Cache weather legend references
  weatherLegend = document.getElementById("weather-legend");
  legendTitle = document.getElementById("legend-title");
  legendBar = document.getElementById("legend-bar");
  legendLabels = document.getElementById("legend-labels");

  // Cache unit info panel references
  unitInfoPanel = document.getElementById("unit-info");
  unitTypeEl = document.getElementById("unit-type");
  unitIdEl = document.getElementById("unit-id");
  unitCloseBtn = document.getElementById("unit-close");
  unitLatEl = document.getElementById("unit-lat");
  unitLonEl = document.getElementById("unit-lon");
  unitHdgEl = document.getElementById("unit-hdg");
  unitSpdEl = document.getElementById("unit-spd");
  unitAltEl = document.getElementById("unit-alt");
  unitLabel1 = document.getElementById("unit-label-1");
  unitLabel2 = document.getElementById("unit-label-2");
  unitLabel3 = document.getElementById("unit-label-3");
  unitLabel4 = document.getElementById("unit-label-4");
  unitLabel5 = document.getElementById("unit-label-5");

  // Cache drone feed references
  droneFeedPanel = document.getElementById("drone-feed");
  droneFeedCoords = document.getElementById("drone-feed-coords");
  droneVideo = document.getElementById("drone-video") as HTMLVideoElement;
}

// =============================================================================
// UPDATE FUNCTIONS
// =============================================================================

/** Weather layer configuration */
const WEATHER_LAYER_CONFIG: Record<
  string,
  { title: string; labels: [string, string]; barClass: string }
> = {
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

/**
 * Update weather legend based on current layer.
 */
export function updateWeatherLegend(layerName: string, visible: boolean): void {
  if (!weatherLegend || !legendBar || !legendTitle || !legendLabels) return;

  if (!visible) {
    weatherLegend.classList.add("hidden");
    return;
  }

  weatherLegend.classList.remove("hidden");

  // Remove all layer classes
  legendBar.classList.remove("precipitation", "wind", "temperature", "pressure");

  // Set title and gradient based on layer
  const config = WEATHER_LAYER_CONFIG[layerName] || WEATHER_LAYER_CONFIG.precipitation;
  legendTitle.textContent = config.title;
  legendBar.classList.add(config.barClass);
  legendLabels.innerHTML = `<span>${config.labels[0]}</span><span>${config.labels[1]}</span>`;
}

/**
 * Update telemetry display with current values.
 */
export function updateTelemetry(
  cameraDistance: number,
  cameraPosition: THREE.Vector3,
  earth: THREE.Mesh,
  totalUnits: number
): void {
  if (!telAltitude || !telLat || !telLon || !telUnits || !telUtc || !metValue) return;

  // Altitude (scaled - assuming Earth radius = 6371km, our radius = 2)
  const scaleFactor = 6371 / EARTH_RADIUS;
  const altitudeKm = ((cameraDistance - EARTH_RADIUS) * scaleFactor).toFixed(0);
  telAltitude.textContent = Number(altitudeKm).toLocaleString();

  // Calculate view center lat/lon (accounts for Earth rotation)
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

  // Unit count
  telUnits.textContent = totalUnits.toLocaleString();

  // UTC time
  const now = new Date();
  telUtc.textContent = now.toISOString().substr(11, 8);

  // Mission elapsed time
  const elapsed = Math.floor((Date.now() - missionStartTime) / 1000);
  const hours = Math.floor(elapsed / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((elapsed % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (elapsed % 60).toString().padStart(2, "0");
  metValue.textContent = `${hours}:${minutes}:${seconds}`;
}

/**
 * Show the unit info panel.
 */
export function showUnitInfo(): void {
  unitInfoPanel?.classList.remove("hidden");
}

/**
 * Hide the unit info panel.
 */
export function hideUnitInfo(): void {
  unitInfoPanel?.classList.add("hidden");
}

/**
 * Show the drone feed panel.
 */
export function showDroneFeed(): void {
  droneFeedPanel?.classList.remove("hidden");
  droneVideo?.play();
}

/**
 * Hide the drone feed panel.
 */
export function hideDroneFeed(): void {
  droneFeedPanel?.classList.add("hidden");
  droneVideo?.pause();
}

/**
 * Update drone feed coordinates display.
 */
export function updateDroneFeedCoords(lat: number, lon: number): void {
  if (droneFeedCoords) {
    droneFeedCoords.textContent = `TGT: ${lat.toFixed(4)}° ${lon.toFixed(4)}°`;
  }
}

/**
 * Update unit info panel with ship data.
 */
export function updateUnitInfoShip(
  name: string,
  lat: number,
  lon: number,
  heading: number,
  speed: number
): void {
  if (!unitTypeEl || !unitIdEl || !unitLatEl || !unitLonEl || !unitHdgEl || !unitSpdEl || !unitAltEl) return;
  if (!unitLabel1 || !unitLabel2 || !unitLabel3 || !unitLabel4 || !unitLabel5) return;

  unitTypeEl.textContent = "SHIP";
  unitTypeEl.className = "unit-info-type ship";
  unitIdEl.textContent = name;
  unitLabel1.textContent = "LAT";
  unitLabel2.textContent = "LON";
  unitLabel3.textContent = "HDG";
  unitLabel4.textContent = "SOG";
  unitLabel5.textContent = "—";
  unitLatEl.textContent = lat.toFixed(4) + "°";
  unitLonEl.textContent = lon.toFixed(4) + "°";
  unitHdgEl.textContent = heading.toFixed(0) + "°";
  unitSpdEl.textContent = speed.toFixed(1) + " kts";
  unitAltEl.textContent = "—";
}

/**
 * Update unit info panel with aircraft data.
 */
export function updateUnitInfoAircraft(
  callsign: string,
  lat: number,
  lon: number,
  heading: number,
  speed: number,
  altitude: number,
  originCountry?: string
): void {
  if (!unitTypeEl || !unitIdEl || !unitLatEl || !unitLonEl || !unitHdgEl || !unitSpdEl || !unitAltEl) return;
  if (!unitLabel1 || !unitLabel2 || !unitLabel3 || !unitLabel4 || !unitLabel5) return;

  unitTypeEl.textContent = "";
  unitTypeEl.className = "unit-info-type aircraft";
  unitIdEl.textContent = callsign;
  unitLabel1.textContent = "POS";
  unitLabel2.textContent = "HDG";
  unitLabel3.textContent = "SPD";
  unitLabel4.textContent = "REG";
  unitLabel5.textContent = "ALT";
  unitLatEl.textContent = `${lat.toFixed(2)}° ${lon.toFixed(2)}°`;
  unitLonEl.textContent = heading.toFixed(0) + "°";
  unitHdgEl.textContent = speed.toFixed(0) + " kts";
  unitSpdEl.textContent = originCountry || "—";
  unitAltEl.textContent = Math.round(altitude).toLocaleString() + " ft";
}

/**
 * Update unit info panel with satellite data.
 */
export function updateUnitInfoSatellite(
  name: string,
  lat: number,
  lon: number,
  altitude: number,
  orbitType: string
): void {
  if (!unitTypeEl || !unitIdEl || !unitLatEl || !unitLonEl || !unitHdgEl || !unitSpdEl || !unitAltEl) return;
  if (!unitLabel1 || !unitLabel2 || !unitLabel3 || !unitLabel4 || !unitLabel5) return;

  unitTypeEl.textContent = "SATELLITE";
  unitTypeEl.className = "unit-info-type satellite";
  unitIdEl.textContent = name;
  unitLabel1.textContent = "LAT";
  unitLabel2.textContent = "LON";
  unitLabel3.textContent = "ALT";
  unitLabel4.textContent = "ORBIT";
  unitLabel5.textContent = "—";
  unitLatEl.textContent = lat.toFixed(4) + "°";
  unitLonEl.textContent = lon.toFixed(4) + "°";
  unitHdgEl.textContent = (altitude * 3185.5).toFixed(0) + " km"; // Convert to real altitude
  unitSpdEl.textContent = orbitType;
  unitAltEl.textContent = "—";
}

/**
 * Update unit info panel with drone data.
 */
export function updateUnitInfoDrone(
  name: string,
  lat: number,
  lon: number,
  heading: number,
  altitude: number,
  targetLat: number,
  targetLon: number
): void {
  if (!unitTypeEl || !unitIdEl || !unitLatEl || !unitLonEl || !unitHdgEl || !unitSpdEl || !unitAltEl) return;
  if (!unitLabel1 || !unitLabel2 || !unitLabel3 || !unitLabel4 || !unitLabel5) return;

  unitTypeEl.textContent = "DRONE";
  unitTypeEl.className = "unit-info-type drone";
  unitIdEl.textContent = name;
  unitLabel1.textContent = "LAT";
  unitLabel2.textContent = "LON";
  unitLabel3.textContent = "HDG";
  unitLabel4.textContent = "ALT";
  unitLabel5.textContent = "TGT";
  unitLatEl.textContent = lat.toFixed(4) + "°";
  unitLonEl.textContent = lon.toFixed(4) + "°";
  unitHdgEl.textContent = heading.toFixed(0) + "°";
  // Convert altitude to feet (altitude is in Earth radii, 1 Earth radius = 2 scene units = 6371km)
  const altFeet = Math.round(altitude * 3185.5 * 3280.84);
  unitSpdEl.textContent = altFeet.toLocaleString() + " ft";
  unitAltEl.textContent = `${targetLat.toFixed(2)}°, ${targetLon.toFixed(2)}°`;
}

/**
 * Update unit info panel with airport data.
 */
export function updateUnitInfoAirport(
  name: string,
  iata: string,
  lat: number,
  lon: number
): void {
  if (!unitTypeEl || !unitIdEl || !unitLatEl || !unitLonEl || !unitHdgEl || !unitSpdEl || !unitAltEl) return;
  if (!unitLabel1 || !unitLabel2 || !unitLabel3 || !unitLabel4 || !unitLabel5) return;

  unitTypeEl.textContent = "AIRPORT";
  unitTypeEl.className = "unit-info-type airport";
  unitIdEl.textContent = iata;
  unitLabel1.textContent = "NAME";
  unitLabel2.textContent = "LAT";
  unitLabel3.textContent = "LON";
  unitLabel4.textContent = "—";
  unitLabel5.textContent = "—";
  unitLatEl.textContent = name;
  unitLonEl.textContent = lat.toFixed(4) + "°";
  unitHdgEl.textContent = lon.toFixed(4) + "°";
  unitSpdEl.textContent = "—";
  unitAltEl.textContent = "—";
}
