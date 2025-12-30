/**
 * Realistic Glass Vertex Shader
 *
 * GPU-based orientation with proper normal transformation for 3D extruded shapes.
 */

// Instanced attributes (per-instance data)
attribute float aLat;      // Latitude in degrees (-90 to 90)
attribute float aLon;      // Longitude in degrees (-180 to 180)
attribute float aHeading;  // Heading in degrees (0 = North, clockwise)
attribute float aScale;    // Scale factor

// Uniforms
uniform float uEarthRadius;  // Earth sphere radius
uniform float uAltitude;     // Height above surface

// Varyings for fragment shader
varying vec3 vNormal;        // Transformed normal for lighting
varying vec3 vViewDirection; // View direction for fresnel
varying vec2 vLocalPos;      // Local position for gradients

// Constants
const float PI = 3.141592653589793;
const float DEG_TO_RAD = PI / 180.0;

void main() {
  // Store local position for gradient effects in fragment shader
  vLocalPos = position.xz * 20.0; // Scale up for better gradient range

  // Convert lat/lon to radians
  float phi = (90.0 - aLat) * DEG_TO_RAD;
  float theta = (aLon + 180.0) * DEG_TO_RAD;

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
  vec3 eastRaw = cross(worldUp, surfaceNormal);
  vec3 east;
  vec3 north;

  // Handle poles where east is undefined
  if (length(eastRaw) < 0.001) {
    east = vec3(1.0, 0.0, 0.0);
    north = vec3(0.0, 0.0, aLat > 0.0 ? -1.0 : 1.0);
  } else {
    east = normalize(eastRaw);
    north = normalize(cross(surfaceNormal, east));
  }

  // Calculate heading direction on surface
  float headingRad = aHeading * DEG_TO_RAD;
  float cosH = cos(headingRad);
  float sinH = sin(headingRad);
  vec3 headingDir = normalize(north * cosH + east * sinH);

  // Build orthonormal basis for local-to-world transformation
  vec3 basisY = surfaceNormal;
  vec3 basisZ = -headingDir;
  vec3 basisX = normalize(cross(basisY, basisZ));
  basisZ = normalize(cross(basisX, basisY));

  // Transform vertex position
  vec3 localPos = position * aScale;
  vec3 transformedPos = worldPosition
    + basisX * localPos.x
    + basisY * localPos.y
    + basisZ * localPos.z;

  // Transform the geometry normal using the same basis
  // This allows extruded geometry sides to light correctly
  vec3 localNormal = normal;
  vec3 transformedNormal = normalize(
    basisX * localNormal.x +
    basisY * localNormal.y +
    basisZ * localNormal.z
  );

  // Pass transformed normal to fragment shader
  vNormal = normalize(normalMatrix * transformedNormal);

  // Calculate view direction (from fragment toward camera)
  vec3 worldPos = (modelMatrix * vec4(transformedPos, 1.0)).xyz;
  vViewDirection = normalize(cameraPosition - worldPos);

  // Final MVP transform
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPos, 1.0);
}
