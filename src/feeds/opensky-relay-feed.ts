/**
 * OpenSky Relay Feed
 *
 * Real-time aircraft data from OpenSky Network via WebSocket relay.
 * The relay server handles polling and auth - clients just connect and receive.
 */

import { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";
import type { AircraftUpdate, FeedConfig, FeedStats } from "./types";
import type { AircraftState } from "../types";
import { lookupICAO24, lookupTypecode } from "../data/icao-aircraft";

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface OpenSkyRelayConfig extends FeedConfig {
  /** WebSocket relay URL */
  relayUrl: string;
  /** Enable position interpolation between updates */
  interpolatePositions: boolean;
  /** Interpolation speed multiplier */
  interpolationSpeed: number;
}

const DEFAULT_CONFIG: OpenSkyRelayConfig = {
  ...DEFAULT_FEED_CONFIG,
  updateRateMs: 5000,
  maxUnits: 15000,
  relayUrl: "wss://ais-relay-server-722040785601.us-central1.run.app/opensky",
  interpolatePositions: true,
  interpolationSpeed: 1.0,
};

// =============================================================================
// OPENSKY STATE VECTOR INDICES
// =============================================================================

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

const CATEGORY_MAP: Record<number, string> = {
  0: "Unknown", 1: "Unknown", 2: "Light", 3: "Small", 4: "Large",
  5: "High Vortex Large", 6: "Heavy", 7: "High Performance", 8: "Rotorcraft",
  9: "Glider", 10: "Lighter-than-air", 11: "Skydiver", 12: "Ultralight",
  13: "Reserved", 14: "UAV", 15: "Space Vehicle", 16: "Emergency Vehicle",
  17: "Service Vehicle", 18: "Obstacle", 19: "Cluster Obstacle", 20: "Line Obstacle",
};

// =============================================================================
// INTERPOLATION STATE
// =============================================================================

interface InterpolatedAircraft extends AircraftState {
  apiLat: number;
  apiLon: number;
  apiHeading: number;
  apiAltitude: number;
  apiGroundSpeed: number;
  apiTimestamp: number;
  lastUpdate: number;
  apiOriginCountry: string;
  cosLat: number;
  cosHeading: number;
  sinHeading: number;
}

// =============================================================================
// FEED IMPLEMENTATION
// =============================================================================

export class OpenSkyRelayFeed extends BaseFeed<AircraftUpdate, AircraftState> {
  readonly id = "opensky-relay";
  readonly name = "OpenSky (Relay)";
  readonly type = "aircraft" as const;

  protected _config: OpenSkyRelayConfig;
  protected _units: Map<string, InterpolatedAircraft> = new Map();
  private _socket: WebSocket | null = null;
  private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private _interpolationInterval: ReturnType<typeof setInterval> | null = null;
  private _lastInterpolationTime: number = 0;
  private _fetchError: string | null = null;
  private _consecutiveErrors: number = 0;
  private _isDirty: boolean = false;

  constructor(config: Partial<OpenSkyRelayConfig> = {}) {
    super();
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  get config(): OpenSkyRelayConfig {
    return { ...this._config };
  }

  get lastError(): string | null {
    return this._fetchError;
  }

  start(): void {
    if (this._running) return;
    super.start();
    this.connect();

    if (this._config.interpolatePositions) {
      this._lastInterpolationTime = performance.now();
      this._interpolationInterval = setInterval(() => {
        this.interpolateTick();
      }, 16);
    }
  }

  stop(): void {
    if (this._interpolationInterval) {
      clearInterval(this._interpolationInterval);
      this._interpolationInterval = null;
    }
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    if (this._socket) {
      this._socket.close();
      this._socket = null;
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
  }

  protected tick(): void {
    // WebSocket pushes data, no polling needed
  }

  private connect(): void {
    if (this._socket) return;

    console.log(`[${this.id}] Connecting to ${this._config.relayUrl}...`);

    this._socket = new WebSocket(this._config.relayUrl);

    this._socket.onopen = () => {
      console.log(`[${this.id}] Connected to relay`);
      this._fetchError = null;
      this._consecutiveErrors = 0;
    };

    this._socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.states && Array.isArray(data.states)) {
          this.processStates(data.states, performance.now());
        }
      } catch (err) {
        console.error(`[${this.id}] Parse error:`, err);
      }
    };

    this._socket.onclose = (event) => {
      console.log(`[${this.id}] Disconnected:`, event.code, event.reason);
      this._socket = null;
      this._fetchError = "Disconnected";

      if (this._running) {
        this._consecutiveErrors++;
        const delay = Math.min(5000 * Math.pow(2, this._consecutiveErrors - 1), 60000);
        console.log(`[${this.id}] Reconnecting in ${delay / 1000}s...`);
        this._reconnectTimeout = setTimeout(() => {
          this._reconnectTimeout = null;
          this.connect();
        }, delay);
      }
    };

    this._socket.onerror = (error) => {
      console.error(`[${this.id}] WebSocket error:`, error);
      this._fetchError = "Connection error";
    };
  }

  private processStates(states: (string | number | boolean | null)[][], timestamp: number): void {
    const updates: AircraftUpdate[] = [];
    const seenIds = new Set<string>();
    const nowUnix = Date.now() / 1000;
    const DEG_TO_RAD = Math.PI / 180;
    const KNOTS_TO_KMH = 1.852;
    const DEG_PER_KM = 1 / 111.12;

    for (const state of states) {
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
      const timePosition = (state[OS.TIME_POSITION] as number) || nowUnix;

      // Project position forward to current time
      const lagSeconds = Math.max(0, nowUnix - timePosition);
      const speedKmh = groundSpeedKnots * KNOTS_TO_KMH;
      const distDeg = (speedKmh * lagSeconds / 3600) * DEG_PER_KM;

      let projectedLat = lat;
      let projectedLon = lon;

      const headingRad = heading * DEG_TO_RAD;
      const cosHeading = Math.cos(headingRad);
      const sinHeading = Math.sin(headingRad);
      const cosLat = Math.cos(lat * DEG_TO_RAD);

      if (distDeg > 0) {
        projectedLat += cosHeading * distDeg;
        projectedLon += (sinHeading * distDeg) / Math.max(0.01, Math.abs(cosLat));
      }

      // Look up aircraft type
      const icaoTypecode = lookupICAO24(icao24);
      const typeInfo = icaoTypecode ? lookupTypecode(icaoTypecode) : undefined;
      const categoryNum = state.length > OS.CATEGORY ? state[OS.CATEGORY] as number | null : null;
      const openskyCategory = categoryNum !== null && categoryNum > 1
        ? CATEGORY_MAP[categoryNum] || undefined
        : undefined;
      const aircraftType = typeInfo?.category ?? openskyCategory;

      seenIds.add(icao24);

      let aircraft = this._units.get(icao24);
      if (!aircraft) {
        aircraft = {
          lat: projectedLat,
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
          prevAltitude: Math.round(altitudeFeet),
          altitudeTrend: 0,
          targetHeading: heading,
          baseSpeed: 0,
          baseTurnRate: 0,
          nextCourseChange: 0,
          apiLat: projectedLat,
          apiLon: projectedLon,
          apiHeading: heading,
          apiAltitude: altitudeFeet,
          apiGroundSpeed: groundSpeedKnots,
          apiTimestamp: timePosition,
          lastUpdate: nowUnix,
          apiOriginCountry: originCountry,
          cosLat,
          cosHeading,
          sinHeading,
        };
        this._units.set(icao24, aircraft);
      } else {
        const isNewData = timePosition > (aircraft.apiTimestamp || 0);

        aircraft.apiLat = projectedLat;
        aircraft.apiLon = projectedLon;
        aircraft.apiHeading = heading;
        aircraft.heading = heading;
        aircraft.apiGroundSpeed = groundSpeedKnots;
        aircraft.groundSpeed = groundSpeedKnots;

        const roundedAlt = Math.round(altitudeFeet);
        if (aircraft.prevAltitude !== undefined && roundedAlt !== aircraft.prevAltitude) {
          aircraft.altitudeTrend = roundedAlt > aircraft.prevAltitude ? 1 : -1;
        }
        aircraft.prevAltitude = roundedAlt;
        aircraft.apiAltitude = altitudeFeet;

        if (isNewData) {
          aircraft.apiTimestamp = timePosition;
          aircraft.lastUpdate = nowUnix;
        }

        aircraft.apiOriginCountry = originCountry;
        aircraft.callsign = callsign;
        aircraft.originCountry = originCountry;
        aircraft.flightLevel = Math.floor(altitudeFeet / 100);
        if (aircraftType) aircraft.aircraftType = aircraftType;
        if (icaoTypecode && !aircraft.icaoTypeCode) aircraft.icaoTypeCode = icaoTypecode;

        aircraft.cosLat = cosLat;
        aircraft.cosHeading = cosHeading;
        aircraft.sinHeading = sinHeading;
      }

      updates.push({
        callsign: icao24,
        lat: aircraft.lat,
        lon: aircraft.lon,
        heading: aircraft.heading,
        altitude: aircraft.altitude,
        groundSpeed: aircraft.groundSpeed,
        timestamp,
      });
    }

    // Remove stale aircraft
    for (const [icao24] of this._units) {
      if (!seenIds.has(icao24)) {
        this._units.delete(icao24);
      }
    }

    // Limit units
    if (this._units.size > this._config.maxUnits) {
      const toRemove = this._units.size - this._config.maxUnits;
      const entries = Array.from(this._units.entries());
      for (let i = 0; i < toRemove; i++) {
        this._units.delete(entries[i][0]);
      }
    }

    this._isDirty = true;

    console.log(`[${this.id}] Processed ${updates.length} aircraft (${this._units.size} tracked)`);
    this.emit(updates);
  }

  private interpolateTick(): void {
    if (!this._config.interpolatePositions || this._units.size === 0) return;

    const now = performance.now();
    const deltaTime = (now - this._lastInterpolationTime) / 1000;
    this._lastInterpolationTime = now;

    const KNOTS_TO_KMH = 1.852;
    const DEG_PER_KM = 1 / 111.12;
    const CORRECTION_FACTOR = 0.05;

    let anyUpdated = false;

    for (const aircraft of this._units.values()) {
      const speedKmh = aircraft.groundSpeed * KNOTS_TO_KMH * this._config.interpolationSpeed;
      const distDeg = (speedKmh * deltaTime / 3600) * DEG_PER_KM;

      if (distDeg > 0) {
        const dLat = aircraft.cosHeading * distDeg;
        const dLon = (aircraft.sinHeading * distDeg) / Math.max(0.01, Math.abs(aircraft.cosLat));

        aircraft.lat += dLat;
        aircraft.lon += dLon;
        aircraft.apiLat += dLat;
        aircraft.apiLon += dLon;

        if (aircraft.lon > 180) aircraft.lon -= 360;
        else if (aircraft.lon < -180) aircraft.lon += 360;
        if (aircraft.apiLon > 180) aircraft.apiLon -= 360;
        else if (aircraft.apiLon < -180) aircraft.apiLon += 360;

        anyUpdated = true;
      }

      const latError = aircraft.apiLat - aircraft.lat;
      let lonError = aircraft.apiLon - aircraft.lon;
      if (lonError > 180) lonError -= 360;
      if (lonError < -180) lonError += 360;
      const altError = aircraft.apiAltitude - aircraft.altitude;

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

    if (anyUpdated) {
      this._isDirty = true;
    }
  }

  syncToState(stateArray: AircraftState[]): boolean {
    const needsUpdate = this._isDirty;
    this._isDirty = false;

    if (!needsUpdate && stateArray.length === this._units.size) {
      return false;
    }

    let i = 0;
    for (const aircraft of this._units.values()) {
      if (i >= stateArray.length) {
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
          apiTimestamp: aircraft.apiTimestamp,
          lastUpdate: aircraft.lastUpdate,
          altitudeTrend: aircraft.altitudeTrend,
          prevAltitude: aircraft.prevAltitude,
          targetHeading: aircraft.heading,
          baseSpeed: 0,
          baseTurnRate: 0,
          nextCourseChange: 0,
        });
      } else {
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
        target.apiTimestamp = aircraft.apiTimestamp;
        target.lastUpdate = aircraft.lastUpdate;
        target.altitudeTrend = aircraft.altitudeTrend;
        target.prevAltitude = aircraft.prevAltitude;
      }
      i++;
    }
    stateArray.length = this._units.size;
    return true;
  }

  get aircraftCount(): number {
    return this._units.size;
  }

  protected getUnitId(unit: AircraftState): string {
    return unit.callsign;
  }

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
