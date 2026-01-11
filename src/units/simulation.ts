/**
 * Unit Simulation
 *
 * Motion simulation for ships, aircraft, satellites, and drones.
 * Handles position updates, heading changes, and orbital mechanics.
 */

import type {
  ShipState,
  AircraftState,
  SatelliteState,
  DroneState,
  MotionParams,
} from "../types";
import {
  SHIP_NAMES,
  AIRLINE_CODES,
  SHIPPING_LANES,
  FLIGHT_CORRIDORS,
  normalizeAngle,
  shortestTurnDirection,
  selectWeightedRegion,
  randomInRegion,
} from "../data/demo";
import {
  SATELLITE_ALTITUDE_LEO,
  SATELLITE_ALTITUDE_MEO,
  SATELLITE_ALTITUDE_GEO,
  DRONE_ALTITUDE_MIN,
  DRONE_ALTITUDE_MAX,
  DRONE_PATROL_RADIUS,
  DEG_TO_RAD,
} from "../constants";

// =============================================================================
// DEFAULT MOTION PARAMETERS
// =============================================================================

export const DEFAULT_MOTION_PARAMS: MotionParams = {
  baseSpeed: 1.0,
  speedVariation: 0.3,
  shipSpeedMultiplier: 1.0,
  aircraftSpeedMultiplier: 5.0,
  satelliteSpeedMultiplier: 2.0,
  turnRate: 0.5,
  updateInterval: 16,
};

// =============================================================================
// SHIP STATE INITIALIZATION
// =============================================================================

/**
 * Initialize a ship state.
 */
export function initShipState(
  lat: number,
  lon: number,
  heading: number,
  index: number,
  motionParams: MotionParams = DEFAULT_MOTION_PARAMS
): ShipState {
  const baseSpeed = motionParams.baseSpeed * motionParams.shipSpeedMultiplier;
  const baseTurnRate = motionParams.turnRate;

  return {
    lat,
    lon,
    heading,
    targetHeading: heading,
    baseSpeed: baseSpeed * (0.8 + Math.random() * 0.4),
    baseTurnRate: baseTurnRate * (0.8 + Math.random() * 0.4),
    scale: 0.8 + Math.random() * 0.4,
    nextCourseChange: Math.random() * 30, // Course change interval
    name: SHIP_NAMES[index % SHIP_NAMES.length],
    mmsi: String(211000000 + index),
    sog: 8 + Math.random() * 14, // 8-22 knots
  };
}

// =============================================================================
// AIRCRAFT STATE INITIALIZATION
// =============================================================================

/**
 * Initialize an aircraft state.
 */
export function initAircraftState(
  lat: number,
  lon: number,
  heading: number,
  index: number,
  motionParams: MotionParams = DEFAULT_MOTION_PARAMS
): AircraftState {
  const baseSpeed = motionParams.baseSpeed * motionParams.aircraftSpeedMultiplier;
  const baseTurnRate = motionParams.turnRate;
  const airlineCode = AIRLINE_CODES[index % AIRLINE_CODES.length];
  const flightNum = 100 + (index % 900);

  return {
    lat,
    lon,
    heading,
    targetHeading: heading,
    baseSpeed: baseSpeed * (0.8 + Math.random() * 0.4),
    baseTurnRate: baseTurnRate * (0.8 + Math.random() * 0.4),
    scale: 0.8 + Math.random() * 0.4,
    nextCourseChange: Math.random() * 30,
    callsign: `${airlineCode}${flightNum}`,
    altitude: 28000 + Math.floor(Math.random() * 14) * 1000, // 28000-42000 ft
    groundSpeed: 420 + Math.floor(Math.random() * 80), // 420-500 kts
    flightLevel: Math.floor((28000 + Math.random() * 14000) / 100),
  };
}

// =============================================================================
// SATELLITE STATE INITIALIZATION
// =============================================================================

