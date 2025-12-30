/**
 * Aircraft Reflection Fragment Shader
 *
 * Creates a glossy ground reflection effect with:
 * - Color tinted reflection
 * - Fresnel-based fade
 * - Distance-based opacity
 */

uniform vec3 uColor;           // Reflection tint color (matches aircraft)
uniform float uOpacity;        // Base reflection opacity

varying float vFade;           // Altitude-based fade
varying vec3 vNormal;          // Surface normal
varying vec3 vViewDirection;   // View direction

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewDirection);

  // Fresnel effect - reflections stronger at grazing angles
  float NdotV = max(0.0, dot(normal, viewDir));
  float fresnel = pow(1.0 - NdotV, 2.0);

  // Reflection color - tinted and desaturated
  vec3 reflectionColor = uColor * 0.5 + vec3(0.2); // Slightly washed out

  // Add subtle glossy highlight
  float gloss = pow(NdotV, 8.0) * 0.3;
  reflectionColor += vec3(gloss);

  // Calculate final opacity
  // - Base opacity
  // - Altitude fade (closer = stronger)
  // - Fresnel boost at edges
  float finalOpacity = uOpacity * vFade;
  finalOpacity *= (0.6 + fresnel * 0.4);

  // Fade at center, stronger at edges for realistic reflection
  finalOpacity *= 0.5 + fresnel * 0.5;

  gl_FragColor = vec4(reflectionColor, finalOpacity);
}
