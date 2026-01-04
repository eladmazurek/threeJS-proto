/**
 * Earth Shaders - Main Application Script
 *
 * This script sets up a Three.js scene with a rotating Earth sphere
 * rendered using custom GLSL shaders. It includes interactive camera
 * controls and a debug GUI for parameter adjustment.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import * as h3 from "h3-js";

// Import custom GLSL shaders for the Earth material
// These are compiled by vite-plugin-glsl at build time
import earthVertexShader from "./shaders/earth/vertex.glsl";
import earthFragmentShader from "./shaders/earth/fragment.glsl";

// Import tracking icon shaders (GPU-based orientation)
import trackingVertexShader from "./shaders/tracking/vertex.glsl";
import trackingFragmentShader from "./shaders/tracking/fragment.glsl";

// Import glass shaders for realistic glass UI look
import glassVertexShader from "./shaders/tracking/glass-vertex.glsl";
import glassFragmentShader from "./shaders/tracking/glass-fragment.glsl";
import satelliteVertexShader from "./shaders/tracking/satellite-vertex.glsl";

/**
 * =============================================================================
 * BASE SETUP
 * =============================================================================
 */

// Debug GUI - lil-gui provides a panel for tweaking parameters in real-time
// Access it in the top-right corner of the screen
const gui = new GUI();
gui.title("Controls");

// Inject SpaceX-style GUI styles
(function injectSpacexGuiStyles() {
  const style = document.createElement("style");
  style.id = "spacex-gui-styles";
  style.textContent = `
    /* Main GUI container - minimal dark style */
    .lil-gui {
      --background-color: rgba(0, 0, 0, 0.85) !important;
      --widget-color: rgba(255, 255, 255, 0.1) !important;
      --focus-color: rgba(255, 255, 255, 0.2) !important;
      --hover-color: rgba(255, 255, 255, 0.15) !important;
      --font-family: "Inter", "Helvetica Neue", Arial, sans-serif !important;
      --font-size: 10px !important;
      --number-color: #ffffff !important;
      --string-color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
    }

    /* Folder titles - minimal uppercase */
    .lil-gui .lil-title {
      background: transparent !important;
      color: #ffffff !important;
      text-transform: uppercase !important;
      font-weight: 500 !important;
      letter-spacing: 2px !important;
      font-size: 9px !important;
      border-left: 1px solid rgba(255, 255, 255, 0.3) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
      padding: 8px 10px !important;
    }

    .lil-gui .lil-title:hover {
      background: rgba(255, 255, 255, 0.05) !important;
    }

    /* Controller labels - gray uppercase */
    .lil-gui .lil-name {
      color: rgba(255, 255, 255, 0.5) !important;
      font-size: 9px !important;
      font-weight: 400 !important;
      letter-spacing: 1px !important;
      text-transform: uppercase !important;
    }

    /* Sliders - minimal white */
    .lil-gui .slider {
      background: rgba(255, 255, 255, 0.1) !important;
    }

    .lil-gui .fill {
      background: rgba(255, 255, 255, 0.4) !important;
    }

    /* Input fields */
    .lil-gui input {
      background: rgba(255, 255, 255, 0.05) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: #ffffff !important;
    }

    .lil-gui input:focus {
      border-color: rgba(255, 255, 255, 0.4) !important;
    }

    /* Checkboxes */
    .lil-gui input[type="checkbox"] {
      border-color: rgba(255, 255, 255, 0.3) !important;
    }

    .lil-gui input[type="checkbox"]:checked {
      background: #ffffff !important;
    }

    /* Select dropdowns */
    .lil-gui select {
      background: rgba(255, 255, 255, 0.05) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: #ffffff !important;
    }

    /* Controller rows */
    .lil-gui .controller {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    }
  `;
  document.head.appendChild(style);
})();

/**
 * =============================================================================
 * SPACEX-STYLE UI OVERLAYS
 * =============================================================================
 * Adds tactical UI elements: telemetry display, crosshair, viewport border, LIVE indicator
 */

