/**
 * This module contains the core logic for the GPU-accelerated label system.
 */
import * as THREE from 'three';
import { state } from '../state';
import {
  MAX_LABEL_CHARS,
  CHARS_PER_LINE,
  CHAR_SET,
  ATLAS_SIZE,
  ATLAS_CHAR_SIZE,
  generateFontAtlas,
  formatShipLabel,
  formatAircraftLabel,
  formatDroneLabel,
  formatSatelliteLabel,
  LABEL_VERTEX_SHADER,
  LABEL_FRAGMENT_SHADER,
} from './index';
import { MAX_CANDIDATES, EARTH_RADIUS, SHIP_ALTITUDE, AIRCRAFT_ALTITUDE } from '../constants';
import { getCameraLatLon } from '../utils/coordinates';
import { getH3Worker } from '../scene/h3-grid';
import { unitCountParams } from '../simulation/demo-data';

export const labelParams = {
  enabled: true,
  maxLabels: 100,
  updateInterval: 100,
  fontSize: 0.015,
  labelOffset: 0.025,
  showShipLabels: true,
  showAircraftLabels: true,
  showDroneLabels: true,
  showSatelliteLabels: true,
  debugMode: 0,
  h3Resolution: 3,
};

const labelVisibility = {
  shipIndices: [],
  aircraftIndices: [],
  droneIndices: [],
  satelliteIndices: [],
  lastQuery: 0,
  queryInterval: 200,
  lastIndexBuild: -Infinity,
  indexBuildInterval: 1000,
  pendingQuery: false,
};

const labelAssignments = {
  slots: [],
  count: 0,
};

const workerArrayPool = {
  shipLats: null, shipLons: null,
  aircraftLats: null, aircraftLons: null,
  droneLats: null, droneLons: null,
  satelliteLats: null, satelliteLons: null,
  shipCapacity: 0, aircraftCapacity: 0, droneCapacity: 0, satelliteCapacity: 0,
};

/**
 * Helper to mark buffer attribute for partial update.
 * Uses addUpdateRange to avoid uploading the entire buffer.
 * @param attr - The instanced buffer attribute
 * @param count - Number of elements to upload (in component units, e.g., 3 for vec3)
 */
function markLabelAttributeForUpdate(attr: THREE.InstancedBufferAttribute, count: number): void {
  if ((attr as any).clearUpdateRanges && (attr as any).addUpdateRange) {
    (attr as any).clearUpdateRanges();
    (attr as any).addUpdateRange(0, count);
  }
  attr.needsUpdate = true;
}

function ensureWorkerArrayCapacity() {
  const { ships, aircraft, drones, satellites } = state;
  if (ships.length > workerArrayPool.shipCapacity) {
    const newCapacity = Math.ceil(ships.length * 1.2);
    workerArrayPool.shipLats = new Float32Array(newCapacity);
    workerArrayPool.shipLons = new Float32Array(newCapacity);
    workerArrayPool.shipCapacity = newCapacity;
  }
  if (aircraft.length > workerArrayPool.aircraftCapacity) {
    const newCapacity = Math.ceil(aircraft.length * 1.2);
    workerArrayPool.aircraftLats = new Float32Array(newCapacity);
    workerArrayPool.aircraftLons = new Float32Array(newCapacity);
    workerArrayPool.aircraftCapacity = newCapacity;
  }
  if (drones.length > workerArrayPool.droneCapacity) {
    const newCapacity = Math.ceil(drones.length * 1.2);
    workerArrayPool.droneLats = new Float32Array(newCapacity);
    workerArrayPool.droneLons = new Float32Array(newCapacity);
    workerArrayPool.droneCapacity = newCapacity;
  }
  if (satellites.length > workerArrayPool.satelliteCapacity) {
    const newCapacity = Math.ceil(satellites.length * 1.2);
    workerArrayPool.satelliteLats = new Float32Array(newCapacity);
    workerArrayPool.satelliteLons = new Float32Array(newCapacity);
    workerArrayPool.satelliteCapacity = newCapacity;
  }
}

const cameraState = {
  lastLat: 0, lastLon: 0, lastDist: 0,
  threshold: 2.0,
};

