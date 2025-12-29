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

/**
 * =============================================================================
 * BASE SETUP
 * =============================================================================
 */

// Debug GUI - lil-gui provides a panel for tweaking parameters in real-time
// Access it in the top-right corner of the screen
const gui = new GUI();

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
const EARTH_RADIUS = 2; // Must match the sphere geometry radius
const MAX_SHIPS = 1000; // Maximum number of ship instances
const MAX_AIRCRAFT = 1000; // Maximum number of aircraft instances
const SHIP_ALTITUDE = 0.01; // Height above Earth surface for ships
const AIRCRAFT_ALTITUDE = 0.08; // Height above Earth surface for aircraft

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

/**
 * Create a matrix for positioning and orienting an instance on the Earth
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} heading - Heading in degrees (0 = North, clockwise)
 * @param {number} altitude - Height above surface
 * @param {number} scale - Scale factor for the symbol
 * @returns {THREE.Matrix4} Transformation matrix
 */
function createInstanceMatrix(lat, lon, heading, altitude, scale) {
  const position = latLonToPosition(lat, lon, altitude);

  // Calculate the up vector (normal to Earth surface at this point)
  const up = position.clone().normalize();

  // Calculate north direction at this point (tangent pointing toward north pole)
  const north = new THREE.Vector3(0, 1, 0);
  const east = new THREE.Vector3().crossVectors(north, up).normalize();
  const northTangent = new THREE.Vector3().crossVectors(up, east).normalize();

  // Rotate by heading (clockwise from north)
  const headingRad = -heading * (Math.PI / 180);
  const forward = new THREE.Vector3()
    .addScaledVector(northTangent, Math.cos(headingRad))
    .addScaledVector(east, Math.sin(headingRad))
    .normalize();

  // Create rotation matrix to orient symbol on Earth surface
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const correctedForward = new THREE.Vector3().crossVectors(right, up).normalize();

  const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, correctedForward);

  // Combine position, rotation, and scale
  const matrix = new THREE.Matrix4();
  matrix.compose(
    position,
    new THREE.Quaternion().setFromRotationMatrix(rotationMatrix),
    new THREE.Vector3(scale, scale, scale)
  );

  return matrix;
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

const shipGeometry = new THREE.ShapeGeometry(shipShape);
// Rotate geometry so it lies flat on the surface (Y-up becomes the normal)
shipGeometry.rotateX(-Math.PI / 2);

const shipMaterial = new THREE.MeshBasicMaterial({
  color: 0x00ff88,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.9,
  depthWrite: false, // Prevents z-fighting with Earth
});

// Create InstancedMesh for ships
const shipInstances = new THREE.InstancedMesh(shipGeometry, shipMaterial, MAX_SHIPS);
shipInstances.count = 0; // Start with no visible instances
shipInstances.frustumCulled = false; // Ensure all instances render
earth.add(shipInstances); // Add to Earth so they rotate with it

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

const aircraftGeometry = new THREE.ShapeGeometry(aircraftShape);
// Rotate geometry so it lies flat on the surface
aircraftGeometry.rotateX(-Math.PI / 2);

const aircraftMaterial = new THREE.MeshBasicMaterial({
  color: 0xffaa00,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});

// Create InstancedMesh for aircraft
const aircraftInstances = new THREE.InstancedMesh(aircraftGeometry, aircraftMaterial, MAX_AIRCRAFT);
aircraftInstances.count = 0; // Start with no visible instances
aircraftInstances.frustumCulled = false;
earth.add(aircraftInstances); // Add to Earth so they rotate with it

// -----------------------------------------------------------------------------
// Tracking Data Management
// -----------------------------------------------------------------------------

// Store current tracking data for dynamic rescaling
let currentShipsData = [];
let currentAircraftData = [];
let currentIconScale = 1;

/**
 * Update ship instances with new data
 * @param {Array} ships - Array of ship objects with {lat, lon, heading, [scale]}
 * @param {number} globalScale - Global scale multiplier for all icons
 */
function updateShips(ships, globalScale = currentIconScale) {
  currentShipsData = ships;
  shipInstances.count = Math.min(ships.length, MAX_SHIPS);

  for (let i = 0; i < shipInstances.count; i++) {
    const ship = ships[i];
    const matrix = createInstanceMatrix(
      ship.lat,
      ship.lon,
      ship.heading || 0,
      SHIP_ALTITUDE,
      (ship.scale || 1) * globalScale
    );
    shipInstances.setMatrixAt(i, matrix);
  }

  shipInstances.instanceMatrix.needsUpdate = true;
}

/**
 * Update aircraft instances with new data
 * @param {Array} aircraft - Array of aircraft objects with {lat, lon, heading, [scale]}
 * @param {number} globalScale - Global scale multiplier for all icons
 */
