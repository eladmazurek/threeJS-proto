declare module 'satellite.js' {
  export interface Eci {
    x: number;
    y: number;
    z: number;
  }

  export interface Geodetic {
    longitude: number; // radians
    latitude: number;  // radians
    height: number;    // km
  }

  export interface SatRec {
    satnum: string;
    epochyr: number;
    epochdays: number;
    ndot: number;
    nddot: number;
    bstar: number;
    inclo: number;
    nodeo: number;
    ecco: number;
    argpo: number;
    mo: number;
    no: number;
  }

  export interface PositionAndVelocity {
    position: Eci | boolean;
    velocity: Eci | boolean;
  }

  export function twoline2satrec(line1: string, line2: string): SatRec;
  export function propagate(satrec: SatRec, date: Date): PositionAndVelocity;
  export function gstime(date: Date): number;
  export function eciToGeodetic(eci: Eci, gmst: number): Geodetic;
  export function degreesLat(radians: number): number;
  export function degreesLong(radians: number): number;
}
