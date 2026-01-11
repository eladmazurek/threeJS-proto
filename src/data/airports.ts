/**
 * Airport Data
 *
 * Major world airports with IATA codes for display on the globe.
 */

import type { Airport } from "../types";

/** Airport data: IATA code, latitude, longitude, name */
export const AIRPORTS: Airport[] = [
  // North America
  { iata: "JFK", lat: 40.6413, lon: -73.7781, name: "New York JFK", size: "large" },
  { iata: "LAX", lat: 33.9425, lon: -118.4081, name: "Los Angeles", size: "large" },
  { iata: "ORD", lat: 41.9742, lon: -87.9073, name: "Chicago O'Hare", size: "large" },
  { iata: "ATL", lat: 33.6407, lon: -84.4277, name: "Atlanta", size: "large" },
  { iata: "DFW", lat: 32.8998, lon: -97.0403, name: "Dallas", size: "large" },
  { iata: "DEN", lat: 39.8561, lon: -104.6737, name: "Denver", size: "large" },
  { iata: "SFO", lat: 37.6213, lon: -122.379, name: "San Francisco", size: "large" },
  { iata: "SEA", lat: 47.4502, lon: -122.3088, name: "Seattle", size: "medium" },
  { iata: "MIA", lat: 25.7959, lon: -80.287, name: "Miami", size: "large" },
  { iata: "YYZ", lat: 43.6777, lon: -79.6248, name: "Toronto", size: "large" },

  // Europe
  { iata: "LHR", lat: 51.47, lon: -0.4543, name: "London Heathrow", size: "large" },
  { iata: "CDG", lat: 49.0097, lon: 2.5479, name: "Paris CDG", size: "large" },
  { iata: "FRA", lat: 50.0379, lon: 8.5622, name: "Frankfurt", size: "large" },
  { iata: "AMS", lat: 52.3105, lon: 4.7683, name: "Amsterdam", size: "large" },
  { iata: "MAD", lat: 40.4983, lon: -3.5676, name: "Madrid", size: "large" },
  { iata: "FCO", lat: 41.8003, lon: 12.2389, name: "Rome", size: "medium" },
  { iata: "MUC", lat: 48.3537, lon: 11.775, name: "Munich", size: "medium" },
  { iata: "ZRH", lat: 47.4647, lon: 8.5492, name: "Zurich", size: "medium" },
  { iata: "LGW", lat: 51.1537, lon: -0.1821, name: "London Gatwick", size: "medium" },

  // Asia
  { iata: "HND", lat: 35.5494, lon: 139.7798, name: "Tokyo Haneda", size: "large" },
  { iata: "NRT", lat: 35.7653, lon: 140.3856, name: "Tokyo Narita", size: "large" },
  { iata: "PEK", lat: 40.0799, lon: 116.6031, name: "Beijing", size: "large" },
  { iata: "PVG", lat: 31.1443, lon: 121.8083, name: "Shanghai", size: "large" },
  { iata: "HKG", lat: 22.308, lon: 113.9185, name: "Hong Kong", size: "large" },
  { iata: "SIN", lat: 1.3644, lon: 103.9915, name: "Singapore", size: "large" },
  { iata: "ICN", lat: 37.4602, lon: 126.4407, name: "Seoul Incheon", size: "large" },
  { iata: "BKK", lat: 13.69, lon: 100.7501, name: "Bangkok", size: "large" },
  { iata: "DEL", lat: 28.5562, lon: 77.1, name: "Delhi", size: "large" },
  { iata: "DXB", lat: 25.2532, lon: 55.3657, name: "Dubai", size: "large" },

  // Oceania
  { iata: "SYD", lat: -33.9399, lon: 151.1753, name: "Sydney", size: "large" },
  { iata: "MEL", lat: -37.6733, lon: 144.8433, name: "Melbourne", size: "large" },
  { iata: "AKL", lat: -37.0082, lon: 174.785, name: "Auckland", size: "medium" },

  // South America
  { iata: "GRU", lat: -23.4356, lon: -46.4731, name: "São Paulo", size: "large" },
  { iata: "EZE", lat: -34.8222, lon: -58.5358, name: "Buenos Aires", size: "large" },
  { iata: "BOG", lat: 4.7016, lon: -74.1469, name: "Bogotá", size: "medium" },
  { iata: "SCL", lat: -33.393, lon: -70.7858, name: "Santiago", size: "medium" },

  // Africa / Middle East
  { iata: "JNB", lat: -26.1392, lon: 28.246, name: "Johannesburg", size: "large" },
  { iata: "CAI", lat: 30.1219, lon: 31.4056, name: "Cairo", size: "large" },
  { iata: "CPT", lat: -33.9715, lon: 18.6021, name: "Cape Town", size: "medium" },
  { iata: "DOH", lat: 25.2731, lon: 51.6081, name: "Doha", size: "large" },
];

/**
 * Get airport by IATA code.
 */
export function getAirportByCode(iata: string): Airport | undefined {
  return AIRPORTS.find((a) => a.iata === iata);
}

/**
 * Get airports by size category.
 */
export function getAirportsBySize(size: "large" | "medium" | "small"): Airport[] {
  return AIRPORTS.filter((a) => a.size === size);
}