// Create and inject UI overlay container
(function createSpacexOverlays() {
  // Main overlay container
  const overlay = document.createElement("div");
  overlay.id = "spacex-overlay";
  overlay.innerHTML = `
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
      </div>
    </div>
  `;

  // Inject styles for overlays
  const style = document.createElement("style");
  style.id = "spacex-overlay-styles";
  style.textContent = `
    #spacex-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
      font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace;
    }

    /* Viewport border - thin white line */
    #viewport-border {
      position: absolute;
      top: 8px;
      left: 8px;
      right: 8px;
      bottom: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      pointer-events: none;
    }

    /* Crosshair at center */
    #crosshair {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 40px;
    }

    .crosshair-h, .crosshair-v {
      position: absolute;
      background: rgba(255, 255, 255, 0.5);
    }

    .crosshair-h {
      width: 100%;
      height: 1px;
      top: 50%;
      transform: translateY(-50%);
    }

    .crosshair-v {
      width: 1px;
      height: 100%;
      left: 50%;
      transform: translateX(-50%);
    }

    .crosshair-circle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 16px;
      height: 16px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 50%;
    }

    /* LIVE indicator */
    #live-indicator {
      position: absolute;
      top: 20px;
      left: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .live-dot {
      width: 8px;
      height: 8px;
      background: #ff3333;
      border-radius: 50%;
      animation: live-pulse 1.5s ease-in-out infinite;
    }

    @keyframes live-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .live-text {
      color: rgba(255, 255, 255, 0.8);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 2px;
    }

    /* Telemetry display */
    #telemetry {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .telemetry-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .telemetry-label {
      color: rgba(255, 255, 255, 0.4);
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 1px;
      width: 40px;
    }

    .telemetry-value {
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
      min-width: 70px;
    }

    .telemetry-unit {
      color: rgba(255, 255, 255, 0.4);
      font-size: 9px;
      font-weight: 400;
    }

    /* Mission elapsed time */
    #mission-time {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: baseline;
      gap: 4px;
    }

    .mission-label {
      color: rgba(255, 255, 255, 0.5);
      font-size: 11px;
      font-weight: 500;
    }

    .mission-value {
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
      letter-spacing: 1px;
    }

    /* Unit info panel */
    #unit-info {
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      min-width: 180px;
      pointer-events: auto;
    }

    #unit-info.hidden {
      display: none;
    }

    .unit-info-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .unit-info-type {
      color: #2dd4bf;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1px;
    }

    .unit-info-type.ship { color: #2dd4bf; }
    .unit-info-type.aircraft { color: #fbbf24; }
    .unit-info-type.satellite { color: #a78bfa; }
    .unit-info-type.airport { color: #ffffff; }

    .unit-info-id {
      color: rgba(255, 255, 255, 0.5);
      font-size: 10px;
      font-weight: 400;
    }

    .unit-info-close {
      margin-left: auto;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      font-size: 16px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }

    .unit-info-close:hover {
      color: rgba(255, 255, 255, 0.9);
    }

    .unit-info-body {
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .unit-info-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .unit-info-label {
      color: rgba(255, 255, 255, 0.4);
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 1px;
    }

    .unit-info-value {
      color: rgba(255, 255, 255, 0.9);
      font-size: 11px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
    }

    /* Weather Legend */
    #weather-legend {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 10px 14px;
      pointer-events: auto;
      min-width: 140px;
    }

    #weather-legend.hidden {
      display: none;
    }

    .legend-header {
      margin-bottom: 8px;
    }

    .legend-title {
      color: rgba(255, 255, 255, 0.7);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 1.5px;
    }

    .legend-bar {
      height: 10px;
      border-radius: 2px;
      margin-bottom: 4px;
    }

    .legend-bar.precipitation {
      background: linear-gradient(to right,
        rgb(25, 90, 140),
        rgb(0, 155, 165),
        rgb(50, 180, 40),
        rgb(230, 220, 25),
        rgb(255, 115, 0),
        rgb(205, 25, 25)
      );
    }

    .legend-bar.wind {
      background: linear-gradient(to right,
        rgb(50, 100, 180),
        rgb(75, 180, 155),
        rgb(230, 205, 75),
        rgb(245, 100, 155)
      );
    }

    .legend-bar.temperature {
      background: linear-gradient(to right,
        rgb(0, 0, 155),
        rgb(0, 100, 205),
        rgb(0, 180, 130),
        rgb(230, 230, 0),
        rgb(255, 130, 0),
        rgb(205, 0, 0)
      );
    }

    .legend-bar.pressure {
      background: linear-gradient(to right,
        rgb(0, 100, 200),
        rgb(100, 100, 100),
        rgb(200, 100, 50)
      );
    }

    .legend-labels {
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.5);
      letter-spacing: 0.5px;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);
})();

// References to telemetry elements for updates
const telAltitude = document.getElementById("tel-altitude");
const telLat = document.getElementById("tel-lat");
const telLon = document.getElementById("tel-lon");
const telUnits = document.getElementById("tel-units");
const telUtc = document.getElementById("tel-utc");
const metValue = document.getElementById("met-value");

// Weather legend elements
const weatherLegend = document.getElementById("weather-legend");
const legendTitle = document.getElementById("legend-title");
const legendBar = document.getElementById("legend-bar");
const legendLabels = document.getElementById("legend-labels");

/**
 * Update weather legend based on current layer
 */
function updateWeatherLegend(layerName, visible) {
  if (!visible) {
    weatherLegend.classList.add("hidden");
    return;
  }

  weatherLegend.classList.remove("hidden");

  // Remove all layer classes
  legendBar.classList.remove("precipitation", "wind", "temperature", "pressure");

  // Set title and gradient based on layer
  const layerConfig = {
    precipitation: {
      title: "PRECIPITATION",
      labels: ["LIGHT", "HEAVY"],
      barClass: "precipitation"
    },
    wind: {
      title: "WIND SPEED",
      labels: ["SLOW", "JET STREAM"],
      barClass: "wind"
    },
    temperature: {
      title: "TEMPERATURE",
      labels: ["COLD", "HOT"],
      barClass: "temperature"
    },
    pressure: {
      title: "PRESSURE",
      labels: ["LOW", "HIGH"],
      barClass: "pressure"
    }
  };

  const config = layerConfig[layerName] || layerConfig.precipitation;
  legendTitle.textContent = config.title;
  legendBar.classList.add(config.barClass);
  legendLabels.innerHTML = `<span>${config.labels[0]}</span><span>${config.labels[1]}</span>`;
}

// Mission start time for elapsed time calculation
const missionStartTime = Date.now();

/**
 * Update telemetry display with current values
 */
function updateTelemetry(cameraDistance, cameraPosition) {
  // Altitude (scaled - assuming Earth radius = 6371km, our radius = 2)
  const scaleFactor = 6371 / EARTH_RADIUS;
  const altitudeKm = ((cameraDistance - EARTH_RADIUS) * scaleFactor).toFixed(0);
  telAltitude.textContent = altitudeKm.toLocaleString();

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
    const normalizedLon = lon < -180 ? lon + 360 : (lon > 180 ? lon - 360 : lon);

    telLat.textContent = lat.toFixed(2) + "°";
    telLon.textContent = normalizedLon.toFixed(2) + "°";
  }

  // Unit counts (only visible units)
  let totalUnits = 0;
  if (unitCountParams.showShips) totalUnits += shipSimState.length;
  if (unitCountParams.showAircraft) totalUnits += aircraftSimState.length;
  if (unitCountParams.showSatellites) totalUnits += satelliteSimState.length;
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

// Earth radius constant - must match the sphere geometry radius
const EARTH_RADIUS = 2;

// Get reference to the WebGL canvas element defined in index.html
const canvas = document.querySelector("canvas.webgl");

// Create the Three.js scene - this is the container for all 3D objects,
// lights, and cameras
const scene = new THREE.Scene();

// Texture loader for loading image files as textures
// Used for Earth day/night maps, clouds, etc.
const textureLoader = new THREE.TextureLoader();

/**
 * =============================================================================
 * TEXTURES
 * =============================================================================
 */

// Texture presets - different Earth imagery options
// Users can add their own high-res textures to static/earth/ folder
const texturePresets = {
  "Standard": {
    day: "earth/day.jpg",
    night: "earth/night.jpg",
    specularClouds: "earth/specularClouds.jpg",
    description: "Default Earth textures",
  },
  "Black Marble (NASA)": {
    // NASA Black Marble - 8K night imagery showing city lights
    // Source: https://earthobservatory.nasa.gov/features/NightLights
    day: "earth/blackmarble_night.jpg",  // Use night for both - city lights view
    night: "earth/blackmarble_night.jpg",
    specularClouds: "earth/specularClouds.jpg",
    description: "NASA night imagery - city lights",
  },
  "Blue Marble (NASA)": {
    // NASA Blue Marble - true color satellite imagery
    // Source: https://visibleearth.nasa.gov/collection/1484/blue-marble
    day: "earth/bluemarble_day.jpg",
    night: "earth/night.jpg",
    specularClouds: "earth/specularClouds.jpg",
    description: "NASA true color day imagery",
  },
  "Topo + Bathymetry": {
    // Topographic relief with ocean bathymetry
    // Shows elevation data - great for tactical/military look
    day: "earth/topo_bathymetry.jpg",
    night: "earth/night.jpg",
    specularClouds: "earth/specularClouds.jpg",
    description: "Elevation + ocean depth",
  },
};

// Current texture preset selection
const textureParams = {
  preset: "Standard",
};

// Texture cache to avoid reloading
const textureCache = {};

/**
 * Load a texture with caching
 */
function loadTexture(path, isSRGB = true) {
  if (textureCache[path]) {
    return textureCache[path];
  }

  // Prepend base URL for GitHub Pages deployment
  const fullPath = import.meta.env.BASE_URL + path;

  const texture = textureLoader.load(
    fullPath,
    // onLoad
    (tex) => {
      console.log(`Loaded texture: ${path}`);
    },
    // onProgress
    undefined,
    // onError
    (err) => {
      console.warn(`Failed to load texture: ${path}. Using fallback.`);
    }
  );

  if (isSRGB) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }

  textureCache[path] = texture;
  return texture;
}

/**
 * Switch to a different texture preset
 */
function switchTexturePreset(presetName) {
  const preset = texturePresets[presetName];
  if (!preset) {
    console.warn(`Unknown texture preset: ${presetName}`);
    return;
  }

  console.log(`Switching to texture preset: ${presetName}`);

  // Load and apply textures
  const dayTex = loadTexture(preset.day, true);
  const nightTex = loadTexture(preset.night, true);
  const specCloudsTex = loadTexture(preset.specularClouds, false);

  // Update Earth material uniforms
  earthMaterial.uniforms.uDayTexture.value = dayTex;
  earthMaterial.uniforms.uNightTexture.value = nightTex;
  earthMaterial.uniforms.uSpecularCloudsTexture.value = specCloudsTex;

  // Update cloud layer
  cloudMaterial.uniforms.uCloudsTexture.value = specCloudsTex;

  // Update anisotropic filtering on new textures
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy() || 1;
  dayTex.anisotropy = maxAniso;
  nightTex.anisotropy = maxAniso;
  specCloudsTex.anisotropy = maxAniso;
}

// Load initial textures (Standard preset)
const earthDayTexture = loadTexture("earth/day.jpg", true);
const earthNightTexture = loadTexture("earth/night.jpg", true);
const earthSpecularCloudsTexture = loadTexture("earth/specularClouds.jpg", false);

/**
 * =============================================================================
 * EARTH
 * =============================================================================
 */

// Parameters that can be adjusted via the GUI
const earthParameters = {
  atmosphereDayColor: "#4a90c2", // Subtle blue atmosphere (SpaceX style)
  atmosphereTwilightColor: "#1a3a5c", // Dark blue twilight
  atmosphereIntensity: 0.12, // Very subtle atmosphere
  cloudsIntensity: 0.08, // Minimal clouds
  sunDirectionX: -1.0, // Sun direction X component
  sunDirectionY: 0.5, // Sun direction Y component
  sunDirectionZ: 1.0, // Sun direction Z component
  specularIntensity: 0.3, // Subtle sun glint
  specularSharpness: 800.0, // Sharpness of the center highlight
  specularGlowSize: 200.0, // Size of the medium glow
};

// Create sphere geometry for the Earth
// Parameters: radius=2, widthSegments=128, heightSegments=128
// Higher segment counts = smoother sphere but more vertices to process
const earthGeometry = new THREE.SphereGeometry(2, 128, 128);

// Create custom shader material using our GLSL shaders
// ShaderMaterial allows us to write custom vertex and fragment shaders
// instead of using Three.js built-in materials
const earthMaterial = new THREE.ShaderMaterial({
  vertexShader: earthVertexShader, // Controls vertex positions
  fragmentShader: earthFragmentShader, // Controls pixel colors
  uniforms: {
    // Texture uniforms
    uDayTexture: { value: earthDayTexture },
    uNightTexture: { value: earthNightTexture },
    uSpecularCloudsTexture: { value: earthSpecularCloudsTexture },

    // Sun direction - controls day/night and lighting
    uSunDirection: {
      value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize(),
    },

    // Atmosphere parameters (kept for minor surface tinting)
    uAtmosphereDayColor: { value: new THREE.Color(earthParameters.atmosphereDayColor) },
    uAtmosphereTwilightColor: { value: new THREE.Color(earthParameters.atmosphereTwilightColor) },
    uAtmosphereDayMix: { value: 0.1 },
    uAtmosphereTwilightMix: { value: 0.15 },

    // Cloud parameters
    uCloudsIntensity: { value: earthParameters.cloudsIntensity },

    // Specular/sun glint parameters
    uSpecularIntensity: { value: earthParameters.specularIntensity },
    uSpecularSharpness: { value: earthParameters.specularSharpness },
    uSpecularGlowSize: { value: earthParameters.specularGlowSize },

    // Color mode (0=normal, 1=grayscale, 2=night vision, 3=thermal, 4=hologram)
    uColorMode: { value: 0 },

    // Night blend toggle (0=day only, 1=day/night blend)
    uNightBlend: { value: 1.0 },
  },
});

// Create the Earth mesh by combining geometry and material
const earth = new THREE.Mesh(earthGeometry, earthMaterial);

// Add the Earth to the scene graph
scene.add(earth);

/**
 * =============================================================================
 * ATMOSPHERE GLOW (Separate sphere extending beyond Earth)
 * =============================================================================
 * Creates the blue/red atmospheric rim visible at Earth's edges
 */

const ATMOSPHERE_SCALE = 1.025; // Atmosphere extends 2.5% beyond Earth surface (thin rim)

const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * ATMOSPHERE_SCALE, 64, 64);

const atmosphereMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uSunDirection;
    uniform vec3 uDayColor;
    uniform vec3 uTwilightColor;
    uniform float uIntensity;

    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vec3 viewDirection = normalize(cameraPosition - vPosition);
      vec3 normal = normalize(vNormal);

      // Soft fresnel - gradual glow at edges
      float fresnel = 1.0 - dot(viewDirection, normal);
      fresnel = pow(fresnel, 4.0); // Higher power = thinner rim
      fresnel = smoothstep(0.0, 1.0, fresnel); // Soften the falloff

      // Sun orientation for color mixing
      float sunOrientation = dot(normal, uSunDirection);
      float colorMix = smoothstep(-0.3, 0.6, sunOrientation);

      // Blend between twilight (red) and day (blue) colors
      vec3 atmosphereColor = mix(uTwilightColor, uDayColor, colorMix);

      // Soft visibility falloff
      float visibility = 0.5 + 0.5 * smoothstep(-0.5, 0.3, sunOrientation);

      float alpha = fresnel * uIntensity * visibility;

      gl_FragColor = vec4(atmosphereColor, alpha);
    }
  `,
  uniforms: {
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
    uDayColor: { value: new THREE.Color(earthParameters.atmosphereDayColor) },
    uTwilightColor: { value: new THREE.Color(earthParameters.atmosphereTwilightColor) },
    uIntensity: { value: earthParameters.atmosphereIntensity },
  },
  transparent: true,
  side: THREE.BackSide, // Render inside of sphere (we're looking at it from outside)
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphereMesh);

/**
 * =============================================================================
 * CLOUD LAYER (Separate sphere for proper depth ordering)
 * =============================================================================
 * Renders clouds as a separate transparent layer so ships appear below clouds
 * but aircraft appear above them.
 */

const CLOUD_ALTITUDE = 0.008; // Slightly above ships (0.005) but below aircraft (0.02)

const cloudGeometry = new THREE.SphereGeometry(EARTH_RADIUS + CLOUD_ALTITUDE, 64, 64);

const cloudMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uCloudsTexture;
    uniform float uCloudsIntensity;
    uniform vec3 uSunDirection;

    varying vec2 vUv;

    void main() {
      // Sample cloud coverage from green channel
      float clouds = texture2D(uCloudsTexture, vUv).g;

      // Calculate basic day/night based on normal (approximate from UV)
      vec3 normal = normalize(vec3(
        -sin(vUv.y * 3.14159) * cos(vUv.x * 6.28318),
        cos(vUv.y * 3.14159),
        sin(vUv.y * 3.14159) * sin(vUv.x * 6.28318)
      ));
      float dayMix = smoothstep(-0.2, 0.4, dot(normal, uSunDirection));

      // Clouds only visible on day side
      float cloudAlpha = clouds * uCloudsIntensity * dayMix * 0.9;

      gl_FragColor = vec4(1.0, 1.0, 1.0, cloudAlpha);
    }
  `,
  uniforms: {
    uCloudsTexture: { value: earthSpecularCloudsTexture },
    uCloudsIntensity: { value: earthParameters.cloudsIntensity },
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
  },
  transparent: true,
  side: THREE.FrontSide,
  depthTest: true,
  depthWrite: false,
});

const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
cloudMesh.renderOrder = 1.5; // Between ships (1) and aircraft (2)
earth.add(cloudMesh);

/**
 * =============================================================================
 * WEATHER OVERLAY
 * =============================================================================
 * Real-time weather data visualization using NASA GIBS imagery
 * Supports multiple weather layers: clouds, precipitation, temperature, etc.
 */

const WEATHER_ALTITUDE = 0.006; // Between surface and clouds

// Weather overlay parameters
const weatherParams = {
  enabled: false,
  layer: "precipitation", // precipitation, temperature, wind, pressure
  opacity: 0.6,
  animate: true,
};

// Weather layer definitions with NASA GIBS tile URLs
// Using NASA EOSDIS Global Imagery Browse Services
const WEATHER_LAYERS = {
  clouds: {
    name: "Cloud Cover",
    // NASA MODIS Terra Cloud imagery
    url: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
    layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    color: new THREE.Color(0xffffff),
    description: "Satellite cloud imagery",
  },
  precipitation: {
    name: "Precipitation",
    // IMERG precipitation data
    layer: "IMERG_Precipitation_Rate",
    color: new THREE.Color(0x00aaff),
    description: "Global precipitation rate",
  },
  temperature: {
    name: "Temperature",
    layer: "MODIS_Terra_Land_Surface_Temp_Day",
    color: new THREE.Color(0xff6600),
    description: "Land surface temperature",
  },
  wind: {
    name: "Wind Speed",
    layer: "MERRA2_Wind_Speed_50m",
    color: new THREE.Color(0x00ff88),
    description: "Wind speed at 50m",
  },
};

// Create weather overlay geometry (sphere slightly above surface)
const weatherGeometry = new THREE.SphereGeometry(EARTH_RADIUS + WEATHER_ALTITUDE, 64, 64);

// Weather overlay shader - procedural clouds/weather patterns
const weatherMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    uniform float uTime;
    uniform vec3 uColor;
    uniform int uLayerType; // 0=clouds, 1=precipitation, 2=temperature, 3=wind
    uniform vec3 uSunDirection;

    varying vec2 vUv;
    varying vec3 vNormal;

    // Simplex noise for procedural weather patterns
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    float fbm(vec3 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
        value += amplitude * snoise(p);
        p *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      // Convert UV to 3D position for seamless noise
      float theta = vUv.x * 6.28318;
      float phi = vUv.y * 3.14159;
      vec3 pos = vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));

      float pattern = 0.0;
      vec3 color = uColor;

      if (uLayerType == 0) {
        // REALISTIC PRECIPITATION with organic blob shapes
        vec3 drift = vec3(uTime * 0.001, 0.0, uTime * 0.0008);

        float latitude = asin(pos.y) / 1.5708;
        float longitude = atan(pos.z, pos.x);

        // === DOMAIN WARPING for organic shapes ===
        // Warp the sampling position to create irregular boundaries
        vec3 warpPos1 = pos * 2.0 + drift * 0.5;
        float warpX = snoise(warpPos1) * 0.15;
        float warpY = snoise(warpPos1 + vec3(43.0, 17.0, 91.0)) * 0.15;
        float warpZ = snoise(warpPos1 + vec3(71.0, 23.0, 37.0)) * 0.15;
        vec3 warpedPos = pos + vec3(warpX, warpY, warpZ);

        // Second level of warping for more complexity
        vec3 warpPos2 = warpedPos * 4.0 + drift;
        float warp2X = snoise(warpPos2) * 0.06;
        float warp2Y = snoise(warpPos2 + vec3(31.0, 67.0, 13.0)) * 0.06;
        float warp2Z = snoise(warpPos2 + vec3(89.0, 41.0, 59.0)) * 0.06;
        warpedPos = warpedPos + vec3(warp2X, warp2Y, warp2Z);

        // === CLIMATE ZONES ===
        float itcz = exp(-pow(latitude * 10.0, 2.0));
        float midLat = exp(-pow((abs(latitude) - 0.45) * 5.0, 2.0));
        float subtropicalDry = exp(-pow((abs(latitude) - 0.25) * 5.0, 2.0));
        float polarDry = smoothstep(0.7, 0.9, abs(latitude));

        float climateMask = itcz * 1.0 + midLat * 0.85;
        climateMask = climateMask * (1.0 - subtropicalDry * 0.4) * (1.0 - polarDry * 0.5);
        climateMask = clamp(climateMask, 0.08, 1.0);

        // === MULTI-OCTAVE NOISE for natural variation ===
        // Large weather systems
        float n1 = snoise(warpedPos * 1.5 + drift) * 0.5;
        float n2 = snoise(warpedPos * 3.0 + drift * 1.3) * 0.3;
        float n3 = snoise(warpedPos * 6.0 + drift * 1.6) * 0.15;
        float n4 = snoise(warpedPos * 12.0 + drift * 2.0) * 0.05;

        float combinedNoise = n1 + n2 + n3 + n4; // Range roughly -1 to 1

        // Elongated frontal systems (stretch in one direction)
        vec3 stretchedPos = vec3(warpedPos.x * 0.7, warpedPos.y * 1.8, warpedPos.z * 0.7);
        float frontalNoise = snoise(stretchedPos * 2.0 + drift * 0.8) * 0.4;

        // Combine and apply climate mask
        float rawPrecip = (combinedNoise + frontalNoise + 0.3) * climateMask;

        // Soft threshold with gradual falloff
        pattern = smoothstep(0.1, 0.55, rawPrecip);

        // Light compression - keep gradient range
        pattern = pow(pattern, 1.4);

        // === INTENSITY VARIATION within storms ===
        // Core intensity based on fine detail noise
        vec3 corePos = warpedPos * 8.0 + drift * 2.0;
        float coreDetail = snoise(corePos) * 0.5 + 0.5;

        // Boost centers where base pattern is already strong
        float centerBoost = coreDetail * pattern * pattern * 0.5;
        pattern = pattern + centerBoost;

        // Rare intense cores (very localized)
        float intenseCore = snoise(warpedPos * 15.0 + drift * 3.0);
        intenseCore = smoothstep(0.6, 0.9, intenseCore) * step(0.3, pattern);
        pattern = pattern + intenseCore * 0.25;

        pattern = clamp(pattern, 0.0, 1.0);

        // === COLOR SCALE with smooth gradients ===
        if (pattern < 0.2) {
          // Blue to teal (light rain)
          color = mix(vec3(0.1, 0.35, 0.55), vec3(0.0, 0.6, 0.65), pattern / 0.2);
        } else if (pattern < 0.4) {
          // Teal to green
          color = mix(vec3(0.0, 0.6, 0.65), vec3(0.2, 0.7, 0.15), (pattern - 0.2) / 0.2);
        } else if (pattern < 0.6) {
          // Green to yellow
          color = mix(vec3(0.2, 0.7, 0.15), vec3(0.9, 0.85, 0.1), (pattern - 0.4) / 0.2);
        } else if (pattern < 0.8) {
          // Yellow to orange
          color = mix(vec3(0.9, 0.85, 0.1), vec3(1.0, 0.45, 0.0), (pattern - 0.6) / 0.2);
        } else {
          // Orange to red (intense)
          color = mix(vec3(1.0, 0.45, 0.0), vec3(0.8, 0.1, 0.1), (pattern - 0.8) / 0.2);
        }
      }
      else if (uLayerType == 1) {
        // TEMPERATURE MAP - organic swirling patterns
        float latitude = asin(pos.y) / 1.5708; // -1 to 1
        float absLat = abs(latitude);

        // === DOMAIN WARPING for organic shapes ===
        vec3 warpPos = pos * 2.0;
        float warpX = snoise(warpPos + vec3(0.0, 50.0, 0.0)) * 0.15;
        float warpY = snoise(warpPos + vec3(50.0, 0.0, 0.0)) * 0.15;
        float warpZ = snoise(warpPos + vec3(0.0, 0.0, 50.0)) * 0.15;
        vec3 warpedPos = pos + vec3(warpX, warpY, warpZ);

        // Second level warp for more complexity
        vec3 warp2Pos = warpedPos * 3.0;
        float warp2 = snoise(warp2Pos) * 0.08;
        warpedPos += vec3(warp2);

        // === BASE TEMPERATURE from warped latitude ===
        float warpedLat = asin(clamp(warpedPos.y / length(warpedPos), -1.0, 1.0)) / 1.5708;
        float warpedAbsLat = abs(warpedLat);

        // Temperature: poles cold, equator warm
        float baseTemp = 1.0 - pow(warpedAbsLat, 1.5);

        // === SWIRLING COLD PATTERNS in polar regions ===
        float polarSwirl = snoise(warpedPos * 4.0) * 0.5 + 0.5;
        float polarMask = smoothstep(0.5, 0.8, absLat);
        baseTemp -= polarSwirl * polarMask * 0.3;

        // === VARIATION ===
        float variation = snoise(warpedPos * 5.0) * 0.1;
        baseTemp += variation * (1.0 - absLat * 0.5);

        pattern = clamp(baseTemp, 0.0, 1.0);

        // === COLOR: Purple (coldest) -> Blue -> Cyan -> Green -> Yellow -> Orange ===
        if (pattern < 0.15) {
          // Coldest: white to purple/magenta
          color = mix(vec3(0.95, 0.95, 1.0), vec3(0.6, 0.2, 0.6), pattern / 0.15);
        } else if (pattern < 0.3) {
          // Very cold: purple to blue
          color = mix(vec3(0.6, 0.2, 0.6), vec3(0.3, 0.4, 0.8), (pattern - 0.15) / 0.15);
        } else if (pattern < 0.45) {
          // Cold: blue to cyan
          color = mix(vec3(0.3, 0.4, 0.8), vec3(0.3, 0.7, 0.75), (pattern - 0.3) / 0.15);
        } else if (pattern < 0.6) {
          // Cool: cyan to green
          color = mix(vec3(0.3, 0.7, 0.75), vec3(0.45, 0.7, 0.3), (pattern - 0.45) / 0.15);
        } else if (pattern < 0.75) {
          // Mild: green to yellow-green
          color = mix(vec3(0.45, 0.7, 0.3), vec3(0.75, 0.75, 0.25), (pattern - 0.6) / 0.15);
        } else if (pattern < 0.88) {
          // Warm: yellow to orange
          color = mix(vec3(0.75, 0.75, 0.25), vec3(0.9, 0.55, 0.2), (pattern - 0.75) / 0.13);
        } else {
          // Hot: orange to red-orange
          color = mix(vec3(0.9, 0.55, 0.2), vec3(0.85, 0.35, 0.15), (pattern - 0.88) / 0.12);
        }
      }
      else if (uLayerType == 2) {
        // WIND STREAMLINES - flowing curved lines
        float latitude = asin(pos.y) / 1.5708;
        float longitude = atan(pos.z, pos.x);

        // === WIND VECTOR FIELD ===
        // Create a smooth, flowing vector field using curl noise
        vec3 fieldPos = pos * 3.0;

        // Multi-scale flow field
        float fx1 = snoise(fieldPos * 0.5 + vec3(17.0, 0.0, 0.0));
        float fy1 = snoise(fieldPos * 0.5 + vec3(0.0, 31.0, 0.0));
        float fx2 = snoise(fieldPos * 1.5 + vec3(43.0, 0.0, 0.0)) * 0.4;
        float fy2 = snoise(fieldPos * 1.5 + vec3(0.0, 67.0, 0.0)) * 0.4;

        vec2 flowField = vec2(fx1 + fx2, fy1 + fy2);

        // === ADD GLOBAL WIND PATTERNS ===
        // Zonal flow (east-west based on latitude)
        float zonalFlow = 1.0; // Default westerlies
        if (abs(latitude) < 0.3) zonalFlow = -0.8; // Trade winds
        if (abs(latitude) > 0.65) zonalFlow = -0.5; // Polar easterlies

        flowField.x += zonalFlow * 0.6;

        // === WIND SPEED ===
        float jetMeander = snoise(vec3(longitude * 2.0, 0.0, uTime * 0.01)) * 0.12;
        float jetStream = exp(-pow((abs(latitude) - 0.4 + jetMeander) * 5.0, 2.0));
        float tradeWinds = smoothstep(0.08, 0.18, abs(latitude)) * (1.0 - smoothstep(0.25, 0.35, abs(latitude))) * 0.4;
        float windSpeed = max(jetStream, tradeWinds);
        windSpeed = max(windSpeed, 0.15); // Minimum visibility

        // === ADVECT POSITION ALONG FLOW ===
        // Trace back along the flow field to create streaks
        vec2 uv = vec2(longitude, latitude);
        float time = uTime * 0.5;

        // Advect UV coordinates backwards in time
        vec2 advectedUV = uv;
        for (int i = 0; i < 3; i++) {
          vec3 samplePos = vec3(cos(advectedUV.x) * cos(advectedUV.y * 1.57),
                                sin(advectedUV.y * 1.57),
                                sin(advectedUV.x) * cos(advectedUV.y * 1.57)) * 3.0;
          float sfx = snoise(samplePos * 0.5 + vec3(17.0, 0.0, 0.0));
          float sfy = snoise(samplePos * 0.5 + vec3(0.0, 31.0, 0.0));
          advectedUV -= vec2(sfx + zonalFlow * 0.6, sfy) * 0.02;
        }

        // === CREATE STREAK PATTERN ===
        // Noise-based line pattern that follows the flow
        float streakScale = 80.0;
        vec2 streakUV = advectedUV * streakScale + time * flowField * 2.0;

        // Create thin curved lines
        float lineNoise = snoise(vec3(streakUV.x * 0.3, streakUV.y * 2.0, 0.0));
        float lines = sin(streakUV.y + lineNoise * 3.0 + flowField.x * 5.0);
        lines = smoothstep(0.92, 0.98, abs(lines)); // Thin lines

        // Animated dashes along the lines
        float dashNoise = snoise(vec3(streakUV * 0.5, time * 0.3));
        float dashes = sin(streakUV.x * 2.0 + time * 3.0 + dashNoise * 2.0);
        dashes = smoothstep(0.3, 0.6, dashes);

        pattern = lines * dashes * (0.5 + windSpeed * 0.8);

        // === COLOR by wind speed ===
        vec3 slowColor = vec3(0.3, 0.5, 0.75);
        vec3 medColor = vec3(0.5, 0.75, 0.6);
        vec3 fastColor = vec3(0.9, 0.8, 0.35);
        vec3 jetColor = vec3(0.95, 0.4, 0.6);

        if (windSpeed < 0.3) {
          color = mix(slowColor, medColor, windSpeed / 0.3);
        } else if (windSpeed < 0.6) {
          color = mix(medColor, fastColor, (windSpeed - 0.3) / 0.3);
        } else {
          color = mix(fastColor, jetColor, clamp((windSpeed - 0.6) / 0.4, 0.0, 1.0));
        }

        pattern = clamp(pattern, 0.0, 1.0);
      }
      else if (uLayerType == 3) {
        // PRESSURE MAP - organic blobs, yellow base with blue lows and red highs
        float latitude = asin(pos.y) / 1.5708;
        float absLat = abs(latitude);

        // === DOMAIN WARPING for organic shapes ===
        vec3 warpPos = pos * 1.5;
        float warpX = snoise(warpPos + vec3(17.0, 0.0, 0.0)) * 0.2;
        float warpY = snoise(warpPos + vec3(0.0, 31.0, 0.0)) * 0.2;
        float warpZ = snoise(warpPos + vec3(0.0, 0.0, 43.0)) * 0.2;
        vec3 warpedPos = pos + vec3(warpX, warpY, warpZ);

        // === BASE PRESSURE FIELD ===
        // Multi-octave noise for pressure variation
        float p1 = snoise(warpedPos * 2.0) * 0.5;
        float p2 = snoise(warpedPos * 4.0) * 0.3;
        float p3 = snoise(warpedPos * 8.0) * 0.15;
        float pressureField = p1 + p2 + p3;

        // === LOW PRESSURE CENTERS (blue blobs) ===
        // Create distinct low pressure centers
        float lowNoise = snoise(warpedPos * 2.5 + vec3(100.0, 0.0, 0.0));
        float lowCenters = smoothstep(0.4, 0.7, lowNoise);

        // Lows more common in mid-latitudes and subpolar
        float lowZone = smoothstep(0.2, 0.5, absLat) * (1.0 - smoothstep(0.75, 0.9, absLat));
        lowCenters *= (0.5 + lowZone * 0.8);

        // === HIGH PRESSURE (orange/red) ===
        // High pressure in subtropics and polar regions
        float highNoise = snoise(warpedPos * 2.0 + vec3(0.0, 100.0, 0.0));
        float highCenters = smoothstep(0.35, 0.65, highNoise);

        // Highs strong in polar and subtropical zones
        float polarHigh = smoothstep(0.6, 0.85, absLat);
        float subtropicalHigh = exp(-pow((absLat - 0.3) * 4.0, 2.0));
        highCenters *= (polarHigh * 0.9 + subtropicalHigh * 0.6 + 0.2);

        // === COMBINE INTO PRESSURE VALUE ===
        // 0.0 = low pressure (blue), 0.5 = normal (yellow), 1.0 = high pressure (red)
        float pressure = 0.5 + pressureField * 0.2;
        pressure -= lowCenters * 0.4;
        pressure += highCenters * 0.35;
        pressure = clamp(pressure, 0.0, 1.0);

        pattern = 1.0; // Full opacity for pressure map

        // === COLOR: Blue (low) -> Green -> Yellow (normal) -> Orange -> Red (high) ===
        if (pressure < 0.25) {
          // Low pressure: deep blue
          color = mix(vec3(0.1, 0.2, 0.6), vec3(0.2, 0.4, 0.8), pressure / 0.25);
        } else if (pressure < 0.4) {
          // Low-normal: blue to cyan/green
          color = mix(vec3(0.2, 0.4, 0.8), vec3(0.3, 0.7, 0.5), (pressure - 0.25) / 0.15);
        } else if (pressure < 0.6) {
          // Normal: green to yellow
          color = mix(vec3(0.3, 0.7, 0.5), vec3(0.85, 0.85, 0.3), (pressure - 0.4) / 0.2);
        } else if (pressure < 0.75) {
          // High-normal: yellow to orange
          color = mix(vec3(0.85, 0.85, 0.3), vec3(0.9, 0.55, 0.2), (pressure - 0.6) / 0.15);
        } else {
          // High pressure: orange to red
          color = mix(vec3(0.9, 0.55, 0.2), vec3(0.8, 0.25, 0.15), (pressure - 0.75) / 0.25);
        }
      }

      // Subtle day/night shading
      float daylight = dot(vNormal, uSunDirection) * 0.15 + 0.85;
      color *= daylight;

      float alpha = pattern * uOpacity;
      gl_FragColor = vec4(color, alpha);
    }
  `,
  uniforms: {
    uOpacity: { value: weatherParams.opacity },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xffffff) },
    uLayerType: { value: 0 },
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
  },
  transparent: true,
  side: THREE.FrontSide,
  depthTest: true,
  depthWrite: false,
});

