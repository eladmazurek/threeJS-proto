/**
 * Particle Advection Shader with Trail History
 *
 * Updates particle positions based on vector field.
 * Each particle has TRAIL_POSITIONS consecutive texels storing trail history.
 * Index 0 = head (newest), higher indices = older positions.
 *
 * Particle state stored in RGBA:
 *   R: longitude (0-1, maps to -180 to 180)
 *   G: latitude (0-1, maps to -90 to 90)
 *   B: age (0-1, respawn when > 1)
 *   A: speed (for rendering color)
 */

uniform sampler2D uParticleState;
uniform sampler2D uVectorField;
uniform float uDeltaTime;
uniform float uSpeedScale;
uniform float uMaxAge;
uniform float uRespawnRate;
uniform float uTime;
uniform vec2 uFieldScale;
uniform float uTrailPositions;
uniform float uTextureWidth;

varying vec2 vUv;

// Pseudo-random based on position and time
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float rand2(vec2 co, float seed) {
  return fract(sin(dot(co + seed, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  // Figure out which particle and trail position this texel represents
  // vUv is 0-1 across texture, texelX is the integer column (0 to width-1)
  float texelX = floor(vUv.x * uTextureWidth);
  float trailIndex = mod(texelX, uTrailPositions);

  // Sample current state at this position
  vec4 state = texture2D(uParticleState, vUv);

  if (trailIndex < 0.5) {
    // =========================================================================
    // HEAD POSITION (index 0) - compute new position from velocity
    // =========================================================================

    float lon = state.r;
    float lat = state.g;
    float age = state.b;
    float speed = state.a;

    // Sample vector field at particle position
    vec2 fieldUV = vec2(lon, lat);
    vec4 velocity = texture2D(uVectorField, fieldUV);

    // Decode velocity (stored as 0-1, centered at 0.5)
    float u = (velocity.r - 0.5) * 2.0 * uFieldScale.x;
    float v = (velocity.g - 0.5) * 2.0 * uFieldScale.y;

    // Current speed magnitude (for coloring)
    float currentSpeed = velocity.b;

    // Check if this is valid data
    float validData = velocity.a;

    // Only advect if we have valid data
    if (validData > 0.5) {
      // Adjust for latitude (longitude degrees shrink toward poles)
      float latRad = (lat - 0.5) * 3.14159;
      float lonScale = cos(latRad);

      // Degrees per second
      float degPerSecU = u * uSpeedScale * 0.01 / max(lonScale, 0.1);
      float degPerSecV = v * uSpeedScale * 0.01;

      // Update position
      lon += degPerSecU * uDeltaTime / 360.0;
      lat += degPerSecV * uDeltaTime / 180.0;
    }

    // Wrap longitude
    lon = fract(lon + 1.0);

    // Clamp latitude
    lat = clamp(lat, 0.02, 0.98);

    // Age the particle
    age += uDeltaTime / uMaxAge;

    // Determine if particle should respawn
    bool shouldRespawn = false;

    if (age >= 1.0) {
      shouldRespawn = true;
    }

    // Random respawn for variety
    float respawnRand = rand(vUv + vec2(uTime * 0.01, age));
    if (respawnRand < uRespawnRate * uDeltaTime) {
      shouldRespawn = true;
    }

    // Respawn if in invalid area
    if (validData < 0.5 && rand(vUv + vec2(uTime)) < 0.1) {
      shouldRespawn = true;
    }

    // Respawn particle
    if (shouldRespawn) {
      lon = rand2(vUv, uTime);
      lat = rand2(vUv, uTime + 1.0) * 0.9 + 0.05; // Avoid poles
      age = rand2(vUv, uTime + 2.0) * 0.1;
      currentSpeed = 0.0;
    }

    gl_FragColor = vec4(lon, lat, age, currentSpeed);

  } else {
    // =========================================================================
    // TRAIL POSITION (index > 0) - copy from previous position in trail
    // =========================================================================

    // Calculate UV of the HEAD position (index 0) to check for respawn
    float headTexelX = texelX - trailIndex;  // Go back to index 0
    float headU = (headTexelX + 0.5) / uTextureWidth;
    vec2 headUv = vec2(headU, vUv.y);
    vec4 headState = texture2D(uParticleState, headUv);

    // Calculate UV of the previous trail position (trailIndex - 1)
    float prevTexelX = texelX - 1.0;
    float prevU = (prevTexelX + 0.5) / uTextureWidth;
    vec2 prevUv = vec2(prevU, vUv.y);
    vec4 prevState = texture2D(uParticleState, prevUv);

    // Detect respawn conditions and snap to head:
    // 1. Head is young (respawned recently) - propagate reset
    // 2. Previous position is young (reset is cascading through trail)
    // 3. Previous position is old (about to respawn) - preemptive snap
    bool shouldSnapToHead = headState.b < 0.2 || prevState.b < 0.2 || prevState.b > 0.85;

    if (shouldSnapToHead) {
      // Snap to head position to prevent shooting lines
      gl_FragColor = vec4(headState.rg, headState.b, 0.0);
    } else {
      // Normal cascade - copy from previous position
      gl_FragColor = prevState;
    }
  }
}
