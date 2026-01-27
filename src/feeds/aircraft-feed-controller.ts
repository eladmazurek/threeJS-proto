/**
 * Aircraft Feed Controller
 *
 * Manages switching between simulated and live (OpenSky) aircraft feeds.
 * Provides a clean interface for the GUI and app to control feed behavior.
 */

import * as THREE from "three";
import { SimulatedAircraftFeed } from "./simulated-aircraft-feed";
import { OpenSkyRelayFeed } from "./opensky-relay-feed";
import type { AircraftUpdate } from "./types";
import { state } from "../state";
import { aircraftFeedParams } from "./shared";
import type { FeedMode, CoverageMode, AircraftFeedParams } from "./shared";
import { updateLiveIndicator } from "./shared";

export type { FeedMode, CoverageMode, AircraftFeedParams };
export { aircraftFeedParams };

// =============================================================================
// FEED INSTANCES
// =============================================================================

let simulatedFeed: SimulatedAircraftFeed | null = null;
let liveFeed: OpenSkyRelayFeed | null = null;
let activeFeed: SimulatedAircraftFeed | OpenSkyRelayFeed | null = null;

// Dependencies
let cameraRef: THREE.Camera | null = null;
let getEarthRotation: (() => number) | null = null;
let onAttributesUpdate: (() => void) | null = null;
let onUnitVisibilityChange: ((showSimulatedUnits: boolean) => void) | null = null;


// =============================================================================
// INITIALIZATION
// =============================================================================

export interface FeedControllerDependencies {
  camera: THREE.Camera;
  getEarthRotation: () => number;
  updateAircraftAttributes: () => void;
  /** Called when feed mode changes to show/hide simulated-only units */
  onUnitVisibilityChange?: (showSimulatedUnits: boolean) => void;
}

/**
 * Initialize the aircraft feed controller.
 * Must be called before using any other controller functions.
 */
export function initAircraftFeedController(deps: FeedControllerDependencies): void {
  cameraRef = deps.camera;
  getEarthRotation = deps.getEarthRotation;
  onAttributesUpdate = deps.updateAircraftAttributes;
  onUnitVisibilityChange = deps.onUnitVisibilityChange || null;

  // Create simulated feed
  simulatedFeed = new SimulatedAircraftFeed({
    maxUnits: aircraftFeedParams.simulatedCount,
    updateRateMs: 100,
  });

  // Create live feed (uses relay server - no credentials needed client-side)
  liveFeed = new OpenSkyRelayFeed({
    interpolatePositions: aircraftFeedParams.interpolation,
  });

  // Register update handlers
  simulatedFeed.onUpdate(handleAircraftUpdates);
  liveFeed.onUpdate(handleAircraftUpdates);

  console.log("[AircraftFeedController] Initialized (using relay server for live data)");
}

// =============================================================================
// FEED SWITCHING
// =============================================================================

/**
 * Start the aircraft feed with current settings.
 */
export function startAircraftFeed(): void {
  stopAircraftFeed();

  if (aircraftFeedParams.mode === "simulated") {
    if (!simulatedFeed) return;

    // Clear existing state and index
    state.aircraft.length = 0;
    aircraftIndex.clear();

    simulatedFeed.setConfig({ maxUnits: aircraftFeedParams.simulatedCount });
    // Set activeFeed BEFORE start() so handleAircraftUpdates can access full unit state
    activeFeed = simulatedFeed;
    simulatedFeed.start();
    aircraftFeedParams.status = "simulated";
    aircraftFeedParams.indicatorStatus = "simulated";

    // Show all simulated units (ships, satellites, drones)
    if (onUnitVisibilityChange) {
      onUnitVisibilityChange(true);
    }

    updateLiveIndicator();
    console.log("[AircraftFeedController] Started simulated feed");
  } else {
    if (!liveFeed) return;

    // Clear existing state and index
    state.aircraft.length = 0;
    aircraftIndex.clear();

    liveFeed.setInterpolation(aircraftFeedParams.interpolation);
    // Set activeFeed BEFORE start() for consistency
    activeFeed = liveFeed;
    liveFeed.start();
    aircraftFeedParams.status = "connecting";
    aircraftFeedParams.indicatorStatus = "connecting";

    // Hide simulated-only units (ships, satellites, drones) - only show live aircraft
    if (onUnitVisibilityChange) {
      onUnitVisibilityChange(false);
    }

    updateLiveIndicator();
    console.log("[AircraftFeedController] Started live feed");
  }
}

/**
 * Stop the active aircraft feed.
 */
export function stopAircraftFeed(): void {
  if (simulatedFeed?.isRunning()) {
    simulatedFeed.stop();
  }
  if (liveFeed?.isRunning()) {
    liveFeed.stop();
  }
  activeFeed = null;
  aircraftFeedParams.status = "stopped";
}

/**
 * Switch between feed modes.
 */
