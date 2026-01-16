/**
 * TypeScript Type Definitions
 *
 * Core interfaces for the Earth visualization application.
 */

import type * as THREE from "three";

// =============================================================================
// UNIT STATE TYPES
// =============================================================================

/** Base properties shared by all moving units */
export interface BaseUnitState {
  lat: number;
  lon: number;
  heading: number;
  targetHeading: number;
  baseSpeed: number;
  baseTurnRate: number;
  scale: number;
  nextCourseChange: number;
}

/** Ship unit state */
export interface ShipState extends BaseUnitState {
  name: string;
  mmsi: string;
  sog: number; // Speed over ground
}

/** Aircraft unit state */
export interface AircraftState extends BaseUnitState {
  callsign: string;
  altitude: number;
  groundSpeed: number;
  flightLevel: number;
}

/** Satellite unit state */
export interface SatelliteState {
  lat: number;
  lon: number;
  heading: number;
  scale: number;
  altitude: number;
  inclination: number;
  ascendingNode: number;
  phase: number;
  orbitalPeriod: number;
  name: string;
  orbitTypeLabel: string;
  isMilitary: boolean;
}

/** Drone unit state */
export interface DroneState {
  lat: number;
  lon: number;
  heading: number;
  altitude: number;
  patrolCenterLat: number;
  patrolCenterLon: number;
  patrolRadius: number;
  targetLat: number;
  targetLon: number;
  phase: number;
  scale: number;
  name: string;
  orbitDirection: number;
  orbitSpeed: number;
}

/** Union type for any unit state */
export type UnitState = ShipState | AircraftState | SatelliteState | DroneState;

/** Unit type identifier */
export type UnitType = "ship" | "aircraft" | "satellite" | "drone" | "airport";

/** Selected unit reference */
export interface SelectedUnit {
  type: UnitType;
  index: number;
  data?: any;
}

// =============================================================================
// PARAMETER TYPES (GUI-controlled)
// =============================================================================

/** Earth rendering parameters */
export interface EarthParameters {
  sunDirectionX: number;
  sunDirectionY: number;
  sunDirectionZ: number;
  atmosphereColor: string;
  atmosphereIntensity: number;
  cloudOpacity: number;
  cloudSpeed: number;
  oceanSpecular: number;
}

/** Weather overlay parameters */
export interface WeatherParams {
  enabled: boolean;
  layer: string; // Changed from number to string to match usage
  opacity: number;
  animate: boolean;
}

/** H3 grid parameters */
export interface H3Params {
  enabled: boolean;
  resolution: number;
  opacity: number;
  updateInterval: number;
}

/** Unit label parameters */
export interface LabelParams {
  enabled: boolean;
  maxLabels: number;
  updateInterval: number;
  showShipLabels: boolean;
  showAircraftLabels: boolean;
  showDroneLabels: boolean;
  showSatelliteLabels: boolean;
  fontSize: number;
  labelOffset: number;
  debugMode: number;
  h3Resolution: number;
}

/** Unit count and visibility parameters */
export interface UnitCountParams {
  shipCount: number;
  aircraftCount: number;
  satelliteCount: number;
  droneCount: number;
  totalCount: number;
  showShips: boolean;
  showAircraft: boolean;
  showSatellites: boolean;
  showDrones: boolean;
  realisticRoutes: boolean;
}

/** Motion simulation parameters */
export interface MotionParams {
  shipSpeed: number;
  aircraftSpeed: number;
  satelliteSpeed: number;
  droneSpeed: number;
  shipBaseSpeed: number;
  shipBaseTurnRate: number;
  aircraftBaseSpeed: number;
  aircraftBaseTurnRate: number;
  droneOrbitPeriod: number;
  courseChangeInterval: number;
  courseChangeVariance: number;
  motionUpdateInterval: number;
}

/** Trail rendering parameters */
export interface TrailParams {
  enabled: boolean;
  opacity: number;
  shipTrails: boolean;
  aircraftTrails: boolean;
}

/** Airport display parameters */
export interface AirportParams {
  visible: boolean;
  showLabels: boolean;
  markerSize: number;
}

/** Camera parameters */
export interface CameraParams {
  tiltAngle: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
}

/** Google 3D Tiles parameters */
export interface TilesParams {
  enabled: boolean;
  transitionAltitude: number;
}

/** Lat/Lon Grid parameters */
export interface GridParams {
  visible: boolean;
  opacity: number;
  latInterval: number;
  lonInterval: number;
}

/** Icon scale parameters */
export interface IconScaleParams {
  multiplier: number;
}

// =============================================================================
// H3 GRID TYPES
// =============================================================================

/** H3 cell density data */
export interface H3CellData {
  ships: number;
  aircraft: number;
  satellites: number;
  total: number;
}

/** H3 grid build state for chunked processing */
export interface H3BuildState {
  allCells: string[];
  densityMap: Map<string, number>;
  maxDensity: number;
  cellIndex: number;
  posIdx: number;
  colorIdx: number;
  lineIdx: number;
  cellCount: number;
}

// =============================================================================
// LABEL SYSTEM TYPES
// =============================================================================

/** Label visibility data from worker */
export interface LabelVisibility {
  shipIndices: number[];
  aircraftIndices: number[];
  satelliteIndices: number[];
  droneIndices: number[];
}

/** Label assignment mapping */
export interface LabelAssignments {
  [labelIndex: number]: {
    type: UnitType;
    unitIndex: number;
  };
}

// =============================================================================
// PERFORMANCE TYPES
// =============================================================================

/** Performance statistics */
export interface PerfStats {
  fps: number;
  frameMs: number;
  ships: number;
  aircraft: number;
  satellites: number;
  drones: number;
}

/** Performance profiler data */
export interface PerfProfiler {
  enabled: boolean;
  times: Record<string, number>;
  lastLog: number;
}

// =============================================================================
// TRAIL TYPES
// =============================================================================

/** Trail history entry for a single unit */
export interface TrailHistoryEntry {
  positions: Array<{ lat: number; lon: number }>;
  headIndex: number;
}

/** Trail history state */
export interface TrailHistoryState {
  shipHistory: TrailHistoryEntry[];
  aircraftHistory: TrailHistoryEntry[];
  activeShipCount: number;
  activeAircraftCount: number;
}

// =============================================================================
// CAMERA STATE TYPES
// =============================================================================

/** Camera movement tracking for change detection */
export interface CameraState {
  lastLat: number;
  lastLon: number;
  lastDist: number;
  threshold: number;
}

// =============================================================================
// THREE.JS OBJECT REFERENCES
// =============================================================================

/** References to Three.js objects for a unit mesh */
export interface UnitMeshRefs {
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  latAttr: THREE.InstancedBufferAttribute;
  lonAttr: THREE.InstancedBufferAttribute;
  headingAttr: THREE.InstancedBufferAttribute;
  scaleAttr: THREE.InstancedBufferAttribute;
}

// =============================================================================
// DATA TYPES
// =============================================================================

/** Shipping lane definition */
export interface ShippingLane {
  name: string;
  weight: number;
  latRange: [number, number];
  lonRange: [number, number];
}

/** Flight corridor definition */
export interface FlightCorridor {
  name: string;
  weight: number;
  latRange: [number, number];
  lonRange: [number, number];
}

/** Raw airport data tuple (legacy format) */
export type AirportTuple = [string, number, number, string];

/** Airport data */
export interface Airport {
  iata: string;
  name: string;
  lat: number;
  lon: number;
  size: "large" | "medium" | "small";
}
