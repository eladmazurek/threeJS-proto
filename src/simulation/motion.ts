/**
 * Handles the motion simulation for all units.
 */
import { state } from '../state';
import { normalizeAngle, shortestTurnDirection } from '../data/demo';
import { DRONE_ALTITUDE_MIN, DRONE_ALTITUDE_MAX, EARTH_RADIUS } from '../constants';

// Motion parameters - simplified with single speed slider per type
export const motionParams = {
  // Speed multipliers (1 = normal, higher = faster)
  shipSpeed: 10.0,
  aircraftSpeed: 10.0,
  satelliteSpeed: 10.0,
  droneSpeed: 5.0,

  // Base values (internal, not exposed to GUI)
  shipBaseSpeed: 0.002,      // degrees per second at multiplier 1
  shipBaseTurnRate: 15,      // degrees per second at multiplier 1
  aircraftBaseSpeed: 0.02,   // degrees per second at multiplier 1
  aircraftBaseTurnRate: 45,  // degrees per second at multiplier 1
  droneOrbitPeriod: 120,     // seconds to complete one patrol orbit

  // How often units change course (seconds)
  courseChangeInterval: 10,
  courseChangeVariance: 5,

  // Performance: motion update interval in ms (0 = every frame)
  motionUpdateInterval: 10, // Update motion every 10ms (~100 updates/sec)
};

// Simulation state for all units - aliased from centralized state module
const shipSimState = state.ships;
const aircraftSimState = state.aircraft;
const satelliteSimState = state.satellites;
const droneSimState = state.drones;

/**
 * Initialize drone state with patrol pattern
 */
export function initDroneState(patrolCenterLat, patrolCenterLon, patrolRadius, targetLat, targetLon) {
  // Random altitude in realistic UAV range (25,000-60,000 ft)
  const altitude = DRONE_ALTITUDE_MIN + Math.random() * (DRONE_ALTITUDE_MAX - DRONE_ALTITUDE_MIN);

  return {
    // Patrol pattern
    patrolCenterLat,
    patrolCenterLon,
    patrolRadius,
    phase: Math.random() * 360, // Starting position in orbit
    altitude, // Per-drone altitude

    // Ground target (what the drone is observing)
    targetLat,
    targetLon,

    // Current position (computed from patrol)
    lat: patrolCenterLat,
    lon: patrolCenterLon,
    heading: 0,
    scale: 0.8 + Math.random() * 0.4, // Same as aircraft
  };
}

/**
 * Update drone position along circular patrol path
 */
function updateDroneMotion(drone, deltaTime, speedMultiplier) {
  // Orbit rate: complete a circle in droneOrbitPeriod seconds
  const phaseRate = (360 / motionParams.droneOrbitPeriod) * speedMultiplier;
  drone.phase = (drone.phase + phaseRate * deltaTime) % 360;

  const phaseRad = drone.phase * (Math.PI / 180);

  // Compute position on patrol circle
  const latOffset = Math.sin(phaseRad) * drone.patrolRadius * (180 / Math.PI) / EARTH_RADIUS;
  const lonOffset = Math.cos(phaseRad) * drone.patrolRadius * (180 / Math.PI) / EARTH_RADIUS /
    Math.cos(drone.patrolCenterLat * Math.PI / 180);

  drone.lat = drone.patrolCenterLat + latOffset;
  drone.lon = drone.patrolCenterLon + lonOffset;

  // Heading is tangent to circle, pointing in direction of motion
  drone.heading = (360 - drone.phase) % 360;
}


/**
 * Update satellite position based on orbital mechanics
 */
function updateSatelliteMotion(sat, deltaTime, speedMultiplier) {
  const phaseRate = (360 / sat.orbitalPeriod) * speedMultiplier;
  sat.phase = normalizeAngle(sat.phase + phaseRate * deltaTime);

  const phaseRad = sat.phase * (Math.PI / 180);
  const inclinationRad = sat.inclination * (Math.PI / 180);

  const xOrbit = Math.cos(phaseRad);
  const yOrbit = Math.sin(phaseRad);

  sat.lat = Math.asin(yOrbit * Math.sin(inclinationRad)) * (180 / Math.PI);

  const lonInOrbit = Math.atan2(yOrbit * Math.cos(inclinationRad), xOrbit) * (180 / Math.PI);
  sat.lon = normalizeAngle(sat.ascendingNode + lonInOrbit + 180) - 180;

  const dLatDPhase = Math.cos(phaseRad) * Math.sin(inclinationRad);
  const dLonDPhase = (Math.cos(phaseRad) * Math.cos(inclinationRad) * xOrbit + yOrbit * (-Math.sin(phaseRad))) /
                     (xOrbit * xOrbit + yOrbit * yOrbit * Math.cos(inclinationRad) * Math.cos(inclinationRad));

  sat.heading = normalizeAngle(90 - Math.atan2(dLatDPhase, dLonDPhase * Math.cos(sat.lat * Math.PI / 180)) * (180 / Math.PI));
}

