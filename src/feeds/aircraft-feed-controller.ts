/**
 * Aircraft Feed Controller
 *
 * Manages switching between simulated and live (OpenSky) aircraft feeds.
 * Provides a clean interface for the GUI and app to control feed behavior.
 */

import * as THREE from "three";
import { SimulatedAircraftFeed } from "./simulated-aircraft-feed";
import { OpenSkyAircraftFeed } from "./opensky-aircraft-feed";
import type { AircraftUpdate } from "./types";
import type { AircraftState } from "../types";
import { state } from "../state";
import { getViewportBoundingBox } from "../utils/coordinates";

// =============================================================================
// CONFIGURATION
// =============================================================================

export type FeedMode = "simulated" | "live";
export type CoverageMode = "worldwide" | "viewport";

export interface AircraftFeedParams {
  /** Current feed mode */
  mode: FeedMode;
  /** Coverage area for live feed */
  coverage: CoverageMode;
  /** Enable position interpolation for live feed */
  interpolation: boolean;
  /** Number of simulated aircraft (when in simulated mode) */
  simulatedCount: number;
  /** Last error message (if any) */
  lastError: string;
  /** Number of tracked aircraft */
  trackedCount: number;
  /** Feed status */
  status: string;
  /** Indicator status for UI (simulated, live, connecting, error) */
  indicatorStatus: "simulated" | "live" | "connecting" | "error";
}

export const aircraftFeedParams: AircraftFeedParams = {
  mode: "simulated",
  coverage: "worldwide",
  interpolation: true,
  simulatedCount: 500,
  lastError: "",
  trackedCount: 0,
  status: "idle",
  indicatorStatus: "simulated",
};

// =============================================================================
// FEED INSTANCES
// =============================================================================

let simulatedFeed: SimulatedAircraftFeed | null = null;
let liveFeed: OpenSkyAircraftFeed | null = null;
let activeFeed: SimulatedAircraftFeed | OpenSkyAircraftFeed | null = null;

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

  // Get OpenSky credentials from environment
  const clientId = import.meta.env.VITE_OPEN_SKY_CLIENT_ID || "";
  const clientKey = import.meta.env.VITE_OPEN_SKY_CLIENT_KEY || "";

  // Create simulated feed
  simulatedFeed = new SimulatedAircraftFeed({
    maxUnits: aircraftFeedParams.simulatedCount,
    updateRateMs: 100,
  });

  // Create live feed
  liveFeed = new OpenSkyAircraftFeed({
    clientId,
    clientKey,
    updateRateMs: clientId ? 5000 : 10000,
    interpolatePositions: aircraftFeedParams.interpolation,
    useViewportFilter: aircraftFeedParams.coverage === "viewport",
    getViewportBounds: () => getViewportBounds(),
  });

  // Register update handlers
  simulatedFeed.onUpdate(handleAircraftUpdates);
  liveFeed.onUpdate(handleAircraftUpdates);

  // Log credential status
  if (clientId) {
    console.log(`[AircraftFeedController] OpenSky credentials found (${clientId.substring(0, 3)}...), using authenticated mode (5s rate limit)`);
  } else {
    console.log("[AircraftFeedController] No OpenSky credentials, using anonymous mode (10s rate limit)");
    console.log("[AircraftFeedController] Expected env vars: VITE_OPEN_SKY_CLIENT_ID, VITE_OPEN_SKY_CLIENT_KEY");
  }

  console.log("[AircraftFeedController] Initialized");
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

    liveFeed.setViewportFilter(aircraftFeedParams.coverage === "viewport");
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
 */
export function setCoverageMode(coverage: CoverageMode): void {
  aircraftFeedParams.coverage = coverage;

  if (liveFeed) {
    liveFeed.setViewportFilter(coverage === "viewport");
  }
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
  aircraftFeedParams.simulatedCount = count;

  if (simulatedFeed && aircraftFeedParams.mode === "simulated") {
    simulatedFeed.setAircraftCount(count);
  }
}

// =============================================================================
// UPDATE HANDLING
// =============================================================================

// Index map for O(1) lookups
const aircraftIndex = new Map<string, number>();