const weatherMesh = new THREE.Mesh(weatherGeometry, weatherMaterial);
weatherMesh.renderOrder = 1.2; // Below clouds but above surface
weatherMesh.visible = weatherParams.enabled;
earth.add(weatherMesh);

/**
 * Update weather layer type
 */
function setWeatherLayer(layerName) {
  const layerTypes = { precipitation: 0, temperature: 1, wind: 2, pressure: 3 };
  weatherMaterial.uniforms.uLayerType.value = layerTypes[layerName] || 0;
  weatherParams.layer = layerName;
}

/**
 * =============================================================================
 * LAT/LON GRID LINES
 * =============================================================================
 * Subtle grid lines showing latitude and longitude on the Earth surface.
 * Lines are added as children of the Earth mesh so they rotate with it.
 */

const GRID_ALTITUDE = 0.002; // Slightly above surface to prevent z-fighting
const GRID_SEGMENTS = 128; // Smoothness of curved lines

// Grid parameters (adjustable via GUI)
const gridParameters = {
  visible: true,
  opacity: 0.3,
  latInterval: 30, // Degrees between latitude lines
  lonInterval: 30, // Degrees between longitude lines
};

// Container for all grid elements (for easy visibility toggling)
const gridGroup = new THREE.Group();
gridGroup.name = "latLonGrid";
earth.add(gridGroup);

// Material for grid lines - subtle and semi-transparent
const gridLineMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: gridParameters.opacity,
  depthWrite: false,
});

/**
 * Create a latitude line (circle parallel to equator)
 * @param {number} lat - Latitude in degrees (-90 to 90)
 */
function createLatitudeLine(lat) {
  const points = [];
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
 * @param {number} lon - Longitude in degrees (-180 to 180)
 */
function createLongitudeLine(lon) {
  const points = [];
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
 * @param {string} text - Label text
 * @param {THREE.Vector3} position - Position on the globe
 */
function createTextLabel(text, position) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
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

/**
 * Build the complete grid with lines and labels
 */
function buildGrid() {
  // Clear existing grid
  while (gridGroup.children.length > 0) {
    const child = gridGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
    gridGroup.remove(child);
  }

  const latInterval = gridParameters.latInterval;
  const lonInterval = gridParameters.lonInterval;

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

// Note: buildGrid() is called after latLonToPosition is defined (below)

/**
 * =============================================================================
 * H3 HEXAGONAL GRID OVERLAY
 * =============================================================================
 * Uses Uber's H3 library for hierarchical hexagonal grid visualization.
 * Supports dynamic LOD based on camera distance and density heatmap coloring.
 */

const h3Params = {
  enabled: false,
  showDensity: true,
  opacity: 0.6,
  resolution: 1, // Default resolution
  updateInterval: 2.0, // Seconds between density recalculations
};

// Web Worker for background H3 calculations
const h3Worker = new Worker(new URL('./h3Worker.js', import.meta.url), { type: 'module' });
let h3WorkerBusy = false;
let h3PendingUpdate = false; // Flag if update was requested while worker busy

// Handle results from H3 worker
h3Worker.onmessage = function(e) {
  const { type, data } = e.data;
  if (type === 'densityResult') {
    h3WorkerBusy = false;
    applyH3DensityResult(data);

    // If another update was requested while we were busy, trigger it now
    if (h3PendingUpdate) {
      h3PendingUpdate = false;
      requestH3Update();
    }
  }
};

// Merged geometry mesh for H3 hexes (actual cell boundaries)
let h3Mesh = null;
let h3Geometry = null;
let h3LineMesh = null;
let h3LineGeometry = null;
let lastH3Resolution = -1;
let lastH3UpdateTime = 0;
let lastH3ViewCenter = { lat: 0, lon: 0 };
// H3_UPDATE_INTERVAL now controlled via h3Params.updateInterval
const H3_PAN_THRESHOLD = 5; // Degrees of movement to trigger rebuild at high res
const H3_MAX_CELLS = 8000;

// Pre-allocated buffers for H3 geometry (max cells * 6 triangles * 3 verts * 3 floats)
const H3_VERTS_PER_CELL = 18; // 6 triangles * 3 vertices
const h3PositionBuffer = new Float32Array(H3_MAX_CELLS * H3_VERTS_PER_CELL * 3);
const h3ColorBuffer = new Float32Array(H3_MAX_CELLS * H3_VERTS_PER_CELL * 3);
const h3LineBuffer = new Float32Array(H3_MAX_CELLS * 12 * 3); // 6 edges * 2 verts * 3 floats

// Shared material for H3
const h3Material = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const h3LineMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.25,
});

// H3 Cell Selection Highlight
let h3HighlightMesh = null;
let h3HighlightGeometry = null;
const h3HighlightMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 1.0,
  depthTest: false, // Always render on top to avoid z-fighting
});

// Color gradient for density (blue -> cyan -> green -> yellow -> red)
// Empty cells get a dim base color
const EMPTY_CELL_COLOR = new THREE.Color(0x2a3a5e); // Dark blue-gray (visible)

function getDensityColor(density, maxDensity) {
  if (density === 0) return EMPTY_CELL_COLOR;

  // Use logarithmic scale for better color distribution
  // This gives good differentiation across a wide range of densities
  // 1-2: blue, 3-10: cyan, 11-50: green, 51-200: yellow, 200+: red
  const logDensity = Math.log10(density + 1); // +1 to handle density=1
  const t = Math.min(logDensity / 2.5, 1); // log10(300) ≈ 2.5, so 300+ is max

  if (t < 0.25) {
    return new THREE.Color(0x1e40af).lerp(new THREE.Color(0x06b6d4), t * 4);
  } else if (t < 0.5) {
    return new THREE.Color(0x06b6d4).lerp(new THREE.Color(0x22c55e), (t - 0.25) * 4);
  } else if (t < 0.75) {
    return new THREE.Color(0x22c55e).lerp(new THREE.Color(0xeab308), (t - 0.5) * 4);
  } else {
    return new THREE.Color(0xeab308).lerp(new THREE.Color(0xef4444), (t - 0.75) * 4);
  }
}

/**
 * Cache for H3 cell 3D points (boundaries never change)
 */
const cellPointsCache = new Map();

/**
 * Convert H3 cell boundary to 3D points on sphere (cached)
 * Handles antimeridian-crossing cells by normalizing longitudes
 */
function cellTo3DPoints(cellIndex) {
  // Check cache first
  if (cellPointsCache.has(cellIndex)) {
    return cellPointsCache.get(cellIndex);
  }

  const boundary = h3.cellToBoundary(cellIndex);

  // Fix antimeridian crossing: normalize longitudes to be continuous
  // If any adjacent pair has a jump > 180°, the cell crosses the date line
  const lngs = boundary.map(([, lng]) => lng);
  let needsNormalization = false;
  for (let i = 0; i < lngs.length; i++) {
    const nextI = (i + 1) % lngs.length;
    if (Math.abs(lngs[nextI] - lngs[i]) > 180) {
      needsNormalization = true;
      break;
    }
  }

  // Normalize longitudes to be continuous (shift negative values to positive)
  const normalizedBoundary = needsNormalization
    ? boundary.map(([lat, lng]) => [lat, lng < 0 ? lng + 360 : lng])
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

  // Cache for future use (limit cache size to prevent memory bloat)
  if (cellPointsCache.size < 50000) {
    cellPointsCache.set(cellIndex, points);
  }

  return points;
}

/**
 * Update H3 cell selection highlight
 * Creates a thick white border around the selected cell
 */
function updateH3CellHighlight(cellIndex) {
  if (!cellIndex) {
    // Hide highlight if no cell selected
    if (h3HighlightMesh) {
      h3HighlightMesh.visible = false;
    }
    return;
  }

  try {
    const points = cellTo3DPoints(cellIndex);
    if (!points || points.length < 3) return;

    // Create multiple line layers at different altitudes for thickness effect
    const linePositions = [];
    const altitudeOffsets = [0.008, 0.010, 0.012]; // Multiple layers for visibility

    for (const altitudeOffset of altitudeOffsets) {
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i].clone().normalize().multiplyScalar(EARTH_RADIUS + altitudeOffset);
        const p2 = points[(i + 1) % points.length].clone().normalize().multiplyScalar(EARTH_RADIUS + altitudeOffset);
        linePositions.push(p1.x, p1.y, p1.z);
        linePositions.push(p2.x, p2.y, p2.z);
      }
    }

    // Update or create geometry
    if (!h3HighlightGeometry) {
      h3HighlightGeometry = new THREE.BufferGeometry();
    }
    h3HighlightGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );

    // Create or update mesh
    if (!h3HighlightMesh) {
      h3HighlightMesh = new THREE.LineSegments(h3HighlightGeometry, h3HighlightMaterial);
      h3HighlightMesh.renderOrder = 10; // Render on top
      earth.add(h3HighlightMesh);
    }

    h3HighlightMesh.visible = true;
  } catch (e) {
    console.warn('Error updating H3 highlight:', e);
  }
}

/**
 * Get the center lat/lon of current camera view on Earth
 */
function getCameraViewCenter() {
  // Get camera position in world space (accounting for Earth rotation)
  const camWorldPos = camera.position.clone();

  // Direction from camera to Earth center
  const toEarth = new THREE.Vector3(0, 0, 0).sub(camWorldPos).normalize();

  // Intersect with Earth sphere to get view center
  const raycaster = new THREE.Raycaster(camWorldPos, toEarth);
  const intersects = raycaster.intersectObject(earth, false);

  if (intersects.length > 0) {
    // Convert intersection point to lat/lon
    const point = intersects[0].point;
    // Account for Earth's rotation by applying inverse matrix
    const localPoint = point.clone().applyMatrix4(earth.matrixWorld.clone().invert());

    const r = localPoint.length();
    const lat = 90 - Math.acos(localPoint.y / r) * (180 / Math.PI);
    const lon = Math.atan2(localPoint.z, -localPoint.x) * (180 / Math.PI) - 180;

    return { lat, lon };
  }

  return { lat: 0, lon: 0 };
}

/**
 * Check if a point is within visible range of camera center
 */
function isInVisibleRange(lat, lon, centerLat, centerLon, maxDist) {
  // Simple great-circle distance approximation
  const dLat = (lat - centerLat) * Math.PI / 180;
  const dLon = (lon - centerLon) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const dist = c * 180 / Math.PI; // Distance in degrees
  return dist < maxDist;
}

/**
 * Check if longitude is within range (handles date line wrapping)
 */
function isLonInRange(lon, minLon, maxLon) {
  if (minLon <= maxLon) {
    // Normal case: range doesn't cross date line
    return lon >= minLon && lon <= maxLon;
  } else {
    // Range crosses date line (e.g., minLon=170, maxLon=-170)
    return lon >= minLon || lon <= maxLon;
  }
}

// Note: H3 density calculation moved to h3Worker.js for background processing

/**
 * Build H3 geometry into pre-allocated buffers using actual cell boundaries
 * Returns vertex counts for draw ranges
 */
function buildH3Geometry(allCells, densityMap, maxDensity) {
  let posIdx = 0;
  let colorIdx = 0;
  let lineIdx = 0;
  const cellCount = Math.min(allCells.length, H3_MAX_CELLS);

  for (let c = 0; c < cellCount; c++) {
    const cellIndex = allCells[c];
    const density = densityMap.get(cellIndex) || 0;
    const points = cellTo3DPoints(cellIndex);
    const color = getDensityColor(density, maxDensity);

    // Calculate center for fan triangulation
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < points.length; i++) {
      cx += points[i].x;
      cy += points[i].y;
      cz += points[i].z;
    }
    cx /= points.length;
    cy /= points.length;
    cz /= points.length;

    // Normalize center to sphere surface (important for large cells at low resolution)
    const centerLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (centerLen > 0) {
      const targetRadius = points[0] ? Math.sqrt(points[0].x ** 2 + points[0].y ** 2 + points[0].z ** 2) : 1;
      cx = (cx / centerLen) * targetRadius;
      cy = (cy / centerLen) * targetRadius;
      cz = (cz / centerLen) * targetRadius;
    }

    // Create triangle fan from center to each edge
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      // Triangle: center, p1, p2
      h3PositionBuffer[posIdx++] = cx;
      h3PositionBuffer[posIdx++] = cy;
      h3PositionBuffer[posIdx++] = cz;
      h3PositionBuffer[posIdx++] = p1.x;
      h3PositionBuffer[posIdx++] = p1.y;
      h3PositionBuffer[posIdx++] = p1.z;
      h3PositionBuffer[posIdx++] = p2.x;
      h3PositionBuffer[posIdx++] = p2.y;
      h3PositionBuffer[posIdx++] = p2.z;

      // Same color for all 3 vertices
      h3ColorBuffer[colorIdx++] = color.r;
      h3ColorBuffer[colorIdx++] = color.g;
      h3ColorBuffer[colorIdx++] = color.b;
      h3ColorBuffer[colorIdx++] = color.r;
      h3ColorBuffer[colorIdx++] = color.g;
      h3ColorBuffer[colorIdx++] = color.b;
      h3ColorBuffer[colorIdx++] = color.r;
      h3ColorBuffer[colorIdx++] = color.g;
      h3ColorBuffer[colorIdx++] = color.b;

      // Line segment for border
      h3LineBuffer[lineIdx++] = p1.x;
      h3LineBuffer[lineIdx++] = p1.y;
      h3LineBuffer[lineIdx++] = p1.z;
      h3LineBuffer[lineIdx++] = p2.x;
      h3LineBuffer[lineIdx++] = p2.y;
      h3LineBuffer[lineIdx++] = p2.z;
    }
  }

  return { vertexCount: posIdx / 3, lineVertexCount: lineIdx / 3 };
}

// Chunked geometry building state
let h3BuildState = null;
const H3_CELLS_PER_CHUNK = 200; // Process 200 cells per frame to maintain 60fps

/**
 * Start chunked H3 geometry building (non-blocking)
 */
function startChunkedH3Build(allCells, densityMap, maxDensity) {
  h3BuildState = {
    allCells,
    densityMap,
    maxDensity,
    cellIndex: 0,
    posIdx: 0,
    colorIdx: 0,
    lineIdx: 0,
    cellCount: Math.min(allCells.length, H3_MAX_CELLS)
  };
}

/**
 * Process a chunk of H3 cells (called each frame)
 * Returns true when complete
 */