/**
 * Update a single unit's position and heading
 */
function updateUnitMotion(unit, deltaTime) {
  const speedMultiplier = unit.isAircraft ? motionParams.aircraftSpeed : motionParams.shipSpeed;
  const currentSpeed = unit.baseSpeed * speedMultiplier;
  const currentTurnRate = unit.baseTurnRate * speedMultiplier;

  const turnDiff = shortestTurnDirection(unit.heading, unit.targetHeading);
  const maxTurn = currentTurnRate * deltaTime;

  if (Math.abs(turnDiff) <= maxTurn) {
    unit.heading = unit.targetHeading;
  } else {
    unit.heading = normalizeAngle(unit.heading + Math.sign(turnDiff) * maxTurn);
  }

  const headingRad = unit.heading * (Math.PI / 180);
  const latSpeed = currentSpeed * Math.cos(headingRad);
  const lonSpeed = currentSpeed * Math.sin(headingRad) / Math.max(0.1, Math.cos(unit.lat * Math.PI / 180));

  unit.lat += latSpeed * deltaTime;
  unit.lon += lonSpeed * deltaTime;
  unit.lat = Math.max(-85, Math.min(85, unit.lat));

  if (unit.lon > 180) unit.lon -= 360;
  if (unit.lon < -180) unit.lon += 360;

  unit.nextCourseChange -= deltaTime;
  if (unit.nextCourseChange <= 0) {
    const courseChange = (Math.random() - 0.5) * 60;
    unit.targetHeading = normalizeAngle(unit.heading + courseChange);
    if (Math.random() < 0.1) {
      unit.targetHeading = normalizeAngle(unit.heading + (Math.random() - 0.5) * 180);
    }
    unit.nextCourseChange = motionParams.courseChangeInterval +
      (Math.random() - 0.5) * motionParams.courseChangeVariance * 2;
  }
}

/**
 * Update all units' motion and refresh the display.
 * Throttled to reduce CPU load.
 */
export function updateMotionSimulation(currentTime, attributeUpdaters) {
  const deltaTime = state.lastSimTime === 0 ? 0 : currentTime - state.lastSimTime;
  state.lastSimTime = currentTime;

  if (deltaTime > 1) return;

  const now = performance.now();
  const timeSinceLastUpdate = now - state.lastMotionUpdateTime;

  if (motionParams.motionUpdateInterval > 0 && timeSinceLastUpdate < motionParams.motionUpdateInterval) {
    return;
  }

  const physicsDelta = motionParams.motionUpdateInterval > 0
    ? timeSinceLastUpdate / 1000
    : deltaTime;

  state.lastMotionUpdateTime = now;

  for (let i = 0; i < shipSimState.length; i++) {
    updateUnitMotion(shipSimState[i], physicsDelta);
  }

  for (let i = 0; i < aircraftSimState.length; i++) {
    updateUnitMotion(aircraftSimState[i], physicsDelta);
  }

  const satSpeedMultiplier = motionParams.satelliteSpeed;
  for (let i = 0; i < satelliteSimState.length; i++) {
    updateSatelliteMotion(satelliteSimState[i], physicsDelta, satSpeedMultiplier);
  }

  const droneSpeedMultiplier = motionParams.droneSpeed;
  for (let i = 0; i < droneSimState.length; i++) {
    updateDroneMotion(droneSimState[i], physicsDelta, droneSpeedMultiplier);
  }

  // GPU vertex shader will compute position and orientation
  attributeUpdaters.updateShipAttributes();
  attributeUpdaters.updateAircraftAttributes();
  attributeUpdaters.updateSatelliteAttributes();
  attributeUpdaters.updateDroneAttributes();
}
