/**
 * Data Feed Types
 *
 * Common interfaces for all data feeds (simulated or real).
 * These types define the contract that any data source must implement,
 * making it easy to swap between simulated data and real sources
 * like FlightAware, AIS, or Redis.
 */

import type {
  ShipState,
  AircraftState,
  SatelliteState,
  DroneState,
} from "../types";

// =============================================================================
// FEED UPDATE TYPES
// =============================================================================

/** Ship position update from a data feed */
export interface ShipUpdate {
  mmsi: string;
  lat: number;
  lon: number;
  heading: number;
  sog: number; // Speed over ground in knots
  name?: string;
  timestamp?: number;
}

/** Aircraft position update from a data feed */
export interface AircraftUpdate {
  callsign: string;
  lat: number;
  lon: number;
  heading: number;
  altitude: number;
  groundSpeed: number;
  timestamp?: number;
}

/** Satellite position update from a data feed */
export interface SatelliteUpdate {
  noradId: string;
  name: string;
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  orbitType?: "LEO" | "MEO" | "GEO";
  timestamp?: number;
}

/** Drone position update from a data feed */
export interface DroneUpdate {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  targetLat?: number;
  targetLon?: number;
  timestamp?: number;
}

// =============================================================================
// FEED STATISTICS
// =============================================================================

/** Statistics for a data feed */
export interface FeedStats {
  /** Messages received per second */
  messagesPerSec: number;
  /** Total messages received since start */
  totalMessages: number;
  /** Average latency in ms (for real feeds) */
  avgLatencyMs: number;
  /** Last update timestamp */
  lastUpdateTime: number;
  /** Number of active units being tracked */
  activeUnits: number;
  /** Connection status (for real feeds) */
  status: "connected" | "disconnected" | "connecting" | "simulated";
}

// =============================================================================
// FEED CONFIGURATION
// =============================================================================

/** Configuration for a data feed */
export interface FeedConfig {
  /** Enable/disable this feed */
  enabled: boolean;
  /** Update rate in milliseconds */
  updateRateMs: number;
  /** Maximum units to track (for performance) */
  maxUnits: number;
}

// =============================================================================
// FEED INTERFACE
// =============================================================================

/** Base interface for all data feeds */
export interface DataFeed<TUpdate, TState> {
  /** Unique identifier for this feed */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Feed type (ship, aircraft, satellite, drone) */
  readonly type: "ship" | "aircraft" | "satellite" | "drone";

  /** Current configuration */
  config: FeedConfig;

  /** Start receiving/generating data */
  start(): void;

  /** Stop receiving/generating data */
  stop(): void;

  /** Check if feed is running */
  isRunning(): boolean;

  /** Get current statistics */
  getStats(): FeedStats;

  /** Get all current unit states */
  getUnits(): TState[];

  /** Register callback for data updates */
  onUpdate(callback: (updates: TUpdate[]) => void): void;

  /** Unregister callback */
  offUpdate(callback: (updates: TUpdate[]) => void): void;

  /** Update configuration */
  setConfig(config: Partial<FeedConfig>): void;
}

// =============================================================================
// TYPED FEED INTERFACES
// =============================================================================

export type ShipFeed = DataFeed<ShipUpdate, ShipState>;
export type AircraftFeed = DataFeed<AircraftUpdate, AircraftState>;
export type SatelliteFeed = DataFeed<SatelliteUpdate, SatelliteState>;
export type DroneFeed = DataFeed<DroneUpdate, DroneState>;

// =============================================================================
// FEED MANAGER INTERFACE
// =============================================================================

/** Aggregates all data feeds */
export interface FeedManager {
  /** Register a ship feed */
  registerShipFeed(feed: ShipFeed): void;

  /** Register an aircraft feed */
  registerAircraftFeed(feed: AircraftFeed): void;

  /** Register a satellite feed */
  registerSatelliteFeed(feed: SatelliteFeed): void;

  /** Register a drone feed */
  registerDroneFeed(feed: DroneFeed): void;

  /** Start all enabled feeds */
  startAll(): void;

  /** Stop all feeds */
  stopAll(): void;

  /** Get combined stats for all feeds */
  getAllStats(): Map<string, FeedStats>;

  /** Get all ship states from all ship feeds */
  getAllShips(): ShipState[];

  /** Get all aircraft states from all aircraft feeds */
  getAllAircraft(): AircraftState[];

  /** Get all satellite states from all satellite feeds */
  getAllSatellites(): SatelliteState[];

  /** Get all drone states from all drone feeds */
  getAllDrones(): DroneState[];
}
