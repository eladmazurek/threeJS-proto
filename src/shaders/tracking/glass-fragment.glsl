/**
 * Tactical Glass Fragment Shader
 *
 * Creates a frosted glass UI look with:
 * - Fresnel rim lighting (glowing edges)
 * - Specular highlights from sun
 * - Gradient opacity for depth
 * - Bevel/edge glow effects
 */

uniform vec3 uColor;           // Base color (green for ships, orange for aircraft)
uniform float uOpacity;        // Base opacity
uniform vec3 uSunDirection;    // Direction to sun for specular
uniform float uFresnelPower;   // Fresnel edge glow intensity
uniform float uSpecularPower;  // Specular highlight sharpness
uniform vec3 uGlowColor;       // Edge glow color (usually lighter than base)

varying vec3 vNormal;          // Surface normal in world space
varying vec3 vViewDirection;   // Direction from fragment to camera
varying vec2 vLocalPos;        // Local position for gradient effects

void main() {
  // Normalize interpolated vectors
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewDirection);

  // ==========================================================================
  // FRESNEL RIM LIGHTING - edges glow brighter
  // ==========================================================================
  float fresnel = 1.0 - abs(dot(viewDir, normal));
  fresnel = pow(fresnel, uFresnelPower);

  // ==========================================================================
  // SPECULAR HIGHLIGHT - sun reflection
  // ==========================================================================
  vec3 halfVector = normalize(uSunDirection + viewDir);
  float specular = max(0.0, dot(normal, halfVector));
  specular = pow(specular, uSpecularPower);

  // Add a secondary, softer specular for broader shine
  float specularSoft = pow(max(0.0, dot(normal, halfVector)), uSpecularPower * 0.25);

  // ==========================================================================
  // GRADIENT OPACITY - slight variation across surface
  // ==========================================================================
  // Distance from center for radial gradient
  float distFromCenter = length(vLocalPos);
  float gradientOpacity = mix(0.85, 1.0, distFromCenter * 0.5);

  // ==========================================================================
  // BEVEL SIMULATION - edges catch more light
  // ==========================================================================
  float edgeBrightness = smoothstep(0.3, 0.8, distFromCenter);

  // ==========================================================================
  // COMBINE EFFECTS
  // ==========================================================================

  // Base frosted glass color
  vec3 baseColor = uColor;

  // Add fresnel glow (edge lighting)
  vec3 fresnelGlow = uGlowColor * fresnel * 0.8;

  // Add specular highlights
  vec3 specularColor = vec3(1.0) * (specular * 0.9 + specularSoft * 0.3);

  // Add subtle edge bevel highlight
  vec3 bevelHighlight = uGlowColor * edgeBrightness * 0.2;

  // Combine all lighting
  vec3 finalColor = baseColor + fresnelGlow + specularColor + bevelHighlight;

  // Calculate final opacity
  // - Base opacity
  // - Fresnel adds opacity at edges (glass effect)
  // - Gradient varies slightly across surface
  float finalOpacity = uOpacity * gradientOpacity;
  finalOpacity = mix(finalOpacity, min(1.0, finalOpacity + 0.3), fresnel);

  // Add extra opacity for specular highlights
  finalOpacity = min(1.0, finalOpacity + specular * 0.5);

  gl_FragColor = vec4(finalColor, finalOpacity);
}
