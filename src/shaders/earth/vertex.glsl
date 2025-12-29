/**
 * Earth Vertex Shader
 *
 * This shader runs once per vertex in the Earth sphere geometry.
 * Its main job is to transform vertex positions from local object space
 * to clip space (screen coordinates) and pass data to the fragment shader.
 *
 * Built-in uniforms provided by Three.js (no need to declare):
 * - modelMatrix: Transforms from object space to world space
 * - viewMatrix: Transforms from world space to camera/view space
 * - projectionMatrix: Transforms from view space to clip space (2D screen)
 * - cameraPosition: The camera's position in world space
 *
 * Built-in attributes provided by Three.js (no need to declare):
 * - position: Vertex position in object space
 * - normal: Vertex normal vector (perpendicular to surface)
 * - uv: Texture coordinates (0-1 range for mapping textures)
 */

// Varyings - data passed from vertex shader to fragment shader
// These values are interpolated across the triangle's surface
varying vec2 vUv;        // Texture coordinates for mapping textures
varying vec3 vNormal;    // Normal vector in world space (for lighting)
varying vec3 vPosition;  // Vertex position in world space (for view calculations)

void main()
{
    // ==========================================================================
    // POSITION TRANSFORMATION
    // ==========================================================================

    // Transform vertex position from object space to world space
    // modelMatrix contains the object's translation, rotation, and scale
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    // Transform from world space -> view space -> clip space
    // This is the final position used to render on screen
    // viewMatrix: Positions everything relative to the camera
    // projectionMatrix: Applies perspective (things farther away appear smaller)
    gl_Position = projectionMatrix * viewMatrix * modelPosition;

    // ==========================================================================
    // NORMAL TRANSFORMATION
    // ==========================================================================

    // Transform the normal vector to world space
    // Note: We use 0.0 for the w component because normals are directions,
    // not positions, so they shouldn't be affected by translation
    vec3 modelNormal = (modelMatrix * vec4(normal, 0.0)).xyz;

    // ==========================================================================
    // PASS DATA TO FRAGMENT SHADER
    // ==========================================================================

    // Pass texture coordinates unchanged
    vUv = uv;

    // Pass the world-space normal (will be interpolated across the triangle)
    vNormal = modelNormal;

    // Pass the world-space position (used for calculating view direction)
    vPosition = modelPosition.xyz;
}
