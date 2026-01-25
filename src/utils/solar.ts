/**
 * Solar Position Calculation
 *
 * Calculates realistic sun direction based on current date/time.
 * Uses astronomical formulas to determine the subsolar point
 * (the point on Earth where the sun is directly overhead).
 */

import * as THREE from "three";
import { DEG_TO_RAD } from "../constants";

/** Earth's axial tilt in degrees */
const AXIAL_TILT = 23.44;

/**
 * Get the day of year (1-365/366) from a Date object.
 */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Calculate the subsolar point (lat/lon where sun is directly overhead).
 *
 * @param date - The date/time to calculate for (defaults to now)
 * @returns Object with subsolar latitude and longitude in degrees
 */
export function getSubsolarPoint(date: Date = new Date()): {
  lat: number;
  lon: number;
} {
  const dayOfYear = getDayOfYear(date);

  // Subsolar latitude: varies between ±23.44° throughout the year
  // Maximum (23.44°N) at summer solstice (~June 21, day ~172)
  // Minimum (-23.44°S) at winter solstice (~December 21, day ~356)
  // Formula: -axialTilt * cos(360° * (dayOfYear + 10) / 365)
  // The +10 shifts so that day 0 (Jan 1) gives correct tilt
  const lat = -AXIAL_TILT * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);

  // Subsolar longitude: rotates 360° per 24 hours
  // At UTC 12:00 (solar noon at prime meridian), subsolar longitude = 0°
  // Longitude = -15° per hour from UTC 12:00
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const fractionalHours = hours + minutes / 60 + seconds / 3600;

  // At 12:00 UTC, sun is over 0° longitude
  // Sun moves west at 15°/hour, so at 13:00 UTC it's at -15°
  let lon = (12 - fractionalHours) * 15;

  // Normalize to -180..180
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return { lat, lon };
}

/**
 * Calculate sun direction vector from a given date/time.
 * The vector points FROM Earth center TOWARDS the sun.
 *
 * @param date - The date/time to calculate for (defaults to now)
 * @returns Normalized THREE.Vector3 pointing towards the sun
 */
export function calculateSunDirection(date: Date = new Date()): THREE.Vector3 {
  const { lat, lon } = getSubsolarPoint(date);

  // Convert subsolar lat/lon to a direction vector
  // This is the direction from Earth center towards the sun
  const phi = (90 - lat) * DEG_TO_RAD; // Colatitude
  const theta = (lon + 180) * DEG_TO_RAD; // Longitude offset (matching latLonToPosition)

  // Same coordinate system as latLonToPosition in coordinates.ts
  const sunDir = new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );

  return sunDir.normalize();
}

/**
 * Calculate sun direction and write to an existing Vector3 (no allocation).
 *
 * @param date - The date/time to calculate for
 * @param outVec - Vector3 to write result to
 */
export function calculateSunDirectionTo(
  date: Date,
  outVec: THREE.Vector3
): void {
  const { lat, lon } = getSubsolarPoint(date);

  const phi = (90 - lat) * DEG_TO_RAD;
  const theta = (lon + 180) * DEG_TO_RAD;

  outVec.set(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
  outVec.normalize();
}

/**
 * Sun parameters for realistic sun positioning.
 */
export interface SunParams {
  /** Use realistic sun position based on current time */
  realistic: boolean;
  /** Time multiplier (1 = real-time, 60 = 1 min/sec, 3600 = 1 hr/sec) */
  timeMultiplier: number;
  /** Starting timestamp (for time acceleration) */
  startTime: number;
  /** Elapsed simulation time in ms (for time acceleration) */
  elapsedSimTime: number;
}

/** Default sun parameters */
export const DEFAULT_SUN_PARAMS: SunParams = {
  realistic: true,
  timeMultiplier: 1,
  startTime: Date.now(),
  elapsedSimTime: 0,
};

/**
 * Get the simulated date based on time multiplier.
 * When timeMultiplier > 1, time passes faster in the simulation.
 *
 * @param params - Sun parameters
 * @param realDeltaMs - Real time elapsed since last frame (milliseconds)
 * @returns The simulated Date
 */
export function getSimulatedDate(
  params: SunParams,
  realDeltaMs: number = 0
): Date {
  // Accumulate simulation time (scaled by multiplier)
  params.elapsedSimTime += realDeltaMs * params.timeMultiplier;

  // Return date based on start time + accumulated sim time
  return new Date(params.startTime + params.elapsedSimTime);
}

/**
 * Reset simulation time to current real time.
 */
export function resetSimulatedTime(params: SunParams): void {
  params.startTime = Date.now();
  params.elapsedSimTime = 0;
}

/**
 * Format a date for display (UTC time string).
 */
export function formatSimulatedTime(date: Date): string {
  return date.toUTCString().replace("GMT", "UTC");
}

/**
 * Calculate Earth's rotation angle for a given date/time.
 * This is the angle the Earth has rotated from a reference point.
 *
 * At UTC 12:00, the prime meridian (0° longitude) faces the sun.
 * Earth rotates 360° per 24 hours = 15°/hour = 2π rad/day
 *
 * @param date - The date/time to calculate for
 * @returns Rotation angle in radians
 */
export function getEarthRotation(date: Date): number {
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();

  // Fractional hours since midnight UTC
  const fractionalHours = hours + minutes / 60 + seconds / 3600 + ms / 3600000;

  // At 12:00 UTC, prime meridian faces sun (rotation = 0 for our reference)
  // Earth rotates eastward (counterclockwise when viewed from above North Pole)
  // So rotation increases as time passes
  const hoursFrom12 = fractionalHours - 12;

  // Convert to radians: 15°/hour = π/12 rad/hour
  return hoursFrom12 * (Math.PI / 12);
}

/**
 * Calculate sun direction based ONLY on seasonal tilt (day of year).
 * This gives a fixed sun direction that doesn't change through the day.
 * The daily cycle is achieved by rotating the Earth mesh instead.
 *
 * @param date - The date to get seasonal sun position for
 * @param outVec - Vector3 to write result to
 */
export function getSeasonalSunDirection(date: Date, outVec: THREE.Vector3): void {
  const dayOfYear = getDayOfYear(date);

  // Subsolar latitude based on season (axial tilt)
  const lat = -AXIAL_TILT * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);

  // For seasonal sun, longitude is fixed at 0 (sun over prime meridian at noon)
  // The Earth's rotation will handle the daily cycle
  const lon = 0;

  const phi = (90 - lat) * DEG_TO_RAD;
  const theta = (lon + 180) * DEG_TO_RAD;

  outVec.set(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
  outVec.normalize();
}
