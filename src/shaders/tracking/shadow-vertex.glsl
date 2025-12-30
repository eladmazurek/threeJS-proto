/**
 * Aircraft Shadow Vertex Shader
 *
 * Projects shadows onto the Earth surface based on sun direction.
 * Shadow offset is calculated from aircraft altitude and sun angle.
 */

// Instanced attributes (per-instance data)
attribute float aLat;      // Latitude in degrees (-90 to 90)
attribute float aLon;      // Longitude in degrees (-180 to 180)
attribute float aHeading;  // Heading in degrees (0 = North, clockwise)
attribute float aScale;    // Scale factor

// Uniforms
uniform float uEarthRadius;     // Earth sphere radius
uniform float uAircraftAltitude; // Height of aircraft above surface (for offset calc)
uniform vec3 uSunDirection;     // Direction TO the sun (normalized)
uniform float uShadowLength;    // Shadow length multiplier

// Constants
const float PI = 3.141592653589793;
const float DEG_TO_RAD = PI / 180.0;
const float SHADOW_SURFACE_OFFSET = 0.001; // Tiny offset to prevent z-fighting

void main() {
  // Convert lat/lon to radians
  float phi = (90.0 - aLat) * DEG_TO_RAD;
  float theta = (aLon + 180.0) * DEG_TO_RAD;

  // Calculate aircraft position (at altitude)
  float aircraftRadius = uEarthRadius + uAircraftAltitude;
  vec3 aircraftPos = vec3(
    -aircraftRadius * sin(phi) * cos(theta),
    aircraftRadius * cos(phi),
    aircraftRadius * sin(phi) * sin(theta)
  );

  // Surface normal at this point
  vec3 surfaceNormal = normalize(aircraftPos);

  // Calculate shadow offset based on sun direction
  // Project sun direction onto the tangent plane at this point
  vec3 sunTangent = uSunDirection - surfaceNormal * dot(uSunDirection, surfaceNormal);
  float sunTangentLength = length(sunTangent);

  // Shadow goes opposite to sun direction
  // Keep shadow very close to aircraft - just a subtle hint of depth
  vec3 shadowOffset = vec3(0.0);
  if (sunTangentLength > 0.001) {
    sunTangent = normalize(sunTangent);
    // Very small fixed offset
    float shadowMult = uAircraftAltitude * uShadowLength * 0.15;
    shadowOffset = -sunTangent * shadowMult;
  }

  // Shadow position on surface (with tiny offset to prevent z-fighting)
  float shadowRadius = uEarthRadius + SHADOW_SURFACE_OFFSET;
  vec3 shadowBasePos = vec3(
    -shadowRadius * sin(phi) * cos(theta),
    shadowRadius * cos(phi),
    shadowRadius * sin(phi) * sin(theta)
  );

  // Apply shadow offset (in world space, projected onto sphere surface)
  vec3 shadowWorldPos = shadowBasePos + shadowOffset;
  // Re-project onto sphere surface
  shadowWorldPos = normalize(shadowWorldPos) * shadowRadius;

  // Calculate tangent directions for shadow orientation
  vec3 shadowNormal = normalize(shadowWorldPos);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 east = normalize(cross(worldUp, shadowNormal));
  vec3 north = normalize(cross(shadowNormal, east));

  // Handle poles
  if (length(east) < 0.001) {
    east = vec3(1.0, 0.0, 0.0);
    north = vec3(0.0, 0.0, aLat > 0.0 ? -1.0 : 1.0);
  }

  // Calculate heading direction on surface
  float headingRad = aHeading * DEG_TO_RAD;
  float cosH = cos(headingRad);
  float sinH = sin(headingRad);
  vec3 headingDir = normalize(north * cosH + east * sinH);

  // Build orthonormal basis
  vec3 basisY = shadowNormal;
  vec3 basisZ = -headingDir;
  vec3 basisX = normalize(cross(basisY, basisZ));
  basisZ = normalize(cross(basisX, basisY));

  // Transform vertex
  vec3 localPos = position * aScale;
  vec3 transformedPos = shadowWorldPos
    + basisX * localPos.x
    + basisY * localPos.y
    + basisZ * localPos.z;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPos, 1.0);
}
