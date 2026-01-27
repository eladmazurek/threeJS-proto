/**
 * AIS Feed Controller
 *
 * Manages switching between simulated and live AIS ship data.
 */

import { feedManager } from "./feed-manager";
import { SimulatedShipFeed } from "./simulated-ship-feed";
import { AISStreamFeed, type AISFeedConfig } from "./ais-feed";
import { state } from "../state";
import { aisFeedParams, updateLiveIndicator, DEFAULT_RELAY_SERVER } from "./shared";
import { initTrailHistory } from "../units/trails";

let isLive = false;
let simulatedFeed: SimulatedShipFeed | null = null;
let liveFeed: AISStreamFeed | null = null;
let statsInterval: any = null;

// Callbacks
let onVisibilityChange: ((showSimulated: boolean) => void) | null = null;
let updateShipAttributes: (() => void) | null = null;

/**
 * Initialize the AIS feed controller
 */
export function initAISFeedController(params: {
  updateShipAttributes: () => void;
  onUnitVisibilityChange: (showSimulated: boolean) => void;
}) {
  updateShipAttributes = params.updateShipAttributes;
  onVisibilityChange = params.onUnitVisibilityChange;

  // Create feeds if not already registered
  // Check if feeds exist in feedManager
  if (!feedManager.getShipFeed("simulated-ships")) {
    simulatedFeed = new SimulatedShipFeed({
      maxUnits: 100,
      updateRateMs: 100
    });
    feedManager.registerShipFeed(simulatedFeed);
  } else {
    simulatedFeed = feedManager.getShipFeed("simulated-ships") as SimulatedShipFeed;
  }

  if (!feedManager.getShipFeed("ais-live")) {
    // Construct relay URL:
    // 1. VITE_RELAY_SERVER (Base URL) -> append /ais
    // 2. VITE_AIS_RELAY_URL (Full URL) -> use as is
    // 3. DEFAULT_RELAY_SERVER -> append /ais
    let relayUrl = "";
    const baseRelay = import.meta.env.VITE_RELAY_SERVER;
    const legacyUrl = import.meta.env.VITE_AIS_RELAY_URL;

    if (baseRelay && typeof baseRelay === 'string') {
      relayUrl = `${baseRelay.replace(/\/$/, '')}/ais`;
    } else if (legacyUrl && typeof legacyUrl === 'string') {
      relayUrl = legacyUrl;
    } else {
      relayUrl = `${DEFAULT_RELAY_SERVER}/ais`;
    }

    liveFeed = new AISStreamFeed({
      relayUrl,
      maxUnits: 50000,
      updateRateMs: 100,
    });
    feedManager.registerShipFeed(liveFeed);
  } else {
    liveFeed = feedManager.getShipFeed("ais-live") as AISStreamFeed;
  }
}

/**
 * Start the AIS feed (defaults to simulated)
 */
export function startAISFeed() {
  // Always start in simulated mode by default
  // User can toggle to live via GUI if key is available
  setAISFeedMode("simulated");
}

/**
 * Switch between "simulated" and "live" modes
 */
export function setAISFeedMode(mode: "simulated" | "live") {
  if (!simulatedFeed || !liveFeed) return;

  if (mode === "live") {
    console.log("[AISController] Switching to LIVE feed...");
    isLive = true;
    aisFeedParams.mode = "live";
    aisFeedParams.status = "Connecting...";
    aisFeedParams.indicatorStatus = "connecting";
    updateLiveIndicator();
    
    // Stop simulated
    simulatedFeed.stop();
    
    // Start live
    liveFeed.start();
    
    // Hide simulated-only units (if any logic depends on it)
    if (onVisibilityChange) onVisibilityChange(false);
    
    // Clear state for clean slate
    state.ships.length = 0;
    
    // Clear trails
    state.trails.shipHistory = [];
    
    // Hide simulated drones/satellites to ensure "Pure Live" feel
    // unless their live feeds are active.
    // Note: We don't have direct access to satellite feed state here easily,
    // but we can toggle visibility if we want strict mode.
    // User requested "we should only display real data after AIS gets activated"
    // "like we do for the other live data types".
    // Usually this means hiding simulated counterparts.
    // Simulated satellites are managed by satellite-feed-controller.
    // If we want to hide them, we can set state.unitCounts.showSatellites = false?
    // No, that hides ALL satellites.
    // We should probably rely on the user to toggle Satellites to Live.
    // But if you want to hide SIMULATED satellites, we need to know if sats are simulated.
    
    // Simpler interpretation: "Simulated ships" are hidden. "Simulated drones" are hidden.
    // "Simulated satellites" should also be hidden if possible.
    if (onVisibilityChange) onVisibilityChange(false);

  } else {
    console.log("[AISController] Switching to SIMULATED feed...");
    isLive = false;
    aisFeedParams.mode = "simulated";
    aisFeedParams.status = "Simulating";
    aisFeedParams.indicatorStatus = "simulated";
    updateLiveIndicator();
    
    liveFeed.stop();
    simulatedFeed.start();
    
    if (onVisibilityChange) onVisibilityChange(true);
    
    // Clear state
    state.ships.length = 0;
  }
}

/**
 * Sync live feed state to GPU
 */
export function syncAISFeedState() {
    // Periodically update UI stats (every ~1s)
    const now = performance.now();
    if (!statsInterval || now - statsInterval > 1000) {
        // Log queue size every ~15s
        const count = Math.floor(now / 1000);
        if (isLive && liveFeed && count % 15 === 0) {
             console.log(`[AIS Monitor] Queue Size: ${liveFeed.queueSize}`);
        }

        statsInterval = now;
        
        if (isLive && liveFeed) {
            const stats = liveFeed.getStats();
            aisFeedParams.trackedCount = stats.activeUnits;
            aisFeedParams.msgRate = stats.messagesPerSec;

            if (stats.messagesPerSec > 0) {
                 aisFeedParams.status = "Live";
                 aisFeedParams.indicatorStatus = "live";
            } else if (liveFeed.lastError) {
                 aisFeedParams.status = `Error: ${liveFeed.lastError}`;
                 aisFeedParams.indicatorStatus = "error";
            } else {
                 aisFeedParams.status = "Connecting...";
            }
        } else if (simulatedFeed) {
            const stats = simulatedFeed.getStats();
            aisFeedParams.trackedCount = stats.activeUnits;
            aisFeedParams.msgRate = stats.messagesPerSec;
            aisFeedParams.status = "Simulated";
            aisFeedParams.indicatorStatus = "simulated";
        }
        updateLiveIndicator();
    }
}

export function getAISFeedStats() {
    if (isLive && liveFeed) return liveFeed.getStats();
    if (simulatedFeed) return simulatedFeed.getStats();
    return null;
}

/**
 * Update the simulated ship count
 */
export function setSimulatedShipCount(count: number) {
    if (simulatedFeed) {
        simulatedFeed.setShipCount(count);
    }
}
