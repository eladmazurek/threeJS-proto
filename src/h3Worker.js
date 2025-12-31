/**
 * H3 Density Calculation Web Worker
 * Offloads expensive H3 cell calculations to a background thread
 */

import * as h3 from 'h3-js';

/**
 * Check if longitude is within range (handles wrap-around)
 */
function isLonInRange(lon, minLon, maxLon) {
  if (minLon <= maxLon) {
    return lon >= minLon && lon <= maxLon;
  }
  // Wrapped range (crosses antimeridian)
  return lon >= minLon || lon <= maxLon;
}

/**
 * Calculate H3 density from unit positions
 */
function calculateDensity(data) {
  const {
    resolution,
    ships,
    aircraft,
    satellites,
    showShips,
    showAircraft,
    showSatellites,
    viewCenter,
    visibleRadius
  } = data;

  const densityMap = new Map();
  const cellCounts = new Map();

  // Fast bounding box for quick rejection
  const minLat = Math.max(-90, viewCenter.lat - visibleRadius);
  const maxLat = Math.min(90, viewCenter.lat + visibleRadius);
  const lonRange = visibleRadius / Math.max(0.1, Math.cos(viewCenter.lat * Math.PI / 180));
  let minLon = viewCenter.lon - lonRange;
  let maxLon = viewCenter.lon + lonRange;
  if (minLon < -180) minLon += 360;
  if (maxLon > 180) maxLon -= 360;

  // Helper to get or create cell count entry
  const getCellCounts = (cellIndex) => {
    if (!cellCounts.has(cellIndex)) {
      cellCounts.set(cellIndex, { ships: 0, aircraft: 0, satellites: 0, total: 0 });
    }
    return cellCounts.get(cellIndex);
  };

  // Count ships
  if (showShips && ships) {
    for (let i = 0; i < ships.length; i += 2) {
      const lat = ships[i];
      const lon = ships[i + 1];
      if (lat < minLat || lat > maxLat) continue;
      if (!isLonInRange(lon, minLon, maxLon)) continue;
      try {
        const cellIndex = h3.latLngToCell(lat, lon, resolution);
        densityMap.set(cellIndex, (densityMap.get(cellIndex) || 0) + 1);
        const counts = getCellCounts(cellIndex);
        counts.ships++;
        counts.total++;
      } catch (e) { /* Skip invalid coords */ }
    }
  }

  // Count aircraft
  if (showAircraft && aircraft) {
    for (let i = 0; i < aircraft.length; i += 2) {
      const lat = aircraft[i];
      const lon = aircraft[i + 1];
      if (lat < minLat || lat > maxLat) continue;
      if (!isLonInRange(lon, minLon, maxLon)) continue;
      try {
        const cellIndex = h3.latLngToCell(lat, lon, resolution);
        densityMap.set(cellIndex, (densityMap.get(cellIndex) || 0) + 1);
        const counts = getCellCounts(cellIndex);
        counts.aircraft++;
        counts.total++;
      } catch (e) { /* Skip invalid coords */ }
    }
  }

  // Count satellites
  if (showSatellites && satellites) {
    for (let i = 0; i < satellites.length; i += 2) {
      const lat = satellites[i];
      const lon = satellites[i + 1];
      if (lat < minLat || lat > maxLat) continue;
      if (!isLonInRange(lon, minLon, maxLon)) continue;
      try {
        const cellIndex = h3.latLngToCell(lat, lon, resolution);
        densityMap.set(cellIndex, (densityMap.get(cellIndex) || 0) + 1);
        const counts = getCellCounts(cellIndex);
        counts.satellites++;
        counts.total++;
      } catch (e) { /* Skip invalid coords */ }
    }
  }

  // Convert Maps to transferable format
  const densityEntries = Array.from(densityMap.entries());
  const cellCountEntries = Array.from(cellCounts.entries());

  return { densityEntries, cellCountEntries };
}

// Handle messages from main thread
self.onmessage = function(e) {
  const { type, data } = e.data;

  if (type === 'calculateDensity') {
    const result = calculateDensity(data);
    self.postMessage({ type: 'densityResult', data: result });
  }
};
