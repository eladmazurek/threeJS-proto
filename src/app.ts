/**
 * Earth Shaders - Main Application Orchestrator
 */
import * as THREE from "three";
import { scene, camera, renderer, controls, clock, canvas } from "./core/scene.js";
import { initCameraModule, updateCameraControlSpeeds, cameraParams, tiltPresets, setCameraTilt } from "./camera/controls";
import { createMainOverlay } from "./ui/main-overlay";
import { createGui } from "./ui/gui";
import { updateMotionSimulation, motionParams } from "./simulation/motion";
import { generateDemoData, generateSatelliteData, generateDroneData, updateUnitCounts, unitCountParams } from "./simulation/demo-data";
import { shipMesh, aircraftMesh, satelliteMesh, droneMesh, shipGeometry, aircraftGeometry, satelliteGeometry, droneGeometry } from "./units/visuals";
import { initLabelSystem, updateLabelAssignments, updateLabelPositions, labelParams, labelMaterial } from "./labels/system";
import { update as updateTrails, trailParams, createShipTrailMesh, createAircraftTrailMesh, initTrailHistory } from "./units/trails";
import { initSelectionHandling, updateSelectedUnitInfo, deselectUnit } from "./selection/index";
import { createEarth, createAtmosphere, DEFAULT_EARTH_PARAMS, switchTexturePreset as switchEarthTexturePreset, TEXTURE_PRESETS } from "./scene/earth";
import { createCloudLayer } from "./scene/clouds";
import { createWeather, weatherParams, setWeatherLayer } from "./scene/weather";
import { initGrid, buildGrid, gridParams, updateGridOpacity, updateGridVisibility } from "./scene/grid";
import { initAirports, setAirportRotation, updateAirportScales, updateAirportLabels, airportParams, airportGroup } from "./scene/airports";
import { state } from "./state";
import {
  updateIconScale,
  setAttributeDependencies,
  updateShipAttributes,
  updateAircraftAttributes,
  updateSatelliteAttributes,
  updateDroneAttributes,
  iconScaleParams,
} from "./units/attributes";
import { initSelectionVisuals, setVisualsDependencies, updateSelectionRing, setOrbitLineRotation, selectionRingMaterial } from "./selection/visuals";
import {
  initGoogleTiles,
  updateTilesCrossfade,
  updateTilesAttribution,
  getTilesPreloadAltitude,
  getMinCameraAltitude,
  tilesRenderer,
  tilesParams,
  setTilesDependencies,
} from "./scene/tiles";
import { updateTelemetry, updateWeatherLegend } from "./ui/telemetry";
import {
  h3Params,
  setH3Dependencies,
  initH3ClickHandler,
  updateH3Grid,
  processH3BuildChunk,
  updateH3PopupPeriodic,
  getH3HighlightMesh,
  setH3MeshVisibility,
  hideH3Popup,
  h3Material,
  h3LineMaterial,
} from "./scene/h3-grid";
import { EARTH_RADIUS } from "./constants.js";
import {
  initWeatherSystem,
  updateWeatherSystem,
  gibsParams,
  particleParams,
  setGibsEnabled,
  setGibsLayer,
  setGibsOpacity,
  setParticlesEnabled,
  setFlowType,
  getWeatherSystemStatus,
} from "./weather";
import { 
  initAircraftFeedController, 
  startAircraftFeed, 
  syncLiveFeedState, 
  initSatelliteFeedController, 
  startSatelliteFeed, 
  syncSatelliteFeedState,
  initAISFeedController, // Added
  startAISFeed,          // Added
  syncAISFeedState,      // Added
  satelliteFeedParams,   // Added
} from "./feeds";
import {
  getSimulatedDate,
  resetSimulatedTime,
  getEarthRotation,
  getSeasonalSunDirection,
  DEFAULT_SUN_PARAMS,
  type SunParams,
} from "./utils/solar";

