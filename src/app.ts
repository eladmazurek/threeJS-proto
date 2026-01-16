/**
 * Earth Shaders - Main Application Orchestrator
 */
import * as THREE from "three";
import { scene, camera, renderer, controls, clock, canvas } from "./core/scene.js";
import { createMainOverlay } from './ui/main-overlay';
import { createGui } from './ui/gui';
import { updateMotionSimulation, motionParams } from './simulation/motion';
import { generateDemoData, generateSatelliteData, generateDroneData, updateUnitCounts, unitCountParams } from './simulation/demo-data';
import { shipMesh, aircraftMesh, satelliteMesh, droneMesh, shipGeometry, aircraftGeometry, satelliteGeometry, droneGeometry } from './units/visuals';
import { initLabelSystem, updateLabelAssignments, updateLabelPositions, labelParams, labelMaterial } from './labels/system';
import { update as updateTrails, trailParams, createShipTrailMesh, createAircraftTrailMesh, initTrailHistory } from './units/trails';
import { initSelectionHandling, updateSelectedUnitInfo } from './selection/index';
import { createEarth, createAtmosphere, DEFAULT_EARTH_PARAMS, switchTexturePreset as switchEarthTexturePreset, TEXTURE_PRESETS } from './scene/earth';
import { createCloudLayer } from './scene/clouds';
import { createWeather, weatherParams, setWeatherLayer } from './scene/weather';
import { initGrid, buildGrid, gridParams, updateGridOpacity, updateGridVisibility } from './scene/grid';
import { initAirports, setAirportRotation, updateAirportScales, airportParams } from './scene/airports';
import { state } from './state';
import { updateIconScale, setAttributeDependencies, updateShipAttributes, updateAircraftAttributes, updateSatelliteAttributes, updateDroneAttributes, iconScaleParams } from './units/attributes';
import { initSelectionVisuals, setVisualsDependencies, updateSelectionRing, setOrbitLineRotation, selectionRingMaterial } from './selection/visuals';
import { initGoogleTiles, updateTilesCrossfade, updateTilesAttribution, getTilesPreloadAltitude, tilesRenderer, tilesParams } from './scene/tiles';
import { updateTelemetry, updateWeatherLegend } from './ui/telemetry';
import { h3Params, setH3Dependencies, initH3ClickHandler, updateH3Grid, processH3BuildChunk, updateH3PopupPeriodic, getH3HighlightMesh, setH3MeshVisibility, hideH3Popup } from './scene/h3-grid';
import { EARTH_RADIUS } from "./constants.js";

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

    // Set up H3 grid dependencies
    setH3Dependencies({
        getEarth: () => earthRefs.mesh,
        getCamera: () => camera,
        getCanvas: () => canvas,
        getShipSimState: () => state.ships,
        getAircraftSimState: () => state.aircraft,
        getSatelliteSimState: () => state.satellites,
        getUnitCountParams: () => unitCountParams,
    });
    initH3ClickHandler();

    const GOOGLE_TILES_API_KEY = import.meta.env.VITE_GOOGLE_TILES_API_KEY;
    initGoogleTiles(scene, camera, renderer, GOOGLE_TILES_API_KEY);

    generateDemoData();
    generateDroneData();
    generateSatelliteData();

    const trailHistory = initTrailHistory(state.ships.length, state.aircraft.length);
    state.trails = trailHistory;

    initSelectionHandling(camera, canvas, earthRefs.mesh, h3Params);

    // FPS tracking (must be declared before createGui so .listen() works)
    const perfStats = { fps: 0, ships: 0, aircraft: 0, frameMs: 0 };

    const gui = createGui({
        textureParams: { preset: 'Standard' },
        TEXTURE_PRESETS: Object.keys(TEXTURE_PRESETS),
        switchTexturePreset: (value) => switchEarthTexturePreset(value, earthRefs.material, cloudRefs.material, renderer),
        colorModes: { "Normal": 0, "Grayscale (Tactical)": 1, "Night Vision": 2, "Thermal": 3, "Hologram": 4 },
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
        shipMesh, aircraftMesh, satelliteMesh, droneMesh,
        shipTrailMesh: shipTrailRefs.mesh,
        aircraftTrailMesh: aircraftTrailRefs.mesh,
        setH3MeshVisibility,
        hideH3Popup,
        refreshH3PopupIfVisible: () => {},
        h3Material: null,
        h3LineMaterial: null,
        weatherParams,
        weatherMesh: weatherRefs.mesh,
        updateWeatherLegend,
        setWeatherLayer,
        weatherMaterial: weatherRefs.material,
        airportParams,
        airportGroup: null,
        updateAirportLabels: () => {},
        motionParams,
        cameraParams: {tiltAngle: 0},
        setCameraTilt: () => {},
        tiltPresets: {Center: () => {}, "Slight Tilt": () => {}, Tracking: () => {}, Horizon: () => {}},
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

    const tick = () => {
        frameStartTime = performance.now();

        const elapsedTime = clock.getElapsedTime();
        const cameraDistance = camera.position.length();

        const altitudeKm = (camera.position.length() - EARTH_RADIUS) * (6371 / EARTH_RADIUS);
        const rotationFactor = Math.max(0, Math.min(1, (altitudeKm - 9000) / 3000));
        if (rotationFactor > 0) earthRefs.mesh.rotation.y += 0.0003 * rotationFactor;
        
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
        updateTrails(state.trails, state.ships, state.aircraft, shipTrailRefs, aircraftTrailRefs);
        controls.update();
        updateTelemetry({ cameraDistance, cameraPosition: camera.position, earth: earthRefs.mesh, unitCounts: unitCountParams });
        updateAirportScales(cameraDistance);
        updateLabelAssignments(camera);
        updateLabelPositions(earthRotY);
        updateH3Grid(cameraDistance, elapsedTime);
        processH3BuildChunk();
        updateH3PopupPeriodic(elapsedTime);
        
        const h3Highlight = getH3HighlightMesh();
        if (h3Highlight && h3Highlight.visible && h3Highlight.material) {
            h3Highlight.material.opacity = 0.6 + 0.4 * Math.sin(elapsedTime * 4);
        }
        
        updateSelectedUnitInfo();
        updateSelectionRing();
        selectionRingMaterial.uniforms.uTime.value = elapsedTime;
        
        if (tilesRenderer && tilesParams.enabled) {
            const altitude = camera.position.length() - EARTH_RADIUS;
            if (altitude < getTilesPreloadAltitude()) {
              camera.updateMatrixWorld();
              tilesRenderer.update();
            }
            updateTilesCrossfade();
            updateTilesAttribution();
        }

        renderer.render(scene, camera);

        // Track actual frame work time (not inter-frame time)
        const frameTime = performance.now() - frameStartTime;
        frameTimes.push(frameTime);
        if (frameTimes.length > 60) frameTimes.shift();
        perfStats.frameMs = Math.round(frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length * 10) / 10;

        // Update FPS counter every second
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            perfStats.fps = Math.round(frameCount * 1000 / (now - lastFpsTime));
            perfStats.ships = state.ships.length;
            perfStats.aircraft = state.aircraft.length;
            frameCount = 0;
            lastFpsTime = now;
        }

        window.requestAnimationFrame(tick);
    };

    tick();
}

main();
