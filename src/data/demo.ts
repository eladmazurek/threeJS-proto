/**
 * Demo Data
 *
 * Static data for generating demo units: ship names, airline codes,
 * shipping lanes, and flight corridors.
 */

import type { ShippingLane, FlightCorridor } from "../types";

// =============================================================================
// SHIP NAMES
// =============================================================================

/** Sample ship names for labels */
export const SHIP_NAMES: string[] = [
  "EVER GIVEN",
  "MAERSK ALABAMA",
  "MSC OSCAR",
  "EMMA MAERSK",
  "CSCL GLOBE",
  "OOCL HONG KONG",
  "MOL TRIUMPH",
  "MADRID MAERSK",
  "HMM ALGECIRAS",
  "EVER ACE",
  "MSC GULSUN",
  "CMA CGM MARCO POLO",
  "COSCO SHIPPING UNIVERSE",
  "YANGMING WITNESS",
  "ONE APUS",
  "EVERGREEN EVER",
  "HAPAG LLOYD EXPRESS",
  "ZIM INTEGRATED",
  "PIL ASIA",
  "PACIFIC VOYAGER",
  "ATLANTIC PIONEER",
  "NORDIC SPIRIT",
  "OCEAN CARRIER",
  "SEA GIANT",
  "GLOBAL LEADER",
  "TRADE WIND",
  "CARGO MASTER",
  "FREIGHT KING",
  "WAVE RIDER",
  "MARINE STAR",
  "HORIZON BLUE",
  "DEEP SEA",
  "SWIFT CURRENT",
  "NORTHERN LIGHT",
];

// =============================================================================
// AIRLINE CODES
// =============================================================================

/** Sample airline codes for aircraft labels */
export const AIRLINE_CODES: string[] = [
  "UA",
  "AA",
  "DL",
  "SW",
  "BA",
  "LH",
  "AF",
  "EK",
  "QF",
  "SQ",
  "CX",
  "NH",
  "JL",
  "KE",
  "TK",
  "QR",
  "EY",
  "VS",
  "IB",
  "KL",
];

// =============================================================================
// AIRCRAFT TYPES
// =============================================================================

/** Common commercial aircraft types */
export const AIRCRAFT_TYPES: string[] = [
  "B737-800",
  "B737 MAX 8",
  "B737 MAX 9",
  "B777-300ER",
  "B777-200LR",
  "B787-9",
  "B787-10",
  "B747-8",
  "B757-200",
  "B767-300ER",
  "A320neo",
  "A321neo",
  "A319",
  "A330-300",
  "A330-900neo",
  "A350-900",
  "A350-1000",
  "A380-800",
  "E175",
  "E190",
  "CRJ-900",
  "CRJ-700",
  "ATR 72",
  "Dash 8-Q400",
];

// =============================================================================
// SHIPPING LANES
// =============================================================================

