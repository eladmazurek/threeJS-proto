/**
 * Trail Rendering Fragment Shader
 *
 * Colors trails based on speed and fades along trail length.
 */

uniform vec3 uWindColorSlow;
uniform vec3 uWindColorFast;
uniform vec3 uOceanColorSlow;
uniform vec3 uOceanColorFast;
uniform float uOpacity;
uniform float uMaxAge;

varying float vAge;
varying float vSpeed;
varying float vTrailFade;

void main() {
  float encodedSpeed = abs(vSpeed);
  float speedNorm = clamp(encodedSpeed, 0.0, 1.0);
  bool isOcean = vSpeed < 0.0;

  vec3 colorSlow = isOcean ? uOceanColorSlow : uWindColorSlow;
  vec3 colorFast = isOcean ? uOceanColorFast : uWindColorFast;
  vec3 color = mix(colorSlow, colorFast, pow(speedNorm, 0.85));

  float trailAlpha = pow(vTrailFade, 0.55);
  float ageFade = 1.0 - smoothstep(0.8, 1.0, vAge);
  float youngFade = smoothstep(0.0, 0.08, vAge);
  float speedFade = mix(0.55, 1.0, speedNorm);
  float visibilityBoost = isOcean ? mix(1.0, 1.12, speedNorm) : mix(1.45, 1.8, speedNorm);
  float alpha = trailAlpha * ageFade * youngFade * speedFade * uOpacity * visibilityBoost;
  color *= isOcean ? mix(1.0, 1.16, speedNorm) : mix(1.18, 1.38, speedNorm);

  if (alpha < 0.003) discard;

  gl_FragColor = vec4(color, min(alpha, 1.0));
}
