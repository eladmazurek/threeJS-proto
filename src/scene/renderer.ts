/**
 * Scene & Renderer Setup
 *
 * Creates and configures the Three.js scene, camera, renderer, and controls.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EARTH_RADIUS } from "../constants";

// =============================================================================
// CANVAS & VIEWPORT
// =============================================================================

/** Viewport dimensions */
export const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

/** Get the WebGL canvas element */
export function getCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Canvas element with class 'webgl' not found");
  }
  return canvas;
}

// =============================================================================
// SCENE
// =============================================================================

/** Create and configure the Three.js scene */
export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  return scene;
}

// =============================================================================
// CAMERA
// =============================================================================

/** Camera configuration */
export interface CameraConfig {
  fov: number;
  near: number;
  far: number;
  initialDistance: number;
}

const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  fov: 25,
  near: 0.001,
  far: 100,
  initialDistance: 6,
};

/** Create and configure the perspective camera */
export function createCamera(
  config: Partial<CameraConfig> = {}
): THREE.PerspectiveCamera {
  const { fov, near, far, initialDistance } = {
    ...DEFAULT_CAMERA_CONFIG,
    ...config,
  };

  const camera = new THREE.PerspectiveCamera(
    fov,
    sizes.width / sizes.height,
    near,
    far
  );

  camera.position.z = initialDistance;
  return camera;
}

// =============================================================================
// RENDERER
// =============================================================================

/** Create and configure the WebGL renderer */
export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true,
  });

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  return renderer;
}

// =============================================================================
// CONTROLS
// =============================================================================

/** Create and configure OrbitControls */
export function createControls(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement
): OrbitControls {
  const controls = new OrbitControls(camera, canvas);

  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = EARTH_RADIUS + 0.01;
  controls.maxDistance = 15;
  controls.enablePan = false;

  return controls;
}

// =============================================================================
// RAYCASTER
// =============================================================================

/** Create a raycaster for picking */
export function createRaycaster(): THREE.Raycaster {
  return new THREE.Raycaster();
}

/** Normalized mouse position for raycasting */
export const mouse = new THREE.Vector2();

// =============================================================================
// RESIZE HANDLING
// =============================================================================

/** Update sizes and camera aspect ratio on window resize */
export function handleResize(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer
): void {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

/** Set up the resize event listener */
export function setupResizeListener(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer
): void {
  window.addEventListener("resize", () => handleResize(camera, renderer));
}

// =============================================================================
// CLOCK
// =============================================================================

/** Create a clock for animation timing */
export function createClock(): THREE.Clock {
  return new THREE.Clock();
}

// =============================================================================
// NEAR PLANE ADJUSTMENT
// =============================================================================

/**
 * Dynamically adjust camera near plane based on distance to Earth.
 * Prevents z-fighting at close range while maintaining precision at distance.
 */
export function adjustNearPlane(
  camera: THREE.PerspectiveCamera,
  cameraDistance: number
): void {
  // Close to surface: use very small near plane
  // Far from surface: can use larger near plane for better precision
  const distanceFromSurface = cameraDistance - EARTH_RADIUS;
  const nearPlane = Math.max(0.0001, distanceFromSurface * 0.01);

  if (Math.abs(camera.near - nearPlane) > 0.0001) {
    camera.near = nearPlane;
    camera.updateProjectionMatrix();
  }
}
