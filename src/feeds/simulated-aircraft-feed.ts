/**
 * Simulated Aircraft Feed
 *
 * Generates realistic simulated ADS-B-like aircraft data.
 * Can be replaced with a real FlightAware/ADS-B WebSocket feed later.
 */

import { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";
import type { AircraftUpdate, FeedConfig } from "./types";
import type { AircraftState } from "../types";
import {
  AIRLINE_CODES,
  FLIGHT_CORRIDORS,
  selectWeightedRegion,
  randomInRegion,
  normalizeAngle,
  shortestTurnDirection,
} from "../data/demo";
import { getWeightedRandomAircraftType } from "../data/icao-aircraft";

/** Aircraft-specific feed configuration */
export interface AircraftFeedConfig extends FeedConfig {
  /** Use realistic flight corridors vs global distribution */
  useRealisticRoutes: boolean;
  /** Base speed in degrees/second */
  baseSpeed: number;
  /** Speed multiplier for time acceleration */
  speedMultiplier: number;
  /** Base turn rate in degrees/second */
  baseTurnRate: number;
}

const DEFAULT_AIRCRAFT_CONFIG: AircraftFeedConfig = {
  ...DEFAULT_FEED_CONFIG,
  updateRateMs: 100,
  maxUnits: 500,
  useRealisticRoutes: false,
  baseSpeed: 0.02,
  speedMultiplier: 10.0,
  baseTurnRate: 45,
};

/** Extended aircraft state with simulation fields */
interface SimulatedAircraftState extends AircraftState {
  targetHeading: number;
  baseSpeed: number;
  baseTurnRate: number;
  nextCourseChange: number;
}

/**
 * Simulated ADS-B aircraft feed.
 * Generates aircraft with realistic motion along flight corridors.
 */
export class SimulatedAircraftFeed extends BaseFeed<AircraftUpdate, AircraftState> {
  readonly id = "simulated-aircraft";
  readonly name = "Simulated ADS-B";
  readonly type = "aircraft" as const;

  protected _config: AircraftFeedConfig;
  protected _units: Map<string, SimulatedAircraftState> = new Map();
  private _lastTickTime: number = 0;

  constructor(config: Partial<AircraftFeedConfig> = {}) {
    super();
    this._config = { ...DEFAULT_AIRCRAFT_CONFIG, ...config };
  }

  get config(): AircraftFeedConfig {
    return { ...this._config };
  }

  protected initializeUnits(): void {
    this._units.clear();

    for (let i = 0; i < this._config.maxUnits; i++) {
      const aircraft = this.createAircraft(i);
      this._units.set(aircraft.callsign, aircraft);
    }

    this._lastTickTime = performance.now();
    console.log(`[${this.id}] Initialized ${this._units.size} aircraft`);
  }

  private createAircraft(index: number): SimulatedAircraftState {
    let lat: number, lon: number;

    if (this._config.useRealisticRoutes) {
      const region = selectWeightedRegion(FLIGHT_CORRIDORS);
      const pos = randomInRegion(region.latRange, region.lonRange);
      lat = pos.lat;
      lon = pos.lon;
    } else {
      // Global distribution using spherical coordinates
      lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
      lon = Math.random() * 360 - 180;
    }

    const heading = Math.random() * 360;
    const speedVariation = 0.8 + Math.random() * 0.4;
    const airlineCode = AIRLINE_CODES[index % AIRLINE_CODES.length];
    const flightNum = 100 + (index % 900);

    // Get aircraft type from ICAO database
    const icaoType = getWeightedRandomAircraftType();
    const altitude = icaoType.typicalAltitude
      ? icaoType.typicalAltitude + Math.floor((Math.random() - 0.5) * 4000)
      : 28000 + Math.floor(Math.random() * 14) * 1000;
    const groundSpeed = icaoType.typicalSpeed
      ? icaoType.typicalSpeed + Math.floor((Math.random() - 0.5) * 40)
      : 420 + Math.floor(Math.random() * 80);

    return {
      lat,
      lon,
      heading,
      targetHeading: heading,
      baseSpeed: this._config.baseSpeed * speedVariation,
      baseTurnRate: this._config.baseTurnRate * speedVariation,
      scale: 0.8 + Math.random() * 0.4,
      nextCourseChange: Math.random() * 30,
      callsign: `${airlineCode}${flightNum}`,
      altitude,
      groundSpeed,
      flightLevel: Math.floor(altitude / 100),
      aircraftType: icaoType.category,
      icaoTypeCode: icaoType.icao,
      // Simulated aircraft don't have altitude trends (static altitude)
      altitudeTrend: 0,
      prevAltitude: altitude,
    };
  }

  protected tick(): void {
    const now = performance.now();
    const deltaTime = (now - this._lastTickTime) / 1000;
    this._lastTickTime = now;

    // Skip if delta is too large (tab was inactive)
    if (deltaTime > 1) return;

    const updates: AircraftUpdate[] = [];

    for (const aircraft of this._units.values()) {
      this.updateAircraftMotion(aircraft, deltaTime);

      updates.push({
        callsign: aircraft.callsign,
        lat: aircraft.lat,
        lon: aircraft.lon,
        heading: aircraft.heading,
        altitude: aircraft.altitude,
        groundSpeed: aircraft.groundSpeed,
        timestamp: now,
      });
    }

    this.emit(updates);
  }

  private updateAircraftMotion(aircraft: SimulatedAircraftState, deltaTime: number): void {
    const speedMultiplier = this._config.speedMultiplier;
    const currentSpeed = aircraft.baseSpeed * speedMultiplier;
    const currentTurnRate = aircraft.baseTurnRate * speedMultiplier;

    // Smooth heading interpolation
    const turnDiff = shortestTurnDirection(aircraft.heading, aircraft.targetHeading);
    const maxTurn = currentTurnRate * deltaTime;

    if (Math.abs(turnDiff) <= maxTurn) {
      aircraft.heading = aircraft.targetHeading;
    } else {
      aircraft.heading = normalizeAngle(aircraft.heading + Math.sign(turnDiff) * maxTurn);
    }

    // Calculate movement
    const headingRad = aircraft.heading * (Math.PI / 180);
    const latSpeed = currentSpeed * Math.cos(headingRad);
    const lonSpeed = currentSpeed * Math.sin(headingRad) /
                     Math.max(0.1, Math.cos(aircraft.lat * Math.PI / 180));

    // Update position
    aircraft.lat += latSpeed * deltaTime;
    aircraft.lon += lonSpeed * deltaTime;

    // Clamp and wrap
    aircraft.lat = Math.max(-85, Math.min(85, aircraft.lat));
    if (aircraft.lon > 180) aircraft.lon -= 360;
    if (aircraft.lon < -180) aircraft.lon += 360;

    // Course changes
    aircraft.nextCourseChange -= deltaTime;
    if (aircraft.nextCourseChange <= 0) {
      const courseChange = (Math.random() - 0.5) * 60;
      aircraft.targetHeading = normalizeAngle(aircraft.heading + courseChange);

      if (Math.random() < 0.1) {
        aircraft.targetHeading = normalizeAngle(aircraft.heading + (Math.random() - 0.5) * 180);
      }

      aircraft.nextCourseChange = 10 + (Math.random() - 0.5) * 10;
    }
  }

  protected getUnitId(unit: AircraftState): string {
    return unit.callsign;
  }

  /**
   * Update the number of aircraft.
   */
  setAircraftCount(count: number): void {
    const wasRunning = this._running;
    if (wasRunning) this.stop();

    this._config.maxUnits = count;

    if (wasRunning) this.start();
  }
}
