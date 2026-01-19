/**
 * ICAO Aircraft Type Lookup
 *
 * Two lookup systems:
 * 1. ICAO24 (transponder hex) → typecode - for real aircraft from OpenSky
 * 2. typecode → aircraft info - for display and simulation
 *
 * ICAO24 data sourced from OpenSky Network aircraft database.
 */

// ICAO24 → typecode mapping (57k commercial aircraft, ~300KB gzipped)
import icao24Lookup from "./icao24-lookup.json";

// =============================================================================
// TYPES
// =============================================================================

export interface AircraftTypeInfo {
  /** ICAO type designator (e.g., "B738") */
  icao: string;
  /** Manufacturer name */
  manufacturer: string;
  /** Model name */
  model: string;
  /** Aircraft category */
  category: "Light" | "Small" | "Large" | "Heavy";
  /** Typical cruise speed in knots (for simulation) */
  typicalSpeed: number;
  /** Typical cruise altitude in feet (for simulation) */
  typicalAltitude: number;
  /** Simulation weight (higher = more common) */
  weight: number;
}

// =============================================================================
// TYPECODE → INFO MAPPING
// =============================================================================

/**
 * Aircraft type info for display and simulation.
 * Includes typical speeds/altitudes for realistic simulation.
 */
const TYPE_INFO: Record<string, AircraftTypeInfo> = {
  // Boeing Narrowbody (very common)
  B738: { icao: "B738", manufacturer: "Boeing", model: "737-800", category: "Large", typicalSpeed: 450, typicalAltitude: 35000, weight: 15 },
  B737: { icao: "B737", manufacturer: "Boeing", model: "737-700", category: "Large", typicalSpeed: 450, typicalAltitude: 35000, weight: 3 },
  B739: { icao: "B739", manufacturer: "Boeing", model: "737-900", category: "Large", typicalSpeed: 450, typicalAltitude: 35000, weight: 2 },
  B38M: { icao: "B38M", manufacturer: "Boeing", model: "737 MAX 8", category: "Large", typicalSpeed: 450, typicalAltitude: 37000, weight: 5 },
  B39M: { icao: "B39M", manufacturer: "Boeing", model: "737 MAX 9", category: "Large", typicalSpeed: 450, typicalAltitude: 37000, weight: 2 },
  B752: { icao: "B752", manufacturer: "Boeing", model: "757-200", category: "Large", typicalSpeed: 460, typicalAltitude: 38000, weight: 2 },
  B753: { icao: "B753", manufacturer: "Boeing", model: "757-300", category: "Large", typicalSpeed: 460, typicalAltitude: 38000, weight: 1 },

  // Airbus Narrowbody (very common)
  A319: { icao: "A319", manufacturer: "Airbus", model: "A319", category: "Large", typicalSpeed: 450, typicalAltitude: 37000, weight: 5 },
  A320: { icao: "A320", manufacturer: "Airbus", model: "A320", category: "Large", typicalSpeed: 450, typicalAltitude: 37000, weight: 15 },
  A321: { icao: "A321", manufacturer: "Airbus", model: "A321", category: "Large", typicalSpeed: 450, typicalAltitude: 37000, weight: 8 },
  A20N: { icao: "A20N", manufacturer: "Airbus", model: "A320neo", category: "Large", typicalSpeed: 450, typicalAltitude: 39000, weight: 6 },
  A21N: { icao: "A21N", manufacturer: "Airbus", model: "A321neo", category: "Large", typicalSpeed: 450, typicalAltitude: 39000, weight: 6 },
  A19N: { icao: "A19N", manufacturer: "Airbus", model: "A319neo", category: "Large", typicalSpeed: 450, typicalAltitude: 39000, weight: 1 },

  // Boeing Widebody
  B763: { icao: "B763", manufacturer: "Boeing", model: "767-300", category: "Heavy", typicalSpeed: 470, typicalAltitude: 39000, weight: 2 },
  B764: { icao: "B764", manufacturer: "Boeing", model: "767-400", category: "Heavy", typicalSpeed: 470, typicalAltitude: 39000, weight: 1 },
  B772: { icao: "B772", manufacturer: "Boeing", model: "777-200", category: "Heavy", typicalSpeed: 490, typicalAltitude: 41000, weight: 2 },
  B77W: { icao: "B77W", manufacturer: "Boeing", model: "777-300ER", category: "Heavy", typicalSpeed: 490, typicalAltitude: 41000, weight: 4 },
  B77L: { icao: "B77L", manufacturer: "Boeing", model: "777-200LR", category: "Heavy", typicalSpeed: 490, typicalAltitude: 43000, weight: 1 },
  B788: { icao: "B788", manufacturer: "Boeing", model: "787-8", category: "Heavy", typicalSpeed: 490, typicalAltitude: 43000, weight: 2 },
  B789: { icao: "B789", manufacturer: "Boeing", model: "787-9", category: "Heavy", typicalSpeed: 490, typicalAltitude: 43000, weight: 3 },
  B78X: { icao: "B78X", manufacturer: "Boeing", model: "787-10", category: "Heavy", typicalSpeed: 490, typicalAltitude: 43000, weight: 1 },
  B744: { icao: "B744", manufacturer: "Boeing", model: "747-400", category: "Heavy", typicalSpeed: 490, typicalAltitude: 41000, weight: 1 },
  B748: { icao: "B748", manufacturer: "Boeing", model: "747-8", category: "Heavy", typicalSpeed: 490, typicalAltitude: 43000, weight: 1 },

  // Airbus Widebody
  A332: { icao: "A332", manufacturer: "Airbus", model: "A330-200", category: "Heavy", typicalSpeed: 470, typicalAltitude: 41000, weight: 2 },
  A333: { icao: "A333", manufacturer: "Airbus", model: "A330-300", category: "Heavy", typicalSpeed: 470, typicalAltitude: 41000, weight: 2 },
  A339: { icao: "A339", manufacturer: "Airbus", model: "A330-900neo", category: "Heavy", typicalSpeed: 475, typicalAltitude: 41000, weight: 1 },
  A359: { icao: "A359", manufacturer: "Airbus", model: "A350-900", category: "Heavy", typicalSpeed: 488, typicalAltitude: 43000, weight: 3 },
  A35K: { icao: "A35K", manufacturer: "Airbus", model: "A350-1000", category: "Heavy", typicalSpeed: 488, typicalAltitude: 43000, weight: 1 },
  A388: { icao: "A388", manufacturer: "Airbus", model: "A380-800", category: "Heavy", typicalSpeed: 490, typicalAltitude: 43000, weight: 1 },

  // Regional Jets
  E190: { icao: "E190", manufacturer: "Embraer", model: "E190", category: "Large", typicalSpeed: 430, typicalAltitude: 37000, weight: 4 },
  E195: { icao: "E195", manufacturer: "Embraer", model: "E195", category: "Large", typicalSpeed: 430, typicalAltitude: 37000, weight: 2 },
  E170: { icao: "E170", manufacturer: "Embraer", model: "E170", category: "Large", typicalSpeed: 430, typicalAltitude: 37000, weight: 1 },
  E75L: { icao: "E75L", manufacturer: "Embraer", model: "E175", category: "Large", typicalSpeed: 430, typicalAltitude: 37000, weight: 3 },
  CRJ2: { icao: "CRJ2", manufacturer: "Bombardier", model: "CRJ-200", category: "Small", typicalSpeed: 420, typicalAltitude: 37000, weight: 2 },
  CRJ7: { icao: "CRJ7", manufacturer: "Bombardier", model: "CRJ-700", category: "Small", typicalSpeed: 430, typicalAltitude: 37000, weight: 1 },
  CRJ9: { icao: "CRJ9", manufacturer: "Bombardier", model: "CRJ-900", category: "Large", typicalSpeed: 430, typicalAltitude: 37000, weight: 3 },
  DH8D: { icao: "DH8D", manufacturer: "De Havilland", model: "Dash 8-400", category: "Small", typicalSpeed: 360, typicalAltitude: 25000, weight: 3 },
  AT76: { icao: "AT76", manufacturer: "ATR", model: "ATR 72-600", category: "Small", typicalSpeed: 280, typicalAltitude: 25000, weight: 2 },
  AT75: { icao: "AT75", manufacturer: "ATR", model: "ATR 72-500", category: "Small", typicalSpeed: 280, typicalAltitude: 25000, weight: 1 },

  // Business Jets (less common but visible)
  GLF6: { icao: "GLF6", manufacturer: "Gulfstream", model: "G650", category: "Large", typicalSpeed: 500, typicalAltitude: 51000, weight: 1 },
  GLF5: { icao: "GLF5", manufacturer: "Gulfstream", model: "G550", category: "Large", typicalSpeed: 480, typicalAltitude: 51000, weight: 1 },
  GLEX: { icao: "GLEX", manufacturer: "Bombardier", model: "Global Express", category: "Large", typicalSpeed: 490, typicalAltitude: 51000, weight: 1 },
  CL35: { icao: "CL35", manufacturer: "Bombardier", model: "Challenger 350", category: "Large", typicalSpeed: 460, typicalAltitude: 45000, weight: 1 },
  C56X: { icao: "C56X", manufacturer: "Cessna", model: "Citation Excel", category: "Small", typicalSpeed: 430, typicalAltitude: 45000, weight: 1 },
  E55P: { icao: "E55P", manufacturer: "Embraer", model: "Phenom 300", category: "Light", typicalSpeed: 445, typicalAltitude: 45000, weight: 1 },
  PC12: { icao: "PC12", manufacturer: "Pilatus", model: "PC-12", category: "Small", typicalSpeed: 280, typicalAltitude: 30000, weight: 1 },
  PC24: { icao: "PC24", manufacturer: "Pilatus", model: "PC-24", category: "Light", typicalSpeed: 440, typicalAltitude: 45000, weight: 1 },

  // Turboprops
  C208: { icao: "C208", manufacturer: "Cessna", model: "Caravan", category: "Small", typicalSpeed: 175, typicalAltitude: 25000, weight: 1 },
  B350: { icao: "B350", manufacturer: "Beechcraft", model: "King Air 350", category: "Small", typicalSpeed: 310, typicalAltitude: 35000, weight: 1 },
  BE20: { icao: "BE20", manufacturer: "Beechcraft", model: "King Air 200", category: "Small", typicalSpeed: 290, typicalAltitude: 35000, weight: 1 },

  // Cargo
  B77F: { icao: "B77F", manufacturer: "Boeing", model: "777F", category: "Heavy", typicalSpeed: 490, typicalAltitude: 41000, weight: 1 },
  B74S: { icao: "B74S", manufacturer: "Boeing", model: "747-400F", category: "Heavy", typicalSpeed: 490, typicalAltitude: 39000, weight: 1 },
  MD11: { icao: "MD11", manufacturer: "McDonnell Douglas", model: "MD-11F", category: "Heavy", typicalSpeed: 480, typicalAltitude: 39000, weight: 1 },

  // Military (visible on ADS-B)
  C17: { icao: "C17", manufacturer: "Boeing", model: "C-17 Globemaster", category: "Heavy", typicalSpeed: 450, typicalAltitude: 28000, weight: 1 },
  C130: { icao: "C130", manufacturer: "Lockheed", model: "C-130 Hercules", category: "Heavy", typicalSpeed: 290, typicalAltitude: 28000, weight: 1 },
  A400: { icao: "A400", manufacturer: "Airbus", model: "A400M Atlas", category: "Heavy", typicalSpeed: 310, typicalAltitude: 37000, weight: 1 },
  KC35: { icao: "KC35", manufacturer: "Boeing", model: "KC-135", category: "Heavy", typicalSpeed: 460, typicalAltitude: 40000, weight: 1 },
};

