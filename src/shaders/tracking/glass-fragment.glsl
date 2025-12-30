/**
 * Tactical Glass Fragment Shader
 *
 * Efficient glass-like appearance with:
 * - Fresnel rim lighting
 * - Specular sun highlight
 * - Color tinting
 */

uniform vec3 uColor;           // Base tint color
uniform float uOpacity;        // Base opacity
uniform vec3 uSunDirection;    // Direction to sun for specular
uniform float uFresnelPower;   // Fresnel edge intensity
uniform float uSpecularPower;  // Specular highlight sharpness
uniform vec3 uGlowColor;       // Edge glow color

// These uniforms kept for compatibility but simplified
uniform float uIOR;
uniform float uThickness;
uniform float uReflectivity;

varying vec3 vNormal;
varying vec3 vViewDirection;
varying vec2 vLocalPos;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewDirection);

  // Facing ratio
  float NdotV = max(0.0, dot(normal, viewDir));

  // Simple fresnel (edge glow)
  float fresnel = pow(1.0 - NdotV, uFresnelPower);

  // Specular highlight
  vec3 halfVector = normalize(uSunDirection + viewDir);
  float NdotH = max(0.0, dot(normal, halfVector));
  float specular = pow(NdotH, uSpecularPower);

  // Combine
  vec3 baseColor = uColor;
  baseColor += uGlowColor * fresnel * 0.5;  // Edge glow
  baseColor += vec3(1.0) * specular;         // Specular highlight

  // Opacity with fresnel boost at edges
  float finalOpacity = uOpacity + fresnel * 0.3 + specular * 0.4;
  finalOpacity = min(1.0, finalOpacity);

  gl_FragColor = vec4(baseColor, finalOpacity);
}
