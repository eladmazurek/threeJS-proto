/**
 * Feed Manager
 *
 * Coordinates all data feeds and syncs updates to the centralized state arrays.
 * Maintains InstancedMesh optimization by batching updates and using
 * the existing attribute update functions for GPU buffer uploads.
 */

import type {
  FeedManager as IFeedManager,
  FeedStats,
  ShipFeed,
  AircraftFeed,
  SatelliteFeed,
  DroneFeed,
  ShipUpdate,
  AircraftUpdate,
  SatelliteUpdate,
  DroneUpdate,
} from "./types";
import type {
  ShipState,
  AircraftState,
  SatelliteState,
  DroneState,
} from "../types";
import { state } from "../state";

// =============================================================================
// FEED MANAGER CONFIGURATION
// =============================================================================

export interface FeedManagerConfig {
  /** How often to sync feed data to GPU buffers (ms) */
  gpuSyncInterval: number;
  /** Whether to log performance stats */
  logStats: boolean;
  /** Stats logging interval (ms) */
  statsInterval: number;
}

const DEFAULT_CONFIG: FeedManagerConfig = {
  gpuSyncInterval: 16, // ~60 FPS
  logStats: false,
  statsInterval: 5000,
};

// =============================================================================
// GPU SYNC DEPENDENCIES
// =============================================================================

interface GpuSyncDependencies {
  updateShipAttributes: () => void;
  updateAircraftAttributes: () => void;
  updateSatelliteAttributes: () => void;
  updateDroneAttributes: () => void;
  initTrailHistory: () => void;
}

// =============================================================================
// FEED MANAGER IMPLEMENTATION
// =============================================================================

/**
 * Manages all data feeds and syncs to GPU buffers.
 * Maintains InstancedMesh performance by:
 * 1. Batching updates from feeds
 * 2. Syncing to state arrays at controlled intervals
 * 3. Using existing attribute update functions for efficient GPU uploads
 */
export class FeedManagerImpl implements IFeedManager {
  private _shipFeeds: Map<string, ShipFeed> = new Map();
  private _aircraftFeeds: Map<string, AircraftFeed> = new Map();
  private _satelliteFeeds: Map<string, SatelliteFeed> = new Map();
  private _droneFeeds: Map<string, DroneFeed> = new Map();

  private _config: FeedManagerConfig;
  private _gpuSyncDeps: GpuSyncDependencies | null = null;
  private _gpuSyncInterval: ReturnType<typeof setInterval> | null = null;
  private _statsInterval: ReturnType<typeof setInterval> | null = null;

  // Dirty flags to track which arrays need GPU sync
  private _shipsDirty: boolean = false;
  private _aircraftDirty: boolean = false;
  private _satellitesDirty: boolean = false;
  private _dronesDirty: boolean = false;

  // Index maps for O(1) lookup when updating existing units
  private _shipIndex: Map<string, number> = new Map();
  private _aircraftIndex: Map<string, number> = new Map();
  private _satelliteIndex: Map<string, number> = new Map();
  private _droneIndex: Map<string, number> = new Map();