// =============================================================================
// PRE-COMPUTED WEIGHTED ARRAY FOR SIMULATION
// =============================================================================

const WEIGHTED_TYPES: AircraftTypeInfo[] = [];
for (const info of Object.values(TYPE_INFO)) {
  for (let i = 0; i < info.weight; i++) {
    WEIGHTED_TYPES.push(info);
  }
}

// =============================================================================
// PUBLIC API - ICAO24 LOOKUP (for real aircraft)
// =============================================================================

/** ICAO24 lookup map type */
const icao24Map = icao24Lookup as Record<string, string>;

/**
 * Look up aircraft typecode by ICAO24 hex address.
 * @param icao24 - 6-character hex transponder address (e.g., "a1b2c3")
 * @returns ICAO typecode (e.g., "B738") or undefined if not found
 */
export function lookupICAO24(icao24: string): string | undefined {
  return icao24Map[icao24.toLowerCase()];
}

/**
 * Get aircraft info by ICAO24 hex address.
 * Combines ICAO24 → typecode → info lookups.
 */
export function getAircraftInfoByICAO24(icao24: string): AircraftTypeInfo | undefined {
  const typecode = lookupICAO24(icao24);
  if (!typecode) return undefined;
  return TYPE_INFO[typecode];
}

// =============================================================================
// PUBLIC API - TYPECODE LOOKUP (for display and simulation)
// =============================================================================

