/**
 * Unit Selection System
 */
import * as THREE from "three";

// Selection colors for each unit type (matches unit icon colors)
export const SELECTION_COLORS = {
  ship: 0x2dd4bf,      // Cyan/teal
  aircraft: 0xfbbf24,  // Yellow/amber
  satellite: 0xa78bfa, // Purple
  drone: 0x84cc16,     // Lime green
  airport: 0xffffff,   // White
};
import {
  EARTH_RADIUS,
  SHIP_ALTITUDE,
  AIRCRAFT_ALTITUDE,
  ORBIT_LINE_SEGMENTS,
  PATROL_CIRCLE_SEGMENTS,
  DEG_TO_RAD,
} from "../constants";
import type { SelectedUnit, UnitType, SatelliteState, DroneState } from "../types";
import { state } from '../state';
import { AIRPORTS } from "../data/airports";

// DOM elements for unit info panel
let unitInfoPanel, unitTypeEl, unitIdEl, unitLatEl, unitLonEl, unitHdgEl, unitSpdEl, unitAltEl, unitCloseBtn;
let droneFeedPanel, droneFeedCoords, droneVideo;
let unitLabel1, unitLabel2, unitLabel3, unitLabel4, unitLabel5;

function getDomElements() {
    unitInfoPanel = document.getElementById("unit-info");
    unitTypeEl = document.getElementById("unit-type");
    unitIdEl = document.getElementById("unit-id");
    unitLatEl = document.getElementById("unit-lat");
    unitLonEl = document.getElementById("unit-lon");
    unitHdgEl = document.getElementById("unit-hdg");
    unitSpdEl = document.getElementById("unit-spd");
    unitAltEl = document.getElementById("unit-alt");
    unitCloseBtn = document.getElementById("unit-close");
    unitLabel1 = document.getElementById("unit-label-1");
    unitLabel2 = document.getElementById("unit-label-2");
    droneFeedPanel = document.getElementById("drone-feed");
    droneFeedCoords = document.getElementById("drone-feed-coords");
    droneVideo = document.getElementById("drone-video");
    unitLabel3 = document.getElementById("unit-label-3");
    unitLabel4 = document.getElementById("unit-label-4");
    unitLabel5 = document.getElementById("unit-label-5");
}


// Raycaster for click detection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

export function deselectUnit() {
    state.selectedUnit = null;
    unitInfoPanel?.classList.add("hidden");
    droneFeedPanel?.classList.add("hidden");
    if (droneVideo) droneVideo.pause();
    // hideAllSelectionVisuals(); // This will be handled by the visuals module
}

function selectUnit(type, index) {
    let unitData;
    let typeLabel;
    let typeClass;
  
    if (type === "ship") {
      unitData = state.ships[index];
      typeLabel = "SHIP";
      typeClass = "ship";
    } else if (type === "aircraft") {
      unitData = state.aircraft[index];
      typeLabel = "AIRCRAFT";
      typeClass = "aircraft";
    } else if (type === "satellite") {
      unitData = state.satellites[index];
      typeLabel = "SATELLITE";
      typeClass = "satellite";
    } else if (type === "drone") {
      unitData = state.drones[index];
      typeLabel = "DRONE/UAV";
      typeClass = "drone";
    } else if (type === "airport") {
      const airport = AIRPORTS[index];
      if (!airport) return;
      unitData = { lat: airport.lat, lon: airport.lon, heading: 0, code: airport.iata, name: airport.name };
      typeLabel = "AIRPORT";
      typeClass = "airport";
    }
  
    if (!unitData) return;

    state.selectedUnit = { type, index, data: unitData };

    // For aircraft, hide the type label and show callsign prominently
    if (type === "aircraft" && unitData.callsign) {
      unitTypeEl.textContent = "";
      unitTypeEl.className = `unit-info-type ${typeClass}`;
      unitIdEl.textContent = unitData.callsign;
    } else if (type === "airport") {
      unitTypeEl.textContent = typeLabel;
      unitTypeEl.className = `unit-info-type ${typeClass}`;
      unitIdEl.textContent = unitData.code;
    } else {
      unitTypeEl.textContent = typeLabel;
      unitTypeEl.className = `unit-info-type ${typeClass}`;
      unitIdEl.textContent = `#${String(index).padStart(4, "0")}`;
    }
  
    unitInfoPanel?.classList.remove("hidden");

    // Show drone feed panel when drone is selected
    if (type === "drone") {
      droneFeedPanel?.classList.remove("hidden");
      if (droneVideo) {
        droneVideo.currentTime = Math.random() * 10;
        droneVideo.play();
      }
    } else {
      droneFeedPanel?.classList.add("hidden");
      if (droneVideo) droneVideo.pause();
    }

    updateSelectedUnitInfo();

    // Visuals like orbit line will be updated in the main loop
}

