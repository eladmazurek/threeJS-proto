/**
 * Trail Rendering Vertex Shader
 *
 * Looks up particle position from state texture and converts to 3D.
 * Each vertex has a particle index and trail index to find its position.
 */

uniform sampler2D uParticleState;
uniform float uEarthRadius;
uniform float uParticleAltitude;
uniform float uTextureWidth;
uniform float uTextureHeight;
uniform float uTrailPositions;
uniform float uMaxAge;

attribute float aParticleIndex;  // Which particle (0 to MAX_PARTICLES-1)
attribute float aTrailIndex;     // Position in trail (0 = head, N-1 = tail)

varying float vAge;
varying float vSpeed;
varying float vTrailFade;  // Fades along trail length

const float PI = 3.141592653589793;
const float DEG_TO_RAD = PI / 180.0;

void main() {
  // Calculate which texel contains this trail position
  float particlesPerRow = floor(uTextureWidth / uTrailPositions);
  float row = floor(aParticleIndex / particlesPerRow);
  float col = mod(aParticleIndex, particlesPerRow);

  // Texel X = (particle column * trail positions) + trail index
  float texelX = col * uTrailPositions + aTrailIndex;
  float texelY = row;

  // Convert to UV coordinates (center of texel)
  float texU = (texelX + 0.5) / uTextureWidth;
  float texV = (texelY + 0.5) / uTextureHeight;

  // Sample particle state
  vec4 state = texture2D(uParticleState, vec2(texU, texV));

  // Decode position (0-1 range to degrees)
  float lon = (state.r - 0.5) * 360.0;  // -180 to 180
  float lat = (state.g - 0.5) * 180.0;  // -90 to 90

  vAge = state.b;
  vSpeed = state.a;

  // Trail fade: 1.0 at head (index 0), fades toward tail
  vTrailFade = 1.0 - (aTrailIndex / (uTrailPositions - 1.0));

  // Convert lat/lon to 3D position
  float phi = (90.0 - lat) * DEG_TO_RAD;
  float theta = (lon + 180.0) * DEG_TO_RAD;

  float radius = uEarthRadius + uParticleAltitude;

  vec3 worldPosition = vec3(
    -radius * sin(phi) * cos(theta),
    radius * cos(phi),
    radius * sin(phi) * sin(theta)
  );

  // Transform to clip space
  vec4 mvPosition = modelViewMatrix * vec4(worldPosition, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
