/**
 * SDF Label Vertex Shader - SIMPLIFIED DEBUG VERSION
 */

// Per-instance attributes
attribute vec3 aLabelPos;
attribute float aCharIndex;
attribute vec4 aCharUV;
attribute vec3 aColor;
attribute float aScale;

// Uniforms
uniform float uCharWidth;
uniform float uCharHeight;
uniform float uLabelOffset;  // Offset to the right of unit (in world units)

varying vec2 vUV;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vAlpha = 1.0;
  vColor = aColor;

  // Simple billboard using view matrix
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

  // Character position offset
  float charOffset = aCharIndex * uCharWidth * aScale;

  // Quad corner offset
  float qx = position.x * uCharWidth * aScale;
  float qy = position.y * uCharHeight * aScale;

  // Final world position - offset to the right in screen space
  vec3 worldPos = aLabelPos + camRight * (qx + charOffset + uLabelOffset) + camUp * qy;

  // UV coordinates
  vUV = aCharUV.xy + (position.xy + 0.5) * aCharUV.zw;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
