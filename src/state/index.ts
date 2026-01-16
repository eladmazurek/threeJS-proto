/**
 * Centralized State Management
 *
 * Simple typed store for application state.
 * Separates runtime state (changes per-frame) from config (GUI-controlled).
 */

import type {
  ShipState,
  AircraftState,
  SatelliteState,
  DroneState,
  SelectedUnit,
  EarthParameters,
  WeatherParams,
  H3Params,
  LabelParams,
  UnitCountParams,
  MotionParams,
  TrailParams,
  AirportParams,
  CameraParams,
  TilesParams,
  IconScaleParams,
  PerfStats,
  LabelVisibility,
  CameraState,
  H3BuildState,
  H3CellData,
  TrailHistoryState,
  GridParams,
} from "../types";

// =============================================================================
// RUNTIME STATE
// =============================================================================

/**
 * Runtime state that changes per-frame or per-interaction.
 * This is mutable state managed by the application.
 */
export const state = {
  // -------------------------------------------------------------------------
  // Unit Simulation State
  // -------------------------------------------------------------------------

  /** Ship unit states (position, heading, speed, etc.) */
  ships: [] as ShipState[],

  /** Aircraft unit states */
  aircraft: [] as AircraftState[],

  /** Satellite unit states */
  satellites: [] as SatelliteState[],

  /** Drone unit states */
  drones: [] as DroneState[],

  // -------------------------------------------------------------------------
  // Selection State
  // -------------------------------------------------------------------------

  /** Currently selected unit (null if none) */
  selectedUnit: null as SelectedUnit | null,

  // -------------------------------------------------------------------------
  // Timing State
  // -------------------------------------------------------------------------

  /** Last simulation update timestamp */
  lastSimTime: 0,

  /** Last motion update timestamp */
  lastMotionUpdateTime: 0,

  /** Last trail update timestamp */
  lastTrailUpdateTime: 0,

  /** Last label rebuild timestamp */
  lastLabelRebuild: 0,

  /** Last label update timestamp */
  lastLabelUpdate: 0,

  /** Last FPS calculation timestamp */
  lastFpsTime: 0,

  /** Frame counter for FPS calculation */
  frameCount: 0,

  // -------------------------------------------------------------------------
  // H3 Grid State
  // -------------------------------------------------------------------------

  h3: {
    /** Whether worker is currently processing */
    workerBusy: false,

    /** Whether an update is pending (queued while busy) */
    pendingUpdate: false,

    /** Current geometry build state (for chunked processing) */
    buildState: null as H3BuildState | null,

    /** Pending cell data from worker */
    pendingCells: null as string[] | null,

    /** Pending camera distance snapshot */
    pendingCameraDistance: 0,

    /** Current cell density counts */
    currentCellCounts: new Map<string, H3CellData>(),

    /** Currently selected cell */
    currentSelectedCell: null as string | null,

    /** Last resolution used */
    lastResolution: -1,

    /** Last update timestamp */
    lastUpdateTime: 0,

    /** Last view center (for change detection) */
    lastViewCenter: { lat: 0, lon: 0 },

    /** Last popup total (for change detection) */
    lastPopupTotal: -1,

    /** Last popup update timestamp */
    lastPopupUpdateTime: 0,

    /** Current active resolution */
    currentResolution: 1,
  },

  // -------------------------------------------------------------------------
  // Label State
  // -------------------------------------------------------------------------

  labels: {
    /** Visible unit indices by type (from worker) */
    visibility: {
      shipIndices: [],
      aircraftIndices: [],
      satelliteIndices: [],
      droneIndices: [],
    } as LabelVisibility,

    /** Label slot to unit mapping */
    assignments: {} as Record<number, { type: string; unitIndex: number }>,

    /** Visibility version counter */
    visibilityVersion: 0,

    /** Last processed visibility version */
    lastVisibilityVersion: 0,
  },

  // -------------------------------------------------------------------------
  // Trail State
  // -------------------------------------------------------------------------

  trails: {
    shipHistory: [],
    aircraftHistory: [],
    activeShipCount: 0,
    activeAircraftCount: 0,
  } as TrailHistoryState,

  // -------------------------------------------------------------------------
  // Camera State
  // -------------------------------------------------------------------------

  camera: {
    /** Last camera latitude (for change detection) */
    lastLat: 0,

    /** Last camera longitude */
    lastLon: 0,

    /** Last camera distance */
    lastDist: 0,

    /** Movement threshold for triggering updates */
    threshold: 5,
  } as CameraState,

  // -------------------------------------------------------------------------
  // Rendering State
  // -------------------------------------------------------------------------

  /** Current computed icon scale */
  currentIconScale: 1,

  /** Google 3D Tiles transition altitude */
  tilesTransitionAltitude: 0.628,

  /** Whether 3D tiles are loaded */
  tilesLoaded: false,

  // -------------------------------------------------------------------------
  // Performance Stats
  // -------------------------------------------------------------------------

  perf: {
    fps: 0,
    frameMs: 0,
    ships: 0,
    aircraft: 0,
    satellites: 0,
    drones: 0,
  } as PerfStats,

  // -------------------------------------------------------------------------
  // Earth Rotation State (synced from mesh each frame)
  // -------------------------------------------------------------------------

  earthRotation: {
    y: 0,
  },

  // -------------------------------------------------------------------------
  // Unit Visibility (mirrors unitCountParams for easy access)
  // -------------------------------------------------------------------------

  unitCounts: {
    showShips: true,
    showAircraft: true,
    showSatellites: true,
    showDrones: true,
  },
};