export function setFeedMode(mode: FeedMode): void {
  if (mode === aircraftFeedParams.mode) return;

  aircraftFeedParams.mode = mode;
  aircraftFeedParams.lastError = "";

  // Restart with new mode
  if (activeFeed) {
    startAircraftFeed();
  }
}

/**
 * Set coverage mode for live feed.
 * Note: Relay server always sends global data, filtering is done client-side if needed.
 */
export function setCoverageMode(coverage: CoverageMode): void {
  aircraftFeedParams.coverage = coverage;
  // Relay server sends all data - no viewport filtering at API level
}

/**
 * Toggle interpolation for live feed.
 */
export function setInterpolation(enabled: boolean): void {
  aircraftFeedParams.interpolation = enabled;

  if (liveFeed) {
    liveFeed.setInterpolation(enabled);
  }
}

/**
 * Update simulated aircraft count.
 */
export function setSimulatedCount(count: number): void {
  console.log(`[AircraftFeedController] setSimulatedCount(${count}), simulatedFeed=${!!simulatedFeed}`);
  aircraftFeedParams.simulatedCount = count;

  // Always update the feed (it will regenerate units)
  if (simulatedFeed) {
    simulatedFeed.setAircraftCount(count);
  }
}

// =============================================================================
// UPDATE HANDLING
// =============================================================================

// Index map for O(1) lookups
const aircraftIndex = new Map<string, number>();

function handleAircraftUpdates(updates: AircraftUpdate[]): void {
  // If we're in live mode, syncLiveFeedState handles the state updates 
  // every frame for all aircraft. We don't want to duplicate that here
  // or mess up the indices managed by syncToState.
  if (activeFeed === liveFeed && liveFeed) {
    const error = liveFeed.lastError;
    aircraftFeedParams.lastError = error || "";

    const prevStatus = aircraftFeedParams.indicatorStatus;
    if (error) {
      aircraftFeedParams.status = "error";
      aircraftFeedParams.indicatorStatus = "error";
    } else {
      aircraftFeedParams.status = "connected";
      aircraftFeedParams.indicatorStatus = "live";
    }

    if (prevStatus !== aircraftFeedParams.indicatorStatus) {
      updateLiveIndicator();
    }
    return;
  }

  // For simulated feed, get full unit state to access type info
  const fullUnits = activeFeed === simulatedFeed ? simulatedFeed?.getUnits() : undefined;

  // Trigger GPU buffer update (simulated feed only)
  if (onAttributesUpdate) {
    onAttributesUpdate();
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up stale aircraft that haven't been updated.
 * Call periodically (e.g., every 30 seconds) for live feed.
 */
export function cleanupStaleAircraft(maxAgeMs: number = 60000): void {
  if (aircraftFeedParams.mode !== "live") return;

  // For live feed, aircraft are automatically removed by the feed
  // when they're no longer in the API response
}

/**
 * Get current feed statistics.
 */
export function getFeedStats() {
  return {
    mode: aircraftFeedParams.mode,
    coverage: aircraftFeedParams.coverage,
    interpolation: aircraftFeedParams.interpolation,
    trackedCount: aircraftFeedParams.trackedCount,
    status: aircraftFeedParams.status,
    lastError: aircraftFeedParams.lastError,
    isRunning: activeFeed?.isRunning() || false,
  };
}

/**
 * Sync live feed state to state.aircraft and update GPU buffers.
 * Call this once per frame from the render loop when in live mode.
 * This avoids the overhead of emitting 7000+ updates via callbacks at 60fps.
 */
export function syncLiveFeedState(): void {
  // Update stats for both modes
  if (aircraftFeedParams.mode === "simulated" && simulatedFeed) {
    const stats = simulatedFeed.getStats();
    aircraftFeedParams.trackedCount = stats.activeUnits;
    aircraftFeedParams.msgRate = stats.messagesPerSec;
    return;
  }

  if (aircraftFeedParams.mode !== "live" || !liveFeed) return;

  // Sync interpolated positions directly to state array
  // Returns true only if positions actually changed
  const needsGpuUpdate = liveFeed.syncToState(state.aircraft);
  const stats = liveFeed.getStats();
  aircraftFeedParams.trackedCount = state.aircraft.length;
  aircraftFeedParams.msgRate = stats.messagesPerSec;

  // Update selected unit index if it's an aircraft (indices may have shifted)
  if (state.selectedUnit?.type === "aircraft" && state.selectedUnit.id) {
    const newIndex = state.aircraft.findIndex(a => a.callsign === state.selectedUnit!.id);
    if (newIndex >= 0) {
      state.selectedUnit.index = newIndex;
    } else {
      // Aircraft no longer in feed - deselect
      state.selectedUnit = null;
    }
  }

  // Only update GPU buffers when positions changed
  if (needsGpuUpdate && onAttributesUpdate) {
    onAttributesUpdate();
  }
}
