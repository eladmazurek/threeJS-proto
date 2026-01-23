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
  satnum: string;
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
  private _worker: Worker | null = null;

  private _isDirty = false;

  constructor(config: Partial<CelesTrakFeedConfig> = {}) {
    super();
    this._config = { ...DEFAULT_CELESTRAK_CONFIG, ...config };
    this._config.updateRateMs = 0; // Manual control

    // Initialize worker
    try {
      this._worker = new Worker(new URL('../workers/satellite-worker.ts', import.meta.url), { type: 'module' });
      this._worker.onmessage = this.handleWorkerMessage.bind(this);
    } catch (e) {
      console.error(`[${this.id}] Failed to initialize worker:`, e);
    }
  }

  get lastError(): string | null {
    return this._fetchError;
  }

  get unitCount(): number {
    return this._units.size;
  }

  async start(): Promise<void> {
    if (this._running) return;
    super.start();

    // Fetch initial TLEs
    await this.fetchTLEs();

    // Start propagation loop (request-response style)
    if (this._worker) {
        this._worker.postMessage({
          type: 'propagate',
          data: { time: Date.now() }
        });
    }
  }

  stop(): void {
    super.stop();
    // Worker will stop its loop automatically when _running becomes false
    // since handleWorkerMessage checks _running before requesting next update
  }

  dispose(): void {
    this.stop();
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._units.clear();
  }

  // Abstract method implementation (unused as we handle updates via worker)
  protected async tick(): Promise<void> {
    // Updates are driven by the worker message loop, not by tick()
  }

  protected initializeUnits(): void {
    // Units are initialized when TLEs are fetched
  }

  protected getUnitId(unit: SatelliteState): string {
    return unit.name;
  }

  /**
   * Sync internal state to the provided state array.
   * Returns true if GPU buffers need updating.
   */
  public syncToState(stateArray: SatelliteState[]): boolean {
    // Skip if no updates since last sync
    if (!this._isDirty && stateArray.length === this._units.size) {
      return false;
    }

    // Reset dirty flag
    this._isDirty = false;

    // Handle size changes (rebuild array)
    if (stateArray.length !== this._units.size) {
      stateArray.length = 0;
      for (const unit of this._units.values()) {
        stateArray.push({ ...unit });
      }
      return true;
    }

    // Update existing entries in-place
    let i = 0;
    for (const unit of this._units.values()) {
      const target = stateArray[i];
      target.lat = unit.lat;
      target.lon = unit.lon;
      target.altitude = unit.altitude;
      target.heading = unit.heading;
      target.name = unit.name;
      target.isMilitary = unit.isMilitary;
      target.ascendingNode = unit.ascendingNode;
      target.inclination = unit.inclination;
      target.orbitalPeriod = unit.orbitalPeriod;
      target.orbitTypeLabel = unit.orbitTypeLabel;
      i++;
    }
    return true;
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

  private getOrbitType(periodMin: number, inclination: number): string {
    if (periodMin > 1300) return "GEO"; // Synchronous and High Earth Orbits
    if (periodMin < 128) return "LEO";  // Low Earth Orbits
    return "MEO";                      // Medium Earth and everything else
  }

  private isMilitarySatellite(name: string): boolean {
    const militaryPrefixes = ["USA", "NROL", "KEYHOLE", "COSMOS", "ZHUHAI", "YAOGAN"];
    const upperName = name.toUpperCase();
    return militaryPrefixes.some(prefix => upperName.startsWith(prefix));
  }

  private processTLEs(tleData: string): void {
    const lines = tleData.split(/\r?\n/);
    let count = 0;
    const workerInitData: any[] = [];
    
    // Clear existing to ensure sync with worker
    this._units.clear();
    
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

        // We only need basic metadata locally
        const satnum = line1.substring(2, 7);
        const incl = parseFloat(line2.substring(8, 16));
        const period = 0; // We could parse this locally if needed, or get from worker. 
                          // For now, let's just parse rough period for orbit type.
        const meanMotion = parseFloat(line2.substring(52, 63));
        const periodMin = (24 * 60) / meanMotion;

        const sat: PropagatedSatellite = {
            satnum,
            lat: 0, lon: 0, heading: 0, altitude: 0, scale: 1.0,
            inclination: incl,
            ascendingNode: 0, // Updated by worker
            phase: 0, // Not updated by worker currently, used for simple viz only
            orbitalPeriod: periodMin,
            name: name,
            orbitTypeLabel: this.getOrbitType(periodMin, incl),
            isMilitary: this.isMilitarySatellite(name),
        };

        this._units.set(satnum, sat);
        workerInitData.push({ line1, line2, satnum });
        
        count++;
        i += 1;
      }
    }
    
    // Send to worker
    if (this._worker && workerInitData.length > 0) {
        this._worker.postMessage({
            type: 'init',
            data: workerInitData
        });
    }
    
    console.log(`[${this.id}] Parsed ${count} satellites`);
  }

  private handleWorkerMessage(e: MessageEvent): void {
    const { type, buffer } = e.data;
    if (type === 'update' && buffer) {
      const data = new Float32Array(buffer);
      let idx = 0;

      // Iterate map in insertion order (must match worker order)
      for (const unit of this._units.values()) {
        if (idx * 5 >= data.length) break;

        unit.lat = data[idx * 5];
        unit.lon = data[idx * 5 + 1];
        unit.altitude = data[idx * 5 + 2];
        unit.heading = data[idx * 5 + 3];
        unit.ascendingNode = data[idx * 5 + 4];

        idx++;
      }

      // Mark dirty so next syncToState triggers GPU update
      this._isDirty = true;

      // Request next update immediately (loop)
      if (this._running && this._worker) {
        this._worker.postMessage({
          type: 'propagate',
          data: { time: Date.now() }
        });
      }
    }
  }
}
