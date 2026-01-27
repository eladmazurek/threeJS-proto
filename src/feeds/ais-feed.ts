/**
 * AIS Stream Data Feed
 *
 * Real-time ship data from AISStream.io via WebSocket.
 * Uses a Web Worker to handle the connection and JSON parsing.
 */

import { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";
import type { FeedConfig, FeedStats, ShipUpdate } from "./types";
import type { ShipState } from "../types";

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface AISFeedConfig extends FeedConfig {
  /** WebSocket relay URL */
  relayUrl: string;
}

const DEFAULT_AIS_CONFIG: AISFeedConfig = {
  ...DEFAULT_FEED_CONFIG,
  updateRateMs: 100, // Process worker updates every 100ms
  maxUnits: 50000,
  relayUrl: "wss://ais-relay-server-722040785601.us-central1.run.app/ais",
};

// =============================================================================
// FEED IMPLEMENTATION
// =============================================================================

export class AISStreamFeed extends BaseFeed<ShipUpdate, ShipState> {
  readonly id = "ais-live";
  readonly name = "AIS Stream (Live)";
  readonly type = "ship" as const;

  protected _config: AISFeedConfig;
  private _worker: Worker | null = null;
  private _fetchError: string | null = null;

  constructor(config: Partial<AISFeedConfig> = {}) {
    super();
    this._config = { ...DEFAULT_AIS_CONFIG, ...config };
    
    // Initialize worker
    try {
      this._worker = new Worker(new URL('../workers/ais-worker.ts', import.meta.url), { type: 'module' });
      this._worker.onmessage = this.handleWorkerMessage.bind(this);
    } catch (e) {
      console.error(`[${this.id}] Failed to initialize worker:`, e);
      this._fetchError = "Worker init failed";
    }
  }

  get lastError(): string | null {
    return this._fetchError;
  }

  start(): void {
    if (this._running) return;

    super.start();

    if (this._worker) {
        this._worker.postMessage({
            type: 'init',
            data: {
                relayUrl: this._config.relayUrl
            }
        });
    }
  }

  stop(): void {
    super.stop();
    if (this._worker) {
        this._worker.postMessage({ type: 'stop' });
    }
  }

  protected tick(): void {
    // Worker pushes updates, we don't pull
  }

  protected initializeUnits(): void {
    this._units.clear();
  }

  protected getUnitId(unit: ShipState): string {
    return unit.mmsi;
  }

  private _lastQueueSize = 0;

  get queueSize(): number {
    return this._lastQueueSize;
  }

  private handleWorkerMessage(e: MessageEvent): void {
      const { type, updates, queueSize } = e.data;
      if (type === 'update' && updates) {
          this._lastQueueSize = queueSize || 0;
          
          // 'updates' is an array of objects: { mmsi, lat, lon, heading, sog, name, type, flag }
          const shipUpdates: ShipUpdate[] = [];

          for (const u of updates) {
              const mmsi = String(u.mmsi);
              
              // Maintain local state map for stats
              let ship = this._units.get(mmsi);
              if (!ship) {
                  ship = {
                      mmsi,
                      lat: u.lat,
                      lon: u.lon,
                      heading: u.heading,
                      targetHeading: u.heading, // BaseUnitState
                      baseSpeed: 0, // BaseUnitState
                      baseTurnRate: 0, // BaseUnitState
                      nextCourseChange: 0, // BaseUnitState
                      sog: u.sog,
                      name: u.name,
                      scale: 1.0,
                      country: u.flag,
                      shipType: u.type
                  };
                  this._units.set(mmsi, ship);
              } else {
                  ship.lat = u.lat;
                  ship.lon = u.lon;
                  ship.heading = u.heading;
                  ship.sog = u.sog;
                  if (u.name) ship.name = u.name;
                  if (u.flag) ship.country = u.flag;
                  if (u.type) ship.shipType = u.type;
                  if (u.dest) ship.destination = u.dest;
                  if (u.len) ship.length = u.len;
                  if (u.width) ship.width = u.width;
              }

              shipUpdates.push({
                  mmsi,
                  lat: u.lat,
                  lon: u.lon,
                  heading: u.heading,
                  sog: u.sog,
                  name: u.name,
                  timestamp: Date.now()
              });
          }
          
          this.emit(shipUpdates);
      }
  }
}
