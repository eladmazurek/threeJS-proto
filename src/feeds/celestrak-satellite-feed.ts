/**
 * CelesTrak Satellite Feed
 *
 * Real-time satellite data using TLEs from CelesTrak and SGP4 propagation.
 */

import * as satellite from "satellite.js";
import { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";
import type { FeedConfig, FeedStats } from "./types";
import type { SatelliteState } from "../types";
import { EARTH_RADIUS } from "../constants";

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface CelesTrakFeedConfig extends FeedConfig {
  /** CelesTrak TLE Group (e.g., 'active', 'starlink', 'gps-ops') */
  group: string;
  /** Update TLEs every N minutes */
  tleUpdateIntervalMinutes: number;
}

const DEFAULT_CELESTRAK_CONFIG: CelesTrakFeedConfig = {
  ...DEFAULT_FEED_CONFIG,
  updateRateMs: 1000 / 60, // 60 FPS propagation (client-side)
  maxUnits: 20000,
  group: "active",
  tleUpdateIntervalMinutes: 60,
};

// =============================================================================
// FEED IMPLEMENTATION
// =============================================================================

interface PropagatedSatellite extends SatelliteState {
  satrec: satellite.SatRec;
  satnum: string;
  prevLat?: number;
  prevLon?: number;
}

export class CelesTrakSatelliteFeed extends BaseFeed<any, SatelliteState> {
  readonly id = "celestrak-live";
  readonly name = "CelesTrak (Live)";
  readonly type = "satellite" as const;

  protected _config: CelesTrakFeedConfig;
  protected _units: Map<string, PropagatedSatellite> = new Map();
  private _lastTleUpdate: number = 0;
  private _propagationInterval: ReturnType<typeof setInterval> | null = null;
  private _fetchError: string | null = null;
  // ... (rest of class)

  constructor(config: Partial<CelesTrakFeedConfig> = {}) {
    super();
    this._config = { ...DEFAULT_CELESTRAK_CONFIG, ...config };
    // We don't use the base class polling for TLEs, we handle it manually
    this._config.updateRateMs = 0; 
  }

  get config(): CelesTrakFeedConfig {
    return { ...this._config };
  }

  get lastError(): string | null {
    return this._fetchError;
  }

  async start(): Promise<void> {
    if (this._running) return;
    super.start();

    // Fetch initial TLEs
    await this.fetchTLEs();

    // Start propagation loop (60 FPS)
    this._propagationInterval = setInterval(() => {
      this.propagateTick();
    }, 16);
  }

  stop(): void {
    if (this._propagationInterval) {
      clearInterval(this._propagationInterval);
      this._propagationInterval = null;
    }
    super.stop();
  }

  // Abstract method implementation (unused as we override start/stop loop)
  protected async tick(): Promise<void> {
    // We handle updates via fetchTLEs and propagateTick
  }

  protected initializeUnits(): void {
    // Units are initialized when TLEs are fetched
  }

  protected getUnitId(unit: SatelliteState): string {
    return unit.name;
  }

  private async fetchTLEs(): Promise<void> {
    const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${this._config.group}&FORMAT=tle`;
    console.log(`[${this.id}] Fetching TLEs from ${url}...`);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      this.processTLEs(text);
      this._lastTleUpdate = Date.now();
      this._fetchError = null;
    } catch (err) {
      this._fetchError = (err as Error).message;
      console.error(`[${this.id}] Failed to fetch TLEs:`, err);
    }
  }

  private processTLEs(tleData: string): void {
    const lines = tleData.split(/\r?\n/);
    let count = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("1 ") && i + 1 < lines.length && lines[i+1].startsWith("2 ")) {
        const line1 = line;
        const line2 = lines[i+1];
        let name = "Unknown";
        if (i > 0) {
            name = lines[i-1].trim();
        }

        try {
            const satrec = satellite.twoline2satrec(line1, line2);
            const satnum = satrec.satnum;

            const inclinationDeg = (satrec.inclo * 180) / Math.PI;
            const periodMin = 2 * Math.PI / satrec.no;

            if (!this._units.has(satnum)) {
                this._units.set(satnum, {
                    satrec,
                    satnum,
                    lat: 0,
                    lon: 0,
                    heading: 0,
                    altitude: 0,
                    scale: 1.0,
                    inclination: inclinationDeg,
                    ascendingNode: (satrec.nodeo * 180) / Math.PI,
                    phase: (satrec.mo * 180) / Math.PI,
                    orbitalPeriod: periodMin,
                    name: name,
                    orbitTypeLabel: this.getOrbitType(periodMin, inclinationDeg),
                    isMilitary: this.isMilitarySatellite(name),
                });
            } else {
                const unit = this._units.get(satnum)!;
                unit.satrec = satrec;
                unit.name = name;
                unit.isMilitary = this.isMilitarySatellite(name);
            }
            count++;
            i += 1;
        } catch (e) {
            // Ignore bad TLE
        }
      }
    }
    console.log(`[${this.id}] Parsed ${count} satellites`);
  }

  private getOrbitType(periodMin: number, inclination: number): string {
    if (Math.abs(periodMin - 1436) < 10 && Math.abs(inclination) < 1) return "GEO";
    if (periodMin < 120) return "LEO";
    if (periodMin > 120 && periodMin < 1000) return "MEO";
    return "Other";
  }

  private isMilitarySatellite(name: string): boolean {
    const militaryPrefixes = ["USA", "NROL", "KEYHOLE", "COSMOS", "ZHUHAI", "YAOGAN"];
    const upperName = name.toUpperCase();
    return militaryPrefixes.some(prefix => upperName.startsWith(prefix));
  }

  private propagateTick(): void {
    if (this._units.size === 0) return;

    const now = new Date();
    const gmst = satellite.gstime(now);
    const DEG_TO_RAD = Math.PI / 180;
    const RAD_TO_DEG = 180 / Math.PI;

    for (const unit of this._units.values()) {
        const positionAndVelocity = satellite.propagate(unit.satrec, now);
        
        if (positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
            const positionEci = positionAndVelocity.position;
            const velocityEci = positionAndVelocity.velocity as satellite.Eci;

            // Convert to Geodetic
            const geodetic = satellite.eciToGeodetic(positionEci, gmst);
            
            // Store previous for heading
            unit.prevLat = unit.lat;
            unit.prevLon = unit.lon;

            // Update Unit State
            unit.lat = (geodetic.latitude * 180) / Math.PI;
            unit.lon = (geodetic.longitude * 180) / Math.PI;
            
            // Convert altitude from km to scene units
            unit.altitude = (geodetic.height / 6371) * EARTH_RADIUS;

            // --- HEADING CALCULATION ---
            // Calculate from position delta
            if (unit.prevLat !== undefined) {
              const dLat = unit.lat - unit.prevLat;
              let dLon = unit.lon - unit.prevLon;
              if (dLon > 180) dLon -= 360;
              if (dLon < -180) dLon += 360;

              // Always update if there's any movement
              if (Math.abs(dLat) > 0 || Math.abs(dLon) > 0) {
                const cosLat = Math.cos(unit.lat * DEG_TO_RAD);
                unit.heading = Math.atan2(dLon * cosLat, dLat) * RAD_TO_DEG;
                if (unit.heading < 0) unit.heading += 360;
              }
            }

            // --- ORBIT LINE ALIGNMENT ---
            // Convert Geodetic Latitude (from SGP4) to Geocentric Latitude (for Spherical Visualizer)
            // This corrects the offset caused by Earth's oblateness
            // f = 1/298.257223563 (WGS84 flattening)
            // (1-f)^2 ~= 0.9933056
            const latGeodeticRad = unit.lat * DEG_TO_RAD;
            const latGeocentricRad = Math.atan(0.9933056 * Math.tan(latGeodeticRad));

            const inclRad = unit.inclination * DEG_TO_RAD;
            
            // sin(lat_gc) = sin(inc) * sin(phase)
            const sinPhase = Math.max(-1, Math.min(1, Math.sin(latGeocentricRad) / Math.sin(inclRad)));
            let phaseRad = Math.asin(sinPhase);

            // Determine quadrant based on velocity Z
            if (velocityEci.z < 0) {
              phaseRad = Math.PI - phaseRad;
            }

            // Calculate longitude relative to ascending node
            const yOrbit = Math.sin(phaseRad);
            const xOrbit = Math.cos(phaseRad);
            
            const lonInOrbitRad = Math.atan2(yOrbit * Math.cos(inclRad), xOrbit);
            const lonInOrbitDeg = lonInOrbitRad * RAD_TO_DEG;

            let lan = unit.lon - lonInOrbitDeg;
            
            while (lan > 180) lan -= 360;
            while (lan < -180) lan += 360;

            unit.ascendingNode = lan;
        }
    }
  }

  /**
   * Sync internal state to external state array.
   */
  syncToState(stateArray: SatelliteState[]): boolean {
    if (stateArray.length !== this._units.size) {
        // Rebuild array if size mismatch (simplest, though garbage heavy if size changes often)
        // With TLEs, size only changes on fetch (hourly).
        stateArray.length = 0;
        for (const unit of this._units.values()) {
            stateArray.push({ ...unit }); // Clone to avoid ref issues? Or just push reference?
            // Pushing shallow clone is safer if we mutate internals.
            // But actually we want to update the SAME objects in stateArray to avoid GC.
        }
        return true;
    }

    // Update existing objects in place
    let i = 0;
    for (const unit of this._units.values()) {
        const target = stateArray[i];
        target.lat = unit.lat;
        target.lon = unit.lon;
        target.altitude = unit.altitude;
        target.heading = unit.heading;
        target.name = unit.name;
        target.isMilitary = unit.isMilitary;
        // Static props usually don't change, but ensuring sync is cheap enough
        i++;
    }
    return true;
  }
}