function cameraMovedSignificantly(camera, earthRotation) {
  const { lat, lon, distance } = getCameraLatLon(camera, earthRotation);
  const dLat = Math.abs(lat - cameraState.lastLat);
  const dLon = Math.abs(lon - cameraState.lastLon);
  const dDist = Math.abs(distance - cameraState.lastDist);
  const zoomScale = Math.max(0.5, distance / 5);
  const threshold = cameraState.threshold * zoomScale;
  if (dLat > threshold || dLon > threshold || dDist > 0.5) {
    cameraState.lastLat = lat;
    cameraState.lastLon = lon;
    cameraState.lastDist = distance;
    return true;
  }
  return false;
}

function requestLabelIndexBuild() {
    ensureWorkerArrayCapacity();
    const { ships, aircraft, drones, satellites } = state;
    const { shipLats, shipLons, aircraftLats, aircraftLons, droneLats, droneLons, satelliteLats, satelliteLons } = workerArrayPool;

    // Only fill arrays if they exist and have data
    if (shipLats && ships.length > 0) {
      for (let i = 0; i < ships.length; i++) { shipLats[i] = ships[i].lat; shipLons[i] = ships[i].lon; }
    }
    if (aircraftLats && aircraft.length > 0) {
      for (let i = 0; i < aircraft.length; i++) { aircraftLats[i] = aircraft[i].lat; aircraftLons[i] = aircraft[i].lon; }
    }
    if (droneLats && drones.length > 0) {
      for (let i = 0; i < drones.length; i++) { droneLats[i] = drones[i].lat; droneLons[i] = drones[i].lon; }
    }
    if (satelliteLats && satellites.length > 0) {
      for (let i = 0; i < satellites.length; i++) { satelliteLats[i] = satellites[i].lat; satelliteLons[i] = satellites[i].lon; }
    }

    getH3Worker().postMessage({
      type: 'buildLabelIndex',
      data: {
        resolution: labelParams.h3Resolution,
        shipLats: shipLats ? shipLats.subarray(0, ships.length) : null,
        shipLons: shipLons ? shipLons.subarray(0, ships.length) : null,
        aircraftLats: aircraftLats ? aircraftLats.subarray(0, aircraft.length) : null,
        aircraftLons: aircraftLons ? aircraftLons.subarray(0, aircraft.length) : null,
        droneLats: droneLats ? droneLats.subarray(0, drones.length) : null,
        droneLons: droneLons ? droneLons.subarray(0, drones.length) : null,
        satelliteLats: satelliteLats ? satelliteLats.subarray(0, satellites.length) : null,
        satelliteLons: satelliteLons ? satelliteLons.subarray(0, satellites.length) : null,
      }
    });
    labelVisibility.lastIndexBuild = performance.now();
}
  
function requestVisibleUnits(camera, earthRotation) {
    if (labelVisibility.pendingQuery) return;
    const { lat, lon, distance } = getCameraLatLon(camera, earthRotation);
    const zoomFactor = Math.max(0.1, (distance - EARTH_RADIUS) / EARTH_RADIUS);
    const baseRing = Math.floor(zoomFactor * 15);
    const ringPadding = 4;
    const ringSize = Math.max(4, Math.min(25, baseRing + ringPadding));
  
    getH3Worker().postMessage({
      type: 'queryVisibleUnits',
      data: {
        centerLat: lat,
        centerLon: lon,
        ringSize,
        includeShips: labelParams.showShipLabels && unitCountParams.showShips,
        includeAircraft: labelParams.showAircraftLabels && unitCountParams.showAircraft,
        includeDrones: labelParams.showDroneLabels && unitCountParams.showDrones,
        includeSatellites: labelParams.showSatelliteLabels && unitCountParams.showSatellites,
      }
    });
    labelVisibility.pendingQuery = true;
    labelVisibility.lastQuery = performance.now();
}