function main() {
  createMainOverlay();

  // Performance tracking elements
  const perfFpsEl = document.getElementById("perf-fps");
  const perfMsEl = document.getElementById("perf-ms");
  const perfMemEl = document.getElementById("perf-mem");
  const perfMemContainer = document.getElementById("perf-mem-container");
  const hasMemoryApi = (performance as any).memory !== undefined;
  if (!hasMemoryApi && perfMemContainer) perfMemContainer.style.display = "none";

  const earthRefs = createEarth();
  const atmosphereRefs = createAtmosphere();
  const cloudRefs = createCloudLayer(earthRefs.specularCloudsTexture, new THREE.Vector3().fromArray(Object.values(DEFAULT_EARTH_PARAMS).slice(4, 7)));
  const weatherRefs = createWeather();

  scene.add(earthRefs.mesh, atmosphereRefs.mesh);
  earthRefs.mesh.add(cloudRefs.mesh, weatherRefs.mesh);

  // Sun position (realistic by default, based on current date/time)
  const sunParams: SunParams = { ...DEFAULT_SUN_PARAMS };
  const sunDirection = new THREE.Vector3();

  // Initialize sun direction from current date (seasonal position)
  getSeasonalSunDirection(new Date(), sunDirection);

  // Function to update sun direction across all materials
  const updateAllSunDirection = (dir: THREE.Vector3) => {
    earthRefs.material.uniforms.uSunDirection.value.copy(dir);
    atmosphereRefs.material.uniforms.uSunDirection.value.copy(dir);
    cloudRefs.material.uniforms.uSunDirection.value.copy(dir);
  };

  // Apply initial sun direction
  updateAllSunDirection(sunDirection);

  // Real Weather System (GIBS + Particle Flow)
  const realWeatherRefs = initWeatherSystem(renderer, sunDirection);
  earthRefs.mesh.add(realWeatherRefs.gibsOverlay);
  scene.add(realWeatherRefs.particleMesh);

  const shipTrailRefs = createShipTrailMesh();
  const aircraftTrailRefs = createAircraftTrailMesh();
  scene.add(shipTrailRefs.mesh, aircraftTrailRefs.mesh);

  scene.add(shipMesh, aircraftMesh, satelliteMesh, droneMesh);

  initGrid(earthRefs.mesh);
  buildGrid();
  initAirports(scene);
  initLabelSystem(scene);
  initSelectionVisuals(scene);
  initCameraModule(camera, controls);

  // Set up attribute dependencies for GPU buffer updates
  setAttributeDependencies({
    shipGeometry,
    aircraftGeometry,
    satelliteGeometry,
    droneGeometry,
    getShipSimState: () => state.ships,
    getAircraftSimState: () => state.aircraft,
    getSatelliteSimState: () => state.satellites,
    getDroneSimState: () => state.drones,
  });

  // Set up selection visuals dependencies
  setVisualsDependencies({
    getEarthRotationY: () => earthRefs.mesh.rotation.y,
    getCameraDistance: () => camera.position.length(),
    getShipState: (index) => state.ships[index],
    getAircraftState: (index) => state.aircraft[index],
    getSatelliteState: (index) => state.satellites[index],
    getDroneState: (index) => state.drones[index],
  });

  // H3 Grid
  setH3Dependencies({
    getEarth: () => earthRefs.mesh,
    getCamera: () => camera,
    getCanvas: () => canvas as unknown as HTMLCanvasElement,
    getShipSimState: () => state.ships,
    getAircraftSimState: () => state.aircraft,
    getSatelliteSimState: () => state.satellites,
    getUnitCountParams: () => unitCountParams,
  });
  initH3ClickHandler();

  const GOOGLE_TILES_API_KEY = import.meta.env.VITE_GOOGLE_TILES_API_KEY;
  initGoogleTiles(scene, camera, renderer, GOOGLE_TILES_API_KEY);
  setTilesDependencies({ earth: earthRefs.mesh, earthMaterial: earthRefs.material, cloud: cloudRefs.mesh, atmosphere: atmosphereRefs.mesh, camera });

  generateDemoData();
  generateDroneData();

  // Initialize aircraft feed controller (for switching between simulated and live data)
  initAircraftFeedController({
    camera,
    getEarthRotation: () => earthRefs.mesh.rotation.y,
    updateAircraftAttributes,
    // Show/hide simulated-only units when switching feed modes
    onUnitVisibilityChange: (showSimulatedUnits: boolean) => {
      // Drones are simulated-only
      droneMesh.visible = showSimulatedUnits && unitCountParams.showDrones;
      
      // Also hide labels for simulated-only units
      labelParams.showDroneLabels = showSimulatedUnits;
      
      // Update state.unitCounts so click detection respects visibility
      state.unitCounts.showDrones = showSimulatedUnits && unitCountParams.showDrones;
    },
  });
  // Start with simulated feed (default)
  startAircraftFeed();

  // Initialize satellite feed controller
  initSatelliteFeedController({
    updateSatelliteAttributes,
    onUnitVisibilityChange: (showSimulatedUnits: boolean) => {
      // Drones are simulated-only
      droneMesh.visible = showSimulatedUnits && unitCountParams.showDrones;
      
      // Labels for drones
      labelParams.showDroneLabels = showSimulatedUnits;
      // Unit counts for click detection
      state.unitCounts.showDrones = showSimulatedUnits && unitCountParams.showDrones;
    },
  });
  startSatelliteFeed();

  // Initialize AIS feed controller
  initAISFeedController({
    updateShipAttributes,
    onUnitVisibilityChange: (showSimulated: boolean) => {
      // Drones are simulated-only
      droneMesh.visible = showSimulated && unitCountParams.showDrones;
      // Labels for drones
      labelParams.showDroneLabels = showSimulated;
      // Unit counts
      state.unitCounts.showDrones = showSimulated && unitCountParams.showDrones;
      
      // HIDE SIMULATED SATELLITES when Live AIS is on (per user request)
      // If we are in "Live AIS" mode (showSimulated = false), and Satellites are "Simulated", hide them.
      if (!showSimulated && satelliteFeedParams.mode === "simulated") {
          satelliteMesh.visible = false;
          // Note: We don't change state.unitCounts.showSatellites because that would break the GUI toggle state.
          // We just hide the mesh temporarily.
          // Ideally, we should also hide labels?
          // labelParams.showSatelliteLabels = false; // Maybe too aggressive?
      } else {
          // Restore visibility based on params
          satelliteMesh.visible = unitCountParams.showSatellites;
      }
    },
  });
  startAISFeed();

  const trailHistory = initTrailHistory(state.ships.length, state.aircraft.length);
  state.trails = trailHistory;

  initSelectionHandling(camera, canvas, earthRefs.mesh, h3Params);

  // Earth rotation toggle
  const earthRotationParams = { enabled: true };

  const gui = createGui({
    textureParams: { preset: "Standard" },
    TEXTURE_PRESETS: Object.keys(TEXTURE_PRESETS),
    switchTexturePreset: (value) => switchEarthTexturePreset(value, earthRefs.material, cloudRefs.material, renderer),
    colorModes: { Normal: 0, "Grayscale (Tactical)": 1, "Night Vision": 2, Thermal: 3, Hologram: 4 },
    earthMaterial: earthRefs.material,
    nightBlendParams: { enabled: true },
    earthParameters: DEFAULT_EARTH_PARAMS,
    atmosphereMaterial: atmosphereRefs.material,
    cloudMaterial: cloudRefs.material,
    // Manual sun direction update (when realistic mode is off)
    updateSunDirection: () => {
      const dir = new THREE.Vector3(
        DEFAULT_EARTH_PARAMS.sunDirectionX,
        DEFAULT_EARTH_PARAMS.sunDirectionY,
        DEFAULT_EARTH_PARAMS.sunDirectionZ
      ).normalize();
      updateAllSunDirection(dir);
    },
    // Realistic sun params
    sunParams,
    resetSimulatedTime: () => resetSimulatedTime(sunParams),
    sunDirection,
    gridParams,
    updateGridVisibility,
    updateGridOpacity,
    buildGrid,
    h3Params,
    state,
    shipMesh,
    aircraftMesh,
    satelliteMesh,
    droneMesh,
    shipTrailMesh: shipTrailRefs.mesh,
    aircraftTrailMesh: aircraftTrailRefs.mesh,
    setH3MeshVisibility,
    hideH3Popup,
    deselectUnit,
    refreshH3PopupIfVisible: () => {},
    h3Material,
    h3LineMaterial,
    weatherParams,
    weatherMesh: weatherRefs.mesh,
    updateWeatherLegend,
    setWeatherLayer,
    weatherMaterial: weatherRefs.material,
    // Real Weather System (GIBS + Particles)
    gibsParams,
    particleParams,
    setGibsEnabled,
    setGibsLayer,
    setGibsOpacity,
    setParticlesEnabled,
    setFlowType,
    getWeatherSystemStatus,
    gibsOverlay: realWeatherRefs.gibsOverlay,
    particleMesh: realWeatherRefs.particleMesh,
    airportParams,
    airportGroup,
    updateAirportLabels,
    motionParams,
    cameraParams,
    setCameraTilt,
    tiltPresets,
    earthRotationParams,
    tilesParams,
    setTransitionAltitude: () => {},
    tilesRenderer: null,
    trailParams,
    updateTrailAttributes: () => {},
    shipTrailMaterial: shipTrailRefs.material,
    aircraftTrailMaterial: aircraftTrailRefs.material,
    unitCountParams,
    updateUnitCounts,
    generateSatelliteData,
    iconScaleParams,
    labelParams,
    labelMaterial,
  });

  // FPS tracking state
  let lastFpsTime = performance.now();
  let frameStartTime = 0;
  let frameCount = 0;
  const frameTimes: number[] = [];
  let lastFrameTimestamp = performance.now(); // For accurate deltaTime calculation

  // Debug timing (temporary)
  let debugTiming = { motion: 0, trails: 0, labels: 0, h3: 0, other: 0, gpu: 0, count: 0 };

  const tick = () => {
    frameStartTime = performance.now();
    let t0 = frameStartTime,
      t1;

    const elapsedTime = clock.getElapsedTime();
    const cameraDistance = camera.position.length();

    // Calculate simulated time (for both sun position and earth rotation)
    const currentTime = performance.now();
    const frameDeltaTime = (currentTime - lastFrameTimestamp) / 1000;
    lastFrameTimestamp = currentTime;

    // Clamp deltaTime to prevent jumps on first frame or after tab switch
    const clampedDeltaMs = Math.min(frameDeltaTime * 1000, 100);
    const simDate = getSimulatedDate(sunParams, sunParams.realistic ? clampedDeltaMs : 0);

    // Earth rotation based on simulated time (realistic rotation at all altitudes)
    let earthRotY: number;
    if (sunParams.realistic) {
      // Realistic: Earth rotation derived from simulated time
      earthRotY = getEarthRotation(simDate);
      earthRefs.mesh.rotation.y = earthRotY;

      // Sun direction based on season only (Earth rotation handles daily cycle)
      getSeasonalSunDirection(simDate, sunDirection);
      updateAllSunDirection(sunDirection);
    } else {
      // Manual mode: no automatic rotation, user controls sun direction
      earthRotY = earthRefs.mesh.rotation.y;
    }
    state.earthRotation.y = earthRotY;
    setAirportRotation(earthRotY);
    // Sync unit/trail mesh rotation with earth (avoid forEach to reduce GC)
    shipMesh.rotation.y = earthRotY;
    aircraftMesh.rotation.y = earthRotY;
    satelliteMesh.rotation.y = earthRotY;
    droneMesh.rotation.y = earthRotY;
    shipTrailRefs.mesh.rotation.y = earthRotY;
    aircraftTrailRefs.mesh.rotation.y = earthRotY;
    setOrbitLineRotation(earthRotY);

    if (weatherParams.enabled && weatherParams.animate) weatherRefs.material.uniforms.uTime.value = elapsedTime;

    // Update real weather system (GIBS + particle flow)
    updateWeatherSystem(frameDeltaTime, elapsedTime);

    updateIconScale(cameraDistance);
    updateMotionSimulation(elapsedTime, { updateShipAttributes, updateAircraftAttributes, updateSatelliteAttributes, updateDroneAttributes });
    // Sync live feed state (handles interpolation + GPU update for live mode)
    syncLiveFeedState();
    syncSatelliteFeedState();
    syncAISFeedState(); // Added
    t1 = performance.now();
    debugTiming.motion += t1 - t0;
    t0 = t1;
    updateTrails(state.trails, state.ships, state.aircraft, shipTrailRefs, aircraftTrailRefs);
    t1 = performance.now();
    debugTiming.trails += t1 - t0;
    t0 = t1;

    // Adjust rotation/zoom speeds based on altitude (see camera/controls.ts for details)
    updateCameraControlSpeeds();

    controls.update();
    updateTelemetry({
      cameraDistance,
      cameraPosition: camera.position,
      earth: earthRefs.mesh,
      unitCounts: {
        ships: state.ships.length,
        aircraft: state.aircraft.length,
        satellites: state.satellites.length,
        drones: state.drones.length,
        showShips: state.unitCounts.showShips,
        showAircraft: state.unitCounts.showAircraft,
        showSatellites: state.unitCounts.showSatellites,
        showDrones: state.unitCounts.showDrones,
      },
    });
    updateAirportScales(cameraDistance);
    updateLabelAssignments(camera);
    updateLabelPositions(earthRotY);
    t1 = performance.now();
    debugTiming.labels += t1 - t0;
    t0 = t1;
    updateH3Grid(cameraDistance, elapsedTime);
    processH3BuildChunk();
    updateH3PopupPeriodic(elapsedTime);
    t1 = performance.now();
    debugTiming.h3 += t1 - t0;
    t0 = t1;

    const h3Highlight = getH3HighlightMesh();
    if (h3Highlight && h3Highlight.visible && h3Highlight.material) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 4);
      (h3Highlight.material as THREE.Material).opacity = 0.6 + 0.4 * pulse;
    }

    updateSelectedUnitInfo();
    updateSelectionRing();
    selectionRingMaterial.uniforms.uTime.value = elapsedTime;

    // Always update crossfade and attribution - they handle state when tiles are disabled
    updateTilesCrossfade();
    updateTilesAttribution();

    if (tilesRenderer && tilesParams.enabled) {
      const altitude = camera.position.length() - EARTH_RADIUS;
      // Always update tiles when forceShow is true, otherwise only below preload altitude
      if (tilesParams.forceShow || altitude < getTilesPreloadAltitude()) {
        camera.updateMatrixWorld();
        tilesRenderer.update();
      }
    }

    // Enforce minimum distance from Earth center based on tiles state
    // When tiles are disabled, restrict to 1000km altitude
    const minDistanceFromCenter = EARTH_RADIUS + getMinCameraAltitude();
    const distanceFromCenter = camera.position.length();
    if (distanceFromCenter < minDistanceFromCenter) {
      camera.position.normalize().multiplyScalar(minDistanceFromCenter);
    }

    // Dynamic near plane based on altitude
    const altitude = distanceFromCenter - EARTH_RADIUS;
    const nearPlane = Math.max(0.00001, Math.min(0.01, altitude * 0.1));
    camera.near = nearPlane;
    camera.updateProjectionMatrix();

        t1 = performance.now();

        debugTiming.other += t1 - t0; // selection/tiles/misc work

        const renderStart = performance.now();

        renderer.render(scene, camera);

        debugTiming.gpu += performance.now() - renderStart;

        debugTiming.count++;

    

        // Track frame work time
    const frameTime = performance.now() - frameStartTime;
    frameTimes.push(frameTime);
    if (frameTimes.length > 60) frameTimes.shift();
    frameCount++;

    // Update debug stats every 500ms
    const now = performance.now();
    if (now - lastFpsTime >= 500) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

      if (perfFpsEl) perfFpsEl.textContent = fps.toString();
      if (perfMsEl) perfMsEl.textContent = avgFrameTime.toFixed(1);

      if (hasMemoryApi && perfMemEl) {
        const mem = Math.round((performance as any).memory.usedJSHeapSize / 1048576);
        perfMemEl.textContent = mem.toString();
      }

      // Log debug timing
      if (debugTiming.count > 0) {
        const n = debugTiming.count;
        //console.log(`[Timing] motion: ${(debugTiming.motion/n).toFixed(2)}ms, trails: ${(debugTiming.trails/n).toFixed(2)}ms, labels: ${(debugTiming.labels/n).toFixed(2)}ms, h3: ${(debugTiming.h3/n).toFixed(2)}ms, other: ${(debugTiming.other/n).toFixed(2)}ms, gpu: ${(debugTiming.gpu/n).toFixed(2)}ms`);
        debugTiming = { motion: 0, trails: 0, labels: 0, h3: 0, other: 0, gpu: 0, count: 0 };
      }
      frameCount = 0;
      lastFpsTime = now;
    }

    window.requestAnimationFrame(tick);
  };

  tick();
}

main();
