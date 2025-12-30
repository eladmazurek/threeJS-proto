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
import shadowVertexShader from "./shaders/tracking/shadow-vertex.glsl";

// Import glass shaders for tactical UI look
import glassVertexShader from "./shaders/tracking/glass-vertex.glsl";
import glassFragmentShader from "./shaders/tracking/glass-fragment.glsl";

/**
 * =============================================================================
 * BASE SETUP
 * =============================================================================
 */

// Debug GUI - lil-gui provides a panel for tweaking parameters in real-time
// Access it in the top-right corner of the screen
const gui = new GUI();

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
  atmosphereColor: "#0088ff", // Color of the atmospheric glow
  atmosphereDayMix: 0.4, // How much atmosphere color blends with day side
  atmosphereTwilightMix: 0.8, // How much atmosphere color blends at twilight
  cloudsIntensity: 0.4, // Opacity/intensity of cloud layer
  sunDirectionX: -1.0, // Sun direction X component
  sunDirectionY: 0.5, // Sun direction Y component
  sunDirectionZ: 1.0, // Sun direction Z component
  specularIntensity: 1.0, // Overall sun glint intensity
  specularSharpness: 64.0, // Sharpness of the center highlight
  specularGlowSize: 8.0, // Size of the medium glow
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

    // Atmosphere parameters
    uAtmosphereColor: { value: new THREE.Color(earthParameters.atmosphereColor) },
    uAtmosphereDayMix: { value: earthParameters.atmosphereDayMix },
    uAtmosphereTwilightMix: { value: earthParameters.atmosphereTwilightMix },

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
// Negative rotation: bow (at +Y in shape) goes to -Z
shipBaseGeometry.rotateX(-Math.PI / 2);

// Create instanced geometry with tracking attributes
const shipGeometry = createTrackingGeometry(shipBaseGeometry, MAX_SHIPS);

// Create tactical glass material for ships
const shipMaterial = new THREE.ShaderMaterial({
  vertexShader: glassVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uAltitude: { value: SHIP_ALTITUDE },
    uColor: { value: new THREE.Color(0x00cc66) }, // Slightly deeper green
    uOpacity: { value: 0.7 },
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0x88ffcc) }, // Lighter green glow
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: false, // Better blending for glass
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
// Negative rotation: nose (at +Y in shape) goes to -Z
aircraftBaseGeometry.rotateX(-Math.PI / 2);

// Create instanced geometry with tracking attributes
const aircraftGeometry = createTrackingGeometry(aircraftBaseGeometry, MAX_AIRCRAFT);

// Create tactical glass material for aircraft
const aircraftMaterial = new THREE.ShaderMaterial({
  vertexShader: glassVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uAltitude: { value: AIRCRAFT_ALTITUDE },
    uColor: { value: new THREE.Color(0xff8800) }, // Slightly deeper orange
    uOpacity: { value: 0.7 },
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0xffcc66) }, // Lighter orange/yellow glow
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: false, // Better blending for glass
  blending: THREE.NormalBlending,
});

// Create mesh for aircraft
const aircraftMesh = new THREE.Mesh(aircraftGeometry, aircraftMaterial);
aircraftMesh.frustumCulled = false;
aircraftMesh.renderOrder = 2; // Render aircraft after ships (above ships)
earth.add(aircraftMesh);

// -----------------------------------------------------------------------------
// Aircraft Shadows - shares attribute buffers with aircraft for automatic sync
// -----------------------------------------------------------------------------
const SHADOW_ALTITUDE = 0.001; // Just above surface to prevent z-fighting

// Create shadow geometry that shares the same instanced attributes as aircraft
const aircraftShadowGeometry = new THREE.InstancedBufferGeometry();
aircraftShadowGeometry.index = aircraftBaseGeometry.index;
aircraftShadowGeometry.attributes.position = aircraftBaseGeometry.attributes.position;

// Share the same attribute buffers - shadows auto-update when aircraft move!
aircraftShadowGeometry.setAttribute('aLat', aircraftGeometry.getAttribute('aLat'));
aircraftShadowGeometry.setAttribute('aLon', aircraftGeometry.getAttribute('aLon'));
aircraftShadowGeometry.setAttribute('aHeading', aircraftGeometry.getAttribute('aHeading'));
aircraftShadowGeometry.setAttribute('aScale', aircraftGeometry.getAttribute('aScale'));

// Shadow material - dark and semi-transparent, offset by sun direction
const aircraftShadowMaterial = new THREE.ShaderMaterial({
  vertexShader: shadowVertexShader,
  fragmentShader: trackingFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uAircraftAltitude: { value: AIRCRAFT_ALTITUDE },
    uSunDirection: { value: new THREE.Vector3(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ).normalize() },
    uShadowLength: { value: 1.0 }, // Shadow length multiplier
    uColor: { value: new THREE.Color(0x000000) }, // Black shadow
    uOpacity: { value: 0.3 }, // Semi-transparent
  },
  transparent: true,
  side: THREE.FrontSide,
  depthTest: true,
  depthWrite: false, // Don't write to depth buffer
});

