/**
 * GIBS Overlay Fragment Shader
 *
 * Samples NASA GIBS texture and applies opacity.
 * Supports day/night blending and crossfade transitions.
 */

uniform sampler2D uGibsTexture;
uniform float uOpacity;
uniform float uCrossfade;        // 0-1 for texture transition
uniform sampler2D uPendingTexture;
uniform bool uHasPendingTexture;
uniform vec3 uSunDirection;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  // Sample current GIBS texture
  vec4 currentColor = texture2D(uGibsTexture, vUv);

  // Handle crossfade if pending texture exists
  vec4 color = currentColor;
  if (uHasPendingTexture) {
    vec4 pendingColor = texture2D(uPendingTexture, vUv);
    color = mix(currentColor, pendingColor, uCrossfade);
  }

  // Polar fade to hide data gaps at extreme latitudes
  float lat = vUv.y;
  float polarFade = smoothstep(0.0, 0.08, lat) * smoothstep(0.0, 0.08, 1.0 - lat);

  // Calculate day/night factor based on sun direction
  float sunDot = dot(normalize(vWorldPosition), uSunDirection);
  float dayFactor = smoothstep(-0.2, 0.3, sunDot);

  // Slightly dim on night side (clouds less visible at night)
  float nightDim = mix(0.3, 1.0, dayFactor);

  // Apply opacity
  float alpha = color.a * uOpacity * nightDim * polarFade;

  // Discard fully transparent pixels
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(color.rgb, alpha);
}