function updateAircraft(aircraft, globalScale = currentIconScale) {
  currentAircraftData = aircraft;
  aircraftInstances.count = Math.min(aircraft.length, MAX_AIRCRAFT);

  for (let i = 0; i < aircraftInstances.count; i++) {
    const plane = aircraft[i];
    const matrix = createInstanceMatrix(
      plane.lat,
      plane.lon,
      plane.heading || 0,
      AIRCRAFT_ALTITUDE,
      (plane.scale || 1) * globalScale
    );
    aircraftInstances.setMatrixAt(i, matrix);
  }

  aircraftInstances.instanceMatrix.needsUpdate = true;
}

/**
 * Update icon scale based on camera distance
 * Only rebuilds matrices if scale changed significantly
 */
function updateIconScale(cameraDistance) {
  const baseDistance = 13;
  const newScale = cameraDistance / baseDistance;

  // Only update if scale changed by more than 5% to avoid constant rebuilding
  if (Math.abs(newScale - currentIconScale) / currentIconScale > 0.05) {
    currentIconScale = newScale;

    // Rebuild matrices with new scale
    if (currentShipsData.length > 0) {
      updateShips(currentShipsData, currentIconScale);
    }
    if (currentAircraftData.length > 0) {
      updateAircraft(currentAircraftData, currentIconScale);
    }
  }
}

// -----------------------------------------------------------------------------
// Demo Data - Generate sample ships and aircraft around the world
// -----------------------------------------------------------------------------
function generateDemoData() {
  // Generate demo ships (major shipping routes)
  const demoShips = [];
  const shippingRoutes = [
    { latRange: [30, 40], lonRange: [-80, -10], count: 50 }, // Atlantic
    { latRange: [0, 30], lonRange: [50, 100], count: 40 }, // Indian Ocean
    { latRange: [10, 50], lonRange: [100, 150], count: 60 }, // Pacific Asia
    { latRange: [30, 50], lonRange: [-160, -120], count: 30 }, // Pacific US
    { latRange: [50, 60], lonRange: [-10, 30], count: 25 }, // North Sea / Baltic
  ];

  for (const route of shippingRoutes) {
    for (let i = 0; i < route.count; i++) {
      demoShips.push({
        lat: route.latRange[0] + Math.random() * (route.latRange[1] - route.latRange[0]),
        lon: route.lonRange[0] + Math.random() * (route.lonRange[1] - route.lonRange[0]),
        heading: Math.random() * 360,
        scale: 0.8 + Math.random() * 0.4,
      });
    }
  }

  // Generate demo aircraft (major flight corridors)
  const demoAircraft = [];
  const flightCorridors = [
    { latRange: [35, 55], lonRange: [-130, -70], count: 80 }, // US domestic
    { latRange: [45, 65], lonRange: [-60, 30], count: 70 }, // Transatlantic
    { latRange: [20, 50], lonRange: [70, 140], count: 90 }, // Asia
    { latRange: [30, 50], lonRange: [-10, 40], count: 60 }, // Europe
    { latRange: [-40, 0], lonRange: [110, 160], count: 30 }, // Australia
  ];

  for (const corridor of flightCorridors) {
    for (let i = 0; i < corridor.count; i++) {
      demoAircraft.push({
        lat: corridor.latRange[0] + Math.random() * (corridor.latRange[1] - corridor.latRange[0]),
        lon: corridor.lonRange[0] + Math.random() * (corridor.lonRange[1] - corridor.lonRange[0]),
        heading: Math.random() * 360,
        scale: 0.8 + Math.random() * 0.4,
      });
    }
  }

  return { ships: demoShips, aircraft: demoAircraft };
}

// Initialize with demo data
const demoData = generateDemoData();
updateShips(demoData.ships);
updateAircraft(demoData.aircraft);

// Build the lat/lon grid (now that latLonToPosition is defined)
buildGrid();

// Export update functions for external use (e.g., real AIS/FlightAware data)
window.updateShips = updateShips;
window.updateAircraft = updateAircraft;

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
  earthMaterial.uniforms.uSunDirection.value
    .set(earthParameters.sunDirectionX, earthParameters.sunDirectionY, earthParameters.sunDirectionZ)
    .normalize();
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

  // Scale tracking icons based on camera distance
  // Icons should be smaller when zoomed in, larger when zoomed out
  const cameraDistance = camera.position.length();
  updateIconScale(cameraDistance);

  // Update OrbitControls - required for damping to work
  controls.update();

  // Render the scene from the camera's perspective
  renderer.render(scene, camera);

  // Request the next frame, creating an infinite loop
  window.requestAnimationFrame(tick);
};

// Start the animation loop
tick();
