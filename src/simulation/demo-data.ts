/**
 * Handles the generation of demo data for ships, aircraft, satellites, and drones.
 */
import { state } from '../state';
import {
  SHIPPING_LANES,
  FLIGHT_CORRIDORS,
  randomInRegion,
  selectWeightedRegion,
  AIRLINE_CODES,
  SHIP_NAMES,
} from '../data/demo';
import {
  SATELLITE_ALTITUDE_LEO,
  SATELLITE_ALTITUDE_MEO,
  SATELLITE_ALTITUDE_GEO,
  DRONE_PATROL_RADIUS
} from '../constants';
import { initDroneState } from './motion';
import { motionParams } from './motion';

// Aliases for simulation state arrays
const shipSimState = state.ships;
const aircraftSimState = state.aircraft;
const satelliteSimState = state.satellites;
const droneSimState = state.drones;

// Unit count parameters (adjustable via GUI)
export const unitCountParams = {
  shipCount: 200,
  aircraftCount: 300,
  satelliteCount: 4000,
  droneCount: 5,
  totalCount: 500,
  realisticRoutes: false,
  showShips: true,
  showAircraft: true,
  showSatellites: true,
  showDrones: true,
};

function initUnitState(lat, lon, heading, isAircraft, index = 0) {
    const baseSpeedRef = isAircraft ? motionParams.aircraftBaseSpeed : motionParams.shipBaseSpeed;
    const baseTurnRef = isAircraft ? motionParams.aircraftBaseTurnRate : motionParams.shipBaseTurnRate;
  
    const baseState = {
      lat,
      lon,
      heading,
      targetHeading: heading,
      baseSpeed: baseSpeedRef * (0.8 + Math.random() * 0.4),
      baseTurnRate: baseTurnRef * (0.8 + Math.random() * 0.4),
      scale: 0.8 + Math.random() * 0.4,
      nextCourseChange: Math.random() * motionParams.courseChangeInterval,
      isAircraft,
    };
  
    if (isAircraft) {
      const airlineCode = AIRLINE_CODES[index % AIRLINE_CODES.length];
      const flightNum = 100 + (index % 900);
      baseState.callsign = `${airlineCode}${flightNum}`;
      baseState.altitude = 28000 + Math.floor(Math.random() * 14) * 1000;
      baseState.groundSpeed = 420 + Math.floor(Math.random() * 80);
    } else {
      baseState.name = SHIP_NAMES[index % SHIP_NAMES.length];
      baseState.mmsi = String(211000000 + index);
      baseState.sog = 8 + Math.random() * 14;
    }
  
    return baseState;
}
  
function initSatelliteState(altitude, inclination, ascendingNode, phase, name, orbitTypeLabel, isMilitary) {
    const basePeriod = 5400;
    const orbitalPeriod = basePeriod * Math.pow(1 + altitude * 5, 1.5);
  
    return {
      altitude,
      inclination,
      ascendingNode,
      phase,
      orbitalPeriod,
      name,
      orbitTypeLabel,
      isMilitary,
      lat: 0,
      lon: 0,
      heading: 0,
      scale: 1.0 + Math.random() * 0.5,
    };
}

function generateSatelliteName(orbitTypeLabel, isMilitary, index) {
    if (isMilitary) {
      const militaryTypes = [
        { prefix: 'USA', numRange: [200, 350] },
        { prefix: 'NROL', numRange: [40, 120] },
        { prefix: 'KEYHOLE', numRange: [11, 18] },
        { prefix: 'LACROSSE', numRange: [1, 6] },
        { prefix: 'MENTOR', numRange: [1, 8] },
        { prefix: 'COSMOS', numRange: [2500, 2600] },
      ];
      const type = militaryTypes[index % militaryTypes.length];
      const num = type.numRange[0] + Math.floor(Math.random() * (type.numRange[1] - type.numRange[0]));
      return `${type.prefix}-${num}`;
    } else {
      if (orbitTypeLabel === 'LEO') {
        const leoTypes = [
          { prefix: 'STARLINK', numRange: [1000, 5000] },
          { prefix: 'ONEWEB', numRange: [1, 600] },
          { prefix: 'IRIDIUM', numRange: [100, 180] },
          { prefix: 'PLANET', numRange: [1, 200] },
          { prefix: 'SPIRE', numRange: [1, 150] },
        ];
        const type = leoTypes[index % leoTypes.length];
        const num = type.numRange[0] + Math.floor(Math.random() * (type.numRange[1] - type.numRange[0]));
        return `${type.prefix}-${num}`;
      } else if (orbitTypeLabel === 'MEO') {
        const meoTypes = [
          { prefix: 'GPS IIF', numRange: [1, 12] },
          { prefix: 'GPS III', numRange: [1, 10] },
          { prefix: 'GLONASS', numRange: [750, 800] },
          { prefix: 'GALILEO', numRange: [201, 230] },
          { prefix: 'BEIDOU', numRange: [40, 60] },
        ];
        const type = meoTypes[index % meoTypes.length];
        const num = type.numRange[0] + Math.floor(Math.random() * (type.numRange[1] - type.numRange[0]));
        return `${type.prefix}-${num}`;
      } else { // GEO
        const geoTypes = [
          { prefix: 'GOES', numRange: [16, 19] },
          { prefix: 'SES', numRange: [1, 20] },
          { prefix: 'INTELSAT', numRange: [30, 40] },
          { prefix: 'ECHOSTAR', numRange: [18, 24] },
          { prefix: 'VIASAT', numRange: [1, 4] },
        ];
        const type = geoTypes[index % geoTypes.length];
        const num = type.numRange[0] + Math.floor(Math.random() * (type.numRange[1] - type.numRange[0]));
        return `${type.prefix}-${num}`;
      }
    }
}