function processH3BuildChunk() {
  if (!h3BuildState) return true;

  const { allCells, densityMap, maxDensity, cellCount } = h3BuildState;
  let { cellIndex, posIdx, colorIdx, lineIdx } = h3BuildState;

  const endIndex = Math.min(cellIndex + H3_CELLS_PER_CHUNK, cellCount);

  for (let c = cellIndex; c < endIndex; c++) {
    const cell = allCells[c];
    const density = densityMap.get(cell) || 0;
    const points = cellTo3DPoints(cell);
    const color = getDensityColor(density, maxDensity);

    // Calculate center for fan triangulation
    let cx = 0, cy = 0, cz = 0;
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
      const targetRadius = points[0] ? Math.sqrt(points[0].x ** 2 + points[0].y ** 2 + points[0].z ** 2) : 1;
      cx = (cx / centerLen) * targetRadius;
      cy = (cy / centerLen) * targetRadius;
      cz = (cz / centerLen) * targetRadius;
    }

    // Create triangle fan from center to each edge
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
  h3BuildState.cellIndex = endIndex;
  h3BuildState.posIdx = posIdx;
  h3BuildState.colorIdx = colorIdx;
  h3BuildState.lineIdx = lineIdx;

  // Check if complete
  if (endIndex >= cellCount) {
    // Finalize geometry - only update GPU buffers once when complete
    if (!h3Geometry) {
      h3Geometry = new THREE.BufferGeometry();
      h3Geometry.setAttribute('position', new THREE.BufferAttribute(h3PositionBuffer, 3));
      h3Geometry.setAttribute('color', new THREE.BufferAttribute(h3ColorBuffer, 3));
    }
    h3Geometry.setDrawRange(0, posIdx / 3);
    h3Geometry.attributes.position.needsUpdate = true;
    h3Geometry.attributes.color.needsUpdate = true;

    if (!h3LineGeometry) {
      h3LineGeometry = new THREE.BufferGeometry();
      h3LineGeometry.setAttribute('position', new THREE.BufferAttribute(h3LineBuffer, 3));
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

    h3BuildState = null;
    return true;
  }

  // Don't update geometry during build - wait until complete to avoid flicker
  return false;
}

// State for pending H3 worker update
let pendingH3Cells = null;
let pendingH3CameraDistance = 0;

/**
 * Request H3 density calculation from worker (non-blocking)
 */
function requestH3Update() {
  if (h3WorkerBusy) {
    h3PendingUpdate = true;
    return;
  }

  const resolution = h3Params.resolution;
  const center = getCameraViewCenter();
  const visibleRadius = Math.min(90, pendingH3CameraDistance * 12);

  // Extract unit positions as flat arrays for efficient transfer
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

  h3WorkerBusy = true;
  h3Worker.postMessage({
    type: 'calculateDensity',
    data: {
      resolution,
      ships,
      aircraft,
      satellites,
      showShips: unitCountParams.showShips,
      showAircraft: unitCountParams.showAircraft,
      showSatellites: unitCountParams.showSatellites,
      viewCenter: center,
      visibleRadius
    }
  }, [ships.buffer, aircraft.buffer, satellites.buffer]); // Transfer buffers for performance
}

/**
 * Apply density results from worker and start chunked geometry build
 */
function applyH3DensityResult(data) {
  const { densityEntries, cellCountEntries, allCells } = data;

  // Rebuild Maps from arrays
  const densityMap = new Map(densityEntries);
  currentH3CellCounts = new Map(cellCountEntries);

  // Use cells from worker
  pendingH3Cells = allCells;
  if (!allCells || allCells.length === 0) {
    if (h3Mesh) h3Mesh.visible = false;
    if (h3LineMesh) h3LineMesh.visible = false;
    return;
  }

  const maxDensity = densityMap.size > 0 ? Math.max(...Array.from(densityMap.values()), 1) : 1;

  // Start chunked geometry building (processed in tick loop)
  startChunkedH3Build(allCells, densityMap, maxDensity);
}

/**
 * Update H3 grid visualization using actual cell boundaries
 */
function updateH3Grid(cameraDistance, elapsedTime) {
  if (!h3Params.enabled) {
    if (h3Mesh) h3Mesh.visible = false;
    if (h3LineMesh) h3LineMesh.visible = false;
    if (h3HighlightMesh) h3HighlightMesh.visible = false;
    return;
  }

  // Use manual resolution from GUI
  const resolution = h3Params.resolution;
  const center = getCameraViewCenter();

  // Check if camera has panned significantly (for high res, rebuild on pan)
  const panDistance = Math.sqrt(
    Math.pow(center.lat - lastH3ViewCenter.lat, 2) +
    Math.pow(center.lon - lastH3ViewCenter.lon, 2)
  );
  const panTriggersRebuild = resolution >= 3 && panDistance > H3_PAN_THRESHOLD;

  // Check if any units are visible (only need time-based updates when tracking units)
  const hasVisibleUnits = unitCountParams.showShips || unitCountParams.showAircraft || unitCountParams.showSatellites;

  // Rebuild if resolution changed, enough time passed (only with units), or camera panned (high res)
  const timeSinceUpdate = elapsedTime - lastH3UpdateTime;
  const resChanged = resolution !== lastH3Resolution;
  const timeTriggered = hasVisibleUnits && timeSinceUpdate > h3Params.updateInterval;
  const needsUpdate = resChanged || timeTriggered || panTriggersRebuild;

  if (!needsUpdate) {
    if (h3Mesh) h3Mesh.visible = true;
    if (h3LineMesh) h3LineMesh.visible = true;
    return;
  }

  // Clear boundary cache when resolution changes (different cells, fresh computation)
  if (resChanged) {
    cellPointsCache.clear();
  }

  lastH3Resolution = resolution;
  lastH3UpdateTime = elapsedTime;
  lastH3ViewCenter = { lat: center.lat, lon: center.lon };
  currentH3Resolution = resolution; // Track for popup clicks
  pendingH3CameraDistance = cameraDistance;

  // Request H3 update from worker (all expensive work happens in worker)
  requestH3Update();
}

// =============================================================================
// H3 CELL POPUP
// =============================================================================

const h3Popup = document.getElementById('h3-popup');
const h3PopupClose = document.querySelector('.h3-popup-close');

// Store current density data for click lookups (cached from grid build)
let currentH3CellCounts = new Map(); // cellIndex -> {ships, aircraft, satellites, total}
let currentH3Resolution = 1;
let currentH3SelectedCell = null; // Track selected cell for live updates

/**
 * Get H3 cell at screen coordinates
 */
function getH3CellAtClick(clientX, clientY) {
  if (!h3Params.enabled) return null;

  // Convert to normalized device coordinates
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );

  // Raycast to Earth
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(earth, false);

  if (intersects.length === 0) return null;

  // Convert intersection point to lat/lon (accounting for Earth rotation)
  const point = intersects[0].point;
  const localPoint = point.clone().applyMatrix4(earth.matrixWorld.clone().invert());

  const r = localPoint.length();
  const lat = 90 - Math.acos(localPoint.y / r) * (180 / Math.PI);
  const lon = Math.atan2(localPoint.z, -localPoint.x) * (180 / Math.PI) - 180;

  // Get H3 cell at this position
  try {
    const cellIndex = h3.latLngToCell(lat, lon, currentH3Resolution);
    return { cellIndex, lat, lon };
  } catch (e) {
    return null;
  }
}

/**
 * Count units in a specific H3 cell (uses cached data from grid build)
 */
function countUnitsInCell(cellIndex) {
  // Use cached counts from calculateH3Density - O(1) lookup instead of O(n) iteration
  const cached = currentH3CellCounts.get(cellIndex);
  if (cached) {
    return { ...cached }; // Return copy to avoid mutation
  }
  return { ships: 0, aircraft: 0, satellites: 0, total: 0 };
}

/**
 * Update just the counts in the popup (for live updates)
 */
function updateH3PopupCounts(cellIndex) {
  const counts = countUnitsInCell(cellIndex);
  document.getElementById('h3-total-units').textContent = counts.total.toLocaleString();
  document.getElementById('h3-ship-count').textContent = counts.ships.toLocaleString();
  document.getElementById('h3-aircraft-count').textContent = counts.aircraft.toLocaleString();
  document.getElementById('h3-satellite-count').textContent = counts.satellites.toLocaleString();
}

/**
 * Show H3 cell popup at bottom right (next to unit info card)
 */
function showH3Popup(cellIndex, lat, lon, clientX, clientY) {
  currentH3SelectedCell = cellIndex; // Track for live updates
  lastPopupTotal = -1; // Reset so periodic update triggers
  updateH3PopupCounts(cellIndex);

  // Update static content
  const cellCenter = h3.cellToLatLng(cellIndex);
  const shortId = cellIndex.slice(2, 7).toUpperCase();
  document.getElementById('h3-popup-title').textContent = `CELL ${shortId}`;
  document.getElementById('h3-cell-center').textContent =
    `${cellCenter[0].toFixed(2)}°, ${cellCenter[1].toFixed(2)}°`;

  // Update the highlight on the globe
  updateH3CellHighlight(cellIndex);

  // Fixed position at bottom right (CSS handles positioning)
  h3Popup.classList.remove('hidden');
}

/**
 * Hide H3 cell popup
 */
function hideH3Popup() {
  h3Popup.classList.add('hidden');
  currentH3SelectedCell = null;
  updateH3CellHighlight(null); // Hide the highlight
}

/**
 * Refresh popup counts if visible (call when unit visibility changes)
 */
function refreshH3PopupIfVisible() {
  if (currentH3SelectedCell && !h3Popup.classList.contains('hidden')) {
    updateH3PopupCounts(currentH3SelectedCell);
  }
}

// Track last popup count for change detection
let lastPopupTotal = -1;
let lastPopupUpdateTime = 0;
const POPUP_UPDATE_INTERVAL = 0.5; // Check every 0.5 seconds

/**
 * Lightweight periodic check for selected cell (called from tick loop)
 */
function updateH3PopupPeriodic(elapsedTime) {
  if (!currentH3SelectedCell || h3Popup.classList.contains('hidden')) return;

  // Only check periodically to avoid performance hit
  if (elapsedTime - lastPopupUpdateTime < POPUP_UPDATE_INTERVAL) return;
  lastPopupUpdateTime = elapsedTime;

  // Count units in selected cell and update if changed
  const counts = countUnitsInCell(currentH3SelectedCell);
  if (counts.total !== lastPopupTotal) {
    lastPopupTotal = counts.total;
    document.getElementById('h3-total-units').textContent = counts.total.toLocaleString();
    document.getElementById('h3-ship-count').textContent = counts.ships.toLocaleString();
    document.getElementById('h3-aircraft-count').textContent = counts.aircraft.toLocaleString();
    document.getElementById('h3-satellite-count').textContent = counts.satellites.toLocaleString();
  }
}

// Close button handler
h3PopupClose?.addEventListener('click', hideH3Popup);

// Click handler for H3 cells
canvas.addEventListener('click', (event) => {
  // Only handle H3 clicks when H3 grid is enabled
  if (!h3Params.enabled) {
    hideH3Popup();
    return;
  }

  const cellData = getH3CellAtClick(event.clientX, event.clientY);
  if (cellData) {
    showH3Popup(cellData.cellIndex, cellData.lat, cellData.lon, event.clientX, event.clientY);
  } else {
    hideH3Popup();
  }
});

// Hide popup when H3 grid is disabled
// (This is handled in the existing onChange handler, but we also track resolution)

/**
 * =============================================================================
 * TRACKING SYMBOLS (AIS Ships & Aircraft)
 * =============================================================================
 * Uses InstancedMesh for efficient rendering of hundreds of tracking symbols.
 * Each symbol type (ship/aircraft) has its own InstancedMesh.
 */

// Constants
const MAX_SHIPS = 250000; // Maximum number of ship instances
const MAX_AIRCRAFT = 250000; // Maximum number of aircraft instances
const SHIP_ALTITUDE = 0.005; // Height above Earth surface for ships
const AIRCRAFT_ALTITUDE = 0.02; // Height above Earth surface for aircraft

// Satellite altitude ranges (scaled to Earth radius of 2)
const SATELLITE_ALTITUDE_LEO = { min: 0.06, max: 0.12 };  // Low Earth Orbit
const SATELLITE_ALTITUDE_MEO = { min: 0.15, max: 0.25 };  // Medium Earth Orbit
const SATELLITE_ALTITUDE_GEO = { min: 0.35, max: 0.40 };  // Geostationary
const MAX_SATELLITES = 5000;

// Note: Matrix pooling removed - GPU now handles orientation calculations

/**
 * Convert latitude/longitude to 3D position on Earth surface
 * @param {number} lat - Latitude in degrees (-90 to 90)
 * @param {number} lon - Longitude in degrees (-180 to 180)
 * @param {number} altitude - Height above surface (0 = on surface)
 * @returns {THREE.Vector3} Position in 3D space
 */