/** Satellite naming prefixes */
const SATELLITE_PREFIXES = {
  commercial: [
    "STARLINK",
    "ONEWEB",
    "IRIDIUM",
    "GLOBALSTAR",
    "SES",
    "INTELSAT",
  ],
  military: ["USA", "NROL", "COSMOS", "YAOGAN"],
};

/**
 * Initialize a satellite state with orbital elements.
 */
export function initSatelliteState(
  altitude: number,
  inclination: number,
  ascendingNode: number,
  phase: number,
  name: string,
  orbitTypeLabel: string,
  isMilitary: boolean
): SatelliteState {
  // Orbital period scales with altitude (simplified Kepler's 3rd law)
  const basePeriod = 5400; // 90 min in seconds for very low orbit
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
    scale: 1.0,
  };
}

/**
 * Generate a random satellite with realistic orbital parameters.
 */
export function generateRandomSatellite(index: number): SatelliteState {
  // Determine orbit type
  const orbitRoll = Math.random();
  let altitude: number;
  let inclination: number;
  let orbitTypeLabel: string;

  if (orbitRoll < 0.6) {
    // LEO - 60% of satellites
    altitude =
      SATELLITE_ALTITUDE_LEO.min +
      Math.random() * (SATELLITE_ALTITUDE_LEO.max - SATELLITE_ALTITUDE_LEO.min);
    inclination = Math.random() < 0.7 ? 45 + Math.random() * 60 : Math.random() * 30;
    orbitTypeLabel = "LEO";
  } else if (orbitRoll < 0.85) {
    // MEO - 25% of satellites
    altitude =
      SATELLITE_ALTITUDE_MEO.min +
      Math.random() * (SATELLITE_ALTITUDE_MEO.max - SATELLITE_ALTITUDE_MEO.min);
    inclination = 50 + Math.random() * 15;
    orbitTypeLabel = "MEO";
  } else {
    // GEO - 15% of satellites
    altitude =
      SATELLITE_ALTITUDE_GEO.min +
      Math.random() * (SATELLITE_ALTITUDE_GEO.max - SATELLITE_ALTITUDE_GEO.min);
    inclination = Math.random() * 5; // GEO is near-equatorial
    orbitTypeLabel = "GEO";
  }

  const ascendingNode = Math.random() * 360;
  const phase = Math.random() * 360;

  // Generate name
  const isMilitary = Math.random() < 0.15;
  const prefixes = isMilitary
    ? SATELLITE_PREFIXES.military
    : SATELLITE_PREFIXES.commercial;
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = isMilitary
    ? `-${Math.floor(Math.random() * 300)}`
    : `-${1000 + index}`;
  const name = `${prefix}${suffix}`;

  return initSatelliteState(
    altitude,
    inclination,
    ascendingNode,
    phase,
    name,
    orbitTypeLabel,
    isMilitary
  );
}

// =============================================================================
// DRONE STATE INITIALIZATION
// =============================================================================

/** Middle East patrol regions for drones */
const DRONE_PATROL_REGIONS = [
  { lat: 33.5, lon: 44.4, name: "Baghdad" },
  { lat: 36.2, lon: 37.1, name: "Aleppo" },
  { lat: 33.9, lon: 35.5, name: "Beirut" },
  { lat: 31.5, lon: 34.5, name: "Gaza" },
  { lat: 15.4, lon: 44.2, name: "Sanaa" },
];

/**
 * Initialize a drone state with patrol pattern.
 */
