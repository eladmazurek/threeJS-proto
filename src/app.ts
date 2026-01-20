/**
 * Earth Shaders - Main Application Orchestrator
 */
import * as THREE from "three";
import { scene, camera, renderer, controls, clock, canvas } from "./core/scene.js";
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
import { initAircraftFeedController, startAircraftFeed, syncLiveFeedState, initSatelliteFeedController, startSatelliteFeed, syncSatelliteFeedState } from "./feeds";

function main() {
  createMainOverlay();

  const earthRefs = createEarth();
  const atmosphereRefs = createAtmosphere();
  const cloudRefs = createCloudLayer(earthRefs.specularCloudsTexture, new THREE.Vector3().fromArray(Object.values(DEFAULT_EARTH_PARAMS).slice(4, 7)));
  const weatherRefs = createWeather();

  scene.add(earthRefs.mesh, atmosphereRefs.mesh);
  earthRefs.mesh.add(cloudRefs.mesh, weatherRefs.mesh);

  const shipTrailRefs = createShipTrailMesh();
  const aircraftTrailRefs = createAircraftTrailMesh();
  scene.add(shipTrailRefs.mesh, aircraftTrailRefs.mesh);

  scene.add(shipMesh, aircraftMesh, satelliteMesh, droneMesh);

  initGrid(earthRefs.mesh);
  buildGrid();
  initAirports(scene);
  initLabelSystem(scene);
  initSelectionVisuals(scene);

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
      // Ships, drones are simulated-only (satellites handled by their own feed now)
      shipMesh.visible = showSimulatedUnits && unitCountParams.showShips;
      droneMesh.visible = showSimulatedUnits && unitCountParams.showDrones;
      // Trails for ships (aircraft trails stay since we have live aircraft)
      shipTrailRefs.mesh.visible = showSimulatedUnits && unitCountParams.showShips && trailParams.enabled && trailParams.shipTrails;
      // Also hide labels for simulated-only units
      labelParams.showShipLabels = showSimulatedUnits;
      labelParams.showDroneLabels = showSimulatedUnits;
      // Update state.unitCounts so click detection respects visibility
      state.unitCounts.showShips = showSimulatedUnits && unitCountParams.showShips;
      state.unitCounts.showDrones = showSimulatedUnits && unitCountParams.showDrones;
    },
  });
  // Start with simulated feed (default)
  startAircraftFeed();

  // Initialize satellite feed controller
  initSatelliteFeedController({
    updateSatelliteAttributes,
    onUnitVisibilityChange: (showSimulatedUnits: boolean) => {
      // Ships and drones are simulated-only
      shipMesh.visible = showSimulatedUnits && unitCountParams.showShips;
      droneMesh.visible = showSimulatedUnits && unitCountParams.showDrones;
      // Trails for ships
      shipTrailRefs.mesh.visible = showSimulatedUnits && unitCountParams.showShips && trailParams.enabled && trailParams.shipTrails;
      // Labels
      labelParams.showShipLabels = showSimulatedUnits;
      labelParams.showDroneLabels = showSimulatedUnits;
      // Unit counts for click detection
      state.unitCounts.showShips = showSimulatedUnits && unitCountParams.showShips;
      state.unitCounts.showDrones = showSimulatedUnits && unitCountParams.showDrones;
    },
  });
  startSatelliteFeed();

  const trailHistory = initTrailHistory(state.ships.length, state.aircraft.length);
  state.trails = trailHistory;

  initSelectionHandling(camera, canvas, earthRefs.mesh, h3Params);

  // FPS tracking (must be declared before createGui so .listen() works)
  const perfStats = { fps: 0, ships: 0, aircraft: 0, frameMs: 0 };

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
    updateSunDirection: () => {},
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
    airportParams,
    airportGroup,
    updateAirportLabels,
    motionParams,
    cameraParams: { tiltAngle: 0 },
    setCameraTilt: () => {},
    tiltPresets: { Center: () => {}, "Slight Tilt": () => {}, Tracking: () => {}, Horizon: () => {} },
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
    perfStats,
  });

  // FPS tracking state
  let lastFpsTime = performance.now();
  let frameCount = 0;
  let frameStartTime = 0;
  const frameTimes: number[] = [];

  // Debug timing (temporary)
  let debugTiming = { motion: 0, trails: 0, labels: 0, h3: 0, other: 0, gpu: 0, count: 0 };

  const tick = () => {
    frameStartTime = performance.now();
    let t0 = frameStartTime,
      t1;

    const elapsedTime = clock.getElapsedTime();
    const cameraDistance = camera.position.length();

    // Earth rotation (only at high altitude, when enabled)
    const scaleFactor = 6371 / EARTH_RADIUS;
    const altitudeKm = (camera.position.length() - EARTH_RADIUS) * (6371 / EARTH_RADIUS);
    if (earthRotationParams.enabled) {
      const rotationFactor = Math.max(0, Math.min(1, (altitudeKm - 9000) / 3000));
      if (rotationFactor > 0) earthRefs.mesh.rotation.y += 0.0003 * rotationFactor;
    }

    const earthRotY = earthRefs.mesh.rotation.y;
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

    updateIconScale(cameraDistance);
    updateMotionSimulation(elapsedTime, { updateShipAttributes, updateAircraftAttributes, updateSatelliteAttributes, updateDroneAttributes });
    // Sync live feed state (handles interpolation + GPU update for live mode)
    syncLiveFeedState();
    syncSatelliteFeedState();
    t1 = performance.now();
    debugTiming.motion += t1 - t0;
    t0 = t1;
    updateTrails(state.trails, state.ships, state.aircraft, shipTrailRefs, aircraftTrailRefs);
    t1 = performance.now();
    debugTiming.trails += t1 - t0;
    t0 = t1;

    // Adjust rotation speed based on zoom level
    const zoomFactor = (cameraDistance - controls.minDistance) / (controls.maxDistance - controls.minDistance);
    // specific non-linear curve for smoother close-range control
    const controlScale = zoomFactor * zoomFactor;

    // Additional slowdown below 1500km altitude (proportional, capped at 50%)
    const lowAltFactor = altitudeKm < 1500 ? 0.5 + (altitudeKm / 1500) * 0.5 : 2.0;

    controls.rotateSpeed = (0.05 + controlScale * 0.95) * lowAltFactor;
    controls.panSpeed = (0.01 + controlScale * 0.99) * lowAltFactor;
    controls.zoomSpeed = lowAltFactor;

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
        showShips: unitCountParams.showShips,
        showAircraft: unitCountParams.showAircraft,
        showSatellites: unitCountParams.showSatellites,
        showDrones: unitCountParams.showDrones,
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

    // Track actual frame work time (not inter-frame time)
    const frameTime = performance.now() - frameStartTime;
    frameTimes.push(frameTime);
    if (frameTimes.length > 60) frameTimes.shift();
    perfStats.frameMs = Math.round((frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length) * 10) / 10;

    // Update FPS counter every second
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      perfStats.fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      perfStats.ships = state.ships.length;
      perfStats.aircraft = state.aircraft.length;
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
