/**
 * Particle Rendering Fragment Shader
 *
 * Renders particles as circular points with color based on speed
 * and fading based on age.
 */

uniform vec3 uColorSlow;     // Color for slow particles
uniform vec3 uColorFast;     // Color for fast particles
uniform float uMaxSpeed;     // Speed at which color is fully "fast"
uniform float uOpacity;      // Global opacity

varying float vAge;
varying float vSpeed;

void main() {
  // Create circular point with soft edges
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  // Discard pixels outside circle
  if (dist > 0.5) discard;

  // Soft edge falloff
  float alpha = smoothstep(0.5, 0.25, dist);

  // Fade based on age (particles fade as they age)
  float ageFade = 1.0 - smoothstep(0.6, 1.0, vAge);

  // Don't show very young particles (pop-in prevention)
  float youngFade = smoothstep(0.0, 0.05, vAge);

  alpha *= ageFade * youngFade;

  // Color based on speed
  float speedNorm = clamp(vSpeed / uMaxSpeed, 0.0, 1.0);

  // Smooth color interpolation
  vec3 color = mix(uColorSlow, uColorFast, speedNorm);

  // Add slight glow for fast particles
  if (speedNorm > 0.7) {
    float glowFactor = (speedNorm - 0.7) / 0.3;
    color += vec3(0.2, 0.1, 0.0) * glowFactor;
  }

  // Apply global opacity
  alpha *= uOpacity;

  // Discard nearly transparent pixels
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(color, alpha);
}
