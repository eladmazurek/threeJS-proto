/**
 * Aircraft Reflection Vertex Shader
 *
 * Positions a glossy reflection on the Earth surface directly below the aircraft.
 * The reflection fades with distance from the aircraft.
 */

// Instanced attributes (per-instance data)
attribute float aLat;      // Latitude in degrees (-90 to 90)
attribute float aLon;      // Longitude in degrees (-180 to 180)
attribute float aHeading;  // Heading in degrees (0 = North, clockwise)
attribute float aScale;    // Scale factor

// Uniforms
uniform float uEarthRadius;     // Earth sphere radius
uniform float uAircraftAltitude; // Height of aircraft above surface

// Varyings for fragment shader
varying float vFade;            // Fade based on altitude
varying vec3 vNormal;           // Surface normal
varying vec3 vViewDirection;    // View direction

// Constants
const float PI = 3.141592653589793;
const float DEG_TO_RAD = PI / 180.0;
const float REFLECTION_SURFACE_OFFSET = 0.0005; // Tiny offset to prevent z-fighting

void main() {
  // Convert lat/lon to radians
  float phi = (90.0 - aLat) * DEG_TO_RAD;
  float theta = (aLon + 180.0) * DEG_TO_RAD;

  // Reflection position on surface (directly below aircraft)
  float reflectionRadius = uEarthRadius + REFLECTION_SURFACE_OFFSET;
  vec3 reflectionPos = vec3(
    -reflectionRadius * sin(phi) * cos(theta),
    reflectionRadius * cos(phi),
    reflectionRadius * sin(phi) * sin(theta)
  );

  // Surface normal at this point
  vec3 surfaceNormal = normalize(reflectionPos);

  // Calculate tangent directions for reflection orientation
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 east = normalize(cross(worldUp, surfaceNormal));
  vec3 north = normalize(cross(surfaceNormal, east));

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
  vec3 basisY = surfaceNormal;
  vec3 basisZ = -headingDir;
  vec3 basisX = normalize(cross(basisY, basisZ));
  basisZ = normalize(cross(basisX, basisY));

  // Scale reflection slightly larger than aircraft for diffuse appearance
  float reflectionScale = aScale * 1.1;

  // Transform vertex position (flatten slightly for stretched reflection look)
  vec3 localPos = position * reflectionScale;
  localPos.y *= 0.1; // Flatten the reflection

  vec3 transformedPos = reflectionPos
    + basisX * localPos.x
    + basisY * localPos.y
    + basisZ * localPos.z;

  // Calculate fade based on aircraft altitude (higher = more faded)
  // Reflections are stronger when aircraft is closer to ground
  vFade = 1.0 - smoothstep(0.0, 0.05, uAircraftAltitude);

  // Pass surface normal
  vNormal = normalize(normalMatrix * surfaceNormal);

  // View direction for fresnel
  vec3 worldPos = (modelMatrix * vec4(transformedPos, 1.0)).xyz;
  vViewDirection = normalize(cameraPosition - worldPos);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPos, 1.0);
}
