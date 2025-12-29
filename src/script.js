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
earthDayTexture.anisotropy = 8; // Improves texture quality at oblique angles

// Night texture - shows city lights on the dark side of Earth
const earthNightTexture = textureLoader.load("/earth/night.jpg");
earthNightTexture.colorSpace = THREE.SRGBColorSpace;
earthNightTexture.anisotropy = 8;

// Specular and clouds texture - contains cloud data and ocean specularity
// Red channel: specular intensity (oceans are reflective)
// Green channel: cloud coverage
const earthSpecularCloudsTexture = textureLoader.load("/earth/specularClouds.jpg");
earthSpecularCloudsTexture.anisotropy = 8;

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
// Parameters: radius=2, widthSegments=64, heightSegments=64
// Higher segment counts = smoother sphere but more vertices to process
const earthGeometry = new THREE.SphereGeometry(2, 64, 64);

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

  // Rotate the Earth around its Y-axis (vertical axis)
  // 0.1 radians per second = approximately 5.7 degrees per second
  // Full rotation takes about 63 seconds
  earth.rotation.y = elapsedTime * 0.01;

  // Update OrbitControls - required for damping to work
  controls.update();

  // Render the scene from the camera's perspective
  renderer.render(scene, camera);

  // Request the next frame, creating an infinite loop
  window.requestAnimationFrame(tick);
};

// Start the animation loop
tick();
