import type { SatelliteState, UnitCountParams } from "../types";

type SatelliteFilterParams = Pick<
  UnitCountParams,
  "showLEO" | "showMEO" | "showGEO" | "showMilitarySatellites"
>;

export function isSatelliteVisibleByFilters(
  satellite: SatelliteState,
  filters: SatelliteFilterParams
): boolean {
  const orbitVisible =
    (satellite.orbitTypeLabel === "LEO" && filters.showLEO) ||
    (satellite.orbitTypeLabel === "MEO" && filters.showMEO) ||
    (satellite.orbitTypeLabel === "GEO" && filters.showGEO);

  return orbitVisible || (filters.showMilitarySatellites && satellite.isMilitary);
}
