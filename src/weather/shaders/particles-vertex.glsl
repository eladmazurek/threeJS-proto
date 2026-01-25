/**
 * Particle Rendering Vertex Shader
 *
 * Samples particle state from texture and converts lat/lon to 3D position.
 * Uses the same spherical math as unit icons.
 */

uniform sampler2D uParticleState;  // Particle positions from advection
uniform float uEarthRadius;
uniform float uParticleAltitude;
uniform float uPointSize;
uniform vec2 uTextureSize;          // Width, Height of state texture

attribute float aParticleIndex;     // Index of this particle (0 to N-1)

varying float vAge;
varying float vSpeed;

const float PI = 3.141592653589793;
const float DEG_TO_RAD = PI / 180.0;

void main() {
  // Calculate UV coordinates for this particle's state texel
  float idx = aParticleIndex;
  float texU = (mod(idx, uTextureSize.x) + 0.5) / uTextureSize.x;
  float texV = (floor(idx / uTextureSize.x) + 0.5) / uTextureSize.y;

  // Sample particle state
  vec4 state = texture2D(uParticleState, vec2(texU, texV));

  // Decode position (0-1 range to degrees)
  float lon = (state.r - 0.5) * 360.0;  // -180 to 180
  float lat = (state.g - 0.5) * 180.0;  // -90 to 90

  vAge = state.b;
  vSpeed = state.a;

  // Convert lat/lon to 3D position (same as tracking/vertex.glsl)
  float phi = (90.0 - lat) * DEG_TO_RAD;    // Polar angle from Y axis
  float theta = (lon + 180.0) * DEG_TO_RAD; // Azimuthal angle

  float radius = uEarthRadius + uParticleAltitude;

  vec3 worldPosition = vec3(
    -radius * sin(phi) * cos(theta),
    radius * cos(phi),
    radius * sin(phi) * sin(theta)
  );

  // Transform to clip space
  vec4 mvPosition = modelViewMatrix * vec4(worldPosition, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Point size with distance attenuation
  // Smaller points when zoomed out, larger when zoomed in
  float distanceFactor = 5.0 / -mvPosition.z;
  gl_PointSize = clamp(uPointSize * distanceFactor, 0.5, uPointSize * 2.0);

  // Fade out particles at edges of view
  float fadeEdge = 1.0 - smoothstep(0.8, 1.0, abs(gl_Position.x / gl_Position.w));
  fadeEdge *= 1.0 - smoothstep(0.8, 1.0, abs(gl_Position.y / gl_Position.w));

  // Apply fade to age (will be used in fragment shader)
  vAge = vAge + (1.0 - fadeEdge) * 0.5;
}
