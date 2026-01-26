/**
 * Unit Selection System
 */
import * as THREE from "three";
import {
  EARTH_RADIUS,
  SHIP_ALTITUDE,
  AIRCRAFT_ALTITUDE,
  DEG_TO_RAD,
} from "../constants";
import type { SelectedUnit, UnitType, SatelliteState, DroneState, ShipState, AircraftState } from "../types";
import { state } from '../state';
import { AIRPORTS } from "../data/airports";
import { getCountryFlag } from "../utils/country-flags";
import { MID_TO_COUNTRY } from "../data/mmsi-mid";
import { unitCountParams } from "../simulation/demo-data";

// Selection colors for each unit type (matches unit icon colors)
export const SELECTION_COLORS = {
  ship: 0x2dd4bf,      // Cyan/teal
  aircraft: 0xfbbf24,  // Yellow/amber
  satellite: 0xa78bfa, // Purple
  drone: 0x84cc16,     // Lime green
  airport: 0xffffff,   // White
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get panel labels for different unit types
 */
export function getUnitTypeInfo(type: UnitType): { label: string; cssClass: string } {
  const typeMap: Record<UnitType, { label: string; cssClass: string }> = {
    ship: { label: "SHIP", cssClass: "ship" },
    aircraft: { label: "AIRCRAFT", cssClass: "aircraft" },
    satellite: { label: "SATELLITE", cssClass: "satellite" },
    drone: { label: "DRONE/UAV", cssClass: "drone" },
    airport: { label: "AIRPORT", cssClass: "airport" },
  };
  return typeMap[type] || { label: "UNKNOWN", cssClass: "" };
}

// Lazy-loaded formatAircraftType to avoid import affecting startup
let _formatAircraftType: ((code: string | undefined) => string) | null = null;
async function loadFormatAircraftType() {
  if (!_formatAircraftType) {
    const module = await import("../data/icao-aircraft");
    _formatAircraftType = module.formatAircraftType;
  }
  return _formatAircraftType;
}

// Cache for formatted aircraft type strings
const formattedTypeCache = new Map<string, string>();

// Track displayed position for staleness reset
let lastDisplayedPositionKey = "";
let lastPositionChangeTime = Date.now();

function getCachedAircraftType(icaoTypeCode: string | undefined, fallback: string | undefined): string | undefined {
  if (!icaoTypeCode) return fallback;

  // Return cached value if available
  let cached = formattedTypeCache.get(icaoTypeCode);
  if (cached) return cached;

  // If formatter not loaded yet, schedule load and return fallback for now
  if (!_formatAircraftType) {
    loadFormatAircraftType().then(fn => {
      const formatted = fn(icaoTypeCode);
      formattedTypeCache.set(icaoTypeCode, formatted);
    });
    return fallback;
  }

  // Formatter loaded, compute and cache
  cached = _formatAircraftType(icaoTypeCode);
  formattedTypeCache.set(icaoTypeCode, cached);
  return cached;
}

// =============================================================================
// DOM MANAGEMENT
// =============================================================================

// DOM elements for unit info panel
let unitInfoPanel: HTMLElement | null = null;
let unitTypeEl: HTMLElement | null = null;
let unitIdEl: HTMLElement | null = null;
let unitStalenessEl: HTMLElement | null = null;
let unitLatEl: HTMLElement | null = null;
let unitLonEl: HTMLElement | null = null;
let unitHdgEl: HTMLElement | null = null;
let unitSpdEl: HTMLElement | null = null;
let unitAltEl: HTMLElement | null = null;
let unitCloseBtn: HTMLElement | null = null;
let unitLabel1: HTMLElement | null = null;
let unitLabel2: HTMLElement | null = null;
let unitLabel3: HTMLElement | null = null;
let unitLabel4: HTMLElement | null = null;
let unitLabel5: HTMLElement | null = null;
let unitLabel6: HTMLElement | null = null;
let unitRow6: HTMLElement | null = null;
let unitExtra: HTMLElement | null = null;
let droneFeedPanel: HTMLElement | null = null;
let droneFeedCoords: HTMLElement | null = null;
let droneVideo: HTMLVideoElement | null = null;

function getDomElements() {
    unitInfoPanel = document.getElementById("unit-info");
    unitTypeEl = document.getElementById("unit-type");
    unitIdEl = document.getElementById("unit-id");
    unitStalenessEl = document.getElementById("unit-staleness");
    
    // Self-healing: Create staleness element if missing (fixes HMR/hot-reload issues)
    if (!unitStalenessEl && unitInfoPanel) {
      const header = unitInfoPanel.querySelector(".unit-info-header");
      const closeBtn = document.getElementById("unit-close");
      if (header) {
        unitStalenessEl = document.createElement("span");
        unitStalenessEl.id = "unit-staleness";
        unitStalenessEl.className = "unit-staleness";
        if (closeBtn) {
          header.insertBefore(unitStalenessEl, closeBtn);
        } else {
          header.appendChild(unitStalenessEl);
        }
      }
    }

    unitLatEl = document.getElementById("unit-lat");
    unitLonEl = document.getElementById("unit-lon");
    unitHdgEl = document.getElementById("unit-hdg");
    unitSpdEl = document.getElementById("unit-spd");
    unitAltEl = document.getElementById("unit-alt");
    unitCloseBtn = document.getElementById("unit-close");
    unitLabel1 = document.getElementById("unit-label-1");
    unitLabel2 = document.getElementById("unit-label-2");
    unitLabel3 = document.getElementById("unit-label-3");
    unitLabel4 = document.getElementById("unit-label-4");
    unitLabel5 = document.getElementById("unit-label-5");
    unitLabel6 = document.getElementById("unit-label-6");
    unitRow6 = document.getElementById("unit-row-6");
    unitExtra = document.getElementById("unit-extra");
    droneFeedPanel = document.getElementById("drone-feed");
    droneFeedCoords = document.getElementById("drone-feed-coords");
    droneVideo = document.getElementById("drone-video") as HTMLVideoElement;
}

// =============================================================================
// SELECTION LOGIC
// =============================================================================

export function deselectUnit() {
    state.selectedUnit = null;
    unitInfoPanel?.classList.add("hidden");
    droneFeedPanel?.classList.add("hidden");
    if (droneVideo) droneVideo.pause();
}

function selectUnit(type: UnitType, index: number) {
    // Reset staleness tracking for new selection
    lastDisplayedPositionKey = "";
    lastPositionChangeTime = Date.now();

    let unitData: any;
    let typeLabel = "";
    let typeClass = "";
  
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

    // Get unique ID for stable selection across array rebuilds
    let id: string | undefined;
    if (type === "aircraft" && unitData.callsign) {
      id = unitData.callsign;
    } else if (type === "ship" && unitData.mmsi) {
      id = unitData.mmsi;
    } else if (type === "satellite" && unitData.name) {
      id = unitData.name;
    }

    state.selectedUnit = { type, index, id, data: unitData };

    if (!unitInfoPanel) getDomElements();

    // Header logic
    if (type === "aircraft" && unitData.callsign && unitTypeEl && unitIdEl) {
      unitTypeEl.textContent = "";
      unitTypeEl.className = `unit-info-type ${typeClass}`;
      unitIdEl.textContent = unitData.callsign;
    } else if (type === "ship" && (unitData.name || unitData.mmsi) && unitTypeEl && unitIdEl) {
      unitTypeEl.textContent = "SHIP";
      unitTypeEl.className = `unit-info-type ${typeClass}`;
      unitIdEl.textContent = unitData.name || `#${unitData.mmsi}`;
    } else if (type === "satellite" && unitData.name && unitTypeEl && unitIdEl) {
      unitTypeEl.textContent = "SATELLITE";
      unitTypeEl.className = `unit-info-type ${typeClass}`;
      unitIdEl.textContent = unitData.name;
    } else if (type === "airport" && unitTypeEl && unitIdEl) {
      unitTypeEl.textContent = typeLabel;
      unitTypeEl.className = `unit-info-type ${typeClass}`;
      unitIdEl.textContent = unitData.code;
    } else {
      if (unitTypeEl) {
          unitTypeEl.textContent = typeLabel;
          unitTypeEl.className = `unit-info-type ${typeClass}`;
      }
      if (unitIdEl) {
          unitIdEl.textContent = `#${String(index).padStart(4, "0")}`;
      }
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
}

export function updateSelectedUnitInfo() {
    if (!state.selectedUnit) return;
  
    const { type, index } = state.selectedUnit;
    let unitData: any;
    let altitude;
    let speed;
    const typeInfo = getUnitTypeInfo(type);
    const typeClass = typeInfo.cssClass;
  
    // Helper to safely update text content
    const safeSetText = (el: HTMLElement | null, text: string) => {
        if (el) el.textContent = text;
    };

    if (type === "ship") {
      unitData = state.ships[index];
      if (!unitData) { deselectUnit(); return; }
      
      const speed = unitData.sog ? `${unitData.sog.toFixed(1)} kts` : "0.0 kts";
      const shipTypes = ["", "Cargo", "Tanker", "Passenger", "Fishing", "Military", "Pleasure"];
      const typeStr = unitData.shipType !== undefined && unitData.shipType > 0 && unitData.shipType < shipTypes.length 
          ? shipTypes[unitData.shipType] 
          : "";

      // Derive country from MMSI
      let countryName = "";
      if (unitData.mmsi) {
          const mid = String(unitData.mmsi).padStart(9, '0').substring(0, 3);
          countryName = MID_TO_COUNTRY[mid] || "";
      }
      const flag = countryName ? getCountryFlag(countryName) : "";

      safeSetText(unitLabel1, "POS");
      safeSetText(unitLabel2, "HDG");
      safeSetText(unitLabel3, "SPD");
      safeSetText(unitLabel4, "MMSI");
      safeSetText(unitLabel5, "TYPE");

      safeSetText(unitLatEl, `${unitData.lat.toFixed(4)}° ${unitData.lon.toFixed(4)}°`);
      safeSetText(unitLonEl, `${unitData.heading.toFixed(0)}°`);
      safeSetText(unitHdgEl, speed);
      safeSetText(unitSpdEl, unitData.mmsi || "—");
      safeSetText(unitAltEl, typeStr || "—");
      
      // Header update
      if (unitTypeEl && unitIdEl) {
          unitTypeEl.textContent = "SHIP";
          unitTypeEl.className = `unit-info-type ${typeClass}`;
          unitIdEl.textContent = unitData.name || `#${unitData.mmsi}`;
      }

      // Country row
      if (countryName) {
        if (unitRow6) unitRow6.style.display = "";
        if (unitLabel6) unitLabel6.textContent = "COUNTRY";
        if (unitExtra) unitExtra.textContent = `${flag} ${countryName}`.trim();
      } else {
        if (unitRow6) unitRow6.style.display = "none";
      }
      
      if (unitStalenessEl) unitStalenessEl.textContent = "";

    } else if (type === "aircraft") {
      unitData = state.aircraft[index];
      if (!unitData) { deselectUnit(); return; }
      const altFeet = unitData.altitude ? Math.round(unitData.altitude) : 0;
      speed = unitData.groundSpeed ? `${Math.round(unitData.groundSpeed)} kts` : "0 kts";
      const country = unitData.originCountry || "—";
      
      safeSetText(unitLabel1, "POS");
      safeSetText(unitLabel2, "HDG");
      safeSetText(unitLabel3, "SPD");
      safeSetText(unitLabel4, "REG");
      safeSetText(unitLabel5, "ALT");

      safeSetText(unitLatEl, `${unitData.lat.toFixed(2)}° ${unitData.lon.toFixed(2)}°`);
      safeSetText(unitLonEl, `${unitData.heading.toFixed(0)}°`);
      safeSetText(unitHdgEl, speed);
      
      const flag = getCountryFlag(country);
      safeSetText(unitSpdEl, flag ? `${flag} ${country}` : country);
      
      let altArrow = "";
      if (unitData.altitudeTrend === 1) altArrow = "↑ ";
      else if (unitData.altitudeTrend === -1) altArrow = "↓ ";
      safeSetText(unitAltEl, `${altArrow}${altFeet.toLocaleString()} ft`);

      if (unitStalenessEl) {
        const posKey = `${unitData.lat.toFixed(2)}|${unitData.lon.toFixed(2)}|${altFeet}`;
        if (posKey !== lastDisplayedPositionKey) {
          lastDisplayedPositionKey = posKey;
          lastPositionChangeTime = Date.now();
        }
        const staleness = Math.floor((Date.now() - lastPositionChangeTime) / 1000);
        unitStalenessEl.textContent = `+${staleness}s`;
      }

      const typeDisplay = getCachedAircraftType(unitData.icaoTypeCode, unitData.aircraftType);
      if (typeDisplay) {
        if (unitRow6) unitRow6.style.display = "";
        safeSetText(unitLabel6, "TYPE");
        safeSetText(unitExtra, typeDisplay);
      } else {
        if (unitRow6) unitRow6.style.display = "none";
      }

    } else if (type === "satellite") {
        unitData = state.satellites[index];
        if (!unitData) { deselectUnit(); return; }
        const altKm = (unitData.altitude * 6371 / EARTH_RADIUS).toFixed(0);
        altitude = `${altKm} km`;
        const speedVal = Math.sqrt(398600 / (6371 + (unitData.altitude * (6371 / EARTH_RADIUS))));
        speed = `${speedVal.toFixed(2)} km/s`;
        
        safeSetText(unitLabel1, "LAT");
        safeSetText(unitLabel2, "LON");
        safeSetText(unitLabel3, "HDG");
        safeSetText(unitLabel4, "SPD");
        safeSetText(unitLabel5, "ALT");

        safeSetText(unitLatEl, `${unitData.lat.toFixed(4)}°`);
        safeSetText(unitLonEl, `${unitData.lon.toFixed(4)}°`);
        safeSetText(unitHdgEl, `${unitData.heading.toFixed(0)}°`);
        safeSetText(unitSpdEl, speed);
        safeSetText(unitAltEl, altitude);
        
        if (unitRow6) unitRow6.style.display = "none";
        if (unitStalenessEl) unitStalenessEl.textContent = "";

    } else if (type === "drone") {
        unitData = state.drones[index];
        if (!unitData) { deselectUnit(); return; }
        const altFeet = Math.round(unitData.altitude * 6371 / EARTH_RADIUS * 3281);
        altitude = `${altFeet.toLocaleString()} ft`;
        speed = `120 kts`;
        
        safeSetText(unitLabel1, "LAT");
        safeSetText(unitLabel2, "LON");
        safeSetText(unitLabel3, "HDG");
        safeSetText(unitLabel4, "SPD");
        safeSetText(unitLabel5, "ALT");

        safeSetText(unitLatEl, `${unitData.lat.toFixed(4)}°`);
        safeSetText(unitLonEl, `${unitData.lon.toFixed(4)}°`);
        safeSetText(unitHdgEl, `${unitData.heading.toFixed(0)}°`);
        safeSetText(unitSpdEl, speed);
        safeSetText(unitAltEl, altitude);
        
        if (droneFeedCoords) droneFeedCoords.textContent = `TGT: ${unitData.targetLat.toFixed(4)}° ${unitData.targetLon.toFixed(4)}°`;
        if (unitRow6) unitRow6.style.display = "none";
        if (unitStalenessEl) unitStalenessEl.textContent = "";

    } else if (type === "airport") {
        const airport = AIRPORTS[index];
        if (!airport) { deselectUnit(); return; }
        safeSetText(unitLabel1, "NAME");
        safeSetText(unitLabel2, "LAT");
        safeSetText(unitLabel3, "LON");
        safeSetText(unitLabel4, "ELEV");
        safeSetText(unitLabel5, "TYPE");

        safeSetText(unitLatEl, airport.name);
        safeSetText(unitLonEl, `${airport.lat.toFixed(4)}°`);
        safeSetText(unitHdgEl, `${airport.lon.toFixed(4)}°`);
        safeSetText(unitSpdEl, "—");
        safeSetText(unitAltEl, "INTL");
        
        if (unitRow6) unitRow6.style.display = "none";
        if (unitStalenessEl) unitStalenessEl.textContent = "";
    }
}

function latLonTo3D(lat: number, lon: number, altitude = 0) {
    const phi = (90 - lat) * DEG_TO_RAD;
    const theta = (lon + 180) * DEG_TO_RAD;
    const radius = EARTH_RADIUS + altitude;
    return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

function projectToScreen(position: THREE.Vector3, camera: THREE.Camera, canvas: HTMLCanvasElement) {
    const projected = position.clone().project(camera);
    return {
        x: (projected.x + 1) / 2 * canvas.clientWidth,
        y: (-projected.y + 1) / 2 * canvas.clientHeight,
        z: projected.z
    };
}

function onCanvasClick(event: MouseEvent, camera: THREE.Camera, canvas: HTMLCanvasElement, earth: THREE.Object3D, h3Params: any) {
    if ((event.target as HTMLElement).closest(".lil-gui") || (event.target as HTMLElement).closest("#unit-info")) return;
    if (h3Params.enabled) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const camDist = camera.position.length();
    const clickRadius = camDist > 5 ? 40 : 20;
    
    let closestUnit: { type: UnitType, index: number } | null = null;
    let closestDist = clickRadius;

    const cameraWorldPos = camera.position.clone();
    const earthSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), EARTH_RADIUS * 0.98);

    const checkUnits = (units: any[], type: UnitType, altitudeFn: any) => {
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const altitude = typeof altitudeFn === 'function' ? altitudeFn(unit) : altitudeFn;
            if (altitude === null || altitude === undefined) continue;

            const worldPos = latLonTo3D(unit.lat, unit.lon, altitude).applyMatrix4(earth.matrixWorld);
            const distToUnit = cameraWorldPos.distanceTo(worldPos);
            const rayDir = worldPos.clone().sub(cameraWorldPos).normalize();
            const ray = new THREE.Ray(cameraWorldPos, rayDir);
            const intersection = ray.intersectSphere(earthSphere, new THREE.Vector3());
            
            if (intersection) {
                const distToEarth = cameraWorldPos.distanceTo(intersection);
                if (distToEarth < distToUnit - 0.1) continue;
            }

            const screen = projectToScreen(worldPos, camera, canvas);
            if (screen.z > 1) continue;
            
            const dist = Math.sqrt((clickX - screen.x) ** 2 + (clickY - screen.y) ** 2);
            if (dist < closestDist) {
                closestDist = dist;
                closestUnit = { type, index: i };
            }
        }
    };

    if (state.unitCounts.showShips) checkUnits(state.ships, "ship", SHIP_ALTITUDE);
    if (state.unitCounts.showAircraft) checkUnits(state.aircraft, "aircraft", AIRCRAFT_ALTITUDE);
    if (state.unitCounts.showSatellites) {
        checkUnits(state.satellites, "satellite", (unit: any) => {
            const { showLEO, showMEO, showGEO } = unitCountParams;
            if (unit.orbitTypeLabel === 'LEO' && !showLEO) return null;
            if (unit.orbitTypeLabel === 'MEO' && !showMEO) return null;
            if (unit.orbitTypeLabel === 'GEO' && !showGEO) return null;
            return unit.altitude;
        });
    }
    if (state.unitCounts.showDrones) checkUnits(state.drones, "drone", (unit: any) => unit.altitude);

    if (closestUnit) {
        selectUnit((closestUnit as any).type, (closestUnit as any).index);
    } else {
        deselectUnit();
    }
}

export function initSelectionHandling(camera: THREE.Camera, canvas: HTMLCanvasElement, earth: THREE.Object3D, h3Params: any) {
    getDomElements();
    canvas.addEventListener("click", (event) => onCanvasClick(event, camera, canvas, earth, h3Params));
    unitCloseBtn?.addEventListener("click", () => {
        deselectUnit();
    });
}
