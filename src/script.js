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

  // Calculate camera lat/lon from position
  const camLength = cameraPosition.length();
  const lat = Math.asin(cameraPosition.y / camLength) * (180 / Math.PI);
  const lon = Math.atan2(cameraPosition.z, -cameraPosition.x) * (180 / Math.PI) - 180;
  const normalizedLon = lon < -180 ? lon + 360 : lon;

  telLat.textContent = lat.toFixed(2) + "°";
  telLon.textContent = normalizedLon.toFixed(2) + "°";

  // Unit counts
  const totalUnits = shipSimState.length + aircraftSimState.length + satelliteSimState.length;
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

// Load Earth textures from the static/earth/ directory
// These textures are used in the fragment shader for realistic Earth rendering

// Day texture - shows continents, oceans, and land during daytime
const earthDayTexture = textureLoader.load("/earth/day.jpg");
earthDayTexture.colorSpace = THREE.SRGBColorSpace; // Correct color space for display

// Night texture - shows city lights on the dark side of Earth
const earthNightTexture = textureLoader.load("/earth/night.jpg");
earthNightTexture.colorSpace = THREE.SRGBColorSpace;

// Specular and clouds texture - contains cloud data and ocean specularity
// Red channel: specular intensity (oceans are reflective)
// Green channel: cloud coverage
const earthSpecularCloudsTexture = textureLoader.load("/earth/specularClouds.jpg");

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
  currentIconScale = cameraDistance / baseDistance;
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
    scale: 0.6 + Math.random() * 0.4, // Visual scale
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
  satelliteCount: 100,
  totalCount: 500, // Combined slider for easy testing
  realisticRoutes: false, // Toggle between global spread and realistic traffic patterns
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
const FLIGHT_CORRIDORS = [
  // Major hub airports
  { latRange: [40, 42], lonRange: [-75, -73], weight: 0.05, name: "NYC area" },
  { latRange: [33, 35], lonRange: [-118, -117], weight: 0.04, name: "Los Angeles" },
  { latRange: [51, 52], lonRange: [-1, 1], weight: 0.05, name: "London" },
  { latRange: [48, 50], lonRange: [2, 3], weight: 0.04, name: "Paris" },
  { latRange: [25, 26], lonRange: [55, 56], weight: 0.04, name: "Dubai" },
  { latRange: [22, 23], lonRange: [113, 114], weight: 0.04, name: "Hong Kong" },
  { latRange: [1, 2], lonRange: [103, 104], weight: 0.04, name: "Singapore" },
  { latRange: [35, 36], lonRange: [139, 140], weight: 0.04, name: "Tokyo" },
  { latRange: [31, 32], lonRange: [121, 122], weight: 0.04, name: "Shanghai" },
  { latRange: [37, 38], lonRange: [-122, -121], weight: 0.03, name: "San Francisco" },
  { latRange: [41, 42], lonRange: [-88, -87], weight: 0.03, name: "Chicago" },
  { latRange: [49, 51], lonRange: [8, 12], weight: 0.04, name: "Frankfurt / Munich" },
  // Major flight routes
  { latRange: [45, 65], lonRange: [-60, -10], weight: 0.12, name: "North Atlantic Track" },
  { latRange: [35, 55], lonRange: [-130, -70], weight: 0.12, name: "US Domestic" },
  { latRange: [35, 55], lonRange: [-10, 40], weight: 0.10, name: "European Airspace" },
  { latRange: [20, 45], lonRange: [100, 140], weight: 0.10, name: "East Asian Routes" },
  { latRange: [10, 35], lonRange: [70, 100], weight: 0.06, name: "South Asian Routes" },
  { latRange: [-35, 0], lonRange: [115, 155], weight: 0.04, name: "Australia / Oceania" },
];

/**
 * Generate a random point within a region with some gaussian spread
 */
function randomInRegion(latRange, lonRange) {
  // Add some gaussian-like spread for more natural clustering
  const latCenter = (latRange[0] + latRange[1]) / 2;
  const lonCenter = (lonRange[0] + lonRange[1]) / 2;
  const latSpread = (latRange[1] - latRange[0]) / 2;
  const lonSpread = (lonRange[1] - lonRange[0]) / 2;

  // Box-Muller for gaussian distribution, clamped to range
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  const lat = Math.max(latRange[0], Math.min(latRange[1], latCenter + gaussian * latSpread * 0.4));
  const lon = Math.max(lonRange[0], Math.min(lonRange[1], lonCenter + (Math.random() - 0.5) * lonSpread * 2));

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

/**
 * =============================================================================
 * GUI CONTROLS
 * =============================================================================
 */

// Atmosphere folder
const atmosphereFolder = gui.addFolder("Atmosphere");
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
cloudsFolder.add(earthParameters, "cloudsIntensity", 0, 1, 0.01).onChange(() => {
  earthMaterial.uniforms.uCloudsIntensity.value = earthParameters.cloudsIntensity;
  cloudMaterial.uniforms.uCloudsIntensity.value = earthParameters.cloudsIntensity;
});

// Sun glint/specular folder
const specularFolder = gui.addFolder("Sun Glint");
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

// Motion/Speed folder - simplified controls
const motionFolder = gui.addFolder("Motion");
motionFolder.add(motionParams, "shipSpeed", 0, 10, 0.1).name("Ship Speed");
motionFolder.add(motionParams, "aircraftSpeed", 0, 10, 0.1).name("Aircraft Speed");
motionFolder.add(motionParams, "satelliteSpeed", 0, 50, 1).name("Satellite Speed");

// Trails folder
const trailsFolder = gui.addFolder("Trails");
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
  });
unitsFolder
  .add(unitCountDisplay, "satelliteCountK", 0, 5, 0.05)
  .name("Satellites (K)")
  .onChange((value) => {
    unitCountParams.satelliteCount = Math.round(value * 1000);
    generateSatelliteData(unitCountParams.satelliteCount);
  });
unitsFolder
  .add(unitCountParams, "realisticRoutes")
  .name("Realistic Routes")
  .onChange(updateUnitCounts);
unitsFolder
  .add(motionParams, "motionUpdateInterval", 0, 200, 10)
  .name("Update Interval (ms)")
  .onChange(() => {
    // Reset throttle timer when interval changes
    lastMotionUpdateTime = 0;
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

  // Earth rotation disabled
  // earth.rotation.y = elapsedTime * 0.01;

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

  // Update OrbitControls - required for damping to work
  controls.update();

  // Render the scene from the camera's perspective
  renderer.render(scene, camera);

  // Update FPS counter for performance monitoring
  updateFpsCounter();

  // Request the next frame, creating an infinite loop
  window.requestAnimationFrame(tick);
};

// Start the animation loop
tick();
