/**
 * Core Three.js scene setup.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EARTH_RADIUS } from "../constants";

// Store viewport dimensions and pixel ratio for responsive rendering
export const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  // Cap pixel ratio at 2 to prevent performance issues on high-DPI displays
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

// Get reference to the WebGL canvas element defined in index.html
export const canvas = document.querySelector("canvas.webgl");

// Create the Three.js scene - this is the container for all 3D objects
export const scene = new THREE.Scene();

// Create a perspective camera
export const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.01, 100);
camera.position.x = 12;
camera.position.y = 5;
camera.position.z = 4;
scene.add(camera);

// Create OrbitControls for interactive camera movement
export const controls = new OrbitControls(camera, canvas as HTMLElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = EARTH_RADIUS + 0.00015; // ~500m altitude
controls.maxDistance = 62.8; // ~200,000 km from center
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;

// Create the WebGL renderer
export const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);
renderer.setClearColor("#000000");

// Clock tracks elapsed time for frame-independent animations
export const clock = new THREE.Clock();

// Handle window resize events to keep the scene responsive
window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);
});
