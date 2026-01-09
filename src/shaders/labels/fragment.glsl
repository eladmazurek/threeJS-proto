/**
 * SDF Label Fragment Shader - DEBUG VERSION
 */

precision highp float;

uniform sampler2D uAtlas;
uniform float uSmoothing;
uniform float uOutlineWidth;
uniform vec3 uOutlineColor;

varying vec2 vUV;
varying vec3 vColor;
varying float vAlpha;

void main() {
  // DEBUG: Just output solid color to test geometry
  // Sample texture to verify it's working
  float texVal = texture2D(uAtlas, vUV).r;

  // Output bright color - if we see this, geometry is working
  gl_FragColor = vec4(vColor, 1.0);

  // Uncomment below for actual SDF rendering once geometry is confirmed:
  // float alpha = smoothstep(0.5 - uSmoothing, 0.5 + uSmoothing, texVal);
  // if (alpha < 0.01) discard;
  // gl_FragColor = vec4(vColor, alpha);
}