export function updateSelectedUnitInfo() {
    if (!state.selectedUnit) return;
  
    const { type, index } = state.selectedUnit;
    let unitData;
    let altitude;
    let speed;
  
    if (type === "ship") {
      unitData = state.ships[index];
      if (!unitData) { deselectUnit(); return; }
      altitude = "0 ft";
      speed = unitData.sog ? `${unitData.sog.toFixed(1)} kts` : "0.0 kts";
      unitLabel1.textContent = "LAT"; unitLabel2.textContent = "LON"; unitLabel3.textContent = "HDG"; unitLabel4.textContent = "SPD"; unitLabel5.textContent = "ALT";
      unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
      unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
      unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
      unitSpdEl.textContent = speed;
      unitAltEl.textContent = altitude;
    } else if (type === "aircraft") {
      unitData = state.aircraft[index];
      if (!unitData) { deselectUnit(); return; }
      const altFeet = unitData.altitude ? Math.round(unitData.altitude) : 0;
      speed = unitData.groundSpeed ? `${Math.round(unitData.groundSpeed)} kts` : "0 kts";
      const country = unitData.originCountry || "—";
      unitLabel1.textContent = "POS"; unitLabel2.textContent = "HDG"; unitLabel3.textContent = "SPD"; unitLabel4.textContent = "REG"; unitLabel5.textContent = "ALT";
      unitLatEl.textContent = `${unitData.lat.toFixed(2)}° ${unitData.lon.toFixed(2)}°`;
      unitLonEl.textContent = `${unitData.heading.toFixed(0)}°`;
      unitHdgEl.textContent = speed;
      unitSpdEl.textContent = country;
      unitAltEl.textContent = `${altFeet.toLocaleString()} ft`;
    } else if (type === "satellite") {
        unitData = state.satellites[index];
        if (!unitData) { deselectUnit(); return; }
        const altKm = (unitData.altitude * 6371 / EARTH_RADIUS).toFixed(0);
        altitude = `${altKm} km`;
        speed = `${(7.8 - unitData.altitude * 2).toFixed(1)} km/s`;
        unitLabel1.textContent = "LAT"; unitLabel2.textContent = "LON"; unitLabel3.textContent = "HDG"; unitLabel4.textContent = "SPD"; unitLabel5.textContent = "ALT";
        unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
        unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
        unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
        unitSpdEl.textContent = speed;
        unitAltEl.textContent = altitude;
    } else if (type === "drone") {
        unitData = state.drones[index];
        if (!unitData) { deselectUnit(); return; }
        const altFeet = Math.round(unitData.altitude * 6371 / EARTH_RADIUS * 3281);
        altitude = `${altFeet.toLocaleString()} ft`;
        speed = `120 kts`;
        unitLabel1.textContent = "LAT"; unitLabel2.textContent = "LON"; unitLabel3.textContent = "HDG"; unitLabel4.textContent = "SPD"; unitLabel5.textContent = "ALT";
        unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
        unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
        unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
        unitSpdEl.textContent = speed;
        unitAltEl.textContent = altitude;
        if (droneFeedCoords) droneFeedCoords.textContent = `TGT: ${unitData.targetLat.toFixed(4)}° ${unitData.targetLon.toFixed(4)}°`;
    } else if (type === "airport") {
        const airport = AIRPORTS[index];
        if (!airport) { deselectUnit(); return; }
        unitLabel1.textContent = "NAME"; unitLabel2.textContent = "LAT"; unitLabel3.textContent = "LON"; unitLabel4.textContent = "ELEV"; unitLabel5.textContent = "TYPE";
        unitLatEl.textContent = airport.name;
        unitLonEl.textContent = `${airport.lat.toFixed(4)}°`;
        unitHdgEl.textContent = `${airport.lon.toFixed(4)}°`;
        unitSpdEl.textContent = "—";
        unitAltEl.textContent = "INTL";
    }
}

function latLonTo3D(lat, lon, altitude = 0) {
    const phi = (90 - lat) * DEG_TO_RAD;
    const theta = (lon + 180) * DEG_TO_RAD;
    const radius = EARTH_RADIUS + altitude;
    return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

function projectToScreen(position, camera, canvas) {
    const projected = position.clone().project(camera);
    return {
        x: (projected.x + 1) / 2 * canvas.clientWidth,
        y: (-projected.y + 1) / 2 * canvas.clientHeight,
        z: projected.z
    };
}

function onCanvasClick(event, camera, canvas, earth, h3Params) {
    if (event.target.closest(".lil-gui") || event.target.closest("#unit-info")) return;
    if (h3Params.enabled) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const clickRadius = 20;
    let closestUnit = null;
    let closestDist = clickRadius;

    const cameraWorldPos = camera.position.clone();
    const earthWorldPos = earth.position.clone().applyMatrix4(earth.parent?.matrixWorld || new THREE.Matrix4());

    function isOnVisibleSide(unitWorldPos) {
        const surfaceNormal = unitWorldPos.clone().sub(earthWorldPos).normalize();
        const toCamera = cameraWorldPos.clone().sub(unitWorldPos).normalize();
        return surfaceNormal.dot(toCamera) > 0;
    }

    const checkUnits = (units, type, altitudeFn) => {
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const altitude = typeof altitudeFn === 'function' ? altitudeFn(unit) : altitudeFn;
            const worldPos = latLonTo3D(unit.lat, unit.lon, altitude).applyMatrix4(earth.matrixWorld);
            const screen = projectToScreen(worldPos, camera, canvas);
            if (screen.z > 1 || !isOnVisibleSide(worldPos)) continue;
            const dist = Math.sqrt((clickX - screen.x) ** 2 + (clickY - screen.y) ** 2);
            if (dist < closestDist) {
                closestDist = dist;
                closestUnit = { type, index: i };
            }
        }
    };

    if (state.unitCounts.showShips) checkUnits(state.ships, "ship", SHIP_ALTITUDE);
    if (state.unitCounts.showAircraft) checkUnits(state.aircraft, "aircraft", AIRCRAFT_ALTITUDE);
    if (state.unitCounts.showSatellites) checkUnits(state.satellites, "satellite", unit => unit.altitude);
    if (state.unitCounts.showDrones) checkUnits(state.drones, "drone", unit => unit.altitude);

    if (closestUnit) {
        selectUnit(closestUnit.type, closestUnit.index);
    } else {
        deselectUnit();
    }
}

export function initSelectionHandling(camera, canvas, earth, h3Params) {
    getDomElements();
    canvas.addEventListener("click", (event) => onCanvasClick(event, camera, canvas, earth, h3Params));
    unitCloseBtn?.addEventListener("click", () => {
        deselectUnit();
    });
}