const CHAR_TO_INDEX = new Uint8Array(128);
CHAR_SET.split('').forEach((c, i) => { CHAR_TO_INDEX[c.charCodeAt(0)] = i; });
const CHAR_UV_U = new Float32Array(CHAR_SET.length);
const CHAR_UV_V = new Float32Array(CHAR_SET.length);
const CHAR_UV_W = ATLAS_CHAR_SIZE / ATLAS_SIZE;
const CHAR_UV_H = ATLAS_CHAR_SIZE / ATLAS_SIZE;
const charsPerRow = Math.floor(ATLAS_SIZE / ATLAS_CHAR_SIZE);
for (let i = 0; i < CHAR_SET.length; i++) {
  const col = i % charsPerRow;
  const row = Math.floor(i / charsPerRow);
  CHAR_UV_U[i] = col * ATLAS_CHAR_SIZE / ATLAS_SIZE;
  CHAR_UV_V[i] = row * ATLAS_CHAR_SIZE / ATLAS_SIZE;
}
const fontAtlasTexture = generateFontAtlas();

const totalInstances = labelParams.maxLabels * MAX_LABEL_CHARS;
const labelBuffer = {
  positions: new Float32Array(totalInstances * 3),
  charUVs: new Float32Array(totalInstances * 4),
  colors: new Float32Array(totalInstances * 3),
  scales: new Float32Array(totalInstances),
  charIndices: new Float32Array(totalInstances),
  activeCount: 0,
};
for (let label = 0; label < labelParams.maxLabels; label++) {
  for (let char = 0; char < MAX_LABEL_CHARS; char++) {
    labelBuffer.charIndices[label * MAX_LABEL_CHARS + char] = char;
  }
}

const _tempVec3 = new THREE.Vector3();
let labelGeometry = null;
export let labelMaterial = null;
export let labelMesh = null;
let _labelVisibilityVersion = 0;

