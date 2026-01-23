/**
 * Satellite Feed Controller
 *
 * Manages switching between simulated and live (CelesTrak) satellite feeds.
 */

import { SimulatedSatelliteFeed } from "./simulated-satellite-feed";
import { CelesTrakSatelliteFeed } from "./celestrak-satellite-feed";
import { state } from "../state";
import type { SatelliteState } from "../types";
import { satelliteFeedParams } from "./shared";
import type { SatelliteFeedMode, SatelliteFeedParams } from "./shared";
import { updateLiveIndicator } from "./shared";

export type { SatelliteFeedMode, SatelliteFeedParams };
export { satelliteFeedParams };

// =============================================================================
// FEED INSTANCES
// =============================================================================

let simulatedFeed: SimulatedSatelliteFeed | null = null;
let liveFeed: CelesTrakSatelliteFeed | null = null;
let activeFeed: SimulatedSatelliteFeed | CelesTrakSatelliteFeed | null = null;

// Dependencies
let onAttributesUpdate: (() => void) | null = null;
let onUnitVisibilityChange: ((showSimulatedUnits: boolean) => void) | null = null;

export interface SatelliteFeedDependencies {
  updateSatelliteAttributes: () => void;
  onUnitVisibilityChange?: (showSimulatedUnits: boolean) => void;
}

export function initSatelliteFeedController(deps: SatelliteFeedDependencies): void {
  onAttributesUpdate = deps.updateSatelliteAttributes;
  onUnitVisibilityChange = deps.onUnitVisibilityChange || null;

  simulatedFeed = new SimulatedSatelliteFeed({
    maxUnits: satelliteFeedParams.simulatedCount,
  });

  liveFeed = new CelesTrakSatelliteFeed({
    group: satelliteFeedParams.liveGroup,
  });

  console.log("[SatelliteFeedController] Initialized");
}

export function startSatelliteFeed(): void {
  stopSatelliteFeed();

  if (satelliteFeedParams.mode === "simulated") {
    if (!simulatedFeed) return;
    
    // Clear state
    state.satellites.length = 0;
    
    simulatedFeed.setSatelliteCount(satelliteFeedParams.simulatedCount);
    activeFeed = simulatedFeed;
    simulatedFeed.start();
    
    satelliteFeedParams.status = "simulated";
    satelliteFeedParams.indicatorStatus = "simulated";
    
    if (onUnitVisibilityChange) {
      onUnitVisibilityChange(true);
    }
    
    updateLiveIndicator();
    console.log("[SatelliteFeedController] Started simulated feed");
  } else {
    if (!liveFeed) return;

    // Clear state
    state.satellites.length = 0;

    activeFeed = liveFeed;
    liveFeed.start();
    
    satelliteFeedParams.status = "connecting";
    satelliteFeedParams.indicatorStatus = "connecting";
    
    if (onUnitVisibilityChange) {
      onUnitVisibilityChange(false);
    }
    
    updateLiveIndicator();
    console.log("[SatelliteFeedController] Started live feed");
  }
}

export function stopSatelliteFeed(): void {
  simulatedFeed?.stop();
  liveFeed?.stop();
  activeFeed = null;
  satelliteFeedParams.status = "stopped";
}

export function setSatelliteFeedMode(mode: SatelliteFeedMode): void {
  if (mode === satelliteFeedParams.mode) return;
  satelliteFeedParams.mode = mode;
  startSatelliteFeed();
}

export function getSatelliteFeedStats() {
  return {
    mode: satelliteFeedParams.mode,
    trackedCount: state.satellites.length,
    status: satelliteFeedParams.status,
  };
}

let lastSyncTime = 0;

/**
 * Sync live feed state to state.satellites and update GPU buffers.
 * Call this once per frame from the render loop.
 */
export function syncSatelliteFeedState(): void {
  const now = performance.now();
  const deltaTime = lastSyncTime === 0 ? 0 : (now - lastSyncTime) / 1000;
  lastSyncTime = now;

  // Handle Simulated Mode
  if (satelliteFeedParams.mode === "simulated" && simulatedFeed) {
      // Drive simulation physics (60fps)
      simulatedFeed.syncToState(state.satellites, deltaTime);
      
      if (onAttributesUpdate) onAttributesUpdate();
      return;
  }

  // Handle Live Mode
  if (satelliteFeedParams.mode === "live" && liveFeed) {
      const needsUpdate = liveFeed.syncToState(state.satellites);
      
      // Update status when connected
      if (state.satellites.length > 0 && satelliteFeedParams.indicatorStatus === "connecting") {
          satelliteFeedParams.status = "connected";
          satelliteFeedParams.indicatorStatus = "live";
          updateLiveIndicator();
      }

      // Update error status
      const error = (liveFeed as any).lastError;
      if (error && satelliteFeedParams.indicatorStatus !== "error") {
          satelliteFeedParams.status = "error";
          satelliteFeedParams.indicatorStatus = "error";
          satelliteFeedParams.lastError = error;
          updateLiveIndicator();
      }
      
      if (needsUpdate) {
          satelliteFeedParams.trackedCount = state.satellites.length;
          if (onAttributesUpdate) onAttributesUpdate();
      }
  }
}