// Create shadow mesh
const aircraftShadowMesh = new THREE.Mesh(aircraftShadowGeometry, aircraftShadowMaterial);
aircraftShadowMesh.frustumCulled = false;
aircraftShadowMesh.renderOrder = 0; // Render shadows first (below ships and aircraft)
earth.add(aircraftShadowMesh);

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

  // Set instance count for rendering (aircraft and shadows share buffers)
  aircraftGeometry.instanceCount = count;
  aircraftShadowGeometry.instanceCount = count;
}

/**
 * Update icon scale based on camera distance
 */
function updateIconScale(cameraDistance) {
  const baseDistance = 13;
  currentIconScale = cameraDistance / baseDistance;
}

// -----------------------------------------------------------------------------
// Motion Simulation System
// -----------------------------------------------------------------------------

// Motion parameters - simplified with single speed slider per type
const motionParams = {
  // Speed multipliers (1 = normal, higher = faster)
  shipSpeed: 10.0,
  aircraftSpeed: 10.0,

  // Base values (internal, not exposed to GUI)
  shipBaseSpeed: 0.002,      // degrees per second at multiplier 1
  shipBaseTurnRate: 15,      // degrees per second at multiplier 1
  aircraftBaseSpeed: 0.02,   // degrees per second at multiplier 1
  aircraftBaseTurnRate: 45,  // degrees per second at multiplier 1

  // How often units change course (seconds)
  courseChangeInterval: 10,
  courseChangeVariance: 5,

  // Performance: motion update interval in ms (0 = every frame)
  motionUpdateInterval: 50, // Update motion every 50ms (~20 updates/sec)
};

// Throttle tracking
let lastMotionUpdateTime = 0;

// Simulation state for all units
let shipSimState = [];
let aircraftSimState = [];
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

  // Upload updated attributes to GPU (much smaller than full matrices)
  // GPU vertex shader will compute position and orientation
  updateShipAttributes();
  updateAircraftAttributes();
}

// -----------------------------------------------------------------------------
// Demo Data - Generate sample ships and aircraft around the world
// -----------------------------------------------------------------------------

// Unit count parameters (adjustable via GUI)
const unitCountParams = {
  shipCount: 200,
  aircraftCount: 300,
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
// External code can modify shipSimState/aircraftSimState arrays directly,
// then call updateShipAttributes/updateAircraftAttributes to sync to GPU
window.shipSimState = shipSimState;
window.aircraftSimState = aircraftSimState;
window.updateShipAttributes = updateShipAttributes;
window.updateAircraftAttributes = updateAircraftAttributes;
window.generateDemoData = generateDemoData;

/**
 * =============================================================================
 * GUI CONTROLS
 * =============================================================================
 */

// Atmosphere folder
const atmosphereFolder = gui.addFolder("Atmosphere");
atmosphereFolder.addColor(earthParameters, "atmosphereColor").onChange(() => {
  earthMaterial.uniforms.uAtmosphereColor.value.set(earthParameters.atmosphereColor);
});
atmosphereFolder.add(earthParameters, "atmosphereDayMix", 0, 1, 0.01).onChange(() => {
  earthMaterial.uniforms.uAtmosphereDayMix.value = earthParameters.atmosphereDayMix;
});
atmosphereFolder.add(earthParameters, "atmosphereTwilightMix", 0, 1, 0.01).onChange(() => {
  earthMaterial.uniforms.uAtmosphereTwilightMix.value = earthParameters.atmosphereTwilightMix;
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

  // Update cloud layer
  cloudMaterial.uniforms.uSunDirection.value.copy(sunDir);

  // Update tracking icon glass shaders
  shipMaterial.uniforms.uSunDirection.value.copy(sunDir);
  aircraftMaterial.uniforms.uSunDirection.value.copy(sunDir);

  // Update aircraft shadow shader
  aircraftShadowMaterial.uniforms.uSunDirection.value.copy(sunDir);
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

// Unit count folder - for testing performance
const unitsFolder = gui.addFolder("Units (Performance Test)");
unitsFolder
  .add(unitCountParams, "totalCount", 100, 500000, 100)
  .name("Total Units")
  .onChange(updateUnitCounts);
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

// Set background color to dark blue (simulating space)
renderer.setClearColor("#000011");

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

  // Scale tracking icons based on camera distance
  // Icons should be smaller when zoomed in, larger when zoomed out
  const cameraDistance = camera.position.length();
  updateIconScale(cameraDistance);

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