export function initLabelSystem(scene) {
    labelGeometry = new THREE.InstancedBufferGeometry();
    const quadPositions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
    labelGeometry.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
    const posAttr = new THREE.InstancedBufferAttribute(labelBuffer.positions, 3);
    const uvAttr = new THREE.InstancedBufferAttribute(labelBuffer.charUVs, 4);
    const colorAttr = new THREE.InstancedBufferAttribute(labelBuffer.colors, 3);
    const scaleAttr = new THREE.InstancedBufferAttribute(labelBuffer.scales, 1);
    const charIdxAttr = new THREE.InstancedBufferAttribute(labelBuffer.charIndices, 1);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    uvAttr.setUsage(THREE.DynamicDrawUsage);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    scaleAttr.setUsage(THREE.DynamicDrawUsage);
    labelGeometry.setAttribute('aLabelPos', posAttr);
    labelGeometry.setAttribute('aCharUV', uvAttr);
    labelGeometry.setAttribute('aColor', colorAttr);
    labelGeometry.setAttribute('aScale', scaleAttr);
    labelGeometry.setAttribute('aCharIndex', charIdxAttr);
    labelGeometry.userData = { posAttr, uvAttr, colorAttr, scaleAttr };
    labelMaterial = new THREE.ShaderMaterial({
      vertexShader: LABEL_VERTEX_SHADER,
      fragmentShader: LABEL_FRAGMENT_SHADER,
      uniforms: {
        uAtlas: { value: fontAtlasTexture },
        uCharWidth: { value: 0.7 },
        uCharHeight: { value: 1.0 },
        uCharsPerLine: { value: 12.0 },
        uCameraDistance: { value: 5.0 },
        uLabelOffset: { value: labelParams.labelOffset },
        uAtlasSize: { value: new THREE.Vector2(ATLAS_SIZE, ATLAS_SIZE) },
        uSmoothing: { value: 0.2 },
        uOutlineWidth: { value: 0.1 },
        uOutlineColor: { value: new THREE.Color(0x000000) },
        uDebugMode: { value: 0.0 },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
    labelMesh.frustumCulled = false;
    labelMesh.renderOrder = 10;
    labelMesh.visible = labelParams.enabled;
    scene.add(labelMesh);
    labelGeometry.instanceCount = 0;
    labelGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10);
  
    const _h3Worker = getH3Worker();
    const _origWorkerHandler = _h3Worker.onmessage;
    _h3Worker.onmessage = function(e) {
      const { type, data } = e.data;
      if (type === 'visibleUnitsResult') {
        labelVisibility.shipIndices = data.shipIndices;
        labelVisibility.aircraftIndices = data.aircraftIndices;
        labelVisibility.droneIndices = data.droneIndices || [];
        labelVisibility.satelliteIndices = data.satelliteIndices || [];
        labelVisibility.pendingQuery = false;
        _labelVisibilityVersion++;
      }
      if (type === 'densityResult' && _origWorkerHandler) {
        _origWorkerHandler.call(_h3Worker, e);
      }
    };
}
  
function latLonToWorld(lat, lon, altitude, earthRotY, outVec) {
    const phi = (90 - lat) * 0.017453292519943295;
    const theta = (lon + 180) * 0.017453292519943295;
    const radius = EARTH_RADIUS + altitude;
    const sinPhi = Math.sin(phi);
    outVec.x = -radius * sinPhi * Math.cos(theta);
    outVec.y = radius * Math.cos(phi);
    outVec.z = radius * sinPhi * Math.sin(theta);
    const cosR = Math.cos(earthRotY);
    const sinR = Math.sin(earthRotY);
    const x = outVec.x;
    outVec.x = x * cosR + outVec.z * sinR;
    outVec.z = -x * sinR + outVec.z * cosR;
}
  
function encodeTextToBuffer(text, labelIdx) {
    const baseIdx = labelIdx * MAX_LABEL_CHARS * 4;
    for (let c = 0; c < MAX_LABEL_CHARS; c++) {
      const charCode = c < text.length ? text.charCodeAt(c) : 32;
      const charIdx = charCode < 128 ? CHAR_TO_INDEX[charCode] : 0;
      labelBuffer.charUVs[baseIdx + c * 4] = CHAR_UV_U[charIdx];
      labelBuffer.charUVs[baseIdx + c * 4 + 1] = CHAR_UV_V[charIdx];
      labelBuffer.charUVs[baseIdx + c * 4 + 2] = CHAR_UV_W;
      labelBuffer.charUVs[baseIdx + c * 4 + 3] = CHAR_UV_H;
    }
}
  
let _lastLabelRebuild = 0;
let _lastVisibilityVersion = 0;
let _lastSelectedUnit = null;
  
function fillLabelBuffers(labelIdx, unitType, unit, unitIndex) {
    let text;
    if (unitType === 0) text = formatShipLabel(unit);
    else if (unitType === 1) text = formatAircraftLabel(unit);
    else if (unitType === 2) text = formatDroneLabel(unit, unitIndex || 0);
    else text = formatSatelliteLabel(unit);
    encodeTextToBuffer(text, labelIdx);
  
    let r, g, b;
    if (unitType === 0) { r = 0.18; g = 0.83; b = 0.75; }
    else if (unitType === 1) { r = 0.98; g = 0.75; b = 0.14; }
    else if (unitType === 2) { r = 0.52; g = 0.80; b = 0.09; }
    else if (unit.isMilitary) { r = 1.0; g = 0.35; b = 0.25; }
    else { r = 0.30; g = 0.70; b = 1.0; }
  
    const scale = labelParams.fontSize;
    const baseColor = labelIdx * MAX_LABEL_CHARS * 3;
    const baseScale = labelIdx * MAX_LABEL_CHARS;
    for (let c = 0; c < MAX_LABEL_CHARS; c++) {
      const ci = baseColor + c * 3;
      labelBuffer.colors[ci] = r;
      labelBuffer.colors[ci + 1] = g;
      labelBuffer.colors[ci + 2] = b;
      labelBuffer.scales[baseScale + c] = scale;
    }
}
  
export function updateLabelAssignments(camera) {
    const hasSelectedLabelUnit = state.selectedUnit && (state.selectedUnit.type === 'ship' || state.selectedUnit.type === 'aircraft' || state.selectedUnit.type === 'drone' || state.selectedUnit.type === 'satellite');
    
    if (!labelParams.enabled) {
      if (hasSelectedLabelUnit) {
          // Show only selected unit's label when labels are disabled but unit is selected
          const { type, index } = state.selectedUnit;
          let unit, unitType;
          if (type === 'ship') { unit = state.ships[index]; unitType = 0; }
          else if (type === 'aircraft') { unit = state.aircraft[index]; unitType = 1; }
          else if (type === 'drone') { unit = state.drones[index]; unitType = 2; }
          else { unit = state.satellites[index]; unitType = 3; }

          if (unit) {
            labelAssignments.slots[0] = { type: unitType, unitIndex: index };
            fillLabelBuffers(0, unitType, unit, index);
            labelAssignments.count = 1;
            // Only upload 1 label's worth of data
            markLabelAttributeForUpdate(labelGeometry.userData.uvAttr, MAX_LABEL_CHARS * 4);
            markLabelAttributeForUpdate(labelGeometry.userData.colorAttr, MAX_LABEL_CHARS * 3);
            markLabelAttributeForUpdate(labelGeometry.userData.scaleAttr, MAX_LABEL_CHARS);
            labelGeometry.instanceCount = MAX_LABEL_CHARS;
          }
      } else {
          if(labelGeometry) labelGeometry.instanceCount = 0;
          labelAssignments.count = 0;
      }
      return;
    }
  
    if (labelMaterial) labelMaterial.uniforms.uCameraDistance.value = camera.position.length();
  
    const now = performance.now();
    if (now - labelVisibility.lastIndexBuild > labelVisibility.indexBuildInterval) {
      requestLabelIndexBuild();
    }
    if (now - labelVisibility.lastQuery > labelVisibility.queryInterval) {
      if (cameraMovedSignificantly(camera, state.earthRotation.y)) {
        requestVisibleUnits(camera, state.earthRotation.y);
      }
    }
  
    const visibilityChanged = _labelVisibilityVersion !== _lastVisibilityVersion;
    const timeToRebuild = now - _lastLabelRebuild > 200;
    
    // Check if selection changed (type or index)
    const currentSelected = state.selectedUnit ? `${state.selectedUnit.type}:${state.selectedUnit.index}` : null;
    const selectionChanged = currentSelected !== _lastSelectedUnit;

    // Always rebuild if there's a selected unit to ensure it stays prioritized/visible
    if (!visibilityChanged && !timeToRebuild && !selectionChanged && !hasSelectedLabelUnit) return;
    
    // If we have a selected unit and nothing else changed, we only need to rebuild if the selection ITSELF changed
    // effectively stabilizing the buffer
    if (!visibilityChanged && !timeToRebuild && !selectionChanged && hasSelectedLabelUnit) return;
  
    _lastVisibilityVersion = _labelVisibilityVersion;
    _lastLabelRebuild = now;
    _lastSelectedUnit = currentSelected;
  
    const { shipIndices, aircraftIndices, droneIndices, satelliteIndices } = labelVisibility;

    const maxLabels = labelParams.maxLabels;
    // Reserve one slot for the selected unit if it exists
    const generalLabelLimit = hasSelectedLabelUnit ? maxLabels - 1 : maxLabels;
    
    let labelIdx = 0;
    // We don't need labelAssignments.count = 0 here as we set it at the end
    
    let selectedTypeInt = -1;
    let selectedIndex = -1;
    if (hasSelectedLabelUnit) {
        const { type, index } = state.selectedUnit;
        selectedIndex = index;
        if (type === 'ship') selectedTypeInt = 0;
        else if (type === 'aircraft') selectedTypeInt = 1;
        else if (type === 'drone') selectedTypeInt = 2;
        else selectedTypeInt = 3;
    }

    // 1. Fill slots with general visible units (up to generalLabelLimit)
    if (labelParams.showShipLabels && unitCountParams.showShips) {
        for (let j = 0; j < shipIndices.length && labelIdx < generalLabelLimit; j++) {
            const i = shipIndices[j];
            if (selectedTypeInt === 0 && selectedIndex === i) continue; // Skip selected

            const unit = state.ships[i];
            if (!unit) continue;
            labelAssignments.slots[labelIdx] = { type: 0, unitIndex: i };
            fillLabelBuffers(labelIdx, 0, unit, i);
            labelIdx++;
        }
    }

    if (labelParams.showAircraftLabels && unitCountParams.showAircraft) {
        for (let j = 0; j < aircraftIndices.length && labelIdx < generalLabelLimit; j++) {
            const i = aircraftIndices[j];
            if (selectedTypeInt === 1 && selectedIndex === i) continue; // Skip selected

            const unit = state.aircraft[i];
            if (!unit) continue;
            labelAssignments.slots[labelIdx] = { type: 1, unitIndex: i };
            fillLabelBuffers(labelIdx, 1, unit, i);
            labelIdx++;
        }
    }

    if (labelParams.showDroneLabels && unitCountParams.showDrones) {
        for (let j = 0; j < droneIndices.length && labelIdx < generalLabelLimit; j++) {
            const i = droneIndices[j];
            if (selectedTypeInt === 2 && selectedIndex === i) continue; // Skip selected

            const unit = state.drones[i];
            if (!unit) continue;
            labelAssignments.slots[labelIdx] = { type: 2, unitIndex: i };
            fillLabelBuffers(labelIdx, 2, unit, i);
            labelIdx++;
        }
    }

    if (labelParams.showSatelliteLabels && unitCountParams.showSatellites) {
        for (let j = 0; j < satelliteIndices.length && labelIdx < generalLabelLimit; j++) {
            const i = satelliteIndices[j];
            if (selectedTypeInt === 3 && selectedIndex === i) continue; // Skip selected

            const unit = state.satellites[i];
            if (!unit) continue;
            labelAssignments.slots[labelIdx] = { type: 3, unitIndex: i };
            fillLabelBuffers(labelIdx, 3, unit, i);
            labelIdx++;
        }
    }

    // 2. Assign Selected Unit to the next available slot (effectively reserved)
    if (hasSelectedLabelUnit) {
        const { type, index } = state.selectedUnit;
        let unit;
        if (type === 'ship') unit = state.ships[index];
        else if (type === 'aircraft') unit = state.aircraft[index];
        else if (type === 'drone') unit = state.drones[index];
        else unit = state.satellites[index];
        
        if (unit) {
            labelAssignments.slots[labelIdx] = { type: selectedTypeInt, unitIndex: index };
            fillLabelBuffers(labelIdx, selectedTypeInt, unit, index);
            labelIdx++;
        }
    }

    labelAssignments.count = labelIdx;
    if (labelIdx > 0) {
      // Only upload active labels' worth of data
      const activeChars = labelIdx * MAX_LABEL_CHARS;
      markLabelAttributeForUpdate(labelGeometry.userData.uvAttr, activeChars * 4);
      markLabelAttributeForUpdate(labelGeometry.userData.colorAttr, activeChars * 3);
      markLabelAttributeForUpdate(labelGeometry.userData.scaleAttr, activeChars);
    }
    labelGeometry.instanceCount = labelIdx * MAX_LABEL_CHARS;
}
  
export function updateLabelPositions(earthRotation) {
    if (labelAssignments.count === 0) return;
    for (let labelIdx = 0; labelIdx < labelAssignments.count; labelIdx++) {
      const assignment = labelAssignments.slots[labelIdx];
      if (!assignment) continue;
      
      let unit, altitude;
      if (assignment.type === 0) { unit = state.ships[assignment.unitIndex]; altitude = SHIP_ALTITUDE; }
      else if (assignment.type === 1) { unit = state.aircraft[assignment.unitIndex]; altitude = AIRCRAFT_ALTITUDE; }
      else if (assignment.type === 2) { unit = state.drones[assignment.unitIndex]; altitude = unit ? unit.altitude : AIRCRAFT_ALTITUDE; }
      else { unit = state.satellites[assignment.unitIndex]; altitude = unit ? unit.altitude : 0.1; }
      
      if (!unit) continue;
      latLonToWorld(unit.lat, unit.lon, altitude, earthRotation, _tempVec3);
      
      const basePos = labelIdx * MAX_LABEL_CHARS * 3;
      for (let c = 0; c < MAX_LABEL_CHARS; c++) {
        const pi = basePos + c * 3;
        labelBuffer.positions[pi] = _tempVec3.x;
        labelBuffer.positions[pi + 1] = _tempVec3.y;
        labelBuffer.positions[pi + 2] = _tempVec3.z;
      }
    }
    if (labelGeometry) {
      // Only upload active labels' positions
      const activeChars = labelAssignments.count * MAX_LABEL_CHARS;
      markLabelAttributeForUpdate(labelGeometry.userData.posAttr, activeChars * 3);
    }
}