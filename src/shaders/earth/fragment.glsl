/**
 * Earth Fragment Shader
 *
 * This shader runs once per pixel (fragment) and determines the final color.
 * It receives interpolated data from the vertex shader and uses it to
 * calculate lighting, apply textures, and create visual effects.
 *
 * Built-in uniforms provided by Three.js (no need to declare):
 * - cameraPosition: The camera's position in world space
 *
 * Current state: This is a foundation shader that outputs UV coordinates
 * as colors for debugging. It's ready to be extended with:
 * - Day/night texture mapping
 * - Atmospheric effects (Fresnel rim lighting)
 * - Specular highlights (ocean reflections)
 * - Cloud layers
 */

// Varyings - interpolated data received from vertex shader
varying vec2 vUv;        // Texture coordinates (u=0-1 horizontal, v=0-1 vertical)
varying vec3 vNormal;    // Surface normal in world space
varying vec3 vPosition;  // Fragment position in world space

void main()
{
    // ==========================================================================
    // SETUP VECTORS FOR LIGHTING CALCULATIONS
    // ==========================================================================

    // Calculate the view direction (from fragment to camera)
    // This is useful for:
    // - Fresnel effects (rim lighting at edges)
    // - Specular reflections
    // - Atmospheric scattering
    vec3 viewDirection = normalize(vPosition - cameraPosition);

    // Normalize the interpolated normal
    // Interpolation can cause normals to become non-unit length,
    // so we renormalize to ensure correct lighting calculations
    vec3 normal = normalize(vNormal);

    // ==========================================================================
    // COLOR CALCULATION
    // ==========================================================================

    // DEBUG: Output UV coordinates as RGB color
    // This creates a gradient showing how textures would map to the sphere:
    // - Red channel (R) = U coordinate (0 to 1 from left to right)
    // - Green channel (G) = V coordinate (0 to 1 from bottom to top)
    // - Blue channel (B) = 1.0 (constant, makes it purple/pink tinted)
    //
    // Replace this with actual texture sampling and lighting calculations
    vec3 color = vec3(vUv, 1.0);

    // ==========================================================================
    // FINAL OUTPUT
    // ==========================================================================

    // Output the final color with full opacity (alpha = 1.0)
    gl_FragColor = vec4(color, 1.0);

    // Include Three.js shader chunks for proper color handling:
    // - tonemapping_fragment: Converts HDR colors to displayable range
    // - colorspace_fragment: Converts from linear to sRGB color space
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