function latLonToPosition(lat, lon, altitude = 0) {
  const phi = (90 - lat) * (Math.PI / 180); // Convert to radians, offset from pole
  const theta = (lon + 180) * (Math.PI / 180); // Convert to radians, offset for texture alignment

  const radius = EARTH_RADIUS + altitude;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Note: createInstanceMatrix removed - GPU vertex shader now handles orientation

// -----------------------------------------------------------------------------
// GPU-Based Instanced Tracking Icons
// -----------------------------------------------------------------------------
// Uses InstancedBufferGeometry with custom attributes for lat/lon/heading.
// The vertex shader computes position and orientation on the GPU.

/**
 * Create an instanced buffer geometry with tracking attributes
 * @param {THREE.BufferGeometry} baseGeometry - The icon shape geometry
 * @param {number} maxInstances - Maximum number of instances
 * @returns {THREE.InstancedBufferGeometry} Geometry with instanced attributes
 */
function createTrackingGeometry(baseGeometry, maxInstances) {
  const instancedGeometry = new THREE.InstancedBufferGeometry();
  instancedGeometry.index = baseGeometry.index;
  instancedGeometry.attributes.position = baseGeometry.attributes.position;

  // Copy normal attribute if present (needed for extruded geometry lighting)
  if (baseGeometry.attributes.normal) {
    instancedGeometry.attributes.normal = baseGeometry.attributes.normal;
  }

  // Create instanced attribute buffers
  const latArray = new Float32Array(maxInstances);
  const lonArray = new Float32Array(maxInstances);
  const headingArray = new Float32Array(maxInstances);
  const scaleArray = new Float32Array(maxInstances);

  // Initialize with default values
  scaleArray.fill(1.0);

  // Create instanced buffer attributes
  const latAttr = new THREE.InstancedBufferAttribute(latArray, 1);
  const lonAttr = new THREE.InstancedBufferAttribute(lonArray, 1);
  const headingAttr = new THREE.InstancedBufferAttribute(headingArray, 1);
  const scaleAttr = new THREE.InstancedBufferAttribute(scaleArray, 1);

  // Mark as dynamic for frequent updates
  latAttr.setUsage(THREE.DynamicDrawUsage);
  lonAttr.setUsage(THREE.DynamicDrawUsage);
  headingAttr.setUsage(THREE.DynamicDrawUsage);
  scaleAttr.setUsage(THREE.DynamicDrawUsage);

  instancedGeometry.setAttribute('aLat', latAttr);
  instancedGeometry.setAttribute('aLon', lonAttr);
  instancedGeometry.setAttribute('aHeading', headingAttr);
  instancedGeometry.setAttribute('aScale', scaleAttr);

  // Store references for easy access
  instancedGeometry.userData = {
    latArray,
    lonArray,
    headingArray,
    scaleArray,
    latAttr,
    lonAttr,
    headingAttr,
    scaleAttr,
  };

  return instancedGeometry;
}

// -----------------------------------------------------------------------------
// Ship Symbol Geometry (arrow/chevron shape pointing forward)
// -----------------------------------------------------------------------------
const shipShape = new THREE.Shape();
shipShape.moveTo(0, 0.02); // Bow (front)
shipShape.lineTo(0.012, -0.015); // Starboard stern
shipShape.lineTo(0, -0.005); // Center stern notch
shipShape.lineTo(-0.012, -0.015); // Port stern
shipShape.closePath();

const shipBaseGeometry = new THREE.ShapeGeometry(shipShape);
// Rotate geometry so it lies flat on the surface (face points +Y, away from Earth)
shipBaseGeometry.rotateX(-Math.PI / 2);
// Compute normals for lighting
shipBaseGeometry.computeVertexNormals();

// Create instanced geometry with tracking attributes
const shipGeometry = createTrackingGeometry(shipBaseGeometry, MAX_SHIPS);

// Create glass material for ships (SpaceX teal - ocean/maritime)
const shipMaterial = new THREE.ShaderMaterial({
  vertexShader: glassVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uAltitude: { value: SHIP_ALTITUDE },
    uColor: { value: new THREE.Color(0x2dd4bf) }, // Modern teal
    uOpacity: { value: 0.9 },
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0x5eead4) }, // Lighter teal glow
    uIOR: { value: 1.5 },
    uThickness: { value: 1.0 },
    uReflectivity: { value: 0.3 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

// Create mesh for ships
const shipMesh = new THREE.Mesh(shipGeometry, shipMaterial);
shipMesh.frustumCulled = false;
shipMesh.renderOrder = 1; // Render ships first (below aircraft)
earth.add(shipMesh);

// -----------------------------------------------------------------------------
// Aircraft Symbol Geometry (airplane shape)
// -----------------------------------------------------------------------------
const aircraftShape = new THREE.Shape();
// Fuselage and nose
aircraftShape.moveTo(0, 0.025); // Nose
aircraftShape.lineTo(0.003, 0.01); // Right fuselage
aircraftShape.lineTo(0.02, 0.005); // Right wing tip
aircraftShape.lineTo(0.003, 0.0); // Right wing root
aircraftShape.lineTo(0.003, -0.01); // Right tail root
aircraftShape.lineTo(0.01, -0.02); // Right stabilizer
aircraftShape.lineTo(0.003, -0.015); // Right tail
aircraftShape.lineTo(0, -0.02); // Tail
aircraftShape.lineTo(-0.003, -0.015); // Left tail
aircraftShape.lineTo(-0.01, -0.02); // Left stabilizer
aircraftShape.lineTo(-0.003, -0.01); // Left tail root
aircraftShape.lineTo(-0.003, 0.0); // Left wing root
aircraftShape.lineTo(-0.02, 0.005); // Left wing tip
aircraftShape.lineTo(-0.003, 0.01); // Left fuselage
aircraftShape.closePath();

const aircraftBaseGeometry = new THREE.ShapeGeometry(aircraftShape);
// Rotate geometry so it lies flat on the surface (face points +Y, away from Earth)
aircraftBaseGeometry.rotateX(-Math.PI / 2);
// Compute normals for lighting
aircraftBaseGeometry.computeVertexNormals();

// Create instanced geometry with tracking attributes
const aircraftGeometry = createTrackingGeometry(aircraftBaseGeometry, MAX_AIRCRAFT);

// Create glass material for aircraft (SpaceX amber/orange - aviation)
const aircraftMaterial = new THREE.ShaderMaterial({
  vertexShader: glassVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uAltitude: { value: AIRCRAFT_ALTITUDE },
    uColor: { value: new THREE.Color(0xfbbf24) }, // Modern amber
    uOpacity: { value: 0.9 },
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0xfde68a) }, // Lighter amber glow
    uIOR: { value: 1.5 },
    uThickness: { value: 1.0 },
    uReflectivity: { value: 0.3 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

// Create mesh for aircraft
const aircraftMesh = new THREE.Mesh(aircraftGeometry, aircraftMaterial);
aircraftMesh.frustumCulled = false;
aircraftMesh.renderOrder = 2; // Render aircraft after ships (above ships)
earth.add(aircraftMesh);

// -----------------------------------------------------------------------------
// Satellite Symbol Geometry (diamond with solar panel wings)
// -----------------------------------------------------------------------------
const satelliteShape = new THREE.Shape();
// Main body - diamond shape
satelliteShape.moveTo(0, 0.012);      // Top
satelliteShape.lineTo(0.004, 0);       // Right
satelliteShape.lineTo(0, -0.012);      // Bottom
satelliteShape.lineTo(-0.004, 0);      // Left
satelliteShape.closePath();

// Add solar panel wings as separate geometry
const satelliteBodyGeom = new THREE.ShapeGeometry(satelliteShape);

// Solar panels - horizontal bars
const panelShape = new THREE.Shape();
panelShape.moveTo(-0.018, 0.003);
panelShape.lineTo(0.018, 0.003);
panelShape.lineTo(0.018, -0.003);
panelShape.lineTo(-0.018, -0.003);
panelShape.closePath();
const panelGeom = new THREE.ShapeGeometry(panelShape);

// Merge geometries
const satelliteBaseGeometry = new THREE.BufferGeometry();
const bodyPositions = satelliteBodyGeom.attributes.position.array;
const panelPositions = panelGeom.attributes.position.array;
const mergedPositions = new Float32Array(bodyPositions.length + panelPositions.length);
mergedPositions.set(bodyPositions, 0);
mergedPositions.set(panelPositions, bodyPositions.length);
satelliteBaseGeometry.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));

// Add normals (all pointing up in local space, i.e., +Z before rotation)
const normalCount = mergedPositions.length / 3;
const normals = new Float32Array(normalCount * 3);
for (let i = 0; i < normalCount; i++) {
  normals[i * 3] = 0;
  normals[i * 3 + 1] = 0;
  normals[i * 3 + 2] = 1; // Point up (will become +Y after rotation)
}
satelliteBaseGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

// Rotate to lie flat on surface
satelliteBaseGeometry.rotateX(-Math.PI / 2);

// Create instanced geometry with tracking attributes
const satelliteGeometry = createTrackingGeometry(satelliteBaseGeometry, MAX_SATELLITES);

// Create glass material for satellites (SpaceX violet/purple - space/tech)
const satelliteMaterial = new THREE.ShaderMaterial({
  vertexShader: satelliteVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uBaseAltitude: { value: 0.1 },
    uColor: { value: new THREE.Color(0xa78bfa) }, // Modern violet
    uOpacity: { value: 0.85 },
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0xc4b5fd) }, // Lighter violet glow
    uIOR: { value: 1.5 },
    uThickness: { value: 1.0 },
    uReflectivity: { value: 0.3 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

// Create mesh for satellites
const satelliteMesh = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
satelliteMesh.frustumCulled = false;
satelliteMesh.renderOrder = 3; // Render above aircraft (highest altitude)
earth.add(satelliteMesh);

// -----------------------------------------------------------------------------
// Selection Highlight Ring - Shows which unit is selected
// -----------------------------------------------------------------------------

const selectionRingGeometry = new THREE.RingGeometry(0.025, 0.032, 32);
selectionRingGeometry.rotateX(-Math.PI / 2); // Lay flat on surface

const selectionRingMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xffffff) },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      // Pulsing glow effect
      float pulse = 0.7 + 0.3 * sin(uTime * 4.0);
      // Radial gradient for soft edges
      float dist = length(vUv - 0.5) * 2.0;
      float alpha = pulse * smoothstep(1.0, 0.5, dist);
      gl_FragColor = vec4(uColor, alpha);
    }
  `,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const selectionRing = new THREE.Mesh(selectionRingGeometry, selectionRingMaterial);
selectionRing.visible = false;
selectionRing.renderOrder = 10; // Render on top
earth.add(selectionRing);

// -----------------------------------------------------------------------------
// SATELLITE ORBIT LINE
// -----------------------------------------------------------------------------
// Shows the full orbital path when a satellite is selected

const ORBIT_LINE_SEGMENTS = 128; // Points around the orbit

const orbitLineMaterial = new THREE.LineBasicMaterial({
  color: 0xaa88ff, // Violet to match satellite color
  transparent: true,
  opacity: 0.6,
  depthTest: true,
  depthWrite: false,
});

const orbitLineGeometry = new THREE.BufferGeometry();
const orbitLinePositions = new Float32Array(ORBIT_LINE_SEGMENTS * 3);
orbitLineGeometry.setAttribute('position', new THREE.BufferAttribute(orbitLinePositions, 3));

const orbitLine = new THREE.LineLoop(orbitLineGeometry, orbitLineMaterial);
orbitLine.visible = false;
orbitLine.renderOrder = 5;
earth.add(orbitLine);

/**
 * Compute orbital path points for a satellite
 * Uses the same orbital mechanics as updateSatelliteMotion
 */
function updateOrbitLine(sat) {
  if (!sat) {
    orbitLine.visible = false;
    return;
  }

  const positions = orbitLineGeometry.attributes.position.array;
  const inclinationRad = sat.inclination * (Math.PI / 180);
  const radius = EARTH_RADIUS + sat.altitude;

  for (let i = 0; i < ORBIT_LINE_SEGMENTS; i++) {
    const phase = (i / ORBIT_LINE_SEGMENTS) * 360;
    const phaseRad = phase * (Math.PI / 180);

    // Same calculations as updateSatelliteMotion
    const xOrbit = Math.cos(phaseRad);
    const yOrbit = Math.sin(phaseRad);

    // Compute lat/lon
    const lat = Math.asin(yOrbit * Math.sin(inclinationRad)) * (180 / Math.PI);
    const lonInOrbit = Math.atan2(yOrbit * Math.cos(inclinationRad), xOrbit) * (180 / Math.PI);
    const lon = sat.ascendingNode + lonInOrbit;

    // Convert to 3D position
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    positions[i * 3] = -radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }

  orbitLineGeometry.attributes.position.needsUpdate = true;
  orbitLine.visible = true;
}

/**
 * Update selection ring position to follow selected unit
 */
const _ringUp = new THREE.Vector3(0, 1, 0);
const _ringQuat = new THREE.Quaternion();

function updateSelectionRing() {
  if (!selectedUnit) {
    selectionRing.visible = false;
    return;
  }

  const { type, index } = selectedUnit;
  let lat, lon, altitude;

  if (type === "ship") {
    const unitData = shipSimState[index];
    if (!unitData) { selectionRing.visible = false; return; }
    lat = unitData.lat;
    lon = unitData.lon;
    altitude = SHIP_ALTITUDE;
  } else if (type === "aircraft") {
    const unitData = aircraftSimState[index];
    if (!unitData) { selectionRing.visible = false; return; }
    lat = unitData.lat;
    lon = unitData.lon;
    altitude = AIRCRAFT_ALTITUDE;
  } else if (type === "satellite") {
    const unitData = satelliteSimState[index];
    if (!unitData) { selectionRing.visible = false; return; }
    lat = unitData.lat;
    lon = unitData.lon;
    altitude = unitData.altitude;
  } else if (type === "airport") {
    const airport = AIRPORTS[index];
    if (!airport) { selectionRing.visible = false; return; }
    lat = airport[1];
    lon = airport[2];
    altitude = 0.002; // Same as airport markers
  } else {
    selectionRing.visible = false;
    return;
  }

  // Convert lat/lon to 3D position (same formula as shader)
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const radius = EARTH_RADIUS + altitude;

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  selectionRing.position.set(x, y, z);

  // Orient ring perpendicular to surface (face outward from Earth center)
  // Surface normal points from origin to position
  const surfaceNormal = selectionRing.position.clone().normalize();

  // Use quaternion to rotate from default up (0,1,0) to surface normal
  _ringQuat.setFromUnitVectors(_ringUp, surfaceNormal);
  selectionRing.quaternion.copy(_ringQuat);

  // Set color based on unit type
  const colors = {
    ship: 0x00ffff,     // Teal
    aircraft: 0xffa500, // Amber
    satellite: 0xaa88ff, // Violet
    airport: 0xffffff   // White for airports
  };
  selectionRingMaterial.uniforms.uColor.value.setHex(colors[type] || 0xffffff);

  selectionRing.visible = true;
}

// -----------------------------------------------------------------------------
// Unit Trails - Fading dot trails showing recent positions
// -----------------------------------------------------------------------------

const TRAIL_LENGTH = 6; // Number of trail points per unit
const MAX_TRAIL_POINTS = 60000; // Total trail points (limits memory usage)
const TRAIL_UPDATE_INTERVAL = 400; // ms between trail position captures
const MIN_TRAIL_DISTANCE = 0.15; // Minimum distance (degrees) before adding new trail point

// Trail parameters
const trailParams = {
  enabled: true,
  shipTrails: true,
  aircraftTrails: true,
  opacity: 0.7,
};

// Trail vertex shader - positions dots at lat/lon with altitude
const trailVertexShader = `
  attribute float aLat;
  attribute float aLon;
  attribute float aOpacity;
  attribute float aAltitude;

  uniform float uEarthRadius;
  uniform float uPointSize;

  varying float vOpacity;

  const float PI = 3.141592653589793;
  const float DEG_TO_RAD = PI / 180.0;

  void main() {
    vOpacity = aOpacity;

    // Convert lat/lon to 3D position
    float phi = (90.0 - aLat) * DEG_TO_RAD;
    float theta = (aLon + 180.0) * DEG_TO_RAD;
    float radius = uEarthRadius + aAltitude;

    vec3 worldPosition = vec3(
      -radius * sin(phi) * cos(theta),
      radius * cos(phi),
      radius * sin(phi) * sin(theta)
    );

    vec4 mvPosition = modelViewMatrix * vec4(worldPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Scale with distance - smaller when zoomed out, larger when zoomed in
    gl_PointSize = clamp(uPointSize * (6.0 / -mvPosition.z), 1.0, uPointSize);
  }
`;

// Trail fragment shader - renders circular dots
const trailFragmentShader = `
  uniform vec3 uColor;
  uniform float uBaseOpacity;

  varying float vOpacity;

  void main() {
    // Circular point
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    // Slight soft edge but mostly solid
    float alpha = smoothstep(0.5, 0.35, dist);
    alpha *= vOpacity * uBaseOpacity;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

// Create trail geometry
function createTrailGeometry(maxPoints) {
  const geometry = new THREE.BufferGeometry();

  const latArray = new Float32Array(maxPoints);
  const lonArray = new Float32Array(maxPoints);
  const opacityArray = new Float32Array(maxPoints);
  const altitudeArray = new Float32Array(maxPoints);

  const latAttr = new THREE.BufferAttribute(latArray, 1);
  const lonAttr = new THREE.BufferAttribute(lonArray, 1);
  const opacityAttr = new THREE.BufferAttribute(opacityArray, 1);
  const altitudeAttr = new THREE.BufferAttribute(altitudeArray, 1);

  latAttr.setUsage(THREE.DynamicDrawUsage);
  lonAttr.setUsage(THREE.DynamicDrawUsage);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  altitudeAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('aLat', latAttr);
  geometry.setAttribute('aLon', lonAttr);
  geometry.setAttribute('aOpacity', opacityAttr);
  geometry.setAttribute('aAltitude', altitudeAttr);

  geometry.userData = { latArray, lonArray, opacityArray, altitudeArray, latAttr, lonAttr, opacityAttr, altitudeAttr };

  return geometry;
}

// Ship trails
const shipTrailGeometry = createTrailGeometry(MAX_TRAIL_POINTS);
const shipTrailMaterial = new THREE.ShaderMaterial({
  vertexShader: trailVertexShader,
  fragmentShader: trailFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uPointSize: { value: 8.0 }, // Max size in pixels
    uColor: { value: new THREE.Color(0x2dd4bf) }, // Teal (matches ships)
    uBaseOpacity: { value: trailParams.opacity },
  },
  transparent: true,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

const shipTrailMesh = new THREE.Points(shipTrailGeometry, shipTrailMaterial);
shipTrailMesh.frustumCulled = false;
shipTrailMesh.renderOrder = 0.5; // Just above shadows
earth.add(shipTrailMesh);

// Aircraft trails
const aircraftTrailGeometry = createTrailGeometry(MAX_TRAIL_POINTS);
const aircraftTrailMaterial = new THREE.ShaderMaterial({
  vertexShader: trailVertexShader,
  fragmentShader: trailFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uPointSize: { value: 8.0 }, // Max size in pixels
    uColor: { value: new THREE.Color(0xfbbf24) }, // Amber (matches aircraft)
    uBaseOpacity: { value: trailParams.opacity },
  },
  transparent: true,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

const aircraftTrailMesh = new THREE.Points(aircraftTrailGeometry, aircraftTrailMaterial);
aircraftTrailMesh.frustumCulled = false;
aircraftTrailMesh.renderOrder = 1.8; // Just below aircraft
earth.add(aircraftTrailMesh);

// Trail history storage - ring buffers per unit
let shipTrailHistory = []; // Array of arrays, one per ship
let aircraftTrailHistory = []; // Array of arrays, one per aircraft
let lastTrailUpdateTime = 0;
let activeShipTrailCount = 0;
let activeAircraftTrailCount = 0;

/**
 * Initialize trail history for units
 */
function initTrailHistory() {
  // Calculate how many units can have trails based on MAX_TRAIL_POINTS
  const maxShipsWithTrails = Math.floor(MAX_TRAIL_POINTS / TRAIL_LENGTH / 2);
  const maxAircraftWithTrails = Math.floor(MAX_TRAIL_POINTS / TRAIL_LENGTH / 2);

  shipTrailHistory = [];
  aircraftTrailHistory = [];

  // Initialize ring buffers for ships (limited count)
  const shipCount = Math.min(shipSimState.length, maxShipsWithTrails);
  for (let i = 0; i < shipCount; i++) {
    shipTrailHistory.push({
      positions: [], // Array of {lat, lon} objects
      headIndex: 0,
    });
  }

  // Initialize ring buffers for aircraft (limited count)
  const aircraftCount = Math.min(aircraftSimState.length, maxAircraftWithTrails);
  for (let i = 0; i < aircraftCount; i++) {
    aircraftTrailHistory.push({
      positions: [],
      headIndex: 0,
    });
  }

  activeShipTrailCount = shipCount;
  activeAircraftTrailCount = aircraftCount;
}

/**
 * Calculate distance between two lat/lon points (simple approximation)
 */
function latLonDistance(lat1, lon1, lat2, lon2) {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Capture current positions into trail history
 * Only adds new point if unit has moved enough from last captured position
 */
function captureTrailPositions() {
  // Capture ship positions
  for (let i = 0; i < shipTrailHistory.length; i++) {
    const ship = shipSimState[i];
    const trail = shipTrailHistory[i];

    // Check if moved enough from last position
    let shouldAdd = true;
    if (trail.positions.length > 0) {
      const lastIdx = (trail.headIndex - 1 + trail.positions.length) % trail.positions.length;
      const last = trail.positions[lastIdx];
      if (latLonDistance(ship.lat, ship.lon, last.lat, last.lon) < MIN_TRAIL_DISTANCE) {
        shouldAdd = false;
      }
    }

    if (shouldAdd) {
      if (trail.positions.length < TRAIL_LENGTH) {
        trail.positions.push({ lat: ship.lat, lon: ship.lon });
      } else {
        trail.positions[trail.headIndex] = { lat: ship.lat, lon: ship.lon };
        trail.headIndex = (trail.headIndex + 1) % TRAIL_LENGTH;
      }
    }
  }

  // Capture aircraft positions
  for (let i = 0; i < aircraftTrailHistory.length; i++) {
    const aircraft = aircraftSimState[i];
    const trail = aircraftTrailHistory[i];

    // Check if moved enough from last position
    let shouldAdd = true;
    if (trail.positions.length > 0) {
      const lastIdx = (trail.headIndex - 1 + trail.positions.length) % trail.positions.length;
      const last = trail.positions[lastIdx];
      if (latLonDistance(aircraft.lat, aircraft.lon, last.lat, last.lon) < MIN_TRAIL_DISTANCE) {
        shouldAdd = false;
      }
    }

    if (shouldAdd) {
      if (trail.positions.length < TRAIL_LENGTH) {
        trail.positions.push({ lat: aircraft.lat, lon: aircraft.lon });
      } else {
        trail.positions[trail.headIndex] = { lat: aircraft.lat, lon: aircraft.lon };
        trail.headIndex = (trail.headIndex + 1) % TRAIL_LENGTH;
      }
    }
  }
}

/**
 * Update trail GPU buffers from history
 */
function updateTrailAttributes() {
  if (!trailParams.enabled) {
    shipTrailGeometry.setDrawRange(0, 0);
    aircraftTrailGeometry.setDrawRange(0, 0);
    return;
  }

  // Update ship trails
  if (trailParams.shipTrails) {
    const data = shipTrailGeometry.userData;
    let pointIndex = 0;

    for (let i = 0; i < shipTrailHistory.length; i++) {
      const trail = shipTrailHistory[i];
      const posCount = trail.positions.length;

      // Skip j=0 (newest) so trail starts behind the unit, not on it
      for (let j = 1; j < posCount; j++) {
        const ringIndex = (trail.headIndex - 1 - j + posCount) % posCount;
        const pos = trail.positions[ringIndex];
        // Age starts at 0 for first visible point, goes to 1 for oldest
        const age = (j - 1) / (TRAIL_LENGTH - 1);

        data.latArray[pointIndex] = pos.lat;
        data.lonArray[pointIndex] = pos.lon;
        data.opacityArray[pointIndex] = 1.0 - age * 0.6; // Bright to dim
        data.altitudeArray[pointIndex] = SHIP_ALTITUDE * 0.5; // Well below ships
        pointIndex++;
      }
    }

    data.latAttr.needsUpdate = true;
    data.lonAttr.needsUpdate = true;
    data.opacityAttr.needsUpdate = true;
    data.altitudeAttr.needsUpdate = true;
    shipTrailGeometry.setDrawRange(0, pointIndex);
  } else {
    shipTrailGeometry.setDrawRange(0, 0);
  }

  // Update aircraft trails
  if (trailParams.aircraftTrails) {
    const data = aircraftTrailGeometry.userData;
    let pointIndex = 0;

    for (let i = 0; i < aircraftTrailHistory.length; i++) {
      const trail = aircraftTrailHistory[i];
      const posCount = trail.positions.length;

      // Skip j=0 (newest) so trail starts behind the unit
      for (let j = 1; j < posCount; j++) {
        const ringIndex = (trail.headIndex - 1 - j + posCount) % posCount;
        const pos = trail.positions[ringIndex];
        const age = (j - 1) / (TRAIL_LENGTH - 1);

        data.latArray[pointIndex] = pos.lat;
        data.lonArray[pointIndex] = pos.lon;
        data.opacityArray[pointIndex] = 1.0 - age * 0.6; // Bright to dim
        data.altitudeArray[pointIndex] = AIRCRAFT_ALTITUDE * 0.5;
        pointIndex++;
      }
    }

    data.latAttr.needsUpdate = true;
    data.lonAttr.needsUpdate = true;
    data.opacityAttr.needsUpdate = true;
    data.altitudeAttr.needsUpdate = true;
    aircraftTrailGeometry.setDrawRange(0, pointIndex);
  } else {
    aircraftTrailGeometry.setDrawRange(0, 0);
  }
}

/**
 * Update trails (called from animation loop, throttled)
 */
function updateTrails() {
  if (!trailParams.enabled) return;

  const now = performance.now();
  if (now - lastTrailUpdateTime < TRAIL_UPDATE_INTERVAL) return;
  lastTrailUpdateTime = now;

  // Reinitialize if unit counts changed significantly
  if (shipTrailHistory.length === 0 && shipSimState.length > 0) {
    initTrailHistory();
  }

  captureTrailPositions();
  updateTrailAttributes();
}

// -----------------------------------------------------------------------------
// Tracking Data Management (GPU-based)
// -----------------------------------------------------------------------------

// Store current icon scale for dynamic rescaling based on camera distance
let currentIconScale = 1;

// User-adjustable icon scale multiplier (1 = default, max 3 = 3x larger)
const iconScaleParams = {
  multiplier: 1.0
};

/**
 * Update ship instances by writing directly to GPU attribute buffers
 * Much more efficient than uploading full matrices
 */
function updateShipAttributes() {
  const data = shipGeometry.userData;
  const count = Math.min(shipSimState.length, MAX_SHIPS);

  for (let i = 0; i < count; i++) {
    const ship = shipSimState[i];
    data.latArray[i] = ship.lat;
    data.lonArray[i] = ship.lon;
    data.headingArray[i] = ship.heading;
    data.scaleArray[i] = ship.scale * currentIconScale;
  }

  // Mark attributes as needing upload to GPU
  data.latAttr.needsUpdate = true;
  data.lonAttr.needsUpdate = true;
  data.headingAttr.needsUpdate = true;
  data.scaleAttr.needsUpdate = true;

  // Set instance count for rendering
  shipGeometry.instanceCount = count;
}

/**
 * Update aircraft instances by writing directly to GPU attribute buffers
 */
function updateAircraftAttributes() {
  const data = aircraftGeometry.userData;
  const count = Math.min(aircraftSimState.length, MAX_AIRCRAFT);

  for (let i = 0; i < count; i++) {
    const aircraft = aircraftSimState[i];
    data.latArray[i] = aircraft.lat;
    data.lonArray[i] = aircraft.lon;
    data.headingArray[i] = aircraft.heading;
    data.scaleArray[i] = aircraft.scale * currentIconScale;
  }

  // Mark attributes as needing upload to GPU
  data.latAttr.needsUpdate = true;
  data.lonAttr.needsUpdate = true;
  data.headingAttr.needsUpdate = true;
  data.scaleAttr.needsUpdate = true;

  // Set instance count for rendering
  aircraftGeometry.instanceCount = count;
}

/**
 * Update icon scale based on camera distance
 */
function updateIconScale(cameraDistance) {
  const baseDistance = 13;
  currentIconScale = (cameraDistance / baseDistance) * iconScaleParams.multiplier;
}

/**
 * Update satellite instances by writing directly to GPU attribute buffers
 */
function updateSatelliteAttributes() {
  const data = satelliteGeometry.userData;
  const count = Math.min(satelliteSimState.length, MAX_SATELLITES);

  for (let i = 0; i < count; i++) {
    const sat = satelliteSimState[i];
    data.latArray[i] = sat.lat;
    data.lonArray[i] = sat.lon;
    data.headingArray[i] = sat.heading;
    // Encode altitude and display scale in a single float:
    // Integer part: display scale * 10 (includes camera scaling)
    // Fractional part: altitude / 0.5 (normalized to 0-1 range)
    const scaledDisplay = sat.scale * currentIconScale;
    const normalizedAlt = sat.altitude / 0.5; // altitude 0-0.5 -> 0-1
    data.scaleArray[i] = Math.floor(scaledDisplay * 10) + Math.min(0.99, normalizedAlt);
  }

  data.latAttr.needsUpdate = true;
  data.lonAttr.needsUpdate = true;
  data.headingAttr.needsUpdate = true;
  data.scaleAttr.needsUpdate = true;

  satelliteGeometry.instanceCount = count;
}

// -----------------------------------------------------------------------------
// Motion Simulation System
// -----------------------------------------------------------------------------

// Motion parameters - simplified with single speed slider per type
const motionParams = {
  // Speed multipliers (1 = normal, higher = faster)
  shipSpeed: 10.0,
  aircraftSpeed: 10.0,
  satelliteSpeed: 10.0,

  // Base values (internal, not exposed to GUI)
  shipBaseSpeed: 0.002,      // degrees per second at multiplier 1
  shipBaseTurnRate: 15,      // degrees per second at multiplier 1
  aircraftBaseSpeed: 0.02,   // degrees per second at multiplier 1
  aircraftBaseTurnRate: 45,  // degrees per second at multiplier 1

  // How often units change course (seconds)
  courseChangeInterval: 10,
  courseChangeVariance: 5,

  // Performance: motion update interval in ms (0 = every frame)
  motionUpdateInterval: 10, // Update motion every 10ms (~100 updates/sec)
};

// Throttle tracking
let lastMotionUpdateTime = 0;

// Simulation state for all units
let shipSimState = [];
let aircraftSimState = [];
let satelliteSimState = [];
let lastSimTime = 0;

/**
 * Initialize simulation state for a unit
 */
function initUnitState(lat, lon, heading, isAircraft) {
  // Base speed with some random variation (±20%)
  const baseSpeedRef = isAircraft ? motionParams.aircraftBaseSpeed : motionParams.shipBaseSpeed;
  const baseTurnRef = isAircraft ? motionParams.aircraftBaseTurnRate : motionParams.shipBaseTurnRate;

  return {
    lat,
    lon,
    heading,
    targetHeading: heading,
    baseSpeed: baseSpeedRef * (0.8 + Math.random() * 0.4),
    baseTurnRate: baseTurnRef * (0.8 + Math.random() * 0.4),
    scale: 0.8 + Math.random() * 0.4,
    nextCourseChange: Math.random() * motionParams.courseChangeInterval,
    isAircraft,
  };
}

/**
 * Normalize angle to 0-360 range
 */
function normalizeAngle(angle) {
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}

/**
 * Calculate shortest turn direction between two angles
 */
function shortestTurnDirection(current, target) {
  const diff = normalizeAngle(target - current);
  return diff <= 180 ? diff : diff - 360;
}

/**
 * Initialize simulation state for a satellite with orbital elements
 * Uses Keplerian orbital mechanics for realistic motion
 */
function initSatelliteState(altitude, inclination, ascendingNode, phase) {
  // Orbital period scales with altitude (simplified Kepler's 3rd law)
  // LEO (~400km): ~90 min, MEO (~20000km): ~12 hrs, GEO (~36000km): ~24 hrs
  // Since our Earth radius is 2, we scale accordingly
  // Period in seconds = baseperiod * (1 + altitude)^1.5
  const basePeriod = 5400; // 90 min in seconds for very low orbit
  const orbitalPeriod = basePeriod * Math.pow(1 + altitude * 5, 1.5);

  return {
    // Orbital elements
    altitude,           // Height above Earth surface
    inclination,        // Orbital plane tilt (degrees from equator)
    ascendingNode,      // Longitude where orbit crosses equator northward (degrees)
    phase,              // Current position in orbit (0-360 degrees)
    orbitalPeriod,      // Time to complete one orbit (seconds)

    // Computed position (updated each frame)
    lat: 0,
    lon: 0,
    heading: 0,
    scale: 1.0 + Math.random() * 0.5, // Visual scale (larger for visibility)
  };
}

/**
 * Update satellite position based on orbital mechanics
 * Computes lat/lon from orbital elements
 */
function updateSatelliteMotion(sat, deltaTime, speedMultiplier) {
  // Update orbital phase (position along orbit)
  // Phase increases by 360° per orbital period
  const phaseRate = (360 / sat.orbitalPeriod) * speedMultiplier;
  sat.phase = normalizeAngle(sat.phase + phaseRate * deltaTime);

  // Convert orbital elements to lat/lon
  // This is a simplified two-body orbital mechanics calculation
  const phaseRad = sat.phase * (Math.PI / 180);
  const inclinationRad = sat.inclination * (Math.PI / 180);

  // Position in orbital plane
  // x = cos(phase), y = sin(phase) in the orbital plane
  const xOrbit = Math.cos(phaseRad);
  const yOrbit = Math.sin(phaseRad);

  // Latitude is determined by inclination and position in orbit
  // At phase=0 and phase=180, satellite crosses equator
  // At phase=90, satellite is at max northern latitude (= inclination)
  // At phase=270, satellite is at max southern latitude (= -inclination)
  sat.lat = Math.asin(yOrbit * Math.sin(inclinationRad)) * (180 / Math.PI);

  // Longitude advances with the orbit and ascending node
  // For a prograde orbit, longitude increases when inclination > 0
  const lonInOrbit = Math.atan2(yOrbit * Math.cos(inclinationRad), xOrbit) * (180 / Math.PI);
  sat.lon = normalizeAngle(sat.ascendingNode + lonInOrbit + 180) - 180;

  // Heading is tangent to the orbit
  // Satellites generally travel eastward (prograde) with some north/south component
  // The heading depends on where in the orbit the satellite is
  const dLatDPhase = Math.cos(phaseRad) * Math.sin(inclinationRad);
  const dLonDPhase = (Math.cos(phaseRad) * Math.cos(inclinationRad) * xOrbit + yOrbit * (-Math.sin(phaseRad))) /
                     (xOrbit * xOrbit + yOrbit * yOrbit * Math.cos(inclinationRad) * Math.cos(inclinationRad));

  // Simplified heading calculation: direction of motion
  // 0 = North, 90 = East
  sat.heading = normalizeAngle(90 - Math.atan2(dLatDPhase, dLonDPhase * Math.cos(sat.lat * Math.PI / 180)) * (180 / Math.PI));
}

/**
 * Update a single unit's position and heading
 */
function updateUnitMotion(unit, deltaTime) {
  // Get current speed multiplier from params
  const speedMultiplier = unit.isAircraft ? motionParams.aircraftSpeed : motionParams.shipSpeed;
  const currentSpeed = unit.baseSpeed * speedMultiplier;
  const currentTurnRate = unit.baseTurnRate * speedMultiplier;

  // Smooth heading interpolation (realistic turning)
  const turnDiff = shortestTurnDirection(unit.heading, unit.targetHeading);
  const maxTurn = currentTurnRate * deltaTime;

  if (Math.abs(turnDiff) <= maxTurn) {
    unit.heading = unit.targetHeading;
  } else {
    unit.heading = normalizeAngle(unit.heading + Math.sign(turnDiff) * maxTurn);
  }

  // Convert heading to radians for motion calculation
  // Heading: 0 = North, 90 = East (clockwise)
  // cos(heading) = North component, sin(heading) = East component
  const headingRad = unit.heading * (Math.PI / 180);

  // Calculate movement in lat/lon
  // Speed is in degrees per second
  // Latitude: positive = north
  // Longitude: positive = east, adjusted for converging meridians
  const latSpeed = currentSpeed * Math.cos(headingRad);
  const lonSpeed = currentSpeed * Math.sin(headingRad) / Math.max(0.1, Math.cos(unit.lat * Math.PI / 180));

  // Update position
  unit.lat += latSpeed * deltaTime;
  unit.lon += lonSpeed * deltaTime;

  // Clamp latitude to valid range
  unit.lat = Math.max(-85, Math.min(85, unit.lat));

  // Wrap longitude
  if (unit.lon > 180) unit.lon -= 360;
  if (unit.lon < -180) unit.lon += 360;

  // Course changes
  unit.nextCourseChange -= deltaTime;
  if (unit.nextCourseChange <= 0) {
    // Pick a new target heading (realistic: usually small adjustments)
    const courseChange = (Math.random() - 0.5) * 60; // ±30 degrees typical
    unit.targetHeading = normalizeAngle(unit.heading + courseChange);

    // Occasionally make larger course changes
    if (Math.random() < 0.1) {
      unit.targetHeading = normalizeAngle(unit.heading + (Math.random() - 0.5) * 180);
    }

    // Reset timer with some variance
    unit.nextCourseChange = motionParams.courseChangeInterval +
      (Math.random() - 0.5) * motionParams.courseChangeVariance * 2;
  }
}

/**
 * Update all units' motion and refresh the display
 * Throttled to reduce CPU load with large unit counts
 * Now uses GPU-based orientation - only uploads lat/lon/heading/scale (16 bytes vs 64 bytes)
 */
function updateMotionSimulation(currentTime) {
  const deltaTime = lastSimTime === 0 ? 0 : currentTime - lastSimTime;
  lastSimTime = currentTime;

  // Skip if deltaTime is too large (e.g., tab was inactive)
  if (deltaTime > 1) return;

  // Throttle: only update at specified interval
  const now = performance.now();
  const timeSinceLastUpdate = now - lastMotionUpdateTime;

  if (motionParams.motionUpdateInterval > 0 && timeSinceLastUpdate < motionParams.motionUpdateInterval) {
    return; // Skip this frame
  }

  // Use actual elapsed time for physics (not frame delta) for smoother motion
  const physicsDelta = motionParams.motionUpdateInterval > 0
    ? timeSinceLastUpdate / 1000
    : deltaTime;

  lastMotionUpdateTime = now;

  // Update ship motion (CPU physics simulation)
  for (let i = 0; i < shipSimState.length; i++) {
    updateUnitMotion(shipSimState[i], physicsDelta);
  }

  // Update aircraft motion (CPU physics simulation)
  for (let i = 0; i < aircraftSimState.length; i++) {
    updateUnitMotion(aircraftSimState[i], physicsDelta);
  }

  // Update satellite motion (orbital mechanics simulation)
  const satSpeedMultiplier = motionParams.satelliteSpeed;
  for (let i = 0; i < satelliteSimState.length; i++) {
    updateSatelliteMotion(satelliteSimState[i], physicsDelta, satSpeedMultiplier);
  }

  // Upload updated attributes to GPU (much smaller than full matrices)
  // GPU vertex shader will compute position and orientation
  updateShipAttributes();
  updateAircraftAttributes();
  updateSatelliteAttributes();
}

// -----------------------------------------------------------------------------
// Demo Data - Generate sample ships and aircraft around the world
// -----------------------------------------------------------------------------

// Unit count parameters (adjustable via GUI)
const unitCountParams = {
  shipCount: 200,
  aircraftCount: 300,
  satelliteCount: 4000,
  totalCount: 500, // Combined slider for easy testing
  realisticRoutes: false, // Toggle between global spread and realistic traffic patterns
  showShips: true,
  showAircraft: true,
  showSatellites: true,
};

// Realistic shipping lanes with concentration weights
const SHIPPING_LANES = [
  // High traffic areas
  { latRange: [1, 8], lonRange: [103, 117], weight: 0.12, name: "South China Sea / Malacca" },
  { latRange: [29, 32], lonRange: [32, 34], weight: 0.04, name: "Suez Canal approach" },
  { latRange: [47, 49], lonRange: [-123, -122], weight: 0.03, name: "Puget Sound" },
  { latRange: [50, 52], lonRange: [0, 2], weight: 0.04, name: "English Channel" },
  { latRange: [35, 37], lonRange: [139, 141], weight: 0.04, name: "Tokyo Bay" },
  { latRange: [22, 23], lonRange: [113, 115], weight: 0.04, name: "Hong Kong / Pearl River" },
  { latRange: [1, 2], lonRange: [103, 104], weight: 0.04, name: "Singapore Strait" },
  { latRange: [37, 38], lonRange: [-122, -121], weight: 0.03, name: "San Francisco Bay" },
  { latRange: [40, 41], lonRange: [-74, -73], weight: 0.03, name: "New York Harbor" },
  { latRange: [51, 54], lonRange: [3, 8], weight: 0.04, name: "Rotterdam / North Sea" },
  // Medium traffic - major routes
  { latRange: [30, 45], lonRange: [-80, -10], weight: 0.10, name: "North Atlantic" },
  { latRange: [0, 25], lonRange: [50, 75], weight: 0.08, name: "Indian Ocean / Arabian Sea" },
  { latRange: [10, 40], lonRange: [120, 145], weight: 0.10, name: "West Pacific" },
  { latRange: [35, 50], lonRange: [-130, -120], weight: 0.06, name: "US West Coast" },
  { latRange: [25, 45], lonRange: [-85, -75], weight: 0.06, name: "US East Coast" },
  { latRange: [35, 42], lonRange: [-5, 15], weight: 0.05, name: "Mediterranean West" },
  { latRange: [32, 38], lonRange: [15, 35], weight: 0.05, name: "Mediterranean East" },
  { latRange: [55, 62], lonRange: [5, 25], weight: 0.05, name: "Baltic Sea" },
];

// Realistic flight corridors with concentration weights
// Weights favor large corridor regions over small hub areas to avoid clustering
const FLIGHT_CORRIDORS = [
  // Major flight routes (high weight - most aircraft are en route, not at airports)
  { latRange: [45, 65], lonRange: [-60, -10], weight: 0.15, name: "North Atlantic Track" },
  { latRange: [35, 55], lonRange: [-130, -70], weight: 0.18, name: "US Domestic" },
  { latRange: [35, 55], lonRange: [-10, 40], weight: 0.15, name: "European Airspace" },
  { latRange: [20, 45], lonRange: [100, 145], weight: 0.15, name: "East Asian Routes" },
  { latRange: [10, 35], lonRange: [70, 100], weight: 0.10, name: "South Asian Routes" },
  { latRange: [-35, 5], lonRange: [115, 155], weight: 0.08, name: "Australia / Oceania" },
  { latRange: [0, 30], lonRange: [-100, -60], weight: 0.06, name: "Central America / Caribbean" },
  { latRange: [-40, 10], lonRange: [-70, -35], weight: 0.05, name: "South America" },
  { latRange: [20, 40], lonRange: [-20, 40], weight: 0.04, name: "North Africa / Middle East" },
  { latRange: [-35, 5], lonRange: [10, 45], weight: 0.04, name: "Sub-Saharan Africa" },
];

/**
 * Generate a random point within a region using uniform distribution
 */
function randomInRegion(latRange, lonRange) {
  // Uniform distribution across the entire region
  const lat = latRange[0] + Math.random() * (latRange[1] - latRange[0]);
  const lon = lonRange[0] + Math.random() * (lonRange[1] - lonRange[0]);
  return { lat, lon };
}

/**
 * Select a random region based on weights
 */
function selectWeightedRegion(regions) {
  const totalWeight = regions.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;

  for (const region of regions) {
    random -= region.weight;
    if (random <= 0) return region;
  }
  return regions[regions.length - 1];
}

/**
 * Generate demo ships and aircraft with specified counts
 * Distributes units globally or along realistic routes based on setting
 */
function generateDemoData(shipCount = unitCountParams.shipCount, aircraftCount = unitCountParams.aircraftCount) {
  shipSimState = [];
  aircraftSimState = [];

  if (unitCountParams.realisticRoutes) {
    // Generate ships along realistic shipping lanes
    for (let i = 0; i < shipCount; i++) {
      const region = selectWeightedRegion(SHIPPING_LANES);
      const { lat, lon } = randomInRegion(region.latRange, region.lonRange);
      shipSimState.push(initUnitState(lat, lon, Math.random() * 360, false));
    }

    // Generate aircraft along realistic flight corridors
    for (let i = 0; i < aircraftCount; i++) {
      const region = selectWeightedRegion(FLIGHT_CORRIDORS);
      const { lat, lon } = randomInRegion(region.latRange, region.lonRange);
      aircraftSimState.push(initUnitState(lat, lon, Math.random() * 360, true));
    }
  } else {
    // Generate ships distributed globally
    for (let i = 0; i < shipCount; i++) {
      const lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
      const lon = Math.random() * 360 - 180;
      shipSimState.push(initUnitState(lat, lon, Math.random() * 360, false));
    }

    // Generate aircraft distributed globally
    for (let i = 0; i < aircraftCount; i++) {
      const lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
      const lon = Math.random() * 360 - 180;
      aircraftSimState.push(initUnitState(lat, lon, Math.random() * 360, true));
    }
  }

  console.log(`Generated ${shipSimState.length} ships and ${aircraftSimState.length} aircraft (realistic: ${unitCountParams.realisticRoutes})`);

  // Reset trail history for new units
  initTrailHistory();

  // Generate satellites with realistic orbital parameters
  generateSatelliteData(unitCountParams.satelliteCount);
}

/**
 * Generate satellite constellation with realistic orbital distributions
 * Creates a mix of LEO, MEO, and GEO satellites
 */
function generateSatelliteData(count = unitCountParams.satelliteCount) {
  satelliteSimState = [];

  for (let i = 0; i < count; i++) {
    // Distribute satellites across orbit types:
    // 60% LEO (communications, Earth observation, ISS-like)
    // 25% MEO (GPS, navigation)
    // 15% GEO (weather, communications)
    const orbitType = Math.random();
    let altitude, inclination;

    if (orbitType < 0.60) {
      // LEO - Low Earth Orbit
      altitude = SATELLITE_ALTITUDE_LEO.min +
        Math.random() * (SATELLITE_ALTITUDE_LEO.max - SATELLITE_ALTITUDE_LEO.min);
      // LEO inclinations vary widely: sun-synchronous (~98°), ISS (~51.6°), polar (~90°)
      const inclinationType = Math.random();
      if (inclinationType < 0.3) {
        inclination = 51 + Math.random() * 5; // ISS-like
      } else if (inclinationType < 0.6) {
        inclination = 85 + Math.random() * 10; // Polar/sun-synchronous
      } else {
        inclination = 20 + Math.random() * 60; // Various
      }
    } else if (orbitType < 0.85) {
      // MEO - Medium Earth Orbit (GPS constellation at ~55° inclination)
      altitude = SATELLITE_ALTITUDE_MEO.min +
        Math.random() * (SATELLITE_ALTITUDE_MEO.max - SATELLITE_ALTITUDE_MEO.min);
      inclination = 50 + Math.random() * 15; // GPS-like inclination
    } else {
      // GEO - Geostationary (0° inclination, appears stationary)
      altitude = SATELLITE_ALTITUDE_GEO.min +
        Math.random() * (SATELLITE_ALTITUDE_GEO.max - SATELLITE_ALTITUDE_GEO.min);
      inclination = Math.random() * 5; // Near-equatorial
    }

    // Random ascending node (longitude of orbit plane)
    const ascendingNode = Math.random() * 360;

    // Random starting phase (position in orbit)
    const phase = Math.random() * 360;

    satelliteSimState.push(initSatelliteState(altitude, inclination, ascendingNode, phase));
  }

  // Initialize positions
  for (const sat of satelliteSimState) {
    updateSatelliteMotion(sat, 0, 1);
  }

  // Update GPU buffers
  updateSatelliteAttributes();

  console.log(`Generated ${satelliteSimState.length} satellites (LEO/MEO/GEO mix)`);
}

/**
 * Update unit counts (called from GUI)
 */
function updateUnitCounts() {
  // When using total slider, split 40% ships, 60% aircraft
  const total = unitCountParams.totalCount;
  unitCountParams.shipCount = Math.floor(total * 0.4);
  unitCountParams.aircraftCount = Math.floor(total * 0.6);
  generateDemoData(unitCountParams.shipCount, unitCountParams.aircraftCount);
}

// Initialize demo data
generateDemoData();

// Build the lat/lon grid (now that latLonToPosition is defined)
buildGrid();

/**
 * =============================================================================
 * AIRPORT MARKERS
 * =============================================================================
 * Major world airports with IATA codes displayed in SpaceX minimal style
 */

// Airport data: [IATA code, latitude, longitude, name]
const AIRPORTS = [
  // North America
  ["JFK", 40.6413, -73.7781, "New York JFK"],
  ["LAX", 33.9425, -118.4081, "Los Angeles"],
  ["ORD", 41.9742, -87.9073, "Chicago O'Hare"],
  ["ATL", 33.6407, -84.4277, "Atlanta"],
  ["DFW", 32.8998, -97.0403, "Dallas"],
  ["DEN", 39.8561, -104.6737, "Denver"],
  ["SFO", 37.6213, -122.379, "San Francisco"],
  ["SEA", 47.4502, -122.3088, "Seattle"],
  ["MIA", 25.7959, -80.287, "Miami"],
  ["YYZ", 43.6777, -79.6248, "Toronto"],
  // Europe
  ["LHR", 51.47, -0.4543, "London Heathrow"],
  ["CDG", 49.0097, 2.5479, "Paris CDG"],
  ["FRA", 50.0379, 8.5622, "Frankfurt"],
  ["AMS", 52.3105, 4.7683, "Amsterdam"],
  ["MAD", 40.4983, -3.5676, "Madrid"],
  ["FCO", 41.8003, 12.2389, "Rome"],
  ["MUC", 48.3537, 11.775, "Munich"],
  ["ZRH", 47.4647, 8.5492, "Zurich"],
  ["LGW", 51.1537, -0.1821, "London Gatwick"],
  // Asia
  ["HND", 35.5494, 139.7798, "Tokyo Haneda"],
  ["NRT", 35.7653, 140.3856, "Tokyo Narita"],
  ["PEK", 40.0799, 116.6031, "Beijing"],
  ["PVG", 31.1443, 121.8083, "Shanghai"],
  ["HKG", 22.308, 113.9185, "Hong Kong"],
  ["SIN", 1.3644, 103.9915, "Singapore"],
  ["ICN", 37.4602, 126.4407, "Seoul Incheon"],
  ["BKK", 13.6900, 100.7501, "Bangkok"],
  ["DEL", 28.5562, 77.1, "Delhi"],
  ["DXB", 25.2532, 55.3657, "Dubai"],
  // Oceania
  ["SYD", -33.9399, 151.1753, "Sydney"],
  ["MEL", -37.6733, 144.8433, "Melbourne"],
  ["AKL", -37.0082, 174.7850, "Auckland"],
  // South America
  ["GRU", -23.4356, -46.4731, "São Paulo"],
  ["EZE", -34.8222, -58.5358, "Buenos Aires"],
  ["BOG", 4.7016, -74.1469, "Bogotá"],
  ["SCL", -33.393, -70.7858, "Santiago"],
  // Africa / Middle East
  ["JNB", -26.1392, 28.246, "Johannesburg"],
  ["CAI", 30.1219, 31.4056, "Cairo"],
  ["CPT", -33.9715, 18.6021, "Cape Town"],
  ["DOH", 25.2731, 51.6081, "Doha"],
];

// Airport display parameters
const airportParams = {
  visible: true,
  showLabels: true,
  markerSize: 0.02, // Default size (also controls label size)
};

// Group to hold all airport markers
const airportGroup = new THREE.Group();
airportGroup.renderOrder = 5;
earth.add(airportGroup);

/**
 * Create airport marker sprite (small diamond shape)
 */
function createAirportMarker(lat, lon, code) {
  const group = new THREE.Group();

  // Calculate position on globe
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const radius = EARTH_RADIUS + 0.002; // Slightly above surface

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  // Create marker (small diamond/dot)
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 32;
  canvas.height = 32;

  // Draw diamond shape
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.moveTo(16, 4);   // top
  ctx.lineTo(28, 16);  // right
  ctx.lineTo(16, 28);  // bottom
  ctx.lineTo(4, 16);   // left
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
    depthTest: true,
  });

  const marker = new THREE.Sprite(markerMaterial);
  marker.position.set(x, y, z);
  marker.scale.set(airportParams.markerSize, airportParams.markerSize, 1);
  group.add(marker);

  // Create label
  const labelCanvas = document.createElement("canvas");
  const labelCtx = labelCanvas.getContext("2d");
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
  labelCtx.fillText(code, 64, 24);

  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const labelMaterial = new THREE.SpriteMaterial({
    map: labelTexture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
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
  const labelOffset = 0.02;
  label.position.set(
    x + right.x * labelOffset,
    y + right.y * labelOffset,
    z + right.z * labelOffset
  );
  label.scale.set(0.04, 0.015, 1); // Smaller base size
  label.userData.isLabel = true;
  label.userData.baseScale = { x: 0.04, y: 0.015 };
  group.add(label);

  // Store marker base scale for dynamic sizing
  marker.userData.baseScale = airportParams.markerSize;

  return group;
}

/**
 * Build all airport markers
 */
function buildAirportMarkers() {
  // Clear existing markers
  while (airportGroup.children.length > 0) {
    const child = airportGroup.children[0];
    child.traverse((obj) => {
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    airportGroup.remove(child);
  }

  // Create markers for each airport
  for (const [code, lat, lon] of AIRPORTS) {
    const marker = createAirportMarker(lat, lon, code);
    airportGroup.add(marker);
  }

  // Update visibility
  airportGroup.visible = airportParams.visible;
  updateAirportLabels();
}

/**
 * Toggle airport label visibility
 */
function updateAirportLabels() {
  airportGroup.traverse((obj) => {
    if (obj.userData && obj.userData.isLabel) {
      obj.visible = airportParams.showLabels;
    }
  });
}

/**
 * Update airport marker and label scales based on camera distance
 * Keeps them at a consistent screen size regardless of zoom
 */
function updateAirportScales(cameraDistance) {
  // Scale factor: smaller when zoomed in, larger when zoomed out
  // Normalize to a comfortable size at mid-zoom
  const midZoom = 5; // Reference distance
  const scaleFactor = cameraDistance / midZoom;

  // Clamp scale to reasonable range
  const clampedScale = Math.max(0.3, Math.min(2.0, scaleFactor));

  // Use markerSize param as multiplier for both marker and label
  const sizeMultiplier = airportParams.markerSize / 0.02; // Normalize to default size

  airportGroup.traverse((obj) => {
    if (obj.userData && obj.userData.baseScale) {
      if (obj.userData.isLabel) {
        // Labels scale with marker size and zoom
        const labelScale = clampedScale * sizeMultiplier;
        obj.scale.set(
          obj.userData.baseScale.x * labelScale,
          obj.userData.baseScale.y * labelScale,
          1
        );
      } else {
        // Markers
        const size = airportParams.markerSize * clampedScale;
        obj.scale.set(size, size, 1);
      }
    }
  });
}

// Build initial airport markers
buildAirportMarkers();

// Export state and functions for external use (e.g., real AIS/FlightAware data)
// External code can modify shipSimState/aircraftSimState/satelliteSimState arrays directly,
// then call updateShipAttributes/updateAircraftAttributes/updateSatelliteAttributes to sync to GPU
window.shipSimState = shipSimState;
window.aircraftSimState = aircraftSimState;
window.satelliteSimState = satelliteSimState;
window.updateShipAttributes = updateShipAttributes;
window.updateAircraftAttributes = updateAircraftAttributes;
window.updateSatelliteAttributes = updateSatelliteAttributes;
window.generateDemoData = generateDemoData;
window.generateSatelliteData = generateSatelliteData;

// Camera/view parameters (defined here for GUI access)
const cameraParams = {
  tiltAngle: 0, // Default tilt in degrees (0 = looking at center, 90 = looking at horizon)
};

/**
 * Set camera tilt angle (view angle)
 * 0 = looking straight at Earth center (default globe view)
 * 90 = looking toward horizon (good for watching aircraft fly by)
 *
 * Works by offsetting the OrbitControls target from Earth center
 */
function setCameraTilt(degrees) {
  // Clamp to valid range
  const tilt = Math.max(0, Math.min(85, degrees));
  cameraParams.tiltAngle = tilt;

  // Calculate target offset based on tilt
  // At tilt=0, look at center. At tilt=90, look at a point near surface level
  const tiltFactor = tilt / 90;

  // Get direction from Earth center to camera
  const cameraDir = camera.position.clone().normalize();

  // Calculate a "up" vector tangent to Earth surface at camera's ground point
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, cameraDir).normalize();
  const surfaceUp = new THREE.Vector3().crossVectors(cameraDir, right).normalize();

  // Offset target upward (in surface tangent direction) based on tilt
  // More tilt = look higher toward horizon
  const targetOffset = surfaceUp.multiplyScalar(tiltFactor * EARTH_RADIUS * 1.5);

  // Set new target
  controls.target.copy(targetOffset);
  controls.update();
}

/**
 * =============================================================================
 * GUI CONTROLS
 * =============================================================================
 */

// Texture preset folder
const textureFolder = gui.addFolder("Textures");
textureFolder
  .add(textureParams, "preset", Object.keys(texturePresets))
  .name("Preset")
  .onChange((value) => {
    switchTexturePreset(value);
  });

// Color mode options
const colorModes = {
  "Normal": 0,
  "Grayscale (Tactical)": 1,
  "Night Vision": 2,
  "Thermal": 3,
  "Hologram": 4,
};
const colorModeParams = { mode: "Normal" };
textureFolder
  .add(colorModeParams, "mode", Object.keys(colorModes))
  .name("Color Mode")
  .onChange((value) => {
    earthMaterial.uniforms.uColorMode.value = colorModes[value];
  });

// Day/Night blend toggle
const nightBlendParams = { enabled: true };
textureFolder
  .add(nightBlendParams, "enabled")
  .name("Day/Night Blend")
  .onChange((value) => {
    earthMaterial.uniforms.uNightBlend.value = value ? 1.0 : 0.0;
  });

// Atmosphere folder
const atmosphereFolder = gui.addFolder("Atmosphere");
atmosphereFolder.close();
atmosphereFolder.addColor(earthParameters, "atmosphereDayColor").name("Day Color").onChange(() => {
  earthMaterial.uniforms.uAtmosphereDayColor.value.set(earthParameters.atmosphereDayColor);
  atmosphereMaterial.uniforms.uDayColor.value.set(earthParameters.atmosphereDayColor);
});
atmosphereFolder.addColor(earthParameters, "atmosphereTwilightColor").name("Twilight Color").onChange(() => {
  earthMaterial.uniforms.uAtmosphereTwilightColor.value.set(earthParameters.atmosphereTwilightColor);
  atmosphereMaterial.uniforms.uTwilightColor.value.set(earthParameters.atmosphereTwilightColor);
});
atmosphereFolder.add(earthParameters, "atmosphereIntensity", 0, 1, 0.01).name("Intensity").onChange(() => {
  atmosphereMaterial.uniforms.uIntensity.value = earthParameters.atmosphereIntensity;
});

// Clouds folder
const cloudsFolder = gui.addFolder("Clouds");
cloudsFolder.close();
cloudsFolder.add(earthParameters, "cloudsIntensity", 0, 1, 0.01).onChange(() => {
  earthMaterial.uniforms.uCloudsIntensity.value = earthParameters.cloudsIntensity;
  cloudMaterial.uniforms.uCloudsIntensity.value = earthParameters.cloudsIntensity;
});

// Sun glint/specular folder
const specularFolder = gui.addFolder("Sun Glint");
specularFolder.close();
specularFolder
  .add(earthParameters, "specularIntensity", 0, 3, 0.01)
  .name("Intensity")
  .onChange(() => {
    earthMaterial.uniforms.uSpecularIntensity.value = earthParameters.specularIntensity;
  });
specularFolder
  .add(earthParameters, "specularSharpness", 1, 128, 1)
  .name("Sharpness")
  .onChange(() => {
    earthMaterial.uniforms.uSpecularSharpness.value = earthParameters.specularSharpness;
  });
specularFolder
  .add(earthParameters, "specularGlowSize", 1, 32, 0.5)
  .name("Glow Size")
  .onChange(() => {
    earthMaterial.uniforms.uSpecularGlowSize.value = earthParameters.specularGlowSize;
  });

// Sun direction folder
const sunFolder = gui.addFolder("Sun Direction");
sunFolder.close();
sunFolder.add(earthParameters, "sunDirectionX", -1, 1, 0.01).onChange(updateSunDirection);
sunFolder.add(earthParameters, "sunDirectionY", -1, 1, 0.01).onChange(updateSunDirection);
sunFolder.add(earthParameters, "sunDirectionZ", -1, 1, 0.01).onChange(updateSunDirection);

function updateSunDirection() {
  const sunDir = new THREE.Vector3(
    earthParameters.sunDirectionX,
    earthParameters.sunDirectionY,
    earthParameters.sunDirectionZ
  ).normalize();

  // Update Earth shader
  earthMaterial.uniforms.uSunDirection.value.copy(sunDir);

  // Update atmosphere glow
  atmosphereMaterial.uniforms.uSunDirection.value.copy(sunDir);

  // Update cloud layer
  cloudMaterial.uniforms.uSunDirection.value.copy(sunDir);

  // Update tracking icon glass shaders
  shipMaterial.uniforms.uSunDirection.value.copy(sunDir);
  aircraftMaterial.uniforms.uSunDirection.value.copy(sunDir);
  satelliteMaterial.uniforms.uSunDirection.value.copy(sunDir);
}

// Grid folder
const gridFolder = gui.addFolder("Lat/Lon Grid");
gridFolder.close();
gridFolder.add(gridParameters, "visible").name("Show Grid").onChange(() => {
  gridGroup.visible = gridParameters.visible;
});
gridFolder.add(gridParameters, "opacity", 0.05, 0.8, 0.01).name("Opacity").onChange(() => {
  gridLineMaterial.opacity = gridParameters.opacity;
});
gridFolder.add(gridParameters, "latInterval", [10, 15, 30, 45]).name("Lat Interval").onChange(() => {
  buildGrid();
});
gridFolder.add(gridParameters, "lonInterval", [10, 15, 30, 45]).name("Lon Interval").onChange(() => {
  buildGrid();
});

// H3 Grid folder
const h3Folder = gui.addFolder("H3 Hex Grid");
h3Folder.close();
h3Folder.add(h3Params, "enabled").name("Show H3 Grid").onChange(() => {
  if (h3Params.enabled) {
    lastH3Resolution = -1; // Force rebuild
    // Hide flying units when H3 heatmap is shown
    shipMesh.visible = false;
    aircraftMesh.visible = false;
    satelliteMesh.visible = false;
    shipTrailMesh.visible = false;
    aircraftTrailMesh.visible = false;
  } else {
    // Show flying units when H3 is disabled (respecting individual toggles)
    shipMesh.visible = unitCountParams.showShips;
    aircraftMesh.visible = unitCountParams.showAircraft;
    satelliteMesh.visible = unitCountParams.showSatellites;
    shipTrailMesh.visible = unitCountParams.showShips && trailParams.enabled && trailParams.shipTrails;
    aircraftTrailMesh.visible = unitCountParams.showAircraft && trailParams.enabled && trailParams.aircraftTrails;
    // Hide H3 meshes, highlight, and popup
    if (h3Mesh) h3Mesh.visible = false;
    if (h3LineMesh) h3LineMesh.visible = false;
    if (h3HighlightMesh) h3HighlightMesh.visible = false;
    hideH3Popup();
  }
});
h3Folder.add(h3Params, "resolution", 0, 4, 1).name("Resolution").onChange(() => {
  hideH3Popup(); // Hide popup when resolution changes
  lastH3Resolution = -1; // Force rebuild on resolution change
});
h3Folder.add(h3Params, "opacity", 0.2, 1.0, 0.1).name("Opacity").onChange(() => {
  h3Material.opacity = h3Params.opacity * 0.85;
  h3LineMaterial.opacity = h3Params.opacity * 0.4;
});
h3Folder.add(h3Params, "updateInterval", 0.1, 5.0, 0.1).name("Update Interval (s)");

// Weather folder
const weatherFolder = gui.addFolder("Weather");
weatherFolder.close();
weatherFolder.add(weatherParams, "enabled").name("Show Weather").onChange(() => {
  weatherMesh.visible = weatherParams.enabled;
  updateWeatherLegend(weatherParams.layer, weatherParams.enabled);
});
weatherFolder.add(weatherParams, "layer", ["precipitation", "temperature", "wind", "pressure"]).name("Layer").onChange((value) => {
  setWeatherLayer(value);
  updateWeatherLegend(value, weatherParams.enabled);
});
weatherFolder.add(weatherParams, "opacity", 0.1, 1.0, 0.05).name("Opacity").onChange(() => {
  weatherMaterial.uniforms.uOpacity.value = weatherParams.opacity;
});
weatherFolder.add(weatherParams, "animate").name("Animate");

// Airports folder
const airportsFolder = gui.addFolder("Airports");
airportsFolder.close();
airportsFolder.add(airportParams, "visible").name("Show Airports").onChange(() => {
  airportGroup.visible = airportParams.visible;
});
airportsFolder.add(airportParams, "showLabels").name("Show Labels").onChange(() => {
  updateAirportLabels();
});
airportsFolder.add(airportParams, "markerSize", 0.01, 0.05, 0.002).name("Size");

// Motion/Speed folder - simplified controls
const motionFolder = gui.addFolder("Motion");
motionFolder.close();
motionFolder.add(motionParams, "shipSpeed", 0, 10, 0.1).name("Ship Speed");
motionFolder.add(motionParams, "aircraftSpeed", 0, 10, 0.1).name("Aircraft Speed");
motionFolder.add(motionParams, "satelliteSpeed", 0, 50, 1).name("Satellite Speed");

// Camera/View folder
const cameraFolder = gui.addFolder("Camera");
cameraFolder.close();
cameraFolder
  .add(cameraParams, "tiltAngle", 0, 90, 1)
  .name("Tilt (degrees)")
  .onChange((value) => {
    setCameraTilt(value);
  });

// Tilt presets
const tiltPresets = {
  "Center": () => setCameraTilt(0),
  "Slight Tilt": () => setCameraTilt(30),
  "Tracking": () => setCameraTilt(55),
  "Horizon": () => setCameraTilt(80),
};
cameraFolder.add(tiltPresets, "Center").name("● Center (default)");
cameraFolder.add(tiltPresets, "Slight Tilt").name("◢ Slight Tilt");
cameraFolder.add(tiltPresets, "Tracking").name("→ Tracking View");
cameraFolder.add(tiltPresets, "Horizon").name("— Horizon");

// Trails folder
const trailsFolder = gui.addFolder("Trails");
trailsFolder.close();
trailsFolder.add(trailParams, "enabled").name("Show Trails").onChange(() => {
  updateTrailAttributes();
});
trailsFolder.add(trailParams, "shipTrails").name("Ship Trails").onChange(() => {
  updateTrailAttributes();
});
trailsFolder.add(trailParams, "aircraftTrails").name("Aircraft Trails").onChange(() => {
  updateTrailAttributes();
});
trailsFolder.add(trailParams, "opacity", 0.1, 1.0, 0.1).name("Opacity").onChange(() => {
  shipTrailMaterial.uniforms.uBaseOpacity.value = trailParams.opacity;
  aircraftTrailMaterial.uniforms.uBaseOpacity.value = trailParams.opacity;
});

// Unit count folder - for testing performance
const unitsFolder = gui.addFolder("Units (Performance Test)");

// Use K notation for large numbers (display in thousands)
const unitCountDisplay = {
  totalCountK: unitCountParams.totalCount / 1000,
  satelliteCountK: unitCountParams.satelliteCount / 1000,
};

unitsFolder
  .add(unitCountDisplay, "totalCountK", 0.1, 500, 0.1)
  .name("Ships + Aircraft (K)")
  .onChange((value) => {
    unitCountParams.totalCount = Math.round(value * 1000);
    updateUnitCounts();
    lastH3Resolution = -1; // Force H3 rebuild
  });
unitsFolder
  .add(unitCountDisplay, "satelliteCountK", 0, 5, 0.05)
  .name("Satellites (K)")
  .onChange((value) => {
    unitCountParams.satelliteCount = Math.round(value * 1000);
    generateSatelliteData(unitCountParams.satelliteCount);
    lastH3Resolution = -1; // Force H3 rebuild
  });
unitsFolder
  .add(unitCountParams, "realisticRoutes")
  .name("Cluster on Routes")
  .onChange(() => {
    updateUnitCounts();
    lastH3Resolution = -1; // Force H3 rebuild
  });
unitsFolder
  .add(motionParams, "motionUpdateInterval", 0, 200, 10)
  .name("Update Interval (ms)")
  .onChange(() => {
    // Reset throttle timer when interval changes
    lastMotionUpdateTime = 0;
  });
unitsFolder
  .add(iconScaleParams, "multiplier", 1.0, 3.0, 0.1)
  .name("Icon Size");
unitsFolder
  .add(unitCountParams, "showShips")
  .name("Ships")
  .onChange((value) => {
    shipMesh.visible = value && !h3Params.enabled;
    shipTrailMesh.visible = value && trailParams.enabled && trailParams.shipTrails && !h3Params.enabled;
    lastH3Resolution = -1; // Force H3 rebuild
    refreshH3PopupIfVisible();
  });
unitsFolder
  .add(unitCountParams, "showAircraft")
  .name("Aircraft")
  .onChange((value) => {
    aircraftMesh.visible = value && !h3Params.enabled;
    aircraftTrailMesh.visible = value && trailParams.enabled && trailParams.aircraftTrails && !h3Params.enabled;
    lastH3Resolution = -1; // Force H3 rebuild
    refreshH3PopupIfVisible();
  });
unitsFolder
  .add(unitCountParams, "showSatellites")
  .name("Satellites")
  .onChange((value) => {
    satelliteMesh.visible = value && !h3Params.enabled;
    lastH3Resolution = -1; // Force H3 rebuild
    refreshH3PopupIfVisible();
  });

// Performance stats display
const perfStats = { fps: 0, ships: 0, aircraft: 0 };
const statsDisplay = unitsFolder.add(perfStats, "fps").name("FPS").listen().disable();
let frameCount = 0;
let lastFpsTime = performance.now();

function updateFpsCounter() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    perfStats.fps = Math.round(frameCount * 1000 / (now - lastFpsTime));
    perfStats.ships = shipSimState.length;
    perfStats.aircraft = aircraftSimState.length;
    frameCount = 0;
    lastFpsTime = now;
  }
}


/**
 * =============================================================================
 * VIEWPORT SIZES
 * =============================================================================
 */

// Store viewport dimensions and pixel ratio for responsive rendering
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  // Cap pixel ratio at 2 to prevent performance issues on high-DPI displays
  // (e.g., Retina displays can have pixel ratios of 3+)
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

// Handle window resize events to keep the scene responsive
window.addEventListener("resize", () => {
  // Update stored dimensions
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

  // Update camera aspect ratio to prevent stretching
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix(); // Must be called after changing camera properties

  // Update renderer to match new window size
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);
});

/**
 * =============================================================================
 * CAMERA
 * =============================================================================
 */

// Create a perspective camera (mimics human eye perspective)
// Parameters: FOV=25°, aspect ratio, near plane=0.1, far plane=100
// - FOV: Narrow field of view (25°) gives a more "zoomed in" look
// - Near/far planes: Objects outside this range won't be rendered
const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 100);

// Position the camera for an isometric-like view of the Earth
// x=12: To the right, y=5: Above, z=4: Slightly in front
camera.position.x = 12;
camera.position.y = 5;
camera.position.z = 4;

// Add camera to the scene
scene.add(camera);

// Set up OrbitControls for interactive camera movement
// - Left click + drag: Rotate around the Earth
// - Scroll: Zoom in/out
// - Right click + drag: Pan
const controls = new OrbitControls(camera, canvas);

// Enable damping for smooth, momentum-based camera movement
// Without this, camera stops immediately when you release the mouse
controls.enableDamping = true;
controls.dampingFactor = 0.05; // Smoother deceleration

// Prevent zooming inside the Earth
controls.minDistance = EARTH_RADIUS + 0.5; // Stay above surface
controls.maxDistance = 20; // Don't zoom too far out

// Allow full vertical rotation for tilt views
controls.minPolarAngle = 0; // Can look straight down at north pole
controls.maxPolarAngle = Math.PI; // Can look straight up at south pole

/**
 * =============================================================================
 * UNIT SELECTION (Click to select)
 * =============================================================================
 */

// Raycaster for click detection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Currently selected unit
let selectedUnit = null;

// DOM elements for unit info panel
const unitInfoPanel = document.getElementById("unit-info");
const unitTypeEl = document.getElementById("unit-type");
const unitIdEl = document.getElementById("unit-id");
const unitLatEl = document.getElementById("unit-lat");
const unitLonEl = document.getElementById("unit-lon");
const unitHdgEl = document.getElementById("unit-hdg");
const unitSpdEl = document.getElementById("unit-spd");
const unitAltEl = document.getElementById("unit-alt");
const unitCloseBtn = document.getElementById("unit-close");
const unitLabel1 = document.getElementById("unit-label-1");
const unitLabel2 = document.getElementById("unit-label-2");
const unitLabel3 = document.getElementById("unit-label-3");
const unitLabel4 = document.getElementById("unit-label-4");
const unitLabel5 = document.getElementById("unit-label-5");

// Close button handler
unitCloseBtn?.addEventListener("click", () => {
  deselectUnit();
});

/**
 * Deselect current unit
 */
function deselectUnit() {
  selectedUnit = null;
  unitInfoPanel?.classList.add("hidden");
  selectionRing.visible = false;
  orbitLine.visible = false;
}

/**
 * Select a unit and show info panel
 */
function selectUnit(type, index) {
  let unitData;
  let typeLabel;
  let typeClass;

  if (type === "ship") {
    unitData = shipSimState[index];
    typeLabel = "SHIP";
    typeClass = "ship";
  } else if (type === "aircraft") {
    unitData = aircraftSimState[index];
    typeLabel = "AIRCRAFT";
    typeClass = "aircraft";
  } else if (type === "satellite") {
    unitData = satelliteSimState[index];
    typeLabel = "SATELLITE";
    typeClass = "satellite";
  } else if (type === "airport") {
    const airport = AIRPORTS[index];
    if (!airport) return;
    const [code, lat, lon, name] = airport;
    unitData = { lat, lon, heading: 0, code, name };
    typeLabel = "AIRPORT";
    typeClass = "airport";
  }

  if (!unitData) return;

  selectedUnit = { type, index, data: unitData };

  // Update panel content
  unitTypeEl.textContent = typeLabel;
  unitTypeEl.className = `unit-info-type ${typeClass}`;

  // Show IATA code for airports, index for others
  if (type === "airport") {
    unitIdEl.textContent = unitData.code;
  } else {
    unitIdEl.textContent = `#${String(index).padStart(4, "0")}`;
  }

  // Show panel
  unitInfoPanel?.classList.remove("hidden");

  // Update values (will be refreshed each frame)
  updateSelectedUnitInfo();

  // Show orbit line for satellites
  if (type === "satellite") {
    updateOrbitLine(unitData);
  } else {
    orbitLine.visible = false;
  }
}

/**
 * Update selected unit info panel with current values
 */
function updateSelectedUnitInfo() {
  if (!selectedUnit) return;

  const { type, index } = selectedUnit;
  let unitData;
  let altitude;
  let speed;

  if (type === "ship") {
    unitData = shipSimState[index];
    if (!unitData) { deselectUnit(); return; }
    altitude = "0 ft";
    speed = `${(motionParams.shipSpeed * 50).toFixed(0)} kts`;

    // Set standard labels
    unitLabel1.textContent = "LAT";
    unitLabel2.textContent = "LON";
    unitLabel3.textContent = "HDG";
    unitLabel4.textContent = "SPD";
    unitLabel5.textContent = "ALT";

    unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
    unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
    unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
    unitSpdEl.textContent = speed;
    unitAltEl.textContent = altitude;
  } else if (type === "aircraft") {
    unitData = aircraftSimState[index];
    if (!unitData) { deselectUnit(); return; }
    // Generate consistent altitude based on index (28,000-41,000 ft)
    const altFeet = (28000 + (index % 14) * 1000).toLocaleString();
    altitude = `${altFeet} ft`;
    speed = `${(motionParams.aircraftSpeed * 80).toFixed(0)} kts`;

    // Set standard labels
    unitLabel1.textContent = "LAT";
    unitLabel2.textContent = "LON";
    unitLabel3.textContent = "HDG";
    unitLabel4.textContent = "SPD";
    unitLabel5.textContent = "ALT";

    unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
    unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
    unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
    unitSpdEl.textContent = speed;
    unitAltEl.textContent = altitude;
  } else if (type === "satellite") {
    unitData = satelliteSimState[index];
    if (!unitData) { deselectUnit(); return; }
    const altKm = (unitData.altitude * 6371 / EARTH_RADIUS).toFixed(0);
    altitude = `${altKm} km`;
    speed = `${(7.8 - unitData.altitude * 2).toFixed(1)} km/s`;

    // Set standard labels
    unitLabel1.textContent = "LAT";
    unitLabel2.textContent = "LON";
    unitLabel3.textContent = "HDG";
    unitLabel4.textContent = "SPD";
    unitLabel5.textContent = "ALT";

    unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
    unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
    unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
    unitSpdEl.textContent = speed;
    unitAltEl.textContent = altitude;
  } else if (type === "airport") {
    const airport = AIRPORTS[index];
    if (!airport) { deselectUnit(); return; }
    const [code, lat, lon, name] = airport;

    // Set airport-specific labels
    unitLabel1.textContent = "NAME";
    unitLabel2.textContent = "LAT";
    unitLabel3.textContent = "LON";
    unitLabel4.textContent = "ELEV";
    unitLabel5.textContent = "TYPE";

    unitLatEl.textContent = name;
    unitLonEl.textContent = `${lat.toFixed(4)}°`;
    unitHdgEl.textContent = `${lon.toFixed(4)}°`;
    unitSpdEl.textContent = "—"; // Elevation data not available
    unitAltEl.textContent = "INTL";
  }
}

/**
 * Convert lat/lon to 3D world position
 */
function latLonTo3D(lat, lon, altitude = 0) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const radius = EARTH_RADIUS + altitude;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Project 3D position to screen coordinates
 */
function projectToScreen(position) {
  const projected = position.clone().project(camera);
  return {
    x: (projected.x + 1) / 2 * canvas.clientWidth,
    y: (-projected.y + 1) / 2 * canvas.clientHeight,
    z: projected.z // depth for visibility check
  };
}

/**
 * Handle canvas click for unit selection
 * Uses screen-space distance checking since instanced meshes don't raycast well
 */
function onCanvasClick(event) {
  // Ignore if clicking on GUI or overlay elements
  if (event.target.closest(".lil-gui") || event.target.closest("#unit-info")) return;

  // Skip unit/airport selection when H3 grid is active (H3 has its own click handler)
  if (h3Params.enabled) return;

  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // Click radius in pixels (how close click needs to be to unit)
  const clickRadius = 20;
  let closestUnit = null;
  let closestDist = clickRadius;

  // Check ships (if visible)
  if (unitCountParams.showShips) {
    for (let i = 0; i < shipSimState.length; i++) {
      const unit = shipSimState[i];
      const worldPos = latLonTo3D(unit.lat, unit.lon, SHIP_ALTITUDE);

      // Transform by earth's rotation
      worldPos.applyMatrix4(earth.matrixWorld);

      const screen = projectToScreen(worldPos);

      // Skip if behind camera
      if (screen.z > 1) continue;

      const dist = Math.sqrt((clickX - screen.x) ** 2 + (clickY - screen.y) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestUnit = { type: "ship", index: i };
      }
    }
  }

  // Check aircraft (if visible)
  if (unitCountParams.showAircraft) {
    for (let i = 0; i < aircraftSimState.length; i++) {
      const unit = aircraftSimState[i];
      const worldPos = latLonTo3D(unit.lat, unit.lon, AIRCRAFT_ALTITUDE);
      worldPos.applyMatrix4(earth.matrixWorld);

      const screen = projectToScreen(worldPos);
      if (screen.z > 1) continue;

      const dist = Math.sqrt((clickX - screen.x) ** 2 + (clickY - screen.y) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestUnit = { type: "aircraft", index: i };
      }
    }
  }

  // Check satellites (if visible)
  if (unitCountParams.showSatellites) {
    for (let i = 0; i < satelliteSimState.length; i++) {
      const unit = satelliteSimState[i];
      const worldPos = latLonTo3D(unit.lat, unit.lon, unit.altitude);
      worldPos.applyMatrix4(earth.matrixWorld);

      const screen = projectToScreen(worldPos);
      if (screen.z > 1) continue;

      const dist = Math.sqrt((clickX - screen.x) ** 2 + (clickY - screen.y) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestUnit = { type: "satellite", index: i };
      }
    }
  }

  // Check airports (if visible)
  if (airportParams.visible) {
    for (let i = 0; i < AIRPORTS.length; i++) {
      const [code, lat, lon, name] = AIRPORTS[i];
      const worldPos = latLonTo3D(lat, lon, 0.002);
      worldPos.applyMatrix4(earth.matrixWorld);

      const screen = projectToScreen(worldPos);
      if (screen.z > 1) continue;

      const dist = Math.sqrt((clickX - screen.x) ** 2 + (clickY - screen.y) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestUnit = { type: "airport", index: i };
      }
    }
  }

  if (closestUnit) {
    selectUnit(closestUnit.type, closestUnit.index);
  } else {
    deselectUnit();
  }
}

// Add click listener
canvas.addEventListener("click", onCanvasClick)

/**
 * =============================================================================
 * RENDERER
 * =============================================================================
 */

// Create the WebGL renderer that draws the scene to the canvas
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true, // Smooth edges by using antialiasing
});

