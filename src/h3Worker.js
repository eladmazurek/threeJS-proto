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
 * Get all H3 cells in visible area using gridDisk around center
 */
function getVisibleH3Cells(resolution, centerLat, centerLon, radiusDegrees) {
  try {
    const centerCell = h3.latLngToCell(centerLat, centerLon, resolution);
    // H3 cell edge length varies by resolution
    const edgeLengthKm = [1107, 418, 158, 60, 22, 8, 3, 1.2, 0.46, 0.17][resolution] || 1;
    const radiusKm = radiusDegrees * 111; // Rough conversion
    const k = Math.min(Math.ceil(radiusKm / edgeLengthKm), 50); // Cap at 50 rings
    return h3.gridDisk(centerCell, k);
  } catch (e) {
    return [];
  }
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

  // Get visible cells (expensive operation, now in worker)
  const allCells = getVisibleH3Cells(resolution, viewCenter.lat, viewCenter.lon, visibleRadius);

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

  return { densityEntries, cellCountEntries, allCells };
}

// =============================================================================
// LABEL VISIBILITY INDEX
// =============================================================================

// Persistent spatial index for labels
const labelIndex = {
  ships: new Map(),      // H3 cell -> array of indices
  aircraft: new Map(),   // H3 cell -> array of indices
  drones: new Map(),     // H3 cell -> array of indices
  resolution: 3,
};

/**
 * Build the label spatial index from unit positions
 */
function buildLabelIndex(data) {
  const { resolution, shipLats, shipLons, aircraftLats, aircraftLons, droneLats, droneLons } = data;

  labelIndex.resolution = resolution;
  labelIndex.ships.clear();
  labelIndex.aircraft.clear();
  labelIndex.drones.clear();

  // Index ships
  if (shipLats && shipLons) {
    for (let i = 0; i < shipLats.length; i++) {
      const lat = shipLats[i];
      const lon = shipLons[i];
      if (lat === 0 && lon === 0) continue; // Skip uninitialized
      try {
        const cell = h3.latLngToCell(lat, lon, resolution);
        if (!labelIndex.ships.has(cell)) {
          labelIndex.ships.set(cell, []);
        }
        labelIndex.ships.get(cell).push(i);
      } catch (e) { /* Skip invalid */ }
    }
  }

  // Index aircraft
  if (aircraftLats && aircraftLons) {
    for (let i = 0; i < aircraftLats.length; i++) {
      const lat = aircraftLats[i];
      const lon = aircraftLons[i];
      if (lat === 0 && lon === 0) continue;
      try {
        const cell = h3.latLngToCell(lat, lon, resolution);
        if (!labelIndex.aircraft.has(cell)) {
          labelIndex.aircraft.set(cell, []);
        }
        labelIndex.aircraft.get(cell).push(i);
      } catch (e) { /* Skip invalid */ }
    }
  }

  // Index drones
  if (droneLats && droneLons) {
    for (let i = 0; i < droneLats.length; i++) {
      const lat = droneLats[i];
      const lon = droneLons[i];
      if (lat === 0 && lon === 0) continue;
      try {
        const cell = h3.latLngToCell(lat, lon, resolution);
        if (!labelIndex.drones.has(cell)) {
          labelIndex.drones.set(cell, []);
        }
        labelIndex.drones.get(cell).push(i);
      } catch (e) { /* Skip invalid */ }
    }
  }

  return {
    shipCells: labelIndex.ships.size,
    aircraftCells: labelIndex.aircraft.size,
    droneCells: labelIndex.drones.size,
    totalShips: shipLats ? shipLats.length : 0,
    totalAircraft: aircraftLats ? aircraftLats.length : 0,
    totalDrones: droneLats ? droneLats.length : 0,
  };
}

/**
 * Query visible units based on camera position
 * Returns arrays of unit indices that are in visible H3 cells
 */
function queryVisibleUnits(data) {
  const { centerLat, centerLon, ringSize, includeShips, includeAircraft, includeDrones } = data;
  const resolution = labelIndex.resolution;

  const visibleShips = [];
  const visibleAircraft = [];
  const visibleDrones = [];

  try {
    // Get center cell and surrounding ring
    const centerCell = h3.latLngToCell(centerLat, centerLon, resolution);
    const visibleCells = h3.gridDisk(centerCell, ringSize);

    // Collect unit indices from visible cells
    if (includeShips) {
      for (const cell of visibleCells) {
        const indices = labelIndex.ships.get(cell);
        if (indices) {
          visibleShips.push(...indices);
        }
      }
    }

    if (includeAircraft) {
      for (const cell of visibleCells) {
        const indices = labelIndex.aircraft.get(cell);
        if (indices) {
          visibleAircraft.push(...indices);
        }
      }
    }

    if (includeDrones) {
      for (const cell of visibleCells) {
        const indices = labelIndex.drones.get(cell);
        if (indices) {
          visibleDrones.push(...indices);
        }
      }
    }

    return {
      shipIndices: visibleShips,
      aircraftIndices: visibleAircraft,
      droneIndices: visibleDrones,
      cellCount: visibleCells.length,
    };
  } catch (e) {
    return { shipIndices: [], aircraftIndices: [], droneIndices: [], cellCount: 0, error: e.message };
  }
}

// Handle messages from main thread
self.onmessage = function(e) {
  const { type, data } = e.data;

  if (type === 'calculateDensity') {
    const result = calculateDensity(data);
    self.postMessage({ type: 'densityResult', data: result });
  }

  if (type === 'buildLabelIndex') {
    const result = buildLabelIndex(data);
    self.postMessage({ type: 'labelIndexBuilt', data: result });
  }

  if (type === 'queryVisibleUnits') {
    const result = queryVisibleUnits(data);
    self.postMessage({ type: 'visibleUnitsResult', data: result });
  }
};