/**
 * Look up aircraft type info by ICAO typecode.
 * @param typecode - ICAO type designator (e.g., "B738")
 */
export function lookupTypecode(typecode: string): AircraftTypeInfo | undefined {
  return TYPE_INFO[typecode.toUpperCase()];
}

/**
 * Format aircraft type for display.
 * @param typecode - ICAO type designator
 * @returns Formatted string like "Boeing 737-800" or the code if not found
 */
export function formatAircraftType(typecode: string | undefined): string {
  if (!typecode) return "Unknown";
  const info = lookupTypecode(typecode);
  if (!info) return typecode;
  return `${info.manufacturer} ${info.model}`;
}

/**
 * Get aircraft category from typecode.
 */
export function getAircraftCategory(typecode: string | undefined): string {
  if (!typecode) return "Unknown";
  const info = lookupTypecode(typecode);
  return info?.category ?? "Unknown";
}

// =============================================================================
// PUBLIC API - SIMULATION
// =============================================================================

/**
 * Get weighted random aircraft type for simulation.
 * Distribution mimics real-world traffic patterns.
 */
export function getWeightedRandomAircraftType(): AircraftTypeInfo {
  return WEIGHTED_TYPES[Math.floor(Math.random() * WEIGHTED_TYPES.length)];
}

/**
 * Get all known typecodes.
 */
export function getAllTypecodes(): string[] {
  return Object.keys(TYPE_INFO);
}

/**
 * Get count of aircraft in ICAO24 database.
 */
export function getICAO24DatabaseSize(): number {
  return Object.keys(icao24Map).length;
}
