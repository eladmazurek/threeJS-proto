/**
 * Earth Fragment Shader
 *
 * This shader creates a realistic Earth rendering with:
 * - Day/night texture blending based on sun position
 * - Atmospheric Fresnel glow effect
 * - Cloud layer overlay
 * - Specular highlights on oceans
 *
 * Built-in uniforms provided by Three.js:
 * - cameraPosition: The camera's position in world space
 */

// Texture samplers
uniform sampler2D uDayTexture;           // Daytime Earth texture (continents, oceans)
uniform sampler2D uNightTexture;         // Nighttime texture (city lights)
uniform sampler2D uSpecularCloudsTexture; // R: specular mask, G: cloud coverage

// Lighting uniforms
uniform vec3 uSunDirection;              // Direction TO the sun (normalized)

// Atmosphere uniforms
uniform vec3 uAtmosphereColor;           // Color of atmospheric glow
uniform float uAtmosphereDayMix;         // Atmosphere blend on day side (0-1)
uniform float uAtmosphereTwilightMix;    // Atmosphere blend at twilight (0-1)

// Cloud uniforms
uniform float uCloudsIntensity;          // Cloud opacity/intensity (0-1)

// Specular/sun glint uniforms
uniform float uSpecularIntensity;        // Overall specular intensity
uniform float uSpecularSharpness;        // Sharpness of center highlight (higher = smaller)
uniform float uSpecularGlowSize;         // Size of medium glow (higher = smaller)

// Varyings from vertex shader
varying vec2 vUv;                        // Texture coordinates
varying vec3 vNormal;                    // Surface normal in world space
varying vec3 vPosition;                  // Fragment position in world space

void main()
{
    // ==========================================================================
    // SETUP - Normalize vectors for lighting calculations
    // ==========================================================================

    // View direction: from fragment toward camera
    vec3 viewDirection = normalize(vPosition - cameraPosition);

    // Re-normalize the interpolated normal (interpolation can denormalize)
    vec3 normal = normalize(vNormal);

    // ==========================================================================
    // SUN/LIGHTING CALCULATIONS
    // ==========================================================================

    // Calculate how much this fragment faces the sun (-1 to 1)
    // 1 = directly facing sun (noon), -1 = facing away (midnight)
    float sunOrientation = dot(normal, uSunDirection);

    // Create a smooth day/night factor with a soft twilight transition
    // smoothstep creates gradual transition instead of hard edge
    // Range: -0.2 to 0.4 gives nice twilight zone
    float dayMix = smoothstep(-0.2, 0.4, sunOrientation);

    // ==========================================================================
    // TEXTURE SAMPLING
    // ==========================================================================

    // Sample the day texture (continents, oceans in daylight)
    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;

    // Sample the night texture (city lights)
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;

    // Sample specular/clouds texture
    // R channel = specular intensity (oceans are bright, land is dark)
    // G channel = cloud coverage
    vec2 specularClouds = texture2D(uSpecularCloudsTexture, vUv).rg;
    float specularMask = specularClouds.r;  // Ocean reflectivity
    float cloudsMask = specularClouds.g;    // Cloud coverage

    // ==========================================================================
    // DAY/NIGHT BLENDING
    // ==========================================================================

    // Mix between night and day based on sun orientation
    vec3 color = mix(nightColor, dayColor, dayMix);

    // ==========================================================================
    // CLOUD LAYER
    // ==========================================================================

    // Add clouds on top of the surface
    // Clouds are white and only visible on the day side
    // cloudsMask determines where clouds are, uCloudsIntensity controls opacity
    float cloudsStrength = cloudsMask * uCloudsIntensity * dayMix;
    color = mix(color, vec3(1.0), cloudsStrength);

    // ==========================================================================
    // SPECULAR HIGHLIGHTS (Ocean Sun Glint)
    // ==========================================================================

    // Calculate reflection vector for specular
    vec3 reflection = reflect(-uSunDirection, normal);

    // Base specular intensity
    // viewDirection points FROM camera, so we negate it
    float specularBase = max(0.0, dot(reflection, -viewDirection));

    // Create layered specular for realistic sun glint:
    // 1. Bright sharp center core (controlled by uSpecularSharpness)
    float specularSharp = pow(specularBase, uSpecularSharpness) * 2.0;

    // 2. Medium glow around the center (controlled by uSpecularGlowSize)
    float specularMedium = pow(specularBase, uSpecularGlowSize) * 0.5;

    // 3. Large soft outer glow (fixed, provides base diffuse reflection)
    float specularSoft = pow(specularBase, 2.0) * 0.2;

    // Combine all specular layers with intensity control
    float specular = (specularSharp + specularMedium + specularSoft) * uSpecularIntensity;

    // Apply specular only to:
    // - Ocean areas (specularMask)
    // - Day side (dayMix)
    // - Areas without clouds (1.0 - cloudsStrength)
    specular *= specularMask * dayMix * (1.0 - cloudsStrength);

    // Add white specular highlight to color
    color += specular;

    // ==========================================================================
    // ATMOSPHERIC FRESNEL EFFECT
    // ==========================================================================

    // Fresnel effect: edges of sphere glow more than center
    // Based on angle between view direction and surface normal
    // At edges, normal is perpendicular to view = dot product near 0
    float fresnel = 1.0 - abs(dot(viewDirection, normal));

    // Sharpen the fresnel falloff
    fresnel = pow(fresnel, 2.0);

    // Twilight zone gets stronger atmospheric effect
    // smoothstep creates smooth transition around the terminator
    float twilightMix = smoothstep(-0.2, 0.2, sunOrientation);

    // Blend between twilight atmosphere strength and day atmosphere strength
    float atmosphereStrength = mix(uAtmosphereTwilightMix, uAtmosphereDayMix, twilightMix);

    // Apply atmosphere color with fresnel and strength
    // Only add atmosphere on the lit side and twilight zone
    float atmosphereFactor = fresnel * atmosphereStrength * max(0.0, sunOrientation + 0.5);
    color = mix(color, uAtmosphereColor, atmosphereFactor);

    // ==========================================================================
    // FINAL OUTPUT
    // ==========================================================================

    gl_FragColor = vec4(color, 1.0);

    // Three.js color management
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
