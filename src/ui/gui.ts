/**
 * This module is responsible for creating the lil-gui panel.
 * It is a large function due to the high number of parameters it controls.
 * In the future, this could be broken down further.
 */
import GUI from "lil-gui";
import { state } from '../state';

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
    perfStats,
  } = params;

  const gui = new GUI();
  gui.title("Controls");

  // Texture preset folder
  const textureFolder = gui.addFolder("Textures");
  textureFolder
    .add(textureParams, "preset", params.TEXTURE_PRESETS)
    .name("Preset")
    .onChange((value) => {
      switchTexturePreset(value);
    });

  // Color mode options
  const colorModeParams = { mode: "Normal" };
  textureFolder
    .add(colorModeParams, "mode", Object.keys(colorModes))
    .name("Color Mode")
    .onChange((value) => {
      earthMaterial.uniforms.uColorMode.value = colorModes[value];
    });

  // Day/Night blend toggle
  textureFolder
    .add(nightBlendParams, "enabled")
    .name("Day/Night Blend")
    .onChange((value) => {
      earthMaterial.uniforms.uNightBlend.value = value ? 1.0 : 0.0;
    });

  // Earth rotation toggle
  textureFolder.add(earthRotationParams, "enabled").name("Earth Rotation");

  // Atmosphere folder
  const atmosphereFolder = gui.addFolder("Atmosphere");
  atmosphereFolder.close();
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
  cloudsFolder.close();
  cloudsFolder.add(earthParameters, "cloudsIntensity", 0, 1, 0.01).onChange(() => {
    earthMaterial.uniforms.uCloudsIntensity.value = earthParameters.cloudsIntensity;
    cloudMaterial.uniforms.uCloudsIntensity.value = earthParameters.cloudsIntensity;
  });

  // Sun glint/specular folder
  const specularFolder = gui.addFolder("Sun Glint");
  specularFolder.close();
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
  sunFolder.close();
  sunFolder.add(earthParameters, "sunDirectionX", -1, 1, 0.01).onChange(updateSunDirection);
  sunFolder.add(earthParameters, "sunDirectionY", -1, 1, 0.01).onChange(updateSunDirection);
  sunFolder.add(earthParameters, "sunDirectionZ", -1, 1, 0.01).onChange(updateSunDirection);

  // Grid folder
  const gridFolder = gui.addFolder("Lat/Lon Grid");
  gridFolder.close();
  gridFolder.add(gridParams, "visible").name("Show Grid").onChange(() => {
    updateGridVisibility();
  });
  gridFolder.add(gridParams, "opacity", 0.05, 0.8, 0.01).name("Opacity").onChange(() => {
    updateGridOpacity();
  });
  gridFolder.add(gridParams, "latInterval", [10, 15, 30, 45]).name("Lat Interval").onChange(() => {
    buildGrid();
  });
  gridFolder.add(gridParams, "lonInterval", [10, 15, 30, 45]).name("Lon Interval").onChange(() => {
    buildGrid();
  });

  // H3 Grid folder
  const h3Folder = gui.addFolder("H3 Hex Grid");
  h3Folder.close();
  h3Folder.add(h3Params, "enabled").name("Show H3 Grid").onChange(() => {
    if (h3Params.enabled) {
      state.h3.lastResolution = -1; // Force rebuild
      // Close any open unit selection panel
      deselectUnit();
      // Hide flying units when H3 heatmap is shown
      shipMesh.visible = false;
      aircraftMesh.visible = false;
      satelliteMesh.visible = false;
      droneMesh.visible = false;
      shipTrailMesh.visible = false;
      aircraftTrailMesh.visible = false;
    } else {
      // Show flying units when H3 is disabled (respecting individual toggles)
      shipMesh.visible = unitCountParams.showShips;
      aircraftMesh.visible = unitCountParams.showAircraft;
      satelliteMesh.visible = unitCountParams.showSatellites;
      droneMesh.visible = unitCountParams.showDrones;
      shipTrailMesh.visible = unitCountParams.showShips && trailParams.enabled && trailParams.shipTrails;
      aircraftTrailMesh.visible = unitCountParams.showAircraft && trailParams.enabled && trailParams.aircraftTrails;
      // Hide H3 meshes, highlight, and popup
      setH3MeshVisibility(false);
      hideH3Popup();
    }
  });
  h3Folder.add(h3Params, "resolution", 1, 4, 1).name("Resolution").onChange(() => {
    hideH3Popup(); // Hide popup when resolution changes
    state.h3.lastResolution = -1; // Force rebuild on resolution change
  });
  h3Folder.add(h3Params, "opacity", 0.2, 1.0, 0.1).name("Opacity").onChange(() => {
    h3Material.opacity = h3Params.opacity * 0.85;
    h3LineMaterial.opacity = h3Params.opacity * 0.4;
  });
  h3Folder.add(h3Params, "updateInterval", 0.5, 5.0, 0.1).name("Update Interval (s)");

  // Weather folder
  const weatherFolder = gui.addFolder("Weather");
  weatherFolder.close();
  weatherFolder.add(weatherParams, "enabled").name("Show Weather").onChange(() => {
    weatherMesh.visible = weatherParams.enabled;
    updateWeatherLegend(weatherParams.layer, weatherParams.enabled);
  });
  weatherFolder.add(weatherParams, "layer", ["precipitation", "temperature", "wind", "pressure"]).name("Layer").onChange((value) => {
    setWeatherLayer(value);
    updateWeatherLegend(value, weatherParams.enabled);
  });
  weatherFolder.add(weatherParams, "opacity", 0.1, 1.0, 0.05).name("Opacity").onChange(() => {
    weatherMaterial.uniforms.uOpacity.value = weatherParams.opacity;
  });
  weatherFolder.add(weatherParams, "animate").name("Animate");

  // Airports folder
  const airportsFolder = gui.addFolder("Airports");
  airportsFolder.close();
  airportsFolder.add(airportParams, "visible").name("Show Airports").onChange(() => {
    airportGroup.visible = airportParams.visible;
  });
  airportsFolder.add(airportParams, "showLabels").name("Show Labels").onChange(() => {
    updateAirportLabels();
  });
  airportsFolder.add(airportParams, "markerSize", 0.02, 0.12, 0.005).name("Size");

  // Motion/Speed folder - simplified controls
  const motionFolder = gui.addFolder("Motion");
  motionFolder.close();
  motionFolder.add(motionParams, "shipSpeed", 0, 10, 0.1).name("Ship Speed");
  motionFolder.add(motionParams, "aircraftSpeed", 0, 10, 0.1).name("Aircraft Speed");
  motionFolder.add(motionParams, "satelliteSpeed", 0, 50, 1).name("Satellite Speed");

  // Camera/View folder
  const cameraFolder = gui.addFolder("Camera");
  cameraFolder.close();
  cameraFolder
    .add(cameraParams, "tiltAngle", 0, 90, 1)
    .name("Tilt (degrees)")
    .onChange((value) => {
      setCameraTilt(value);
    });

  // Tilt presets (imported from camera/controls module)
  cameraFolder.add(tiltPresets, "Center").name("● Center (default)");
  cameraFolder.add(tiltPresets, "Slight Tilt").name("◢ Slight Tilt");
  cameraFolder.add(tiltPresets, "Tracking").name("→ Tracking View");
  cameraFolder.add(tiltPresets, "Horizon").name("— Horizon");

  // Google 3D Tiles folder
  const tilesFolder = gui.addFolder("3D Tiles");
  tilesFolder.close();
  tilesFolder
    .add(tilesParams, "enabled")
    .name("Enable Tiles");
  tilesFolder
    .add(tilesParams, "forceShow")
    .name("Force Show (any alt)")
    .onChange(() => {
      // Force an immediate crossfade update when toggled
    });
  tilesFolder
    .add(tilesParams, "transitionAltitude", 100, 2000, 50)
    .name("Transition Alt (km)")
    .onChange((value) => {
      setTransitionAltitude(value);
    });

  // Add debug controls for tile loading (only if tilesRenderer exists)
  const tilesDebugParams = {
    errorTarget: 10,
    maxDepth: 30,
  };
  tilesFolder
    .add(tilesDebugParams, "errorTarget", 0.5, 10, 0.5)
    .name("Error Target (px)")
    .onChange((value) => {
      if (tilesRenderer) tilesRenderer.errorTarget = value;
    });
  tilesFolder
    .add(tilesDebugParams, "maxDepth", 10, 50, 1)
    .name("Max Depth")
    .onChange((value) => {
      if (tilesRenderer) tilesRenderer.maxDepth = value;
    });

  // Trails folder
  const trailsFolder = gui.addFolder("Trails");
  trailsFolder.close();
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
      state.h3.lastResolution = -1; // Force H3 rebuild
    });
  unitsFolder
    .add(unitCountDisplay, "satelliteCountK", 0, 5, 0.05)
    .name("Satellites (K)")
    .onChange((value) => {
      unitCountParams.satelliteCount = Math.round(value * 1000);
      generateSatelliteData(unitCountParams.satelliteCount);
      state.h3.lastResolution = -1; // Force H3 rebuild
    });
  unitsFolder
    .add(unitCountParams, "realisticRoutes")
    .name("Cluster on Routes")
    .onChange(() => {
      updateUnitCounts();
      state.h3.lastResolution = -1; // Force H3 rebuild
    });
  unitsFolder
    .add(motionParams, "motionUpdateInterval", 0, 200, 10)
    .name("Update Interval (ms)")
    .onChange(() => {
      // Reset throttle timer when interval changes
      state.lastMotionUpdateTime = 0;
    });
  unitsFolder
    .add(iconScaleParams, "multiplier", 1.0, 3.0, 0.1)
    .name("Icon Size");
  unitsFolder
    .add(unitCountParams, "showShips")
    .name("Ships")
    .onChange((value) => {
      state.unitCounts.showShips = value;
      shipMesh.visible = value && !h3Params.enabled;
      shipTrailMesh.visible = value && trailParams.enabled && trailParams.shipTrails && !h3Params.enabled;
      state.h3.lastResolution = -1; // Force H3 rebuild
      refreshH3PopupIfVisible();
    });
  unitsFolder
    .add(unitCountParams, "showAircraft")
    .name("Aircraft")
    .onChange((value) => {
      state.unitCounts.showAircraft = value;
      aircraftMesh.visible = value && !h3Params.enabled;
      aircraftTrailMesh.visible = value && trailParams.enabled && trailParams.aircraftTrails && !h3Params.enabled;
      state.h3.lastResolution = -1; // Force H3 rebuild
      refreshH3PopupIfVisible();
    });
  unitsFolder
    .add(unitCountParams, "showSatellites")
    .name("Satellites")
    .onChange((value) => {
      state.unitCounts.showSatellites = value;
      satelliteMesh.visible = value && !h3Params.enabled;
      state.h3.lastResolution = -1; // Force H3 rebuild
      refreshH3PopupIfVisible();
    });
  unitsFolder
    .add(unitCountParams, "showDrones")
    .name("Drones/UAV")
    .onChange((value) => {
      state.unitCounts.showDrones = value;
      droneMesh.visible = value && !h3Params.enabled;
    });

  // Unit Labels folder
  const labelsFolder = gui.addFolder("Unit Labels");
  labelsFolder
    .add(labelParams, "enabled")
    .name("Show Labels");
  labelsFolder
    .add(labelParams, "maxLabels", 100, 1000, 50)
    .name("Max Labels");
  labelsFolder
    .add(labelParams, "showShipLabels")
    .name("Ship Labels");
  labelsFolder
    .add(labelParams, "showAircraftLabels")
    .name("Aircraft Labels");
  labelsFolder
    .add(labelParams, "showDroneLabels")
    .name("Drone Labels");
  labelsFolder
    .add(labelParams, "showSatelliteLabels")
    .name("Satellite Labels");
  labelsFolder
    .add(labelParams, "fontSize", 0.005, 0.03, 0.001)
    .name("Label Scale");
  labelsFolder
    .add(labelParams, "labelOffset", 0, 0.1, 0.005)
    .name("Label Offset")
    .onChange((value) => {
      if (labelMaterial) labelMaterial.uniforms.uLabelOffset.value = value;
    });
  labelsFolder
    .add(labelParams, "debugMode", { "Normal": 0, "Show UV": 1, "Show Texture": 2, "Solid Color": 3 })
    .name("Debug Mode")
    .onChange((value) => {
      if (labelMaterial) labelMaterial.uniforms.uDebugMode.value = parseFloat(value);
    });

  // Performance stats display
  unitsFolder.add(perfStats, "fps").name("FPS").listen().disable();
  unitsFolder.add(perfStats, "frameMs").name("Frame (ms)").listen().disable();

  return gui;
}
