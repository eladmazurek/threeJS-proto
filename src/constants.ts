/**
 * Application Constants
 *
 * Centralized constants for the Earth visualization application.
 * All magic numbers and configuration values should be defined here.
 */

// =============================================================================
// EARTH & COORDINATE SYSTEM
// =============================================================================

/** Earth radius in scene units (not real-world meters) */
export const EARTH_RADIUS = 2;

/** Atmosphere extends 2.5% beyond Earth surface (thin rim effect) */
export const ATMOSPHERE_SCALE = 1.025;

/** Cloud layer height above surface */
export const CLOUD_ALTITUDE = 0.008;

/** Weather overlay height (between surface and clouds) */
export const WEATHER_ALTITUDE = 0.006;

/** Lat/lon grid height above surface (prevents z-fighting) */
export const GRID_ALTITUDE = 0.002;

/** Number of segments for curved grid lines */
export const GRID_SEGMENTS = 128;

// =============================================================================
// GOOGLE 3D TILES
// =============================================================================

/** Meters to scene units conversion factor */
export const TILES_SCALE_FACTOR = EARTH_RADIUS / 6371000;

/** Crossfade range for smooth blend between shader earth and 3D tiles */
export const TILES_TRANSITION_RANGE = 0.125;

// =============================================================================
// UNIT POOL SIZES
// =============================================================================

/** Maximum number of ship instances */
export const MAX_SHIPS = 250000;

/** Maximum number of aircraft instances */
export const MAX_AIRCRAFT = 250000;

/** Maximum number of satellite instances */
export const MAX_SATELLITES = 5000;

/** Maximum number of drone instances */
export const MAX_DRONES = 100;

// =============================================================================
// UNIT ALTITUDES
// =============================================================================

/** Height above Earth surface for ships */
export const SHIP_ALTITUDE = 0.005;

/** Height above Earth surface for aircraft */
export const AIRCRAFT_ALTITUDE = 0.02;

/** Low Earth Orbit altitude range */
export const SATELLITE_ALTITUDE_LEO = { min: 0.06, max: 0.12 };

/** Medium Earth Orbit altitude range */
export const SATELLITE_ALTITUDE_MEO = { min: 0.15, max: 0.25 };

/** Geostationary Orbit altitude range */
export const SATELLITE_ALTITUDE_GEO = { min: 0.35, max: 0.40 };

/** Drone minimum altitude (~25,000 ft) */
export const DRONE_ALTITUDE_MIN = 0.0024;

/** Drone maximum altitude (~60,000 ft) */
export const DRONE_ALTITUDE_MAX = 0.0058;

/** Radius of circular drone patrol pattern (in Earth radii) */
export const DRONE_PATROL_RADIUS = 0.08;

// =============================================================================
// WEATHER LAYERS
// =============================================================================

export const WEATHER_LAYERS = {
  PRECIPITATION: 0,
  TEMPERATURE: 1,
  WIND: 2,
  PRESSURE: 3,
} as const;

export type WeatherLayerType = typeof WEATHER_LAYERS[keyof typeof WEATHER_LAYERS];

// =============================================================================
// LABEL SYSTEM (SDF Text)
// =============================================================================

/** Maximum characters per label (2 lines x 12 chars) */
export const MAX_LABEL_CHARS = 24;

/** Characters per line in labels */
export const CHARS_PER_LINE = 12;

/** Supported characters in the font atlas */
export const CHAR_SET = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ|.-/";

/** Font atlas texture size */
export const ATLAS_SIZE = 512;

/** Size of each character cell in atlas */
export const ATLAS_CHAR_SIZE = 32;

/** Maximum visible units for label candidates */
export const MAX_CANDIDATES = 2000;

// =============================================================================
// H3 GRID SYSTEM
// =============================================================================

/** Degrees of camera movement before triggering H3 rebuild */
export const H3_PAN_THRESHOLD = 5;

/** Maximum H3 hexagon cells in buffer */
export const H3_MAX_CELLS = 8000;

/** Vertices per H3 cell (6 triangles x 3 verts) */
export const H3_VERTS_PER_CELL = 18;

/** H3 cells processed per frame (chunked building) */
export const H3_CELLS_PER_CHUNK = 200;

/** H3 popup update interval in seconds */
export const POPUP_UPDATE_INTERVAL = 0.5;

// =============================================================================
// TRAILS SYSTEM
// =============================================================================

/** Number of trail points per unit */
export const TRAIL_LENGTH = 6;

/** Maximum total trail points (memory limit) */
export const MAX_TRAIL_POINTS = 60000;

/** Milliseconds between trail position captures */
export const TRAIL_UPDATE_INTERVAL = 400;

/** Minimum distance (degrees) before adding new trail point */
export const MIN_TRAIL_DISTANCE = 0.15;

// =============================================================================
// SELECTION & VISUALIZATION
// =============================================================================

/** Points around satellite orbit path */
export const ORBIT_LINE_SEGMENTS = 128;

/** Points around drone patrol circle */
export const PATROL_CIRCLE_SEGMENTS = 64;

// =============================================================================
// PARTICLE FLOW SYSTEM
// =============================================================================

/** Maximum particles for wind/ocean flow visualization */
export const MAX_PARTICLES = 15000;

/** Trail length (positions stored per particle) */
export const TRAIL_POSITIONS = 16;

/** Particle state texture dimensions
 * Width = particles per row * trail positions
 * Height = number of rows
 * Total particles = (WIDTH / TRAIL_POSITIONS) * HEIGHT
 */
export const PARTICLE_TEXTURE_WIDTH = 1920; // 120 particles per row * 16 trail positions
export const PARTICLE_TEXTURE_HEIGHT = 125; // 120 * 125 = 15,000 particles

/** Altitude for flow particles (between surface and weather overlay) */
export const PARTICLE_ALTITUDE = 0.004;

/** Vector field texture dimensions (1 degree resolution) */
export const VECTOR_FIELD_WIDTH = 360;
export const VECTOR_FIELD_HEIGHT = 180;

/** GIBS overlay altitude (same as weather) */
export const GIBS_ALTITUDE = 0.006;

// =============================================================================
// MATH CONSTANTS
// =============================================================================

/** Degrees to radians conversion factor */
export const DEG_TO_RAD = Math.PI / 180;

/** Radians to degrees conversion factor */
export const RAD_TO_DEG = 180 / Math.PI;
