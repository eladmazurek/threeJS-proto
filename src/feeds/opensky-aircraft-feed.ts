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
import { lookupICAO24, lookupTypecode } from "../data/icao-aircraft";

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
  CATEGORY: 17,
} as const;

/**
 * OpenSky aircraft category mapping
 * https://openskynetwork.github.io/opensky-api/rest.html#aircraft-category
 */
const CATEGORY_MAP: Record<number, string> = {
  0: "Unknown",
  1: "Unknown",
  2: "Light",
  3: "Small",
  4: "Large",
  5: "High Vortex Large",
  6: "Heavy",
  7: "High Performance",
  8: "Rotorcraft",
  9: "Glider",
  10: "Lighter-than-air",
  11: "Skydiver",
  12: "Ultralight",
  13: "Reserved",
  14: "UAV",
  15: "Space Vehicle",
  16: "Emergency Vehicle",
  17: "Service Vehicle",
  18: "Obstacle",
  19: "Cluster Obstacle",
  20: "Line Obstacle",
};

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
  lastUpdate: number;
  apiOriginCountry: string;
  // Previous position for interpolation
  prevLat: number;
  prevLon: number;
  prevHeading: number;
  // Interpolation progress (0-1)
  interpProgress: number;
  // Cached trig values for performance
  cosLat: number;
  cosHeading: number;
  sinHeading: number;
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
  private _isDirty: boolean = false; // Track if positions changed since last sync

  // OAuth2 token management
  private _accessToken: string | null = null;
  private _tokenExpiry: number = 0;

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

    // Base rate limit (OpenSky API limits)
    const baseInterval = this._config.clientId ? 5000 : 10000;

    // Exponential backoff on errors: double the interval for each consecutive error
    const backoffMultiplier = Math.min(Math.pow(2, this._consecutiveErrors), 32); // Cap at 32x
    const minInterval = baseInterval * backoffMultiplier;

    if (now - this._lastFetchTime < minInterval) {
      return;
    }

    // Always update fetch time to prevent rapid retries
    this._lastFetchTime = now;

    try {
      const states = await this.fetchAircraftStates();
      this._fetchError = null;
      this._consecutiveErrors = 0;

      if (states && states.length > 0) {
        this.processStates(states, now);
      }
    } catch (error) {
      this._consecutiveErrors++;
      this._fetchError = error instanceof Error ? error.message : String(error);

      const nextRetrySeconds = (baseInterval * Math.min(Math.pow(2, this._consecutiveErrors), 32)) / 1000;
      console.error(`[${this.id}] Fetch error (${this._consecutiveErrors}): ${this._fetchError} - next retry in ${nextRetrySeconds}s`);
    }
  }

  /**
   * Get OAuth2 access token, refreshing if needed
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this._config.clientId || !this._config.clientKey) {
      return null;
    }

    // Return cached token if still valid (with 1 min buffer)
    if (this._accessToken && Date.now() < this._tokenExpiry - 60000) {
      return this._accessToken;
    }

    console.log(`[${this.id}] Fetching OAuth2 token...`);

    try {
      // Use proxy in development
      const tokenUrl = import.meta.env.DEV
        ? "/api/opensky-auth/auth/realms/opensky-network/protocol/openid-connect/token"
        : "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this._config.clientId,
          client_secret: this._config.clientKey,
        }),
        credentials: 'omit',
      });

      if (!response.ok) {
        console.error(`[${this.id}] OAuth2 token request failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      this._accessToken = data.access_token;
      // Token expires in 30 min, store expiry time
      this._tokenExpiry = Date.now() + (data.expires_in || 1800) * 1000;
      console.log(`[${this.id}] OAuth2 token obtained, expires in ${data.expires_in}s`);
      return this._accessToken;
    } catch (error) {
      console.error(`[${this.id}] OAuth2 token error:`, error);
      return null;
    }
  }

  private async fetchAircraftStates(): Promise<(string | number | boolean | null)[][] | null> {
    // Use proxy in development to avoid CORS, direct URL in production
    const baseUrl = import.meta.env.DEV
      ? "/api/opensky/states/all"
      : "https://opensky-network.org/api/states/all";
    let url = baseUrl;
    const params: string[] = [];

    // Request extended data to get aircraft category (index 17)
    params.push("extended=1");

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

    // Use OAuth2 Bearer token if credentials are configured
    if (this._config.clientId && this._config.clientKey) {
      const token = await this.getAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        console.warn(`[${this.id}] Failed to get token, trying anonymous mode`);
      }
    }

    const response = await fetch(url, {
      headers,
      credentials: 'omit',
    });

    // If auth fails, clear token and fall back to anonymous
    if (response.status === 401) {
      this._accessToken = null;
      this._tokenExpiry = 0;

      if (this._config.clientId) {
        console.warn(`[${this.id}] Auth failed (token invalid/expired), switching to anonymous mode.`);
        this._config.clientId = "";
        this._config.clientKey = "";
        this._config.updateRateMs = 10000;
        this._consecutiveErrors = 2;
        throw new Error("Auth failed - switching to anonymous mode");
      }
    }

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
    const nowUnix = Date.now() / 1000;
    const DEG_TO_RAD = Math.PI / 180;
    const KNOTS_TO_KMH = 1.852;
    const DEG_PER_KM = 1 / 111.12;

    for (const state of states) {
      // Skip aircraft on ground or with missing position
      if (state[OS.ON_GROUND] === true) continue;
      if (state[OS.LATITUDE] === null || state[OS.LONGITUDE] === null) continue;

      const icao24 = state[OS.ICAO24] as string;
      const callsign = ((state[OS.CALLSIGN] as string) || icao24).trim();
      const originCountry = (state[OS.ORIGIN_COUNTRY] as string) || "Unknown";
      const lat = state[OS.LATITUDE] as number;
      const lon = state[OS.LONGITUDE] as number;
      const heading = (state[OS.TRUE_TRACK] as number) || 0;
      const altitudeMeters = (state[OS.BARO_ALTITUDE] as number) || (state[OS.GEO_ALTITUDE] as number) || 10000;
      const altitudeFeet = altitudeMeters * 3.28084;
      const velocityMs = (state[OS.VELOCITY] as number) || 0;
      const groundSpeedKnots = velocityMs * 1.94384;
      const verticalRateMs = state[OS.VERTICAL_RATE] as number | null; // m/s, positive = climbing
      const verticalRateFpm = verticalRateMs != null ? Math.round(verticalRateMs * 196.85) : undefined; // Convert to ft/min
      const timePosition = (state[OS.TIME_POSITION] as number) || nowUnix;

      // PROJECT POSITION FORWARD TO CURRENT TIME
      // OpenSky data is often 5-10s old. If we target the raw lat/lon, we pull the plane back.
      // We must project where the plane is *now*.
      const lagSeconds = Math.max(0, nowUnix - timePosition);
      const speedKmh = groundSpeedKnots * KNOTS_TO_KMH;
      const distDeg = (speedKmh * lagSeconds / 3600) * DEG_PER_KM;
      
      let projectedLat = lat;
      let projectedLon = lon;

      // Pre-calculate trig values for performance
      const headingRad = heading * DEG_TO_RAD;
      const cosHeading = Math.cos(headingRad);
      const sinHeading = Math.sin(headingRad);
      const cosLat = Math.cos(lat * DEG_TO_RAD);

      if (distDeg > 0) {
        projectedLat += cosHeading * distDeg;
        projectedLon += (sinHeading * distDeg) / Math.max(0.01, Math.abs(cosLat));
      }

      // Look up aircraft type from ICAO24 database (57k commercial aircraft)
      // Falls back to OpenSky category if available
      const icaoTypecode = lookupICAO24(icao24);
      const typeInfo = icaoTypecode ? lookupTypecode(icaoTypecode) : undefined;

      // Use our database first, fall back to OpenSky category
      const categoryNum = state.length > OS.CATEGORY ? state[OS.CATEGORY] as number | null : null;
      const openskyCategory = categoryNum !== null && categoryNum > 1
        ? CATEGORY_MAP[categoryNum] || undefined
        : undefined;
      const aircraftType = typeInfo?.category ?? openskyCategory;

      seenIds.add(icao24);

      // Get or create aircraft state
      let aircraft = this._units.get(icao24);
      if (!aircraft) {
        aircraft = {
          lat: projectedLat, // Start at projected position
          lon: projectedLon,
          heading,
          altitude: altitudeFeet,
          groundSpeed: groundSpeedKnots,
          callsign,
          originCountry,
          aircraftType,
          icaoTypeCode: icaoTypecode,
          scale: 1.0,
          flightLevel: Math.floor(altitudeFeet / 100),
          prevAltitude: Math.round(altitudeFeet), // For altitude trend tracking
          altitudeTrend: 0, // No trend yet for new aircraft
          // Simulation properties (unused for live aircraft, but required by type)
          targetHeading: heading,
          baseSpeed: 0,
          baseTurnRate: 0,
          nextCourseChange: 0,
          // API values (Set to projected so we don't snap back)
          apiLat: projectedLat,
          apiLon: projectedLon,
          apiHeading: heading,
          apiAltitude: altitudeFeet,
          apiGroundSpeed: groundSpeedKnots,
          apiTimestamp: timePosition, // Store Unix timestamp of position report
          lastUpdate: nowUnix, // Store local arrival time
          apiOriginCountry: originCountry,
          // Previous values (not used for dead reckoning, but needed for type compatibility)
          prevLat: projectedLat,
          prevLon: projectedLon,
          prevHeading: heading,
          interpProgress: 0,
          // Cached trig values
          cosLat,
          cosHeading,
          sinHeading,
        };
        this._units.set(icao24, aircraft);
      } else {
        // Check if this is actually new data
        // OpenSky sends updates for all aircraft, even if position hasn't changed.
        // We only want to reset the "staleness" timer if we have a fresh position report.
        const isNewData = timePosition > (aircraft.apiTimestamp || 0);

        // Update API values (Dead Reckoning target)
        // Set target to the PROJECTED position so the ghost doesn't jump back 10 seconds
        aircraft.apiLat = projectedLat;
        aircraft.apiLon = projectedLon;
        
        aircraft.apiHeading = heading; 
        aircraft.heading = heading; 
        
        aircraft.apiGroundSpeed = groundSpeedKnots;
        aircraft.groundSpeed = groundSpeedKnots;

        // Calculate altitude trend when altitude changes
        const roundedAlt = Math.round(altitudeFeet);
        if (aircraft.prevAltitude !== undefined && roundedAlt !== aircraft.prevAltitude) {
          aircraft.altitudeTrend = roundedAlt > aircraft.prevAltitude ? 1 : -1;
        }
        aircraft.prevAltitude = roundedAlt;
        aircraft.apiAltitude = altitudeFeet;

        if (isNewData) {
          aircraft.apiTimestamp = timePosition; // Store Unix timestamp
          aircraft.lastUpdate = nowUnix; // Store local arrival time
        }
        
        aircraft.apiOriginCountry = originCountry;
        aircraft.callsign = callsign;
        aircraft.originCountry = originCountry;
        aircraft.flightLevel = Math.floor(altitudeFeet / 100);
        if (aircraftType) aircraft.aircraftType = aircraftType;
        if (icaoTypecode && !aircraft.icaoTypeCode) aircraft.icaoTypeCode = icaoTypecode;
        
        // Update cached trig values
        aircraft.cosLat = cosLat;
        aircraft.cosHeading = cosHeading;
        aircraft.sinHeading = sinHeading;
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

    // Mark dirty so next sync triggers GPU update
    this._isDirty = true;

    // Log category stats once per fetch (only if we have category data)
    let withCategory = 0;
    for (const aircraft of this._units.values()) {
      if (aircraft.aircraftType) withCategory++;
    }
    console.log(`[${this.id}] Processed ${updates.length} aircraft (${this._units.size} tracked, ${withCategory} with category)`);
    this.emit(updates);
  }

  /**
   * Interpolation tick - runs at 60fps to smoothly animate aircraft.
   * Uses Dead Reckoning (Extrapolation) + Moving Target Correction.
   * 
   * This ensures continuous motion even if API updates are delayed,
   * avoiding the "pause" seen with simple interpolation.
   */
  private interpolateTick(): void {
    if (!this._config.interpolatePositions || this._units.size === 0) return;

    const now = performance.now();
    const deltaTime = (now - this._lastInterpolationTime) / 1000;
    this._lastInterpolationTime = now;

    // Constants for earth calculations
    const KNOTS_TO_KMH = 1.852;
    const DEG_PER_KM = 1 / 111.12; // 1 degree lat is approx 111km
    const CORRECTION_FACTOR = 0.05; // 5% correction per frame towards the moving target

    let anyUpdated = false;

    for (const aircraft of this._units.values()) {
      // 1. DEAD RECKONING (Move based on speed/heading)
      // Calculate distance traveled in degrees
      const speedKmh = aircraft.groundSpeed * KNOTS_TO_KMH * this._config.interpolationSpeed;
      const distDeg = (speedKmh * deltaTime / 3600) * DEG_PER_KM;

      if (distDeg > 0) {
        // Use cached trig values from processStates
        // This avoids expensive Math.cos/sin calls for every aircraft every frame
        const dLat = aircraft.cosHeading * distDeg;
        // Adjust longitude change for latitude (converging meridians)
        const dLon = (aircraft.sinHeading * distDeg) / Math.max(0.01, Math.abs(aircraft.cosLat));

        // Update Visual Position
        aircraft.lat += dLat;
        aircraft.lon += dLon;
        
        // Update Target Position (The "Ghost" moves too!)
        // This prevents the visual plane from being pulled back to a static past point
        aircraft.apiLat += dLat;
        aircraft.apiLon += dLon;

        // Handle longitude wrap-around for both
        if (aircraft.lon > 180) aircraft.lon -= 360;
        else if (aircraft.lon < -180) aircraft.lon += 360;

        if (aircraft.apiLon > 180) aircraft.apiLon -= 360;
        else if (aircraft.apiLon < -180) aircraft.apiLon += 360;
        
        anyUpdated = true;
      }

      // 2. CORRECTION (Drift towards API position)
      // Smoothly blend towards the "Ghost" target
      const latError = aircraft.apiLat - aircraft.lat;
      let lonError = aircraft.apiLon - aircraft.lon;
      
      // Handle wrap-around for shortest path
      if (lonError > 180) lonError -= 360;
      if (lonError < -180) lonError += 360;
      
      const altError = aircraft.apiAltitude - aircraft.altitude;

      // Apply correction if error is significant (but not a teleport/huge jump)
      if (Math.abs(latError) > 1.0 || Math.abs(lonError) > 1.0) {
        aircraft.lat = aircraft.apiLat;
        aircraft.lon = aircraft.apiLon;
      } else {
        aircraft.lat += latError * CORRECTION_FACTOR;
        aircraft.lon += lonError * CORRECTION_FACTOR;
        aircraft.altitude += altError * CORRECTION_FACTOR;
        
        if (Math.abs(latError) > 0.000001 || Math.abs(lonError) > 0.000001) {
          anyUpdated = true;
        }
      }
    }

    // Only mark dirty if positions actually changed
    if (anyUpdated) {
      this._isDirty = true;
    }
  }

  /**
   * Sync internal interpolated state to external state array.
   * Call this once per frame from the render loop.
   * Returns true if GPU buffers need updating (positions changed).
   */
  syncToState(stateArray: AircraftState[]): boolean {
    // Check if we need to update
    const needsUpdate = this._isDirty;
    this._isDirty = false;

    if (!needsUpdate && stateArray.length === this._units.size) {
      return false; // No changes, skip sync
    }

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
          originCountry: aircraft.originCountry,
          aircraftType: aircraft.aircraftType,
          icaoTypeCode: aircraft.icaoTypeCode,
          scale: aircraft.scale,
          flightLevel: aircraft.flightLevel,
          apiTimestamp: aircraft.apiTimestamp, // Pass through timestamp
          lastUpdate: aircraft.lastUpdate, // Pass through local arrival time
          altitudeTrend: aircraft.altitudeTrend,
          prevAltitude: aircraft.prevAltitude,
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
        target.originCountry = aircraft.originCountry;
        target.aircraftType = aircraft.aircraftType;
        target.icaoTypeCode = aircraft.icaoTypeCode;
        target.apiTimestamp = aircraft.apiTimestamp; // Update timestamp
        target.lastUpdate = aircraft.lastUpdate; // Update local arrival time
        target.altitudeTrend = aircraft.altitudeTrend;
        target.prevAltitude = aircraft.prevAltitude;
      }
      i++;
    }
    // Trim excess
    stateArray.length = this._units.size;
    return true;
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
