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
uniform vec3 uAtmosphereDayColor;        // Blue atmosphere on day side
uniform vec3 uAtmosphereTwilightColor;   // Red/orange atmosphere at twilight
uniform float uAtmosphereDayMix;         // Atmosphere blend on day side (0-1)
uniform float uAtmosphereTwilightMix;    // Atmosphere blend at twilight (0-1)

// Cloud uniforms
uniform float uCloudsIntensity;          // Cloud opacity/intensity (0-1)

// Specular/sun glint uniforms
uniform float uSpecularIntensity;        // Overall specular intensity
uniform float uSpecularSharpness;        // Sharpness of center highlight (higher = smaller)
uniform float uSpecularGlowSize;         // Size of medium glow (higher = smaller)

// Color mode uniforms
uniform int uColorMode;                  // 0=normal, 1=grayscale, 2=night vision, 3=thermal, 4=hologram
uniform float uNightBlend;               // 0=day only, 1=day/night blend

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
    // If uNightBlend is 0, just show day texture without any blending
    vec3 color = uNightBlend > 0.5
        ? mix(nightColor, dayColor, dayMix)  // Normal day/night blend
        : dayColor;                           // Full day texture, no blending

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

    // Create concentrated specular for sun glint:
    // 1. Tight center core (controlled by uSpecularSharpness)
    float specularSharp = pow(specularBase, uSpecularSharpness) * 1.2;

    // 2. Very subtle glow around center (controlled by uSpecularGlowSize)
    float specularMedium = pow(specularBase, uSpecularGlowSize) * 0.15;

    // Combine layers - no soft outer glow for tighter appearance
    float specular = (specularSharp + specularMedium) * uSpecularIntensity;

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

    // Sharpen the fresnel falloff for tighter rim
    fresnel = pow(fresnel, 3.0);

    // Calculate atmosphere color based on sun position
    // Day side (facing sun) = blue, twilight/night side = red/orange
    float atmosphereColorMix = smoothstep(-0.3, 0.5, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereColorMix);

    // Atmosphere strength varies: stronger at twilight, lighter on day side
    float twilightFactor = 1.0 - abs(sunOrientation); // Peaks at terminator
    twilightFactor = pow(twilightFactor, 0.5); // Soften the falloff
    float atmosphereStrength = mix(uAtmosphereTwilightMix, uAtmosphereDayMix, atmosphereColorMix);
    atmosphereStrength *= (0.5 + twilightFactor * 0.5); // Boost at terminator

    // Apply atmosphere with fresnel
    // Visible on edges, stronger near terminator
    float atmosphereFactor = fresnel * atmosphereStrength;
    color = mix(color, atmosphereColor, atmosphereFactor);

    // ==========================================================================
    // COLOR MODE PROCESSING
    // ==========================================================================

    // Apply color mode transformation
    if (uColorMode == 1) {
      // GRAYSCALE - Tactical/military look
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      color = vec3(luminance);
    }
    else if (uColorMode == 2) {
      // NIGHT VISION - Green phosphor look
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      // Boost brightness and add green tint
      luminance = pow(luminance, 0.7) * 1.2; // Gamma boost
      color = vec3(luminance * 0.2, luminance, luminance * 0.2);
    }
    else if (uColorMode == 3) {
      // THERMAL - Heat map false color
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      // Map luminance to thermal gradient: black -> blue -> purple -> red -> orange -> yellow -> white
      vec3 thermal;
      if (luminance < 0.25) {
        thermal = mix(vec3(0.0, 0.0, 0.2), vec3(0.3, 0.0, 0.5), luminance * 4.0);
      } else if (luminance < 0.5) {
        thermal = mix(vec3(0.3, 0.0, 0.5), vec3(0.8, 0.1, 0.1), (luminance - 0.25) * 4.0);
      } else if (luminance < 0.75) {
        thermal = mix(vec3(0.8, 0.1, 0.1), vec3(1.0, 0.6, 0.0), (luminance - 0.5) * 4.0);
      } else {
        thermal = mix(vec3(1.0, 0.6, 0.0), vec3(1.0, 1.0, 0.8), (luminance - 0.75) * 4.0);
      }
      color = thermal;
    }
    else if (uColorMode == 4) {
      // HOLOGRAM - Cyan/blue wireframe sci-fi look
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      // Edge detection using fresnel
      float edge = pow(fresnel, 1.5) * 2.0;
      // Scanline effect
      float scanline = sin(vUv.y * 800.0) * 0.5 + 0.5;
      scanline = pow(scanline, 0.5) * 0.3 + 0.7;
      // Combine: cyan base with edge glow
      luminance = luminance * scanline;
      color = vec3(luminance * 0.3, luminance * 0.8, luminance) + vec3(0.0, edge * 0.3, edge * 0.4);
    }

    // ==========================================================================
    // FINAL OUTPUT
    // ==========================================================================

    gl_FragColor = vec4(color, 1.0);

    // Three.js color management
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
