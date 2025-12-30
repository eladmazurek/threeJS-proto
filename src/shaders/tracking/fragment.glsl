/**
 * Tracking Icon Fragment Shader
 *
 * Simple flat color output for tracking icons.
 */

uniform vec3 uColor;
uniform float uOpacity;

void main() {
  gl_FragColor = vec4(uColor, uOpacity);
}
