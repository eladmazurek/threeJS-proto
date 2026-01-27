/**
 * Data Feeds Module
 *
 * Modular data feed system for unit position updates.
 * Currently uses simulated feeds that can be swapped for real sources:
 * - WebSocket feeds (FlightAware, AIS, etc.)
 * - Redis cache feeds
 * - Custom API feeds
 *
 * Usage:
 * ```typescript
 * import { feedManager, SimulatedShipFeed, SimulatedAircraftFeed } from "./feeds";
 *
 * // Create and register feeds
 * const shipFeed = new SimulatedShipFeed({ maxUnits: 500, updateRateMs: 100 });
 * feedManager.registerShipFeed(shipFeed);
 *
 * // Set GPU sync dependencies
 * feedManager.setGpuSyncDependencies({
 *   updateShipAttributes,
 *   updateAircraftAttributes,
 *   updateSatelliteAttributes,
 *   updateDroneAttributes,
 *   initTrailHistory,
 * });
 *
 * // Initialize state arrays from feeds
 * feedManager.initializeFromFeeds();
 *
 * // Start all feeds
 * feedManager.startAll();
 *
 * // Later, to add a real feed:
 * // const aisWebSocketFeed = new AisWebSocketFeed("wss://ais-server.example.com");
 * // feedManager.registerShipFeed(aisWebSocketFeed);
 * ```
 */

// Types
export * from "./types";

// Base feed
export { BaseFeed, DEFAULT_FEED_CONFIG } from "./base-feed";

// Simulated feeds
export { SimulatedShipFeed } from "./simulated-ship-feed";
export type { ShipFeedConfig } from "./simulated-ship-feed";

export { SimulatedAircraftFeed } from "./simulated-aircraft-feed";
export type { AircraftFeedConfig } from "./simulated-aircraft-feed";

export { SimulatedSatelliteFeed } from "./simulated-satellite-feed";
export type { SatelliteFeedConfig } from "./simulated-satellite-feed";

export { SimulatedDroneFeed } from "./simulated-drone-feed";
export type { DroneFeedConfig } from "./simulated-drone-feed";

// Live feeds
export { OpenSkyAircraftFeed } from "./opensky-aircraft-feed";
export type { OpenSkyFeedConfig, BoundingBox } from "./opensky-aircraft-feed";

export { OpenSkyRelayFeed } from "./opensky-relay-feed";
export type { OpenSkyRelayConfig } from "./opensky-relay-feed";

export { CelesTrakSatelliteFeed } from "./celestrak-satellite-feed";
export type { CelesTrakFeedConfig } from "./celestrak-satellite-feed";

export { AISStreamFeed } from "./ais-feed";
export type { AISFeedConfig } from "./ais-feed";

// Feed manager
export { FeedManagerImpl, feedManager } from "./feed-manager";
export type { FeedManagerConfig } from "./feed-manager";

// Shared feed status and params
export * from "./shared";
export { aisFeedParams } from "./shared"; // Explicit export if * doesn't cover it or for clarity

// Aircraft feed controller
export {
  initAircraftFeedController,
  startAircraftFeed,
  stopAircraftFeed,
  setFeedMode,
  setCoverageMode,
  setInterpolation,
  setSimulatedCount,
  getFeedStats,
  syncLiveFeedState,
} from "./aircraft-feed-controller";
export type { FeedControllerDependencies } from "./aircraft-feed-controller";

// Satellite feed controller
export {
  initSatelliteFeedController,
  startSatelliteFeed,
  stopSatelliteFeed,
  setSatelliteFeedMode,
  getSatelliteFeedStats,
  syncSatelliteFeedState,
  setSimulatedSatelliteCount,
} from "./satellite-feed-controller";
export type { SatelliteFeedDependencies } from "./satellite-feed-controller";

// AIS feed controller
export {
  initAISFeedController,
  startAISFeed,
  setAISFeedMode,
  getAISFeedStats,
  syncAISFeedState,
  setSimulatedShipCount,
} from "./ais-feed-controller";