// =============================================================================
// CONFIGURATION (GUI-controlled)
// =============================================================================

/**
 * Configuration objects controlled by the GUI.
 * These are modified by user interaction, not per-frame updates.
 */
export const config = {
  // -------------------------------------------------------------------------
  // Earth Rendering
  // -------------------------------------------------------------------------

  earth: {
    sunDirectionX: 1,
    sunDirectionY: 1,
    sunDirectionZ: 0,
    atmosphereColor: "#4da6ff",
    atmosphereIntensity: 1.0,
    cloudOpacity: 0.8,
    cloudSpeed: 0.02,
    oceanSpecular: 0.5,
  } as EarthParameters,

  // -------------------------------------------------------------------------
  // Weather Overlay
  // -------------------------------------------------------------------------

  weather: {
    enabled: false,
    layer: "precipitation",
    opacity: 0.6,
    animate: true,
  } as WeatherParams,

  // -------------------------------------------------------------------------
  // H3 Grid
  // -------------------------------------------------------------------------

  h3: {
    enabled: false,
    resolution: 2,
    opacity: 0.3,
    updateInterval: 1000,
    showLines: true,
  } as H3Params,

  // -------------------------------------------------------------------------
  // Unit Labels
  // -------------------------------------------------------------------------

  labels: {
    enabled: true,
    maxLabels: 500,
    updateInterval: 100,
    showShipLabels: true,
    showAircraftLabels: true,
    showDroneLabels: true,
    showSatelliteLabels: true,
    fontSize: 1.0,
    labelOffset: 0.025,
    debugMode: 0,
    h3Resolution: 3,
  } as LabelParams,

  // -------------------------------------------------------------------------
  // Unit Counts & Visibility
  // -------------------------------------------------------------------------

  units: {
    shipCount: 500,
    aircraftCount: 500,
    satelliteCount: 100,
    droneCount: 5,
    totalCount: 1105,
    showShips: true,
    showAircraft: true,
    showSatellites: true,
    showDrones: true,
    realisticRoutes: true,
  } as UnitCountParams,

  // -------------------------------------------------------------------------
  // Motion Simulation
  // -------------------------------------------------------------------------

  motion: {
    shipSpeed: 10.0,
    aircraftSpeed: 10.0,
    satelliteSpeed: 10.0,
    droneSpeed: 5.0,
    shipBaseSpeed: 0.002,
    shipBaseTurnRate: 15,
    aircraftBaseSpeed: 0.02,
    aircraftBaseTurnRate: 45,
    droneOrbitPeriod: 120,
    courseChangeInterval: 10,
    courseChangeVariance: 5,
    motionUpdateInterval: 10,
  } as MotionParams,

  // -------------------------------------------------------------------------
  // Trails
  // -------------------------------------------------------------------------

  trails: {
    enabled: false,
    opacity: 0.6,
    shipTrails: true,
    aircraftTrails: true,
  } as TrailParams,

  // -------------------------------------------------------------------------
  // Airports
  // -------------------------------------------------------------------------

  airports: {
    visible: false,
    showLabels: true,
    markerSize: 0.01,
  } as AirportParams,

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  camera: {
    tiltAngle: 0,
  } as CameraParams,

  // -------------------------------------------------------------------------
  // Google 3D Tiles
  // -------------------------------------------------------------------------

  tiles: {
    enabled: false,
    transitionAltitude: 0.628,
  } as TilesParams,

  // -------------------------------------------------------------------------
  // Icon Scaling
  // -------------------------------------------------------------------------

  iconScale: {
    multiplier: 1.0,
  } as IconScaleParams,

  // -------------------------------------------------------------------------
  // Grid Lines
  // -------------------------------------------------------------------------

  grid: {
    visible: false,
    opacity: 0.3,
    latInterval: 15,
    lonInterval: 15,
  } as GridParams,

  // -------------------------------------------------------------------------
  // Texture Selection
  // -------------------------------------------------------------------------

  texture: {
    preset: "standard",
    colorMode: "normal",
    nightBlend: 0.5,
  },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Reset all unit states to empty arrays.
 */
export function resetUnitState(): void {
  state.ships = [];
  state.aircraft = [];
  state.satellites = [];
  state.drones = [];
  state.selectedUnit = null;
}

/**
 * Get the unit state array for a given unit type.
 */
export function getUnitStateArray(
  type: "ship" | "aircraft" | "satellite" | "drone"
): ShipState[] | AircraftState[] | SatelliteState[] | DroneState[] {
  switch (type) {
    case "ship":
      return state.ships;
    case "aircraft":
      return state.aircraft;
    case "satellite":
      return state.satellites;
    case "drone":
      return state.drones;
  }
}

/**
 * Get total unit count across all types.
 */
export function getTotalUnitCount(): number {
  return (
    state.ships.length +
    state.aircraft.length +
    state.satellites.length +
    state.drones.length
  );
}