export function initDroneState(index: number): DroneState {
  const region = DRONE_PATROL_REGIONS[index % DRONE_PATROL_REGIONS.length];
  const patrolCenterLat = region.lat + (Math.random() - 0.5) * 2;
  const patrolCenterLon = region.lon + (Math.random() - 0.5) * 2;

  // Random initial position on patrol circle
  const initialAngle = Math.random() * Math.PI * 2;
  const patrolRadius = DRONE_PATROL_RADIUS * (0.8 + Math.random() * 0.4);

  const lat =
    patrolCenterLat + (patrolRadius * Math.cos(initialAngle) * 180) / Math.PI;
  const lon =
    patrolCenterLon +
    ((patrolRadius * Math.sin(initialAngle) * 180) / Math.PI) *
      Math.cos(patrolCenterLat * DEG_TO_RAD);

  // Random altitude within drone range
  const altitude =
    DRONE_ALTITUDE_MIN + Math.random() * (DRONE_ALTITUDE_MAX - DRONE_ALTITUDE_MIN);

  // Random target within observation range
  const targetAngle = Math.random() * Math.PI * 2;
  const targetDist = Math.random() * patrolRadius * 0.8;
  const targetLat =
    patrolCenterLat + (targetDist * Math.cos(targetAngle) * 180) / Math.PI;
  const targetLon =
    patrolCenterLon +
    ((targetDist * Math.sin(targetAngle) * 180) / Math.PI) *
      Math.cos(patrolCenterLat * DEG_TO_RAD);

  return {
    lat,
    lon,
    heading: 0,
    altitude,
    patrolCenterLat,
    patrolCenterLon,
    patrolRadius,
    targetLat,
    targetLon,
    phase: initialAngle,
    scale: 1.0,
    name: `RQ-${4 + (index % 3)}${String.fromCharCode(65 + (index % 26))}`,
    orbitDirection: Math.random() < 0.5 ? 1 : -1,
    orbitSpeed: 0.1 + Math.random() * 0.1,
  };
}

// =============================================================================
// MOTION UPDATE FUNCTIONS
// =============================================================================

/**
 * Update a ship or aircraft's motion for one frame.
 */
export function updateUnitMotion(
  unit: ShipState | AircraftState,
  deltaTime: number,
  elapsedTime: number,
  speedMultiplier: number
): void {
  // Update course change timer
  unit.nextCourseChange -= deltaTime;
  if (unit.nextCourseChange <= 0) {
    // Pick new target heading
    unit.targetHeading = normalizeAngle(unit.heading + (Math.random() - 0.5) * 90);
    unit.nextCourseChange = 10 + Math.random() * 20;
  }

  // Smoothly turn towards target heading
  const turnAmount = shortestTurnDirection(unit.heading, unit.targetHeading);
  const maxTurn = unit.baseTurnRate * deltaTime * 60;
  if (Math.abs(turnAmount) > maxTurn) {
    unit.heading = normalizeAngle(unit.heading + Math.sign(turnAmount) * maxTurn);
  } else {
    unit.heading = unit.targetHeading;
  }

  // Move forward
  const speed = unit.baseSpeed * speedMultiplier * deltaTime;
  const headingRad = unit.heading * DEG_TO_RAD;

  // Simple lat/lon movement (not great-circle accurate for short distances)
  unit.lat += Math.cos(headingRad) * speed;
  unit.lon += (Math.sin(headingRad) * speed) / Math.cos(unit.lat * DEG_TO_RAD);

  // Wrap coordinates
  if (unit.lat > 85) unit.lat = 85;
  if (unit.lat < -85) unit.lat = -85;
  if (unit.lon > 180) unit.lon -= 360;
  if (unit.lon < -180) unit.lon += 360;
}

/**
 * Update a satellite's orbital position.
 */
export function updateSatelliteMotion(
  sat: SatelliteState,
  deltaTime: number,
  speedMultiplier: number
): void {
  // Update orbital phase
  const phaseChange = (360 / sat.orbitalPeriod) * deltaTime * speedMultiplier;
  sat.phase = normalizeAngle(sat.phase + phaseChange);

  // Convert orbital elements to lat/lon
  const phaseRad = sat.phase * DEG_TO_RAD;
  const incRad = sat.inclination * DEG_TO_RAD;
  const ascRad = sat.ascendingNode * DEG_TO_RAD;

  // Position in orbital plane
  const xOrbit = Math.cos(phaseRad);
  const yOrbit = Math.sin(phaseRad);

  // Rotate by inclination and ascending node
  const lat = Math.asin(yOrbit * Math.sin(incRad)) * (180 / Math.PI);
  const lonOffset = Math.atan2(
    yOrbit * Math.cos(incRad),
    xOrbit
  );
  sat.lon = normalizeAngle((ascRad + lonOffset) * (180 / Math.PI) - 180);
  sat.lat = lat;

  // Heading is tangent to orbit
  sat.heading = normalizeAngle(sat.phase + 90);
}

