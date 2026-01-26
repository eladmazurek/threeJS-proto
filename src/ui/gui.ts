/**
 * This module is responsible for creating the lil-gui panel.
 * Organized into logical categories to reduce clutter.
 */
import GUI from "lil-gui";
import { state } from '../state';
import {
  aircraftFeedParams,
  setFeedMode,
  setCoverageMode,
  setInterpolation,
  startAircraftFeed,
  satelliteFeedParams,
  setSatelliteFeedMode,
  startAISFeed,
  setAISFeedMode,
  aisFeedParams,
} from '../feeds';
import type { CoverageMode } from '../feeds';

export function createGui(params) {
  const {
    textureParams,
    switchTexturePreset,
    colorModes,
    earthMaterial,
    nightBlendParams,
    earthParameters,
    atmosphereMaterial,
    cloudMaterial,
    updateSunDirection,
    sunParams,
    resetSimulatedTime,
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
    shipTrailMesh,
    aircraftTrailMesh,
    setH3MeshVisibility,
    hideH3Popup,
    deselectUnit,
    refreshH3PopupIfVisible,
    h3Material,
    h3LineMaterial,
    weatherParams,
    weatherMesh,
    updateWeatherLegend,
    setWeatherLayer,
    weatherMaterial,
    // Real Weather System (GIBS + Particles)
    gibsParams,
    particleParams,
    setGibsEnabled,
    setGibsLayer,
    setGibsOpacity,
    setParticlesEnabled,
    setFlowType,
    getWeatherSystemStatus,
    gibsOverlay,
    particleMesh,
    airportParams,
    airportGroup,
    updateAirportLabels,
    motionParams,
    cameraParams,
    setCameraTilt,
    tiltPresets,
    earthRotationParams,
    tilesParams,
    setTransitionAltitude,
    tilesRenderer,
    trailParams,
    updateTrailAttributes,
    shipTrailMaterial,
    aircraftTrailMaterial,
    unitCountParams,
    updateUnitCounts,
    generateSatelliteData,
    iconScaleParams,
    labelParams,
    labelMaterial,
  } = params;

  const gui = new GUI();
  gui.title("Controls");

  // ===========================================================================
  // 1. APPEARANCE
  // ===========================================================================
  const sceneFolder = gui.addFolder("Appearance");
  
  // Earth Textures & Colors
  sceneFolder
    .add(textureParams, "preset", params.TEXTURE_PRESETS)
    .name("Texture Preset")
    .onChange((value) => {
      switchTexturePreset(value);
    });

  const colorModeParams = { mode: "Normal" };
  sceneFolder
    .add(colorModeParams, "mode", Object.keys(colorModes))
    .name("Sensor Mode")
    .onChange((value) => {
      earthMaterial.uniforms.uColorMode.value = colorModes[value];
    });

  sceneFolder
    .add(nightBlendParams, "enabled")
    .name("Day/Night Cycle")
    .onChange((value) => {
      earthMaterial.uniforms.uNightBlend.value = value ? 1.0 : 0.0;
    });

  sceneFolder.add(earthRotationParams, "enabled").name("Earth Rotation");

  // Atmosphere Header
  sceneFolder.add({ h: "" }, "h").name("--- ATMOSPHERE ---").disable();
  sceneFolder.addColor(earthParameters, "atmosphereDayColor").name("Day Color").onChange(() => {
    earthMaterial.uniforms.uAtmosphereDayColor.value.set(earthParameters.atmosphereDayColor);
    atmosphereMaterial.uniforms.uDayColor.value.set(earthParameters.atmosphereDayColor);
  });
  sceneFolder.addColor(earthParameters, "atmosphereTwilightColor").name("Twilight Color").onChange(() => {
    earthMaterial.uniforms.uAtmosphereTwilightColor.value.set(earthParameters.atmosphereTwilightColor);
    atmosphereMaterial.uniforms.uTwilightColor.value.set(earthParameters.atmosphereTwilightColor);
  });
  sceneFolder.add(earthParameters, "atmosphereIntensity", 0, 1, 0.01).name("Intensity").onChange(() => {
    atmosphereMaterial.uniforms.uIntensity.value = earthParameters.atmosphereIntensity;
  });

  // Clouds Header
  sceneFolder.add({ h: "" }, "h").name("--- CLOUDS ---").disable();
  sceneFolder.add(earthParameters, "cloudsIntensity", 0, 1, 0.01).name("Opacity").onChange(() => {
    earthMaterial.uniforms.uCloudsIntensity.value = earthParameters.cloudsIntensity;
    cloudMaterial.uniforms.uCloudsIntensity.value = earthParameters.cloudsIntensity;
  });

  // Lighting Header
  sceneFolder.add({ h: "" }, "h").name("--- LIGHTING ---").disable();

  // Realistic sun controls
  let realisticSunCtrl: any = null;
  if (sunParams) {
    realisticSunCtrl = sceneFolder.add(sunParams, "realistic").name("Realistic Sun").onChange((value: boolean) => {
      if (value && resetSimulatedTime) {
        resetSimulatedTime();
      }
    });

    const timeMultiplierOptions = {
      "Real-time (1×)": 1,
      "1 min/sec (60×)": 60,
      "1 hr/sec (3600×)": 3600,
      "6 hr/sec": 21600,
      "24 hr/sec": 86400,
    };
    sceneFolder.add(sunParams, "timeMultiplier", timeMultiplierOptions).name("Time Speed");
  }

  // Manual sun controls - dragging turns off realistic mode
  const onManualSunChange = () => {
    if (sunParams && sunParams.realistic) {
      sunParams.realistic = false;
      if (realisticSunCtrl) realisticSunCtrl.updateDisplay();
    }
    updateSunDirection();
  };
  sceneFolder.add(earthParameters, "sunDirectionX", -1, 1, 0.01).name("Sun X (manual)").onChange(onManualSunChange);
  sceneFolder.add(earthParameters, "sunDirectionY", -1, 1, 0.01).name("Sun Y (manual)").onChange(onManualSunChange);
  sceneFolder.add(earthParameters, "sunDirectionZ", -1, 1, 0.01).name("Sun Z (manual)").onChange(onManualSunChange);
  
  // Specular Header
  sceneFolder.add({ h: "" }, "h").name("--- SPECULAR ---").disable();
  sceneFolder.add(earthParameters, "specularIntensity", 0, 3, 0.01).name("Intensity").onChange(() => {
      earthMaterial.uniforms.uSpecularIntensity.value = earthParameters.specularIntensity;
  });
  sceneFolder.add(earthParameters, "specularSharpness", 1, 128, 1).name("Sharpness").onChange(() => {
      earthMaterial.uniforms.uSpecularSharpness.value = earthParameters.specularSharpness;
  });


  // ===========================================================================
  // 2. LIVE DATA
  // ===========================================================================
  const feedFolder = gui.addFolder("Live Data");
  
  // OpenSky toggle
  const openskyState = { enabled: false };
  feedFolder
    .add(openskyState, "enabled")
    .name("OpenSky (Aircraft)")
    .onChange((value: boolean) => {
      setFeedMode(value ? "live" : "simulated");
      startAircraftFeed();
    });

  // Coverage mode
  const coverageOptions: Record<string, CoverageMode> = {
    "Worldwide": "worldwide",
    "Viewport Only": "viewport",
  };
  const coverageDisplay = { coverage: "Worldwide" };
  feedFolder
    .add(coverageDisplay, "coverage", Object.keys(coverageOptions))
    .name("Coverage")
    .onChange((value: string) => {
      setCoverageMode(coverageOptions[value]);
    });

  feedFolder
    .add(aircraftFeedParams, "interpolation")
    .name("Smooth Motion")
    .onChange((value: boolean) => {
      setInterpolation(value);
    });

  feedFolder.add(aircraftFeedParams, "status").name("Air Status").listen().disable();
  feedFolder.add(aircraftFeedParams, "trackedCount").name("Air Tracked").listen().disable();
  
  // CelesTrak toggle
  const celestrakState = { enabled: false };
  feedFolder
    .add(celestrakState, "enabled")
    .name("CelesTrak (Satellites)")
    .onChange((value: boolean) => {
      setSatelliteFeedMode(value ? "live" : "simulated");
    });

  // AIS toggle
  const aisState = { enabled: false };
  feedFolder
    .add(aisState, "enabled")
    .name("AIS Stream (Ships)")
    .onChange((value: boolean) => {
      setAISFeedMode(value ? "live" : "simulated");
    });
  
  feedFolder.add(aisFeedParams, "status").name("AIS Status").listen().disable();
  feedFolder.add(aisFeedParams, "trackedCount").name("AIS Tracked").listen().disable();

  feedFolder.add(satelliteFeedParams, "status").name("Sat Status").listen().disable();
  feedFolder.add(satelliteFeedParams, "trackedCount").name("Sat Tracked").listen().disable();


  // ===========================================================================
  // 3. SIMULATION
  // ===========================================================================
  const simulationFolder = gui.addFolder("Simulation");
  simulationFolder.close();

  // Use K notation
  const unitCountDisplay = {
    totalCountK: unitCountParams.totalCount / 1000,
    satelliteCountK: unitCountParams.satelliteCount / 1000,
  };

  // Unit Counts (Simulation)
  simulationFolder
    .add(unitCountDisplay, "totalCountK", 0.1, 500, 0.1)
    .name("Ships/Air (K)")
    .onChange((value) => {
      unitCountParams.totalCount = Math.round(value * 1000);
      updateUnitCounts();
      state.h3.lastResolution = -1;
    });
  simulationFolder
    .add(unitCountDisplay, "satelliteCountK", 0, 5, 0.05)
    .name("Satellites (K)")
    .onChange((value) => {
      unitCountParams.satelliteCount = Math.round(value * 1000);
      generateSatelliteData(unitCountParams.satelliteCount);
      state.h3.lastResolution = -1;
    });

  simulationFolder.add(motionParams, "shipSpeed", 0, 10, 0.1).name("Ship Speed");
  simulationFolder.add(motionParams, "aircraftSpeed", 0, 10, 0.1).name("Aircraft Speed");
  simulationFolder.add(motionParams, "satelliteSpeed", 0, 50, 1).name("Satellite Speed");
  simulationFolder.add(unitCountParams, "realisticRoutes").name("Cluster on Routes").onChange(() => {
      updateUnitCounts();
      state.h3.lastResolution = -1;
  });
  simulationFolder.add(iconScaleParams, "multiplier", 1.0, 3.0, 0.1).name("Icon Scale");


  // ===========================================================================
  // 4. FILTERS
  // ===========================================================================
  const filtersFolder = gui.addFolder("Filters");
  filtersFolder.close();
    
  filtersFolder.add(unitCountParams, "showShips").name("Show Ships").onChange((value) => {
      state.unitCounts.showShips = value;
      shipMesh.visible = value && !h3Params.enabled;
      shipTrailMesh.visible = value && trailParams.enabled && trailParams.shipTrails && !h3Params.enabled;
      state.h3.lastResolution = -1;
      refreshH3PopupIfVisible();
  });
  filtersFolder.add(unitCountParams, "showAircraft").name("Show Aircraft").onChange((value) => {
      state.unitCounts.showAircraft = value;
      aircraftMesh.visible = value && !h3Params.enabled;
      aircraftTrailMesh.visible = value && trailParams.enabled && trailParams.aircraftTrails && !h3Params.enabled;
      state.h3.lastResolution = -1;
      refreshH3PopupIfVisible();
  });
  filtersFolder.add(unitCountParams, "showDrones").name("Show Drones").onChange((value) => {
      state.unitCounts.showDrones = value;
      droneMesh.visible = value && !h3Params.enabled;
  });
  filtersFolder.add(unitCountParams, "showSatellites").name("Show Satellites").onChange((value) => {
      state.unitCounts.showSatellites = value;
      satelliteMesh.visible = value && !h3Params.enabled;
      state.h3.lastResolution = -1;
      refreshH3PopupIfVisible();
  });
  filtersFolder.add(unitCountParams, "showLEO").name("   ↳ LEO").onChange(refreshH3PopupIfVisible);
  filtersFolder.add(unitCountParams, "showMEO").name("   ↳ MEO").onChange(refreshH3PopupIfVisible);
  filtersFolder.add(unitCountParams, "showGEO").name("   ↳ GEO").onChange(refreshH3PopupIfVisible);

  // ===========================================================================
  // 5. ANNOTATIONS
  // ===========================================================================
  const visualsFolder = gui.addFolder("Annotations");
  visualsFolder.close();
  
  // -- Labels --
  visualsFolder.add(labelParams, "enabled").name("Enable Labels");
  visualsFolder.add(labelParams, "maxLabels", 5, 1000, 5).name("Max Labels");
  visualsFolder.add(labelParams, "fontSize", 0.005, 0.03, 0.001).name("Label Scale");
  visualsFolder.add(labelParams, "labelOffset", 0, 0.1, 0.005).name("Label Offset").onChange((v) => { if(labelMaterial) labelMaterial.uniforms.uLabelOffset.value = v; });
  visualsFolder.add(labelParams, "showShipLabels").name("Ship Labels");
  visualsFolder.add(labelParams, "showAircraftLabels").name("Aircraft Labels");
  visualsFolder.add(labelParams, "showSatelliteLabels").name("Sat Labels");
  visualsFolder.add(labelParams, "showDroneLabels").name("Drone Labels");
  
  // -- Trails --
  visualsFolder.add(trailParams, "enabled").name("Enable Trails").onChange(updateTrailAttributes);
  visualsFolder.add(trailParams, "shipTrails").name("Ship Trails").onChange(updateTrailAttributes);
  visualsFolder.add(trailParams, "aircraftTrails").name("Air Trails").onChange(updateTrailAttributes);
  visualsFolder.add(trailParams, "opacity", 0.1, 1.0, 0.1).name("Trail Opacity").onChange(() => {
    shipTrailMaterial.uniforms.uBaseOpacity.value = trailParams.opacity;
    aircraftTrailMaterial.uniforms.uBaseOpacity.value = trailParams.opacity;
  });


  // ===========================================================================
  // 6. OVERLAYS & GRIDS
  // ===========================================================================
  const overlaysFolder = gui.addFolder("Overlays & Grids");

  // Weather
  const weatherFolder = overlaysFolder.addFolder("Weather");
  weatherFolder.close();
  weatherFolder.add(weatherParams, "enabled").name("Show Weather").onChange(() => {
    weatherMesh.visible = weatherParams.enabled;
    updateWeatherLegend(weatherParams.layer, weatherParams.enabled);
  });
  weatherFolder.add(weatherParams, "layer", ["precipitation", "temperature", "wind", "pressure"]).name("Type").onChange((value) => {
    setWeatherLayer(value);
    updateWeatherLegend(value, weatherParams.enabled);
  });
  weatherFolder.add(weatherParams, "opacity", 0.1, 1.0, 0.05).name("Opacity").onChange(() => {
    weatherMaterial.uniforms.uOpacity.value = weatherParams.opacity;
  });
  weatherFolder.add(weatherParams, "animate").name("Animate");

  // Real Weather Data (NASA GIBS + Particle Flow)
  const realWeatherFolder = overlaysFolder.addFolder("Real Weather Data");
  realWeatherFolder.close();

  // GIBS Imagery
  const gibsFolder = realWeatherFolder.addFolder("NASA GIBS Imagery");
  gibsFolder.add(gibsParams, "enabled").name("Enable GIBS").onChange(async (value) => {
    await setGibsEnabled(value);
  });
  gibsFolder.add(gibsParams, "layer", ["clouds", "precipitation"]).name("Layer").onChange(async (value) => {
    await setGibsLayer(value);
  });
  gibsFolder.add(gibsParams, "opacity", 0.1, 1.0, 0.05).name("Opacity").onChange((value) => {
    setGibsOpacity(value);
  });

  // Particle Flow
  const flowFolder = realWeatherFolder.addFolder("Flow Visualization");
  flowFolder.add(particleParams, "enabled").name("Enable Particles").onChange((value) => {
    setParticlesEnabled(value);
  });
  flowFolder.add(particleParams, "flowType", ["wind", "ocean", "both"]).name("Flow Type").onChange((value) => {
    setFlowType(value);
  });
  flowFolder.add(particleParams, "speedScale", 0.1, 5.0, 0.1).name("Speed Scale");
  flowFolder.add(particleParams, "opacity", 0.1, 1.0, 0.05).name("Opacity");

  // Lat/Lon Grid
  const gridFolder = overlaysFolder.addFolder("Lat/Lon Grid");
  gridFolder.close();
  gridFolder.add(gridParams, "visible").name("Show Grid").onChange(updateGridVisibility);
  gridFolder.add(gridParams, "opacity", 0.05, 0.8, 0.01).name("Opacity").onChange(updateGridOpacity);
  gridFolder.add(gridParams, "latInterval", [10, 15, 30, 45]).name("Lat Interval").onChange(buildGrid);
  gridFolder.add(gridParams, "lonInterval", [10, 15, 30, 45]).name("Lon Interval").onChange(buildGrid);

  // H3 Grid
  const h3Folder = overlaysFolder.addFolder("H3 Hex Grid");
  h3Folder.close();
  h3Folder.add(h3Params, "enabled").name("Show H3").onChange(() => {
    if (h3Params.enabled) {
      state.h3.lastResolution = -1;
      deselectUnit();
      // Hide traffic when heatmap is on
      shipMesh.visible = false;
      aircraftMesh.visible = false;
      satelliteMesh.visible = false;
      droneMesh.visible = false;
      shipTrailMesh.visible = false;
      aircraftTrailMesh.visible = false;
    } else {
      shipMesh.visible = unitCountParams.showShips;
      aircraftMesh.visible = unitCountParams.showAircraft;
      satelliteMesh.visible = unitCountParams.showSatellites;
      droneMesh.visible = unitCountParams.showDrones;
      shipTrailMesh.visible = unitCountParams.showShips && trailParams.enabled && trailParams.shipTrails;
      aircraftTrailMesh.visible = unitCountParams.showAircraft && trailParams.enabled && trailParams.aircraftTrails;
      setH3MeshVisibility(false);
      hideH3Popup();
    }
  });
  h3Folder.add(h3Params, "resolution", 1, 4, 1).name("Resolution").onChange(() => {
    hideH3Popup();
    state.h3.lastResolution = -1;
  });
  h3Folder.add(h3Params, "opacity", 0.2, 1.0, 0.1).name("Opacity").onChange(() => {
    h3Material.opacity = h3Params.opacity * 0.85;
    h3LineMaterial.opacity = h3Params.opacity * 0.4;
  });

  // Airports
  const airportsFolder = overlaysFolder.addFolder("Airports");
  airportsFolder.close();
  airportsFolder.add(airportParams, "visible").name("Show Airports").onChange(() => {
    airportGroup.visible = airportParams.visible;
  });
  airportsFolder.add(airportParams, "showLabels").name("Show Labels").onChange(updateAirportLabels);
  airportsFolder.add(airportParams, "markerSize", 0.02, 0.12, 0.005).name("Marker Size");

  // Google 3D Tiles
  const tilesFolder = overlaysFolder.addFolder("Google 3D Tiles");
  tilesFolder.close();
  tilesFolder.add(tilesParams, "enabled").name("Enable Tiles");
  tilesFolder.add(tilesParams, "forceShow").name("Force Show");
  tilesFolder.add(tilesParams, "transitionAltitude", 100, 2000, 50).name("Transition Alt").onChange(setTransitionAltitude);


  // ===========================================================================
  // 6. CAMERA & VIEW
  // ===========================================================================
  const cameraFolder = gui.addFolder("Camera Control");
  
  cameraFolder.add(cameraParams, "tiltAngle", 0, 90, 1).name("Tilt Angle").onChange(setCameraTilt);
  
  const presets = cameraFolder.addFolder("Presets");
  presets.close();
  presets.add(tiltPresets, "Center").name("● Center");
  presets.add(tiltPresets, "Slight Tilt").name("◢ Slight Tilt");
  presets.add(tiltPresets, "Tracking").name("→ Tracking");
  presets.add(tiltPresets, "Horizon").name("— Horizon");

  // Close all top-level folders
  sceneFolder.close();
  feedFolder.close();
  simulationFolder.close();
  filtersFolder.close();
  visualsFolder.close();
  overlaysFolder.close();
  cameraFolder.close();

  // Close the main GUI
  gui.close();

  return gui;
}