function handleAircraftUpdates(updates: AircraftUpdate[]): void {
  // For simulated feed, get full unit state to access type info
  const fullUnits = activeFeed === simulatedFeed ? simulatedFeed?.getUnits() : undefined;
  const unitsByCallsign = new Map<string, AircraftState>();

  if (fullUnits) {
    for (const unit of fullUnits) {
      unitsByCallsign.set(unit.callsign, unit);
    }
  }

  for (const update of updates) {
    let index = aircraftIndex.get(update.callsign);
    const fullUnit = unitsByCallsign.get(update.callsign);

    if (index === undefined) {
      // New aircraft - add to state
      index = state.aircraft.length;
      aircraftIndex.set(update.callsign, index);

      state.aircraft.push({
        lat: update.lat,
        lon: update.lon,
        heading: update.heading,
        altitude: update.altitude,
        groundSpeed: update.groundSpeed,
        callsign: update.callsign,
        scale: fullUnit?.scale ?? 1.0,
        flightLevel: Math.floor(update.altitude / 100),
        // Type info from simulated feed
        aircraftType: fullUnit?.aircraftType,
        icaoTypeCode: fullUnit?.icaoTypeCode,
        // Simulation properties (unused for live aircraft, but required by type)
        targetHeading: update.heading,
        baseSpeed: 0,
        baseTurnRate: 0,
        nextCourseChange: 0,
      });
    } else if (index < state.aircraft.length) {
      // Update existing aircraft
      const aircraft = state.aircraft[index];
      aircraft.lat = update.lat;
      aircraft.lon = update.lon;
      aircraft.heading = update.heading;
      aircraft.altitude = update.altitude;
      aircraft.groundSpeed = update.groundSpeed;
      // Update type info if we have it and it's missing
      if (fullUnit?.aircraftType && !aircraft.aircraftType) {
        aircraft.aircraftType = fullUnit.aircraftType;
      }
      if (fullUnit?.icaoTypeCode && !aircraft.icaoTypeCode) {
        aircraft.icaoTypeCode = fullUnit.icaoTypeCode;
      }
    }
  }

  // Update tracked count
  aircraftFeedParams.trackedCount = state.aircraft.length;

  // Update status and error for live feed
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

    // Update indicator if status changed
    if (prevStatus !== aircraftFeedParams.indicatorStatus) {
      updateLiveIndicator();
    }

    // For live feed, syncLiveFeedState handles GPU updates per frame
    // Don't trigger here (this callback is only for initial API response)
    return;
  }

  // Trigger GPU buffer update (simulated feed only)
  if (onAttributesUpdate) {
    onAttributesUpdate();
  }
}

// =============================================================================
// VIEWPORT BOUNDS
// =============================================================================

function getViewportBounds() {
  if (!cameraRef || !getEarthRotation) return null;

  const earthRotY = getEarthRotation();
  const bounds = getViewportBoundingBox(cameraRef, earthRotY);

  return bounds;
}

// =============================================================================
// LIVE INDICATOR
// =============================================================================

const INDICATOR_LABELS: Record<AircraftFeedParams["indicatorStatus"], string> = {
  simulated: "SIM",
  live: "LIVE",
  connecting: "CONNECTING",
  error: "ERROR",
};

/**
 * Update the live indicator in the UI based on current feed status.
 */
export function updateLiveIndicator(): void {
  const indicator = document.getElementById("live-indicator");
  const textEl = indicator?.querySelector(".live-text");

  if (!indicator || !textEl) return;

  // Remove all mode classes
  indicator.classList.remove("mode-simulated", "mode-live", "mode-connecting", "mode-error");

  // Add current mode class
  indicator.classList.add(`mode-${aircraftFeedParams.indicatorStatus}`);

  // Update text
  textEl.textContent = INDICATOR_LABELS[aircraftFeedParams.indicatorStatus];
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
  if (aircraftFeedParams.mode !== "live" || !liveFeed) return;

  // Sync interpolated positions directly to state array
  // Returns true only if positions actually changed
  const needsGpuUpdate = liveFeed.syncToState(state.aircraft);
  aircraftFeedParams.trackedCount = state.aircraft.length;

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
