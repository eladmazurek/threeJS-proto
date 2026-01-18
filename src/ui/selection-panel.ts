/**
 * Unit Selection Panel
 *
 * Manages the DOM elements and display logic for the unit info panel.
 */

import { EARTH_RADIUS } from "../constants";
import { AIRPORTS } from "../data/airports";
import { state } from "../state";
import type { UnitType, ShipState, AircraftState, SatelliteState, DroneState } from "../types";

// =============================================================================
// DOM ELEMENTS
// =============================================================================

// Unit info panel elements
const unitInfoPanel = document.getElementById("unit-info");
const unitTypeEl = document.getElementById("unit-type");
const unitIdEl = document.getElementById("unit-id");
const unitLatEl = document.getElementById("unit-lat");
const unitLonEl = document.getElementById("unit-lon");
const unitHdgEl = document.getElementById("unit-hdg");
const unitSpdEl = document.getElementById("unit-spd");
const unitAltEl = document.getElementById("unit-alt");
const unitCloseBtn = document.getElementById("unit-close");
const unitLabel1 = document.getElementById("unit-label-1");
const unitLabel2 = document.getElementById("unit-label-2");

// Drone video feed panel elements
const droneFeedPanel = document.getElementById("drone-feed");
const droneFeedCoords = document.getElementById("drone-feed-coords");
const droneVideo = document.getElementById("drone-video") as HTMLVideoElement | null;
const unitLabel3 = document.getElementById("unit-label-3");
const unitLabel4 = document.getElementById("unit-label-4");
const unitLabel5 = document.getElementById("unit-label-5");
const unitLabel6 = document.getElementById("unit-label-6");
const unitRow6 = document.getElementById("unit-row-6");
const unitExtra = document.getElementById("unit-extra");

// =============================================================================
// STATE GETTERS (set via setSelectionDependencies)
// =============================================================================

interface SelectionDependencies {
  getShipState: (index: number) => ShipState | undefined;
  getAircraftState: (index: number) => AircraftState | undefined;
  getSatelliteState: (index: number) => SatelliteState | undefined;
  getDroneState: (index: number) => DroneState | undefined;
  onDeselect: () => void;
  onDroneSelected: (unitData: DroneState) => void;
  onSatelliteSelected: (unitData: SatelliteState) => void;
  onOtherSelected: () => void;
  updateObservationLine: (unitData: DroneState) => void;
}

let deps: SelectionDependencies | null = null;

/**
 * Set dependencies for selection panel
 */
export function setSelectionDependencies(dependencies: SelectionDependencies): void {
  deps = dependencies;

  // Setup close button handler
  unitCloseBtn?.addEventListener("click", () => {
    hidePanel();
    deps?.onDeselect();
  });
}

// =============================================================================
// PANEL VISIBILITY
// =============================================================================

/**
 * Show the unit info panel
 */
export function showPanel(): void {
  unitInfoPanel?.classList.remove("hidden");
}

/**
 * Hide the unit info panel
 */
export function hidePanel(): void {
  unitInfoPanel?.classList.add("hidden");
  hideDroneFeed();
}

/**
 * Show the drone feed panel
 */
export function showDroneFeed(targetLat: number, targetLon: number): void {
  droneFeedPanel?.classList.remove("hidden");
  if (droneVideo) {
    droneVideo.currentTime = Math.random() * 10; // Start at random position
    droneVideo.play();
  }
  if (droneFeedCoords) {
    droneFeedCoords.textContent = `TGT: ${targetLat.toFixed(4)}° ${targetLon.toFixed(4)}°`;
  }
}

/**
 * Hide the drone feed panel
 */
export function hideDroneFeed(): void {
  droneFeedPanel?.classList.add("hidden");
  if (droneVideo) droneVideo.pause();
}

// =============================================================================
// PANEL HEADER UPDATE
// =============================================================================

/**
 * Update the panel header with unit type and ID
 */
export function updatePanelHeader(typeLabel: string, typeClass: string, unitId: string): void {
  if (unitTypeEl) {
    unitTypeEl.textContent = typeLabel;
    unitTypeEl.className = `unit-info-type ${typeClass}`;
  }
  if (unitIdEl) {
    unitIdEl.textContent = unitId;
  }
}

// =============================================================================
// PANEL CONTENT UPDATE
// =============================================================================

/**
 * Update panel content for a ship
 */
function updateShipPanel(unitData: ShipState): void {
  const speed = unitData.sog ? `${unitData.sog.toFixed(1)} kts` : "0.0 kts";

  if (unitLabel1) unitLabel1.textContent = "LAT";
  if (unitLabel2) unitLabel2.textContent = "LON";
  if (unitLabel3) unitLabel3.textContent = "HDG";
  if (unitLabel4) unitLabel4.textContent = "SPD";
  if (unitLabel5) unitLabel5.textContent = "ALT";

  if (unitLatEl) unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
  if (unitLonEl) unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
  if (unitHdgEl) unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
  if (unitSpdEl) unitSpdEl.textContent = speed;
  if (unitAltEl) unitAltEl.textContent = "0 ft";
  if (unitRow6) unitRow6.style.display = "none";
}

/**
 * Update panel content for an aircraft
 */