  constructor(config: Partial<FeedManagerConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set GPU sync dependencies.
   * Must be called before starting feeds.
   */
  setGpuSyncDependencies(deps: GpuSyncDependencies): void {
    this._gpuSyncDeps = deps;
  }

  // ==========================================================================
  // FEED REGISTRATION
  // ==========================================================================

  registerShipFeed(feed: ShipFeed): void {
    this._shipFeeds.set(feed.id, feed);
    feed.onUpdate((updates) => this.handleShipUpdates(updates));
    console.log(`[FeedManager] Registered ship feed: ${feed.id}`);
  }

  registerAircraftFeed(feed: AircraftFeed): void {
    this._aircraftFeeds.set(feed.id, feed);
    feed.onUpdate((updates) => this.handleAircraftUpdates(updates));
    console.log(`[FeedManager] Registered aircraft feed: ${feed.id}`);
  }

  registerSatelliteFeed(feed: SatelliteFeed): void {
    this._satelliteFeeds.set(feed.id, feed);
    feed.onUpdate((updates) => this.handleSatelliteUpdates(updates));
    console.log(`[FeedManager] Registered satellite feed: ${feed.id}`);
  }

  registerDroneFeed(feed: DroneFeed): void {
    this._droneFeeds.set(feed.id, feed);
    feed.onUpdate((updates) => this.handleDroneUpdates(updates));
    console.log(`[FeedManager] Registered drone feed: ${feed.id}`);
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  startAll(): void {
    if (!this._gpuSyncDeps) {
      console.error("[FeedManager] GPU sync dependencies not set. Call setGpuSyncDependencies first.");
      return;
    }

    // Start all feeds
    for (const feed of this._shipFeeds.values()) feed.start();
    for (const feed of this._aircraftFeeds.values()) feed.start();
    for (const feed of this._satelliteFeeds.values()) feed.start();
    for (const feed of this._droneFeeds.values()) feed.start();

    // Start GPU sync loop
    this._gpuSyncInterval = setInterval(() => {
      this.syncToGpu();
    }, this._config.gpuSyncInterval);

    // Start stats logging if enabled
    if (this._config.logStats) {
      this._statsInterval = setInterval(() => {
        this.logStats();
      }, this._config.statsInterval);
    }

    // Initialize trail history
    this._gpuSyncDeps.initTrailHistory();

    console.log("[FeedManager] All feeds started");
  }

  stopAll(): void {
    // Stop all feeds
    for (const feed of this._shipFeeds.values()) feed.stop();
    for (const feed of this._aircraftFeeds.values()) feed.stop();
    for (const feed of this._satelliteFeeds.values()) feed.stop();
    for (const feed of this._droneFeeds.values()) feed.stop();

    // Stop sync loops
    if (this._gpuSyncInterval) {
      clearInterval(this._gpuSyncInterval);
      this._gpuSyncInterval = null;
    }
    if (this._statsInterval) {
      clearInterval(this._statsInterval);
      this._statsInterval = null;
    }

    console.log("[FeedManager] All feeds stopped");
  }

  // ==========================================================================
  // UPDATE HANDLERS
  // ==========================================================================

  private handleShipUpdates(updates: ShipUpdate[]): void {
    for (const update of updates) {
      let index = this._shipIndex.get(update.mmsi);
      if (index === undefined) {
          // Add new ship
          index = state.ships.length;
          state.ships.push({
              mmsi: update.mmsi,
              lat: update.lat,
              lon: update.lon,
              heading: update.heading,
              sog: update.sog,
              name: update.name || "Unknown",
              scale: 1.0,
              // BaseUnitState defaults
              targetHeading: update.heading,
              baseSpeed: 0,
              baseTurnRate: 0,
              nextCourseChange: 0
          });
          this._shipIndex.set(update.mmsi, index);
      } else if (index < state.ships.length) {
        // Update existing ship
        const ship = state.ships[index];
        ship.lat = update.lat;
        ship.lon = update.lon;
        ship.heading = update.heading;
        ship.sog = update.sog;
        if (update.name) ship.name = update.name;
      }
    }
    this._shipsDirty = true;
  }

  private handleAircraftUpdates(updates: AircraftUpdate[]): void {
    for (const update of updates) {
      const index = this._aircraftIndex.get(update.callsign);
      if (index !== undefined && index < state.aircraft.length) {
        const aircraft = state.aircraft[index];
        aircraft.lat = update.lat;
        aircraft.lon = update.lon;
        aircraft.heading = update.heading;
        aircraft.altitude = update.altitude;
        aircraft.groundSpeed = update.groundSpeed;
      }
    }
    this._aircraftDirty = true;
  }

  private handleSatelliteUpdates(updates: SatelliteUpdate[]): void {
    for (const update of updates) {
      const index = this._satelliteIndex.get(update.noradId);
      if (index !== undefined && index < state.satellites.length) {
        const sat = state.satellites[index];
        sat.lat = update.lat;
        sat.lon = update.lon;
        sat.heading = update.heading;
        sat.altitude = update.altitude;
      }
    }
    this._satellitesDirty = true;
  }

  private handleDroneUpdates(updates: DroneUpdate[]): void {
    for (const update of updates) {
      const index = this._droneIndex.get(update.id);
      if (index !== undefined && index < state.drones.length) {
        const drone = state.drones[index];
        drone.lat = update.lat;
        drone.lon = update.lon;
        drone.heading = update.heading;
        drone.altitude = update.altitude;
        if (update.targetLat !== undefined) drone.targetLat = update.targetLat;
        if (update.targetLon !== undefined) drone.targetLon = update.targetLon;
      }
    }
    this._dronesDirty = true;
  }

  // ==========================================================================
  // GPU SYNC
  // ==========================================================================

  private syncToGpu(): void {
    if (!this._gpuSyncDeps) return;

    if (this._shipsDirty) {
      this._gpuSyncDeps.updateShipAttributes();
      this._shipsDirty = false;
    }

    if (this._aircraftDirty) {
      this._gpuSyncDeps.updateAircraftAttributes();
      this._aircraftDirty = false;
    }

    if (this._satellitesDirty) {
      this._gpuSyncDeps.updateSatelliteAttributes();
      this._satellitesDirty = false;
    }

    if (this._dronesDirty) {
      this._gpuSyncDeps.updateDroneAttributes();
      this._dronesDirty = false;
    }
  }

  // ==========================================================================
  // STATE INITIALIZATION
  // ==========================================================================

  /**
   * Initialize state arrays from feeds.
   * Call this after registering feeds and before startAll().
   */
  initializeFromFeeds(): void {
    // Clear state arrays
    state.ships.length = 0;
    state.aircraft.length = 0;
    state.satellites.length = 0;
    state.drones.length = 0;

    // Clear index maps
    this._shipIndex.clear();
    this._aircraftIndex.clear();
    this._satelliteIndex.clear();
    this._droneIndex.clear();

    // Initialize from ship feeds
    for (const feed of this._shipFeeds.values()) {
      if (!feed.config.enabled) continue;
      // Trigger initialization
      feed.start();
      feed.stop();
      const units = feed.getUnits();
      for (const unit of units) {
        this._shipIndex.set(unit.mmsi, state.ships.length);
        state.ships.push(unit);
      }
    }

    // Initialize from aircraft feeds
    for (const feed of this._aircraftFeeds.values()) {
      if (!feed.config.enabled) continue;
      feed.start();
      feed.stop();
      const units = feed.getUnits();
      for (const unit of units) {
        this._aircraftIndex.set(unit.callsign, state.aircraft.length);
        state.aircraft.push(unit);
      }
    }

    // Initialize from satellite feeds
    for (const feed of this._satelliteFeeds.values()) {
      if (!feed.config.enabled) continue;
      feed.start();
      feed.stop();
      const units = feed.getUnits();
      let noradId = 25544;
      for (const unit of units) {
        this._satelliteIndex.set(String(noradId++), state.satellites.length);
        state.satellites.push(unit);
      }
    }

    // Initialize from drone feeds
    for (const feed of this._droneFeeds.values()) {
      if (!feed.config.enabled) continue;
      feed.start();
      feed.stop();
      const units = feed.getUnits();
      let droneNum = 1;
      for (const unit of units) {
        const droneId = `UAV-${String(droneNum++).padStart(3, "0")}`;
        this._droneIndex.set(droneId, state.drones.length);
        state.drones.push(unit);
      }
    }

    console.log(`[FeedManager] Initialized state: ${state.ships.length} ships, ` +
                `${state.aircraft.length} aircraft, ${state.satellites.length} satellites, ` +
                `${state.drones.length} drones`);
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  getAllStats(): Map<string, FeedStats> {
    const stats = new Map<string, FeedStats>();

    for (const feed of this._shipFeeds.values()) {
      stats.set(feed.id, feed.getStats());
    }
    for (const feed of this._aircraftFeeds.values()) {
      stats.set(feed.id, feed.getStats());
    }
    for (const feed of this._satelliteFeeds.values()) {
      stats.set(feed.id, feed.getStats());
    }
    for (const feed of this._droneFeeds.values()) {
      stats.set(feed.id, feed.getStats());
    }

    return stats;
  }

  private logStats(): void {
    const stats = this.getAllStats();
    let totalMps = 0;
    let totalUnits = 0;

    for (const [id, stat] of stats) {
      totalMps += stat.messagesPerSec;
      totalUnits += stat.activeUnits;
    }

    console.log(`[FeedManager] Stats: ${totalMps.toFixed(0)} msg/s, ${totalUnits} units`);
  }

  // ==========================================================================
  // AGGREGATED GETTERS
  // ==========================================================================

  getAllShips(): ShipState[] {
    return [...state.ships];
  }

  getAllAircraft(): AircraftState[] {
    return [...state.aircraft];
  }

  getAllSatellites(): SatelliteState[] {
    return [...state.satellites];
  }

  getAllDrones(): DroneState[] {
    return [...state.drones];
  }

  // ==========================================================================
  // INDIVIDUAL FEED ACCESS
  // ==========================================================================

  getShipFeed(id: string): ShipFeed | undefined {
    return this._shipFeeds.get(id);
  }

  getAircraftFeed(id: string): AircraftFeed | undefined {
    return this._aircraftFeeds.get(id);
  }

  getSatelliteFeed(id: string): SatelliteFeed | undefined {
    return this._satelliteFeeds.get(id);
  }

  getDroneFeed(id: string): DroneFeed | undefined {
    return this._droneFeeds.get(id);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/** Global feed manager instance */
export const feedManager = new FeedManagerImpl();