/** Realistic shipping lanes with concentration weights */
export const SHIPPING_LANES: ShippingLane[] = [
  // High traffic areas
  {
    latRange: [1, 8],
    lonRange: [103, 117],
    weight: 0.12,
    name: "South China Sea / Malacca",
  },
  {
    latRange: [29, 32],
    lonRange: [32, 34],
    weight: 0.04,
    name: "Suez Canal approach",
  },
  { latRange: [47, 49], lonRange: [-123, -122], weight: 0.03, name: "Puget Sound" },
  { latRange: [50, 52], lonRange: [0, 2], weight: 0.04, name: "English Channel" },
  { latRange: [35, 37], lonRange: [139, 141], weight: 0.04, name: "Tokyo Bay" },
  {
    latRange: [22, 23],
    lonRange: [113, 115],
    weight: 0.04,
    name: "Hong Kong / Pearl River",
  },
  {
    latRange: [1, 2],
    lonRange: [103, 104],
    weight: 0.04,
    name: "Singapore Strait",
  },
  {
    latRange: [37, 38],
    lonRange: [-122, -121],
    weight: 0.03,
    name: "San Francisco Bay",
  },
  {
    latRange: [40, 41],
    lonRange: [-74, -73],
    weight: 0.03,
    name: "New York Harbor",
  },
  {
    latRange: [51, 54],
    lonRange: [3, 8],
    weight: 0.04,
    name: "Rotterdam / North Sea",
  },
  // Medium traffic - major routes
  { latRange: [30, 45], lonRange: [-80, -10], weight: 0.1, name: "North Atlantic" },
  {
    latRange: [0, 25],
    lonRange: [50, 75],
    weight: 0.08,
    name: "Indian Ocean / Arabian Sea",
  },
  { latRange: [10, 40], lonRange: [120, 145], weight: 0.1, name: "West Pacific" },
  { latRange: [35, 50], lonRange: [-130, -120], weight: 0.06, name: "US West Coast" },
  { latRange: [25, 45], lonRange: [-85, -75], weight: 0.06, name: "US East Coast" },
  {
    latRange: [35, 42],
    lonRange: [-5, 15],
    weight: 0.05,
    name: "Mediterranean West",
  },
  {
    latRange: [32, 38],
    lonRange: [15, 35],
    weight: 0.05,
    name: "Mediterranean East",
  },
  { latRange: [55, 62], lonRange: [5, 25], weight: 0.05, name: "Baltic Sea" },
];

// =============================================================================
// FLIGHT CORRIDORS
// =============================================================================

/** Realistic flight corridors with concentration weights */
export const FLIGHT_CORRIDORS: FlightCorridor[] = [
  // Major flight routes (high weight - most aircraft are en route, not at airports)
  {
    latRange: [45, 65],
    lonRange: [-60, -10],
    weight: 0.15,
    name: "North Atlantic Track",
  },
  { latRange: [35, 55], lonRange: [-130, -70], weight: 0.18, name: "US Domestic" },
  {
    latRange: [35, 55],
    lonRange: [-10, 40],
    weight: 0.15,
    name: "European Airspace",
  },
  {
    latRange: [20, 45],
    lonRange: [100, 145],
    weight: 0.15,
    name: "East Asian Routes",
  },
  {
    latRange: [10, 35],
    lonRange: [70, 100],
    weight: 0.1,
    name: "South Asian Routes",
  },
  {
    latRange: [-35, 5],
    lonRange: [115, 155],
    weight: 0.08,
    name: "Australia / Oceania",
  },
  {
    latRange: [0, 30],
    lonRange: [-100, -60],
    weight: 0.06,
    name: "Central America / Caribbean",
  },
  { latRange: [-40, 10], lonRange: [-70, -35], weight: 0.05, name: "South America" },
  {
    latRange: [20, 40],
    lonRange: [-20, 40],
    weight: 0.04,
    name: "North Africa / Middle East",
  },
  {
    latRange: [-35, 5],
    lonRange: [10, 45],
    weight: 0.04,
    name: "Sub-Saharan Africa",
  },
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a random point within a region using uniform distribution.
 */
export function randomInRegion(
  latRange: [number, number],
  lonRange: [number, number]
): { lat: number; lon: number } {
  const lat = latRange[0] + Math.random() * (latRange[1] - latRange[0]);
  const lon = lonRange[0] + Math.random() * (lonRange[1] - lonRange[0]);
  return { lat, lon };
}

/**
 * Select a random region based on weights.
 */
export function selectWeightedRegion<T extends { weight: number }>(
  regions: T[]
): T {
  const totalWeight = regions.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;

  for (const region of regions) {
    random -= region.weight;
    if (random <= 0) return region;
  }
  return regions[regions.length - 1];
}

/**
 * Normalize angle to 0-360 range.
 */
export function normalizeAngle(angle: number): number {
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}

/**
 * Calculate shortest turn direction between two angles.
 * Returns positive for clockwise, negative for counter-clockwise.
 */
export function shortestTurnDirection(current: number, target: number): number {
  const diff = normalizeAngle(target - current);
  return diff <= 180 ? diff : diff - 360;
}
