/**
 * Shared Feed State and Logic
 *
 * Centralizes parameters and status logic to avoid circular dependencies
 * between the Aircraft and Satellite feed controllers.
 */

// =============================================================================
// CONSTANTS
// =============================================================================

export const DEFAULT_RELAY_SERVER = "wss://ais-relay-server-722040785601.us-central1.run.app";

// =============================================================================
// TYPES
// =============================================================================

export type FeedMode = "simulated" | "live";
export type CoverageMode = "worldwide" | "viewport";
export type SatelliteFeedMode = "simulated" | "live";

export interface AircraftFeedParams {
  mode: FeedMode;
  coverage: CoverageMode;
  interpolation: boolean;
  simulatedCount: number;
  lastError: string;
  trackedCount: number;
  msgRate: number;
  status: string;
  indicatorStatus: "simulated" | "live" | "connecting" | "error";
}

export interface SatelliteFeedParams {
  mode: SatelliteFeedMode;
  simulatedCount: number;
  liveGroup: string;
  status: string;
  indicatorStatus: "simulated" | "live" | "connecting" | "error";
  lastError: string;
  trackedCount: number;
  msgRate: number;
}

export interface AISFeedParams {
  mode: FeedMode;
  status: string;
  indicatorStatus: "simulated" | "live" | "connecting" | "error";
  lastError: string;
  trackedCount: number;
  msgRate: number;
}

// =============================================================================
// STATE
// =============================================================================

export const aircraftFeedParams: AircraftFeedParams = {
  mode: "simulated",
  coverage: "worldwide",
  interpolation: true,
  simulatedCount: 500,
  lastError: "",
  trackedCount: 0,
  msgRate: 0,
  status: "idle",
  indicatorStatus: "simulated",
};

export const satelliteFeedParams: SatelliteFeedParams = {
  mode: "simulated",
  simulatedCount: 200,
  liveGroup: "active",
  status: "idle",
  indicatorStatus: "simulated",
  lastError: "",
  trackedCount: 0,
  msgRate: 0,
};

export const aisFeedParams: AISFeedParams = {
  mode: "simulated",
  status: "idle",
  indicatorStatus: "simulated",
  lastError: "",
  trackedCount: 0,
  msgRate: 0,
};

// =============================================================================
// UI UPDATES
// =============================================================================

export const INDICATOR_LABELS: Record<string, string> = {
  simulated: "SIM",
  live: "LIVE",
  connecting: "CONNECTING",
  error: "ERROR",
};

/**
 * Update the live indicator in the UI based on combined feed status.
 */
export function updateLiveIndicator(): void {
  const indicator = document.getElementById("live-indicator");
  const textEl = indicator?.querySelector(".live-text");

  if (!indicator || !textEl) return;

  // Determine combined status
  // Priority: Error > Connecting > Live > Simulated
  let status: string = "simulated";

  const air = aircraftFeedParams.indicatorStatus;
  const sat = satelliteFeedParams.indicatorStatus;
  const ais = aisFeedParams.indicatorStatus;

  if (air === "error" || sat === "error" || ais === "error") {
    status = "error";
  } else if (air === "connecting" || sat === "connecting" || ais === "connecting") {
    status = "connecting";
  } else if (air === "live" || sat === "live" || ais === "live") {
    status = "live";
  }

  // Remove all mode classes
  indicator.classList.remove("mode-simulated", "mode-live", "mode-connecting", "mode-error");

  // Add current mode class
  indicator.classList.add(`mode-${status}`);

  // Update text
  textEl.textContent = INDICATOR_LABELS[status];
}
