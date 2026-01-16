/**
 * Simulated Satellite Feed
 *
 * Generates realistic simulated TLE/orbital satellite data.
 * Uses Keplerian orbital mechanics for realistic motion.
 * Can be replaced with a real Space-Track/Celestrak feed later.
 */

import { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";
import type { SatelliteUpdate, FeedConfig } from "./types";
import type { SatelliteState } from "../types";
import { normalizeAngle } from "../data/demo";
import {
  SATELLITE_ALTITUDE_LEO,
  SATELLITE_ALTITUDE_MEO,
  SATELLITE_ALTITUDE_GEO,
} from "../constants";

/** Satellite-specific feed configuration */
export interface SatelliteFeedConfig extends FeedConfig {
  /** Speed multiplier for time acceleration */
  speedMultiplier: number;
}

const DEFAULT_SATELLITE_CONFIG: SatelliteFeedConfig = {
  ...DEFAULT_FEED_CONFIG,
  updateRateMs: 100,
  maxUnits: 4000,
  speedMultiplier: 10.0,
};

/** Satellite naming prefixes by type */
const SATELLITE_NAMES = {
  LEO: [
    { prefix: "STARLINK", range: [1000, 5000] },
    { prefix: "ONEWEB", range: [1, 600] },
    { prefix: "IRIDIUM", range: [100, 180] },
    { prefix: "PLANET", range: [1, 200] },
    { prefix: "SPIRE", range: [1, 150] },
  ],
  MEO: [
    { prefix: "GPS IIF", range: [1, 12] },
    { prefix: "GPS III", range: [1, 10] },
    { prefix: "GLONASS", range: [750, 800] },
    { prefix: "GALILEO", range: [201, 230] },
    { prefix: "BEIDOU", range: [40, 60] },
  ],
  GEO: [
    { prefix: "GOES", range: [16, 19] },
    { prefix: "SES", range: [1, 20] },
    { prefix: "INTELSAT", range: [30, 40] },
    { prefix: "ECHOSTAR", range: [18, 24] },
    { prefix: "VIASAT", range: [1, 4] },
  ],
  MILITARY: [
    { prefix: "USA", range: [200, 350] },
    { prefix: "NROL", range: [40, 120] },
    { prefix: "KEYHOLE", range: [11, 18] },
    { prefix: "COSMOS", range: [2500, 2600] },
  ],
};

/**
 * Simulated satellite feed using Keplerian orbital mechanics.
 */
export class SimulatedSatelliteFeed extends BaseFeed<SatelliteUpdate, SatelliteState> {
  readonly id = "simulated-satellites";
  readonly name = "Simulated TLE";
  readonly type = "satellite" as const;

  protected _config: SatelliteFeedConfig;
  protected _units: Map<string, SatelliteState> = new Map();
  private _lastTickTime: number = 0;

  constructor(config: Partial<SatelliteFeedConfig> = {}) {
    super();
    this._config = { ...DEFAULT_SATELLITE_CONFIG, ...config };
  }

  get config(): SatelliteFeedConfig {
    return { ...this._config };
  }

  protected initializeUnits(): void {
    this._units.clear();

    for (let i = 0; i < this._config.maxUnits; i++) {
      const sat = this.createSatellite(i);
      const noradId = String(25544 + i); // NORAD catalog IDs
      this._units.set(noradId, sat);
    }

    // Initialize positions
    for (const sat of this._units.values()) {
      this.updateOrbitalPosition(sat, 0, 1);
    }

    this._lastTickTime = performance.now();
    console.log(`[${this.id}] Initialized ${this._units.size} satellites`);
  }

  private createSatellite(index: number): SatelliteState {
    // Determine orbit type: 60% LEO, 25% MEO, 15% GEO
    const orbitRoll = Math.random();
    let altitude: number;
    let inclination: number;
    let orbitTypeLabel: "LEO" | "MEO" | "GEO";

    if (orbitRoll < 0.60) {
      orbitTypeLabel = "LEO";
      altitude = SATELLITE_ALTITUDE_LEO.min +
        Math.random() * (SATELLITE_ALTITUDE_LEO.max - SATELLITE_ALTITUDE_LEO.min);

      // LEO inclinations: sun-synchronous (~98°), ISS (~51.6°), polar (~90°)
      const incType = Math.random();
      if (incType < 0.3) {
        inclination = 51 + Math.random() * 5;
      } else if (incType < 0.6) {
        inclination = 85 + Math.random() * 10;
      } else {
        inclination = 20 + Math.random() * 60;
      }
    } else if (orbitRoll < 0.85) {
      orbitTypeLabel = "MEO";
      altitude = SATELLITE_ALTITUDE_MEO.min +
        Math.random() * (SATELLITE_ALTITUDE_MEO.max - SATELLITE_ALTITUDE_MEO.min);
      inclination = 50 + Math.random() * 15;
    } else {
      orbitTypeLabel = "GEO";
      altitude = SATELLITE_ALTITUDE_GEO.min +
        Math.random() * (SATELLITE_ALTITUDE_GEO.max - SATELLITE_ALTITUDE_GEO.min);
      inclination = Math.random() * 5;
    }

    // 25% military
    const isMilitary = Math.random() < 0.25;

    // Generate name
    const name = this.generateName(orbitTypeLabel, isMilitary, index);

    // Orbital period (simplified Kepler's 3rd law)
    const basePeriod = 5400; // 90 min for low orbit
    const orbitalPeriod = basePeriod * Math.pow(1 + altitude * 5, 1.5);

    return {
      altitude,
      inclination,
      ascendingNode: Math.random() * 360,
      phase: Math.random() * 360,
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

  private generateName(orbitType: string, isMilitary: boolean, index: number): string {
    const names = isMilitary
      ? SATELLITE_NAMES.MILITARY
      : SATELLITE_NAMES[orbitType as keyof typeof SATELLITE_NAMES] || SATELLITE_NAMES.LEO;

    const nameType = names[index % names.length];
    const num = nameType.range[0] +
      Math.floor(Math.random() * (nameType.range[1] - nameType.range[0]));
    return `${nameType.prefix}-${num}`;
  }

  protected tick(): void {
    const now = performance.now();
    const deltaTime = (now - this._lastTickTime) / 1000;
    this._lastTickTime = now;

    if (deltaTime > 1) return;

    const updates: SatelliteUpdate[] = [];
    const speedMultiplier = this._config.speedMultiplier;

    for (const [noradId, sat] of this._units) {
      this.updateOrbitalPosition(sat, deltaTime, speedMultiplier);

      updates.push({
        noradId,
        name: sat.name,
        lat: sat.lat,
        lon: sat.lon,
        altitude: sat.altitude,
        heading: sat.heading,
        orbitType: sat.orbitTypeLabel as "LEO" | "MEO" | "GEO",
        timestamp: now,
      });
    }

    this.emit(updates);
  }

  private updateOrbitalPosition(
    sat: SatelliteState,
    deltaTime: number,
    speedMultiplier: number
  ): void {
    // Update orbital phase
    const phaseRate = (360 / sat.orbitalPeriod) * speedMultiplier;
    sat.phase = normalizeAngle(sat.phase + phaseRate * deltaTime);

    // Convert orbital elements to lat/lon
    const phaseRad = sat.phase * (Math.PI / 180);
    const inclinationRad = sat.inclination * (Math.PI / 180);

    // Position in orbital plane
    const xOrbit = Math.cos(phaseRad);
    const yOrbit = Math.sin(phaseRad);

    // Latitude from inclination
    sat.lat = Math.asin(yOrbit * Math.sin(inclinationRad)) * (180 / Math.PI);

    // Longitude from ascending node
    const lonInOrbit = Math.atan2(yOrbit * Math.cos(inclinationRad), xOrbit) * (180 / Math.PI);
    sat.lon = normalizeAngle(sat.ascendingNode + lonInOrbit + 180) - 180;

    // Heading tangent to orbit
    const dLatDPhase = Math.cos(phaseRad) * Math.sin(inclinationRad);
    const dLonDPhase = (Math.cos(phaseRad) * Math.cos(inclinationRad) * xOrbit +
                        yOrbit * (-Math.sin(phaseRad))) /
                       (xOrbit * xOrbit + yOrbit * yOrbit * Math.cos(inclinationRad) * Math.cos(inclinationRad));

    sat.heading = normalizeAngle(90 - Math.atan2(dLatDPhase, dLonDPhase * Math.cos(sat.lat * Math.PI / 180)) * (180 / Math.PI));
  }

  protected getUnitId(unit: SatelliteState): string {
    return unit.name;
  }

  /**
   * Update the number of satellites.
   */
  setSatelliteCount(count: number): void {
    const wasRunning = this._running;
    if (wasRunning) this.stop();

    this._config.maxUnits = count;

    if (wasRunning) this.start();
  }
}