export function generateSatelliteData(count = unitCountParams.satelliteCount) {
  satelliteSimState.length = 0;

  for (let i = 0; i < count; i++) {
    const orbitType = Math.random();
    let altitude, inclination, orbitTypeLabel;

    if (orbitType < 0.60) {
      orbitTypeLabel = 'LEO';
      altitude = SATELLITE_ALTITUDE_LEO.min + Math.random() * (SATELLITE_ALTITUDE_LEO.max - SATELLITE_ALTITUDE_LEO.min);
      const inclinationType = Math.random();
      if (inclinationType < 0.3) inclination = 51 + Math.random() * 5;
      else if (inclinationType < 0.6) inclination = 85 + Math.random() * 10;
      else inclination = 20 + Math.random() * 60;
    } else if (orbitType < 0.85) {
      orbitTypeLabel = 'MEO';
      altitude = SATELLITE_ALTITUDE_MEO.min + Math.random() * (SATELLITE_ALTITUDE_MEO.max - SATELLITE_ALTITUDE_MEO.min);
      inclination = 50 + Math.random() * 15;
    } else {
      orbitTypeLabel = 'GEO';
      altitude = SATELLITE_ALTITUDE_GEO.min + Math.random() * (SATELLITE_ALTITUDE_GEO.max - SATELLITE_ALTITUDE_GEO.min);
      inclination = Math.random() * 5;
    }

    const isMilitary = Math.random() < 0.25;
    const name = generateSatelliteName(orbitTypeLabel, isMilitary, i);
    const ascendingNode = Math.random() * 360;
    const phase = Math.random() * 360;

    satelliteSimState.push(initSatelliteState(altitude, inclination, ascendingNode, phase, name, orbitTypeLabel, isMilitary));
  }
}

export function generateDroneData(count = unitCountParams.droneCount) {
    droneSimState.length = 0;
  
    const PATROL_ZONES = [
      { centerLat: 34.5, centerLon: 40.5, targetLat: 34.3, targetLon: 40.2, name: "Syria-Iraq Border" },
      { centerLat: 35.2, centerLon: 38.8, targetLat: 35.0, targetLon: 39.0, name: "Eastern Syria" },
      { centerLat: 36.2, centerLon: 43.1, targetLat: 36.4, targetLon: 43.3, name: "Northern Iraq" },
      { centerLat: 15.3, centerLon: 44.2, targetLat: 15.0, targetLon: 44.0, name: "Yemen" },
      { centerLat: 26.5, centerLon: 52.0, targetLat: 26.2, targetLon: 51.8, name: "Persian Gulf" },
    ];
  
    const numZones = PATROL_ZONES.length;
  
    for (let i = 0; i < count; i++) {
      const zone = PATROL_ZONES[i % numZones];
      const offsetLat = (Math.random() - 0.5) * 2;
      const offsetLon = (Math.random() - 0.5) * 2;
  
      droneSimState.push(initDroneState(
        zone.centerLat + offsetLat,
        zone.centerLon + offsetLon,
        DRONE_PATROL_RADIUS,
        zone.targetLat + offsetLat * 0.5,
        zone.targetLon + offsetLon * 0.5
      ));
    }
}

export function generateDemoData(shipCount = unitCountParams.shipCount, aircraftCount = unitCountParams.aircraftCount) {
  shipSimState.length = 0;
  aircraftSimState.length = 0;

  if (unitCountParams.realisticRoutes) {
    for (let i = 0; i < shipCount; i++) {
      const region = selectWeightedRegion(SHIPPING_LANES);
      const { lat, lon } = randomInRegion(region.latRange, region.lonRange);
      shipSimState.push(initUnitState(lat, lon, Math.random() * 360, false, i));
    }
    for (let i = 0; i < aircraftCount; i++) {
      const region = selectWeightedRegion(FLIGHT_CORRIDORS);
      const { lat, lon } = randomInRegion(region.latRange, region.lonRange);
      aircraftSimState.push(initUnitState(lat, lon, Math.random() * 360, true, i));
    }
  } else {
    for (let i = 0; i < shipCount; i++) {
      const lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
      const lon = Math.random() * 360 - 180;
      shipSimState.push(initUnitState(lat, lon, Math.random() * 360, false, i));
    }
    for (let i = 0; i < aircraftCount; i++) {
      const lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
      const lon = Math.random() * 360 - 180;
      aircraftSimState.push(initUnitState(lat, lon, Math.random() * 360, true, i));
    }
  }
}

export function updateUnitCounts() {
  const total = unitCountParams.totalCount;
  unitCountParams.shipCount = Math.floor(total * 0.4);
  unitCountParams.aircraftCount = Math.floor(total * 0.6);
  generateDemoData(unitCountParams.shipCount, unitCountParams.aircraftCount);
}
