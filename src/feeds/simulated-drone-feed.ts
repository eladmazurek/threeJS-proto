/**
 * Simulated Drone Feed
 *
 * Generates realistic simulated UAV/drone patrol data.
 * Drones fly circular patrol patterns over strategic regions.
 * Can be replaced with a real tactical feed later.
 */

import { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";
import type { DroneUpdate, FeedConfig } from "./types";
import type { DroneState } from "../types";
import {
  EARTH_RADIUS,
  DRONE_ALTITUDE_MIN,
  DRONE_ALTITUDE_MAX,
  DRONE_PATROL_RADIUS,
} from "../constants";

/** Drone-specific feed configuration */
export interface DroneFeedConfig extends FeedConfig {
  /** Speed multiplier for time acceleration */
  speedMultiplier: number;
  /** Orbit period in seconds (time to complete one patrol circle) */
  orbitPeriod: number;
}

const DEFAULT_DRONE_CONFIG: DroneFeedConfig = {
  ...DEFAULT_FEED_CONFIG,
  updateRateMs: 100,
  maxUnits: 10,
  speedMultiplier: 5.0,
  orbitPeriod: 120,
};

/** Middle East patrol zones */
const PATROL_ZONES = [
  { centerLat: 34.5, centerLon: 40.5, targetLat: 34.3, targetLon: 40.2, name: "Syria-Iraq Border" },
  { centerLat: 35.2, centerLon: 38.8, targetLat: 35.0, targetLon: 39.0, name: "Eastern Syria" },
  { centerLat: 36.2, centerLon: 43.1, targetLat: 36.4, targetLon: 43.3, name: "Northern Iraq" },
  { centerLat: 15.3, centerLon: 44.2, targetLat: 15.0, targetLon: 44.0, name: "Yemen" },
  { centerLat: 26.5, centerLon: 52.0, targetLat: 26.2, targetLon: 51.8, name: "Persian Gulf" },
  { centerLat: 31.5, centerLon: 64.0, targetLat: 31.3, targetLon: 64.2, name: "Helmand" },
  { centerLat: 32.5, centerLon: 15.0, targetLat: 32.2, targetLon: 14.8, name: "Libya" },
  { centerLat: 11.5, centerLon: 43.0, targetLat: 11.2, targetLon: 42.8, name: "Horn of Africa" },
];

/**
 * Simulated drone/UAV feed.
 * Generates drones with circular patrol patterns.
 */
export class SimulatedDroneFeed extends BaseFeed<DroneUpdate, DroneState> {
  readonly id = "simulated-drones";
  readonly name = "Simulated UAV";
  readonly type = "drone" as const;

  protected _config: DroneFeedConfig;
  protected _units: Map<string, DroneState> = new Map();
  private _lastTickTime: number = 0;

  constructor(config: Partial<DroneFeedConfig> = {}) {
    super();
    this._config = { ...DEFAULT_DRONE_CONFIG, ...config };
  }

  get config(): DroneFeedConfig {
    return { ...this._config };
  }

  protected initializeUnits(): void {
    this._units.clear();

    for (let i = 0; i < this._config.maxUnits; i++) {
      const drone = this.createDrone(i);
      const droneId = `UAV-${String(i + 1).padStart(3, "0")}`;
      this._units.set(droneId, drone);
    }

    // Initialize positions
    for (const drone of this._units.values()) {
      this.updatePatrolPosition(drone, 0);
    }

    this._lastTickTime = performance.now();
    console.log(`[${this.id}] Initialized ${this._units.size} drones`);
  }

  private createDrone(index: number): DroneState {
    const zone = PATROL_ZONES[index % PATROL_ZONES.length];

    // Add variation to patrol center
    const offsetLat = (Math.random() - 0.5) * 2;
    const offsetLon = (Math.random() - 0.5) * 2;

    const patrolCenterLat = zone.centerLat + offsetLat;
    const patrolCenterLon = zone.centerLon + offsetLon;

    // Random altitude in UAV range
    const altitude = DRONE_ALTITUDE_MIN +
      Math.random() * (DRONE_ALTITUDE_MAX - DRONE_ALTITUDE_MIN);

    return {
      lat: patrolCenterLat,
      lon: patrolCenterLon,
      heading: 0,
      altitude,
      patrolCenterLat,
      patrolCenterLon,
      patrolRadius: DRONE_PATROL_RADIUS,
      targetLat: zone.targetLat + offsetLat * 0.5,
      targetLon: zone.targetLon + offsetLon * 0.5,
      phase: Math.random() * 360,
      scale: 0.8 + Math.random() * 0.4,
      name: `RQ-${4 + (index % 3)}${String.fromCharCode(65 + (index % 26))}`,
      orbitDirection: Math.random() < 0.5 ? 1 : -1,
      orbitSpeed: 1.0,
    };
  }

  protected tick(): void {
    const now = performance.now();
    const deltaTime = (now - this._lastTickTime) / 1000;
    this._lastTickTime = now;

    if (deltaTime > 1) return;

    const updates: DroneUpdate[] = [];

    for (const [droneId, drone] of this._units) {
      this.updatePatrolPosition(drone, deltaTime);

      updates.push({
        id: droneId,
        name: drone.name,
        lat: drone.lat,
        lon: drone.lon,
        altitude: drone.altitude,
        heading: drone.heading,
        targetLat: drone.targetLat,
        targetLon: drone.targetLon,
        timestamp: now,
      });
    }

    this.emit(updates);
  }

  private updatePatrolPosition(drone: DroneState, deltaTime: number): void {
    const speedMultiplier = this._config.speedMultiplier;

    // Orbit rate: complete a circle in orbitPeriod seconds
    const phaseRate = (360 / this._config.orbitPeriod) * speedMultiplier;
    drone.phase = (drone.phase + phaseRate * deltaTime * drone.orbitDirection) % 360;
    if (drone.phase < 0) drone.phase += 360;

    const phaseRad = drone.phase * (Math.PI / 180);

    // Compute position on patrol circle
    const latOffset = Math.sin(phaseRad) * drone.patrolRadius * (180 / Math.PI) / EARTH_RADIUS;
    const lonOffset = Math.cos(phaseRad) * drone.patrolRadius * (180 / Math.PI) / EARTH_RADIUS /
      Math.cos(drone.patrolCenterLat * Math.PI / 180);

    drone.lat = drone.patrolCenterLat + latOffset;
    drone.lon = drone.patrolCenterLon + lonOffset;

    // Heading tangent to circle
    drone.heading = (360 - drone.phase + (drone.orbitDirection > 0 ? 0 : 180)) % 360;
  }

  protected getUnitId(unit: DroneState): string {
    return unit.name;
  }

  /**
   * Update the number of drones.
   */
  setDroneCount(count: number): void {
    const wasRunning = this._running;
    if (wasRunning) this.stop();

    this._config.maxUnits = count;

    if (wasRunning) this.start();
  }
}
