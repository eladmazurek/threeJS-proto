/**
 * Trail Rendering Fragment Shader
 *
 * Colors trails based on speed and fades along trail length.
 */

uniform vec3 uColorSlow;
uniform vec3 uColorFast;
uniform float uMaxSpeed;
uniform float uOpacity;
uniform float uMaxAge;

varying float vAge;
varying float vSpeed;
varying float vTrailFade;

void main() {
  // Color based on speed
  float speedNorm = clamp(vSpeed / uMaxSpeed, 0.0, 1.0);
  vec3 color = mix(uColorSlow, uColorFast, speedNorm);

  // Fade based on trail position (head = bright, tail = faded)
  // Use sqrt for less aggressive fade
  float trailAlpha = sqrt(vTrailFade);

  // Fade based on particle age - less aggressive
  float ageFade = 1.0 - smoothstep(0.8, 1.0, vAge);

  // Don't show very young particles - fade in as trail builds
  float youngFade = smoothstep(0.0, 0.15, vAge);

  // Combine all fades - boost overall brightness
  float alpha = trailAlpha * ageFade * youngFade * uOpacity * 1.5;

  // Boost brightness for all particles
  color = color * 1.2 + vec3(0.1);

  // Discard nearly transparent fragments
  if (alpha < 0.005) discard;

  gl_FragColor = vec4(color, min(alpha, 1.0));
}
