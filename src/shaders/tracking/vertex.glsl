/**
 * Tracking Icon Vertex Shader - GPU-based orientation
 *
 * Computes position and orientation on the GPU from lat/lon/heading attributes.
 * This is much more efficient than uploading full matrices from CPU.
 */

// Instanced attributes (per-instance data)
attribute float aLat;      // Latitude in degrees (-90 to 90)
attribute float aLon;      // Longitude in degrees (-180 to 180)
attribute float aHeading;  // Heading in degrees (0 = North, clockwise)
attribute float aScale;    // Scale factor

// Uniforms
uniform float uEarthRadius;  // Earth sphere radius
uniform float uAltitude;     // Height above surface

// Constants
const float PI = 3.141592653589793;
const float DEG_TO_RAD = PI / 180.0;

void main() {
  // Convert lat/lon to radians
  float phi = (90.0 - aLat) * DEG_TO_RAD;    // Polar angle from north pole
  float theta = (aLon + 180.0) * DEG_TO_RAD;  // Azimuthal angle

  // Calculate position on sphere
  float radius = uEarthRadius + uAltitude;
  vec3 worldPosition = vec3(
    -radius * sin(phi) * cos(theta),
    radius * cos(phi),
    radius * sin(phi) * sin(theta)
  );

  // Surface normal (points away from Earth center)
  vec3 surfaceNormal = normalize(worldPosition);

  // Calculate east and north tangent vectors
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 east = normalize(cross(worldUp, surfaceNormal));
  vec3 north = normalize(cross(surfaceNormal, east));

  // Handle poles (where east is undefined)
  if (length(east) < 0.001) {
    east = vec3(1.0, 0.0, 0.0);
    north = vec3(0.0, 0.0, aLat > 0.0 ? -1.0 : 1.0);
  }

  // Calculate heading direction on surface
  float headingRad = aHeading * DEG_TO_RAD;
  float cosH = cos(headingRad);
  float sinH = sin(headingRad);
  vec3 headingDir = normalize(north * cosH + east * sinH);

  // Build orthonormal basis for icon orientation:
  // - basisY = surfaceNormal (face points away from Earth)
  // - basisZ = -headingDir (geometry has nose at -Z)
  // - basisX = basisY × basisZ
  vec3 basisY = surfaceNormal;
  vec3 basisZ = -headingDir;
  vec3 basisX = normalize(cross(basisY, basisZ));

  // Re-orthogonalize basisZ
  basisZ = normalize(cross(basisX, basisY));

  // Transform the vertex position using the basis vectors
  // position attribute is in local space (XZ plane after geometry rotation)
  vec3 localPos = position * aScale;

  vec3 transformedPos = worldPosition
    + basisX * localPos.x
    + basisY * localPos.y
    + basisZ * localPos.z;

  // Final MVP transform
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPos, 1.0);
}