function updateAircraftPanel(unitData: AircraftState): void {
  const altFeet = unitData.altitude ? Math.round(unitData.altitude).toLocaleString() : "0";
  const speed = unitData.groundSpeed ? `${Math.round(unitData.groundSpeed)} kts` : "0 kts";
  const country = unitData.originCountry || "—";

  if (unitLabel1) unitLabel1.textContent = "POS";
  if (unitLabel2) unitLabel2.textContent = "HDG";
  if (unitLabel3) unitLabel3.textContent = "SPD";
  if (unitLabel4) unitLabel4.textContent = "REG";
  if (unitLabel5) unitLabel5.textContent = "ALT";

  if (unitLatEl) unitLatEl.textContent = `${unitData.lat.toFixed(2)}° ${unitData.lon.toFixed(2)}°`;
  if (unitLonEl) unitLonEl.textContent = `${unitData.heading.toFixed(0)}°`;
  if (unitHdgEl) unitHdgEl.textContent = speed;
  if (unitSpdEl) unitSpdEl.textContent = country;
  if (unitAltEl) unitAltEl.textContent = `${altFeet} ft`;

  // Show aircraft type in 6th row only if available
  if (unitData.aircraftType) {
    if (unitRow6) unitRow6.style.display = "";
    if (unitLabel6) unitLabel6.textContent = "TYPE";
    if (unitExtra) unitExtra.textContent = unitData.aircraftType;
  } else {
    if (unitRow6) unitRow6.style.display = "none";
  }
}

/**
 * Update panel content for a satellite
 */
function updateSatellitePanel(unitData: SatelliteState): void {
  const altKm = (unitData.altitude * 6371 / EARTH_RADIUS).toFixed(0);
  const speed = `${(7.8 - unitData.altitude * 2).toFixed(1)} km/s`;

  if (unitLabel1) unitLabel1.textContent = "LAT";
  if (unitLabel2) unitLabel2.textContent = "LON";
  if (unitLabel3) unitLabel3.textContent = "HDG";
  if (unitLabel4) unitLabel4.textContent = "SPD";
  if (unitLabel5) unitLabel5.textContent = "ALT";

  if (unitLatEl) unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
  if (unitLonEl) unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
  if (unitHdgEl) unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
  if (unitSpdEl) unitSpdEl.textContent = speed;
  if (unitAltEl) unitAltEl.textContent = `${altKm} km`;
  if (unitRow6) unitRow6.style.display = "none";
}

/**
 * Update panel content for a drone
 */
function updateDronePanel(unitData: DroneState): void {
  const altFeet = Math.round(unitData.altitude * 6371 / EARTH_RADIUS * 3281);
  const speed = `120 kts`; // Typical MQ-9 Reaper cruise speed

  if (unitLabel1) unitLabel1.textContent = "LAT";
  if (unitLabel2) unitLabel2.textContent = "LON";
  if (unitLabel3) unitLabel3.textContent = "HDG";
  if (unitLabel4) unitLabel4.textContent = "SPD";
  if (unitLabel5) unitLabel5.textContent = "ALT";

  if (unitLatEl) unitLatEl.textContent = `${unitData.lat.toFixed(4)}°`;
  if (unitLonEl) unitLonEl.textContent = `${unitData.lon.toFixed(4)}°`;
  if (unitHdgEl) unitHdgEl.textContent = `${unitData.heading.toFixed(0)}°`;
  if (unitSpdEl) unitSpdEl.textContent = speed;
  if (unitAltEl) unitAltEl.textContent = `${altFeet.toLocaleString()} ft`;
  if (unitRow6) unitRow6.style.display = "none";
}

/**
 * Update panel content for an airport
 */
function updateAirportPanel(airport: { name: string; lat: number; lon: number }): void {
  if (unitLabel1) unitLabel1.textContent = "NAME";
  if (unitLabel2) unitLabel2.textContent = "LAT";
  if (unitLabel3) unitLabel3.textContent = "LON";
  if (unitLabel4) unitLabel4.textContent = "ELEV";
  if (unitLabel5) unitLabel5.textContent = "TYPE";

  if (unitLatEl) unitLatEl.textContent = airport.name;
  if (unitLonEl) unitLonEl.textContent = `${airport.lat.toFixed(4)}°`;
  if (unitHdgEl) unitHdgEl.textContent = `${airport.lon.toFixed(4)}°`;
  if (unitSpdEl) unitSpdEl.textContent = "—";
  if (unitAltEl) unitAltEl.textContent = "INTL";
  if (unitRow6) unitRow6.style.display = "none";
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Update the panel with current unit data
 * Called every frame for the selected unit
 */
export function updateSelectedUnitInfo(): boolean {
  if (!state.selectedUnit || !deps) return false;

  const { type, index } = state.selectedUnit;

  if (type === "ship") {
    const unitData = deps.getShipState(index);
    if (!unitData) return false;
    updateShipPanel(unitData);
  } else if (type === "aircraft") {
    const unitData = deps.getAircraftState(index);
    if (!unitData) return false;
    updateAircraftPanel(unitData);
  } else if (type === "satellite") {
    const unitData = deps.getSatelliteState(index);
    if (!unitData) return false;
    updateSatellitePanel(unitData);
  } else if (type === "drone") {
    const unitData = deps.getDroneState(index);
    if (!unitData) return false;
    updateDronePanel(unitData);
    deps.updateObservationLine(unitData);
  } else if (type === "airport") {
    const airport = AIRPORTS[index];
    if (!airport) return false;
    updateAirportPanel(airport);
  }

  return true;
}

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

/**
 * Format unit ID for display
 */
export function formatUnitId(type: UnitType, index: number, code?: string): string {
  if (type === "airport" && code) {
    return code;
  }
  return `#${String(index).padStart(4, "0")}`;
}