/**
 * Update a drone's patrol pattern.
 */
export function updateDroneMotion(drone: DroneState, deltaTime: number): void {
  // Update orbital phase around patrol center
  drone.phase += drone.orbitDirection * drone.orbitSpeed * deltaTime;

  // Calculate new position on patrol circle
  const patrolLat =
    drone.patrolCenterLat +
    (drone.patrolRadius * Math.cos(drone.phase) * 180) / Math.PI;
  const patrolLon =
    drone.patrolCenterLon +
    ((drone.patrolRadius * Math.sin(drone.phase) * 180) / Math.PI) *
      Math.cos(drone.patrolCenterLat * DEG_TO_RAD);

  // Smooth movement towards patrol position
  drone.lat += (patrolLat - drone.lat) * 0.1;
  drone.lon += (patrolLon - drone.lon) * 0.1;

  // Calculate heading (tangent to circle + looking at target)
  const toTargetAngle =
    Math.atan2(
      drone.targetLon - drone.lon,
      drone.targetLat - drone.lat
    ) *
    (180 / Math.PI);
  drone.heading = normalizeAngle(toTargetAngle);
}

// =============================================================================
// DEMO DATA GENERATION
// =============================================================================

/**
 * Generate demo ships along realistic shipping lanes.
 */
export function generateDemoShips(
  count: number,
  useRealisticRoutes: boolean,
  motionParams: MotionParams = DEFAULT_MOTION_PARAMS
): ShipState[] {
  const ships: ShipState[] = [];

  for (let i = 0; i < count; i++) {
    let lat: number, lon: number;

    if (useRealisticRoutes) {
      const region = selectWeightedRegion(SHIPPING_LANES);
      const pos = randomInRegion(region.latRange, region.lonRange);
      lat = pos.lat;
      lon = pos.lon;
    } else {
      // Global distribution
      lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
      lon = Math.random() * 360 - 180;
    }

    ships.push(initShipState(lat, lon, Math.random() * 360, i, motionParams));
  }

  return ships;
}

/**
 * Generate demo aircraft along realistic flight corridors.
 */
export function generateDemoAircraft(
  count: number,
  useRealisticRoutes: boolean,
  motionParams: MotionParams = DEFAULT_MOTION_PARAMS
): AircraftState[] {
  const aircraft: AircraftState[] = [];

  for (let i = 0; i < count; i++) {
    let lat: number, lon: number;

    if (useRealisticRoutes) {
      const region = selectWeightedRegion(FLIGHT_CORRIDORS);
      const pos = randomInRegion(region.latRange, region.lonRange);
      lat = pos.lat;
      lon = pos.lon;
    } else {
      // Global distribution
      lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
      lon = Math.random() * 360 - 180;
    }

    aircraft.push(initAircraftState(lat, lon, Math.random() * 360, i, motionParams));
  }

  return aircraft;
}

/**
 * Generate demo satellites.
 */
export function generateDemoSatellites(count: number): SatelliteState[] {
  const satellites: SatelliteState[] = [];

  for (let i = 0; i < count; i++) {
    satellites.push(generateRandomSatellite(i));
  }

  return satellites;
}

/**
 * Generate demo drones.
 */
export function generateDemoDrones(count: number): DroneState[] {
  const drones: DroneState[] = [];

  for (let i = 0; i < count; i++) {
    drones.push(initDroneState(i));
  }

  return drones;
}
