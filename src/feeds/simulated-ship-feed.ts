/**
 * Simulated Ship Feed
 *
 * Generates realistic simulated AIS-like ship data.
 * Can be replaced with a real AIS WebSocket feed later.
 */

import { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";
import type { ShipUpdate, FeedConfig } from "./types";
import type { ShipState } from "../types";
import {
  SHIP_NAMES,
  SHIPPING_LANES,
  selectWeightedRegion,
  randomInRegion,
  normalizeAngle,
  shortestTurnDirection,
} from "../data/demo";

/** Ship-specific feed configuration */
export interface ShipFeedConfig extends FeedConfig {
  /** Use realistic shipping lanes vs global distribution */
  useRealisticRoutes: boolean;
  /** Base speed in degrees/second */
  baseSpeed: number;
  /** Speed multiplier for time acceleration */
  speedMultiplier: number;
  /** Base turn rate in degrees/second */
  baseTurnRate: number;
}

const DEFAULT_SHIP_CONFIG: ShipFeedConfig = {
  ...DEFAULT_FEED_CONFIG,
  updateRateMs: 100,
  maxUnits: 500,
  useRealisticRoutes: false,
  baseSpeed: 0.002,
  speedMultiplier: 10.0,
  baseTurnRate: 15,
};

/** Extended ship state with simulation fields */
interface SimulatedShipState extends ShipState {
  targetHeading: number;
  baseSpeed: number;
  baseTurnRate: number;
  nextCourseChange: number;
}

/**
 * Simulated AIS ship feed.
 * Generates ships with realistic motion along shipping lanes.
 */
export class SimulatedShipFeed extends BaseFeed<ShipUpdate, ShipState> {
  readonly id = "simulated-ships";
  readonly name = "Simulated AIS";
  readonly type = "ship" as const;

  protected _config: ShipFeedConfig;
  protected _units: Map<string, SimulatedShipState> = new Map();
  private _lastTickTime: number = 0;

  constructor(config: Partial<ShipFeedConfig> = {}) {
    super();
    this._config = { ...DEFAULT_SHIP_CONFIG, ...config };
  }

  get config(): ShipFeedConfig {
    return { ...this._config };
  }

  protected initializeUnits(): void {
    this._units.clear();

    for (let i = 0; i < this._config.maxUnits; i++) {
      const ship = this.createShip(i);
      this._units.set(ship.mmsi, ship);
    }

    this._lastTickTime = performance.now();
    console.log(`[${this.id}] Initialized ${this._units.size} ships`);
  }

  private createShip(index: number): SimulatedShipState {
    let lat: number, lon: number;

    if (this._config.useRealisticRoutes) {
      const region = selectWeightedRegion(SHIPPING_LANES);
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

    return {
      lat,
      lon,
      heading,
      targetHeading: heading,
      baseSpeed: this._config.baseSpeed * speedVariation,
      baseTurnRate: this._config.baseTurnRate * speedVariation,
      scale: 0.8 + Math.random() * 0.4,
      nextCourseChange: Math.random() * 30,
      name: SHIP_NAMES[index % SHIP_NAMES.length],
      mmsi: String(211000000 + index),
      sog: 8 + Math.random() * 14, // 8-22 knots
    };
  }

  protected tick(): void {
    const now = performance.now();
    const deltaTime = (now - this._lastTickTime) / 1000;
    this._lastTickTime = now;

    // Skip if delta is too large (tab was inactive)
    if (deltaTime > 1) return;

    const updates: ShipUpdate[] = [];

    for (const ship of this._units.values()) {
      this.updateShipMotion(ship, deltaTime);

      updates.push({
        mmsi: ship.mmsi,
        lat: ship.lat,
        lon: ship.lon,
        heading: ship.heading,
        sog: ship.sog,
        name: ship.name,
        timestamp: now,
      });
    }

    this.emit(updates);
  }

  private updateShipMotion(ship: SimulatedShipState, deltaTime: number): void {
    const speedMultiplier = this._config.speedMultiplier;
    const currentSpeed = ship.baseSpeed * speedMultiplier;
    const currentTurnRate = ship.baseTurnRate * speedMultiplier;

    // Smooth heading interpolation
    const turnDiff = shortestTurnDirection(ship.heading, ship.targetHeading);
    const maxTurn = currentTurnRate * deltaTime;

    if (Math.abs(turnDiff) <= maxTurn) {
      ship.heading = ship.targetHeading;
    } else {
      ship.heading = normalizeAngle(ship.heading + Math.sign(turnDiff) * maxTurn);
    }

    // Calculate movement
    const headingRad = ship.heading * (Math.PI / 180);
    const latSpeed = currentSpeed * Math.cos(headingRad);
    const lonSpeed = currentSpeed * Math.sin(headingRad) /
                     Math.max(0.1, Math.cos(ship.lat * Math.PI / 180));

    // Update position
    ship.lat += latSpeed * deltaTime;
    ship.lon += lonSpeed * deltaTime;

    // Clamp and wrap
    ship.lat = Math.max(-85, Math.min(85, ship.lat));
    if (ship.lon > 180) ship.lon -= 360;
    if (ship.lon < -180) ship.lon += 360;

    // Course changes
    ship.nextCourseChange -= deltaTime;
    if (ship.nextCourseChange <= 0) {
      const courseChange = (Math.random() - 0.5) * 60;
      ship.targetHeading = normalizeAngle(ship.heading + courseChange);

      if (Math.random() < 0.1) {
        ship.targetHeading = normalizeAngle(ship.heading + (Math.random() - 0.5) * 180);
      }

      ship.nextCourseChange = 10 + (Math.random() - 0.5) * 10;
    }
  }

  protected getUnitId(unit: ShipState): string {
    return unit.mmsi;
  }

  /**
   * Update the number of ships.
   */
  setShipCount(count: number): void {
    const wasRunning = this._running;
    if (wasRunning) this.stop();

    this._config.maxUnits = count;

    if (wasRunning) this.start();
  }
}
