/**
 * OpenSky Network Aircraft Feed
 *
 * Real-time ADS-B aircraft data from OpenSky Network API.
 * https://openskynetwork.github.io/opensky-api/rest.html
 *
 * Rate limits:
 * - Anonymous: 1 request per 10 seconds
 * - Authenticated: 1 request per 5 seconds
 */

import { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";
import type { AircraftUpdate, FeedConfig, FeedStats } from "./types";
import type { AircraftState } from "../types";

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface OpenSkyFeedConfig extends FeedConfig {
  /** OpenSky client ID (username) */
  clientId: string;
  /** OpenSky client key (password) */
  clientKey: string;
  /** Use viewport-based bounding box filtering */
  useViewportFilter: boolean;
  /** Enable position interpolation between API updates */
  interpolatePositions: boolean;
  /** Interpolation speed multiplier */
  interpolationSpeed: number;
  /** Callback to get current viewport bounds */
  getViewportBounds?: () => BoundingBox | null;
}

export interface BoundingBox {
  lamin: number; // min latitude
  lamax: number; // max latitude
  lomin: number; // min longitude
  lomax: number; // max longitude
}

const DEFAULT_OPENSKY_CONFIG: OpenSkyFeedConfig = {
  ...DEFAULT_FEED_CONFIG,
  updateRateMs: 5000, // 5 seconds (OpenSky auth rate limit)
  maxUnits: 15000,    // OpenSky can return ~10-15k aircraft worldwide
  clientId: "",
  clientKey: "",
  useViewportFilter: false,
  interpolatePositions: true,
  interpolationSpeed: 1.0,
};

// =============================================================================
// OPENSKY API TYPES
// =============================================================================

/**
 * OpenSky state vector array indices
 * https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
 */
const OS = {
  ICAO24: 0,
  CALLSIGN: 1,
  ORIGIN_COUNTRY: 2,
  TIME_POSITION: 3,
  LAST_CONTACT: 4,
  LONGITUDE: 5,
  LATITUDE: 6,
  BARO_ALTITUDE: 7,
  ON_GROUND: 8,
  VELOCITY: 9,
  TRUE_TRACK: 10,
  VERTICAL_RATE: 11,
  SENSORS: 12,
  GEO_ALTITUDE: 13,
  SQUAWK: 14,
  SPI: 15,
  POSITION_SOURCE: 16,
} as const;

interface OpenSkyResponse {
  time: number;
  states: (string | number | boolean | null)[][] | null;
}

// =============================================================================
// INTERPOLATION STATE
// =============================================================================

interface InterpolatedAircraft extends AircraftState {
  // Last known position from API
  apiLat: number;
  apiLon: number;
  apiHeading: number;
  apiAltitude: number;
  apiGroundSpeed: number;
  apiTimestamp: number;
  // Previous position for interpolation
  prevLat: number;
  prevLon: number;
  prevHeading: number;
  // Interpolation progress (0-1)
  interpProgress: number;
}

// =============================================================================
// FEED IMPLEMENTATION
// =============================================================================

export class OpenSkyAircraftFeed extends BaseFeed<AircraftUpdate, AircraftState> {
  readonly id = "opensky-live";
  readonly name = "OpenSky Network (Live)";
  readonly type = "aircraft" as const;

  protected _config: OpenSkyFeedConfig;
  protected _units: Map<string, InterpolatedAircraft> = new Map();
  private _lastFetchTime: number = 0;
  private _lastInterpolationTime: number = 0;
  private _interpolationInterval: ReturnType<typeof setInterval> | null = null;
  private _fetchError: string | null = null;
  private _consecutiveErrors: number = 0;

  constructor(config: Partial<OpenSkyFeedConfig> = {}) {
    super();
    this._config = { ...DEFAULT_OPENSKY_CONFIG, ...config };

    // Enforce minimum update rate based on auth status
    const minRate = this._config.clientId ? 5000 : 10000;
    if (this._config.updateRateMs < minRate) {
      this._config.updateRateMs = minRate;
      console.warn(`[${this.id}] Update rate clamped to ${minRate}ms (OpenSky rate limit)`);
    }
  }

  get config(): OpenSkyFeedConfig {
    return { ...this._config };
  }

  get lastError(): string | null {
    return this._fetchError;
  }

  // Override start to also start interpolation loop
  start(): void {
    if (this._running) return;

    super.start();

    // Start interpolation loop (60fps)
    if (this._config.interpolatePositions) {
      this._lastInterpolationTime = performance.now();
      this._interpolationInterval = setInterval(() => {
        this.interpolateTick();
      }, 16); // ~60fps
    }
  }

  // Override stop to also stop interpolation loop
  stop(): void {
    if (this._interpolationInterval) {
      clearInterval(this._interpolationInterval);
      this._interpolationInterval = null;
    }
    super.stop();
  }

  getStats(): FeedStats {
    return {
      messagesPerSec: this._messagesPerSec,
      totalMessages: this._totalMessages,
      avgLatencyMs: 0,
      lastUpdateTime: this._lastUpdateTime,
      activeUnits: this._units.size,
      status: this._fetchError ? "disconnected" : (this._running ? "connected" : "disconnected"),
    };
  }

  protected initializeUnits(): void {
    this._units.clear();
    this._fetchError = null;
    this._consecutiveErrors = 0;
    console.log(`[${this.id}] Initialized, waiting for first fetch...`);
  }

  protected async tick(): Promise<void> {
    const now = performance.now();

    // Respect rate limiting
    const minInterval = this._config.clientId ? 5000 : 10000;
    if (now - this._lastFetchTime < minInterval) {
      return;
    }

    try {
      const states = await this.fetchAircraftStates();
      this._lastFetchTime = now;
      this._fetchError = null;
      this._consecutiveErrors = 0;

      if (states && states.length > 0) {
        this.processStates(states, now);
      }
    } catch (error) {
      this._consecutiveErrors++;
      this._fetchError = error instanceof Error ? error.message : String(error);
      console.error(`[${this.id}] Fetch error (${this._consecutiveErrors}):`, this._fetchError);

      // Back off on repeated errors
      if (this._consecutiveErrors >= 3) {
        console.warn(`[${this.id}] Multiple errors, backing off...`);
      }
    }
  }

  private async fetchAircraftStates(): Promise<(string | number | boolean | null)[][] | null> {
    let url = "https://opensky-network.org/api/states/all";
    const params: string[] = [];

    // Add bounding box if viewport filtering is enabled
    if (this._config.useViewportFilter && this._config.getViewportBounds) {
      const bounds = this._config.getViewportBounds();
      if (bounds) {
        params.push(`lamin=${bounds.lamin}`);
        params.push(`lamax=${bounds.lamax}`);
        params.push(`lomin=${bounds.lomin}`);
        params.push(`lomax=${bounds.lomax}`);
      }
    }

    if (params.length > 0) {
      url += "?" + params.join("&");
    }

    const headers: HeadersInit = {};

    // Add authentication if credentials are provided
    if (this._config.clientId && this._config.clientKey) {
      const credentials = btoa(`${this._config.clientId}:${this._config.clientKey}`);
      headers["Authorization"] = `Basic ${credentials}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limited - too many requests");
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: OpenSkyResponse = await response.json();
    return data.states;
  }

  private processStates(states: (string | number | boolean | null)[][], timestamp: number): void {
    const updates: AircraftUpdate[] = [];
    const seenIds = new Set<string>();

    for (const state of states) {
      // Skip aircraft on ground or with missing position
      if (state[OS.ON_GROUND] === true) continue;
      if (state[OS.LATITUDE] === null || state[OS.LONGITUDE] === null) continue;

      const icao24 = state[OS.ICAO24] as string;
      const callsign = ((state[OS.CALLSIGN] as string) || icao24).trim();
      const lat = state[OS.LATITUDE] as number;
      const lon = state[OS.LONGITUDE] as number;
      const heading = (state[OS.TRUE_TRACK] as number) || 0;
      const altitudeMeters = (state[OS.BARO_ALTITUDE] as number) || (state[OS.GEO_ALTITUDE] as number) || 10000;
      const altitudeFeet = altitudeMeters * 3.28084;
      const velocityMs = (state[OS.VELOCITY] as number) || 0;
      const groundSpeedKnots = velocityMs * 1.94384;

      seenIds.add(icao24);

      // Get or create aircraft state
      let aircraft = this._units.get(icao24);
      if (!aircraft) {
        aircraft = {
          lat,
          lon,
          heading,
          altitude: altitudeFeet,
          groundSpeed: groundSpeedKnots,
          callsign,
          scale: 1.0,
          flightLevel: Math.floor(altitudeFeet / 100),
          // Simulation properties (unused for live aircraft, but required by type)
          targetHeading: heading,
          baseSpeed: 0,
          baseTurnRate: 0,
          nextCourseChange: 0,
          // API values
          apiLat: lat,
          apiLon: lon,
          apiHeading: heading,
          apiAltitude: altitudeFeet,
          apiGroundSpeed: groundSpeedKnots,
          apiTimestamp: timestamp,
          // Previous values (same as current for new aircraft)
          prevLat: lat,
          prevLon: lon,
          prevHeading: heading,
          interpProgress: 1.0,
        };
        this._units.set(icao24, aircraft);
      } else {
        // Update existing aircraft - store previous for interpolation
        aircraft.prevLat = aircraft.apiLat;
        aircraft.prevLon = aircraft.apiLon;
        aircraft.prevHeading = aircraft.apiHeading;
        // Update API values
        aircraft.apiLat = lat;
        aircraft.apiLon = lon;
        aircraft.apiHeading = heading;
        aircraft.apiAltitude = altitudeFeet;
        aircraft.apiGroundSpeed = groundSpeedKnots;
        aircraft.apiTimestamp = timestamp;
        aircraft.callsign = callsign;
        aircraft.flightLevel = Math.floor(altitudeFeet / 100);
        // Reset interpolation
        aircraft.interpProgress = 0;
      }

      updates.push({
        callsign: icao24, // Use ICAO24 as unique ID for feed manager
        lat: aircraft.lat,
        lon: aircraft.lon,
        heading: aircraft.heading,
        altitude: aircraft.altitude,
        groundSpeed: aircraft.groundSpeed,
        timestamp,
      });
    }

    // Remove aircraft that are no longer in the feed
    for (const [icao24] of this._units) {
      if (!seenIds.has(icao24)) {
        this._units.delete(icao24);
      }
    }

    // Limit to maxUnits if needed
    if (this._units.size > this._config.maxUnits) {
      const toRemove = this._units.size - this._config.maxUnits;
      const entries = Array.from(this._units.entries());
      for (let i = 0; i < toRemove; i++) {
        this._units.delete(entries[i][0]);
      }
    }

    console.log(`[${this.id}] Processed ${updates.length} aircraft (${this._units.size} tracked)`);
    this.emit(updates);
  }

  /**
   * Interpolation tick - runs at 60fps to smoothly animate between API updates
   * Updates internal state only - no emit (too expensive with 7000+ aircraft)
   */
  private interpolateTick(): void {
    if (!this._config.interpolatePositions || this._units.size === 0) return;

    const now = performance.now();
    const deltaTime = (now - this._lastInterpolationTime) / 1000;
    this._lastInterpolationTime = now;

    // Calculate interpolation step based on update rate
    const interpStep = (deltaTime / (this._config.updateRateMs / 1000)) * this._config.interpolationSpeed;

    // Update internal state only - no emit to avoid callback overhead
    for (const aircraft of this._units.values()) {
      if (aircraft.interpProgress >= 1.0) continue;

      aircraft.interpProgress = Math.min(1.0, aircraft.interpProgress + interpStep);
      const t = this.easeInOutCubic(aircraft.interpProgress);

      // Interpolate position in place
      aircraft.lat = this.lerp(aircraft.prevLat, aircraft.apiLat, t);
      aircraft.lon = this.lerpAngle(aircraft.prevLon, aircraft.apiLon, t);
      aircraft.heading = this.lerpAngle(aircraft.prevHeading, aircraft.apiHeading, t);
      aircraft.altitude = this.lerp(aircraft.altitude, aircraft.apiAltitude, t);
      aircraft.groundSpeed = this.lerp(aircraft.groundSpeed, aircraft.apiGroundSpeed, t);
    }

    // Mark that interpolation occurred (for sync)
    this._lastInterpolationTime = now;
  }

  /**
   * Sync internal interpolated state to external state array.
   * Call this once per frame from the render loop.
   */
  syncToState(stateArray: AircraftState[]): void {
    let i = 0;
    for (const aircraft of this._units.values()) {
      if (i >= stateArray.length) {
        // Need to add new aircraft
        stateArray.push({
          lat: aircraft.lat,
          lon: aircraft.lon,
          heading: aircraft.heading,
          altitude: aircraft.altitude,
          groundSpeed: aircraft.groundSpeed,
          callsign: aircraft.callsign,
          scale: aircraft.scale,
          flightLevel: aircraft.flightLevel,
          // Simulation properties (unused for live aircraft, but required by type)
          targetHeading: aircraft.heading,
          baseSpeed: 0,
          baseTurnRate: 0,
          nextCourseChange: 0,
        });
      } else {
        // Update existing
        const target = stateArray[i];
        target.lat = aircraft.lat;
        target.lon = aircraft.lon;
        target.heading = aircraft.heading;
        target.altitude = aircraft.altitude;
        target.groundSpeed = aircraft.groundSpeed;
        target.callsign = aircraft.callsign;
      }
      i++;
    }
    // Trim excess
    stateArray.length = this._units.size;
  }

  /**
   * Get current aircraft count
   */
  get aircraftCount(): number {
    return this._units.size;
  }

  // Easing function for smooth interpolation
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Linear interpolation
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // Angle interpolation (handles wrap-around)
  private lerpAngle(a: number, b: number, t: number): number {
    // Normalize to -180 to 180
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
  }

  protected getUnitId(unit: AircraftState): string {
    return unit.callsign;
  }

  /**
   * Update viewport bounds callback
   */
  setViewportBoundsCallback(callback: () => BoundingBox | null): void {
    this._config.getViewportBounds = callback;
  }

  /**
   * Toggle viewport filtering
   */
  setViewportFilter(enabled: boolean): void {
    this._config.useViewportFilter = enabled;
    console.log(`[${this.id}] Viewport filtering: ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Toggle interpolation
   */
  setInterpolation(enabled: boolean): void {
    const wasEnabled = this._config.interpolatePositions;
    this._config.interpolatePositions = enabled;

    if (enabled && !wasEnabled && this._running) {
      this._lastInterpolationTime = performance.now();
      this._interpolationInterval = setInterval(() => {
        this.interpolateTick();
      }, 16);
    } else if (!enabled && wasEnabled && this._interpolationInterval) {
      clearInterval(this._interpolationInterval);
      this._interpolationInterval = null;
    }

    console.log(`[${this.id}] Interpolation: ${enabled ? "enabled" : "disabled"}`);
  }
}