// Set initial render size and pixel ratio
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);

// Set background color to pure black (SpaceX style)
renderer.setClearColor("#000000");

// Set max anisotropic filtering for sharper textures at oblique angles
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
earthDayTexture.anisotropy = maxAnisotropy;
earthNightTexture.anisotropy = maxAnisotropy;
earthSpecularCloudsTexture.anisotropy = maxAnisotropy;

/**
 * =============================================================================
 * ANIMATION LOOP
 * =============================================================================
 */

// Clock tracks elapsed time for frame-independent animations
// Using elapsed time instead of frame count ensures consistent
// animation speed regardless of frame rate
const clock = new THREE.Clock();

// The main animation loop - called every frame (~60 times per second)
const tick = () => {
  // Get total time elapsed since the clock started
  const elapsedTime = clock.getElapsedTime();

  // Earth rotation - smooth fade in when altitude > 9000km for cinematic effect
  const scaleFactor = 6371 / EARTH_RADIUS;
  const altitudeKm = (camera.position.length() - EARTH_RADIUS) * scaleFactor;
  // Smoothly ramp rotation from 9000km to 12000km
  const rotationFactor = Math.max(0, Math.min(1, (altitudeKm - 9000) / 3000));
  if (rotationFactor > 0) {
    // Slow rotation that fades in smoothly
    earth.rotation.y += 0.0003 * rotationFactor;
  }

  // Update weather animation
  if (weatherParams.enabled && weatherParams.animate) {
    weatherMaterial.uniforms.uTime.value = elapsedTime;
  }

  // Update motion simulation for ships and aircraft
  updateMotionSimulation(elapsedTime);

  // Update unit trails (throttled internally)
  updateTrails();

  // Scale tracking icons based on camera distance
  // Icons should be smaller when zoomed in, larger when zoomed out
  const cameraDistance = camera.position.length();
  updateIconScale(cameraDistance);

  // Adjust rotation speed based on zoom level
  // Slower when zoomed in for precise control, faster when zoomed out
  const zoomFactor = (cameraDistance - controls.minDistance) / (controls.maxDistance - controls.minDistance);
  controls.rotateSpeed = 0.3 + zoomFactor * 0.7; // Range: 0.3 (close) to 1.0 (far)

  // Update telemetry display
  updateTelemetry(cameraDistance, camera.position);

  // Update airport marker scales based on zoom
  updateAirportScales(cameraDistance);

  // Update H3 grid if enabled
  updateH3Grid(cameraDistance, elapsedTime);

  // Process chunked H3 geometry building (non-blocking)
  processH3BuildChunk();

  // Update H3 popup if visible (lightweight check for unit movement)
  updateH3PopupPeriodic(elapsedTime);

  // Animate H3 cell highlight (pulsating effect)
  if (h3HighlightMesh && h3HighlightMesh.visible) {
    const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 4); // Pulsate 4 times per second
    h3HighlightMaterial.opacity = 0.6 + 0.4 * pulse; // Range: 0.6 to 1.0
  }

  // Update selected unit info panel and selection highlight
  updateSelectedUnitInfo();
  updateSelectionRing();
  selectionRingMaterial.uniforms.uTime.value = elapsedTime;

  // Update OrbitControls - required for damping to work
  controls.update();

  // Enforce minimum distance from Earth center (not just from target)
  // This prevents zooming into the globe when tilt is applied
  const minDistanceFromCenter = EARTH_RADIUS + 0.3;
  const distanceFromCenter = camera.position.length();
  if (distanceFromCenter < minDistanceFromCenter) {
    camera.position.normalize().multiplyScalar(minDistanceFromCenter);
  }

  // Render the scene from the camera's perspective
  renderer.render(scene, camera);

  // Update FPS counter for performance monitoring
  updateFpsCounter();

  // Request the next frame, creating an infinite loop
  window.requestAnimationFrame(tick);
};

// Start the animation loop
tick();
