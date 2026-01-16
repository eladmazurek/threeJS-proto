/**
 * Weather Overlay
 *
 * Procedural weather visualization with multiple layer types:
 * precipitation, temperature, wind, and pressure.
 */

import * as THREE from "three";
import { EARTH_RADIUS } from "../constants";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Weather overlay altitude above Earth surface */
export const WEATHER_ALTITUDE = 0.006;

/** Weather parameters (GUI-controlled) */
export const weatherParams = {
  enabled: false,
  layer: 'precipitation' as keyof typeof WEATHER_LAYER_TYPES,
  opacity: 0.6,
  animate: true,
};

// =============================================================================
// WEATHER LAYER DEFINITIONS
// =============================================================================

/** Weather layer type enum */
export const WEATHER_LAYER_TYPES = {
  precipitation: 0,
  temperature: 1,
  wind: 2,
  pressure: 3,
} as const;

export type WeatherLayerName = keyof typeof WEATHER_LAYER_TYPES;

/** Weather layer metadata */
export interface WeatherLayerInfo {
  name: string;
  layer: string;
  color: THREE.Color;
  description: string;
  url?: string;
}

/** Available weather layers (NASA GIBS metadata) */
export const WEATHER_LAYERS: Record<string, WeatherLayerInfo> = {
  clouds: {
    name: "Cloud Cover",
    url: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
    layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    color: new THREE.Color(0xffffff),
    description: "Satellite cloud imagery",
  },
  precipitation: {
    name: "Precipitation",
    layer: "IMERG_Precipitation_Rate",
    color: new THREE.Color(0x00aaff),
    description: "Global precipitation rate",
  },
  temperature: {
    name: "Temperature",
    layer: "MODIS_Terra_Land_Surface_Temp_Day",
    color: new THREE.Color(0xff6600),
    description: "Land surface temperature",
  },
  wind: {
    name: "Wind Speed",
    layer: "MERRA2_Wind_Speed_50m",
    color: new THREE.Color(0x00ff88),
    description: "Wind speed at 50m",
  },
};

// =============================================================================
// WEATHER SHADERS
// =============================================================================

/** Weather overlay vertex shader */
const WEATHER_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Weather overlay fragment shader - procedural weather patterns */
const WEATHER_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uTime;
  uniform vec3 uColor;
  uniform int uLayerType; // 0=precipitation, 1=temperature, 2=wind, 3=pressure
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vNormal;

  // Simplex noise for procedural weather patterns
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    // Convert UV to 3D position for seamless noise
    float theta = vUv.x * 6.28318;
    float phi = vUv.y * 3.14159;
    vec3 pos = vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));

    float pattern = 0.0;
    vec3 color = uColor;

    if (uLayerType == 0) {
      // REALISTIC PRECIPITATION with organic blob shapes
      vec3 drift = vec3(uTime * 0.001, 0.0, uTime * 0.0008);

      float latitude = asin(pos.y) / 1.5708;
      float longitude = atan(pos.z, pos.x);

      // === DOMAIN WARPING for organic shapes ===
      vec3 warpPos1 = pos * 2.0 + drift * 0.5;
      float warpX = snoise(warpPos1) * 0.15;
      float warpY = snoise(warpPos1 + vec3(43.0, 17.0, 91.0)) * 0.15;
      float warpZ = snoise(warpPos1 + vec3(71.0, 23.0, 37.0)) * 0.15;
      vec3 warpedPos = pos + vec3(warpX, warpY, warpZ);

      // Second level of warping for more complexity
      vec3 warpPos2 = warpedPos * 4.0 + drift;
      float warp2X = snoise(warpPos2) * 0.06;
      float warp2Y = snoise(warpPos2 + vec3(31.0, 67.0, 13.0)) * 0.06;
      float warp2Z = snoise(warpPos2 + vec3(89.0, 41.0, 59.0)) * 0.06;
      warpedPos = warpedPos + vec3(warp2X, warp2Y, warp2Z);

      // === CLIMATE ZONES ===
      float itcz = exp(-pow(latitude * 10.0, 2.0));
      float midLat = exp(-pow((abs(latitude) - 0.45) * 5.0, 2.0));
      float subtropicalDry = exp(-pow((abs(latitude) - 0.25) * 5.0, 2.0));
      float polarDry = smoothstep(0.7, 0.9, abs(latitude));

      float climateMask = itcz * 1.0 + midLat * 0.85;
      climateMask = climateMask * (1.0 - subtropicalDry * 0.4) * (1.0 - polarDry * 0.5);
      climateMask = clamp(climateMask, 0.08, 1.0);

      // === MULTI-OCTAVE NOISE for natural variation ===
      float n1 = snoise(warpedPos * 1.5 + drift) * 0.5;
      float n2 = snoise(warpedPos * 3.0 + drift * 1.3) * 0.3;
      float n3 = snoise(warpedPos * 6.0 + drift * 1.6) * 0.15;
      float n4 = snoise(warpedPos * 12.0 + drift * 2.0) * 0.05;

      float combinedNoise = n1 + n2 + n3 + n4;

      // Elongated frontal systems
      vec3 stretchedPos = vec3(warpedPos.x * 0.7, warpedPos.y * 1.8, warpedPos.z * 0.7);
      float frontalNoise = snoise(stretchedPos * 2.0 + drift * 0.8) * 0.4;

      // Combine and apply climate mask
      float rawPrecip = (combinedNoise + frontalNoise + 0.3) * climateMask;

      // Soft threshold with gradual falloff
      pattern = smoothstep(0.1, 0.55, rawPrecip);
      pattern = pow(pattern, 1.4);

      // === INTENSITY VARIATION within storms ===
      vec3 corePos = warpedPos * 8.0 + drift * 2.0;
      float coreDetail = snoise(corePos) * 0.5 + 0.5;
      float centerBoost = coreDetail * pattern * pattern * 0.5;
      pattern = pattern + centerBoost;

      // Rare intense cores
      float intenseCore = snoise(warpedPos * 15.0 + drift * 3.0);
      intenseCore = smoothstep(0.6, 0.9, intenseCore) * step(0.3, pattern);
      pattern = pattern + intenseCore * 0.25;

      pattern = clamp(pattern, 0.0, 1.0);

      // === COLOR SCALE with smooth gradients ===
      if (pattern < 0.2) {
        color = mix(vec3(0.1, 0.35, 0.55), vec3(0.0, 0.6, 0.65), pattern / 0.2);
      } else if (pattern < 0.4) {
        color = mix(vec3(0.0, 0.6, 0.65), vec3(0.2, 0.7, 0.15), (pattern - 0.2) / 0.2);
      } else if (pattern < 0.6) {
        color = mix(vec3(0.2, 0.7, 0.15), vec3(0.9, 0.85, 0.1), (pattern - 0.4) / 0.2);
      } else if (pattern < 0.8) {
        color = mix(vec3(0.9, 0.85, 0.1), vec3(1.0, 0.45, 0.0), (pattern - 0.6) / 0.2);
      } else {
        color = mix(vec3(1.0, 0.45, 0.0), vec3(0.8, 0.1, 0.1), (pattern - 0.8) / 0.2);
      }
    }
    else if (uLayerType == 1) {
      // TEMPERATURE MAP - organic swirling patterns
      float latitude = asin(pos.y) / 1.5708;
      float absLat = abs(latitude);

      // === DOMAIN WARPING for organic shapes ===
      vec3 warpPos = pos * 2.0;
      float warpX = snoise(warpPos + vec3(0.0, 50.0, 0.0)) * 0.15;
      float warpY = snoise(warpPos + vec3(50.0, 0.0, 0.0)) * 0.15;
      float warpZ = snoise(warpPos + vec3(0.0, 0.0, 50.0)) * 0.15;
      vec3 warpedPos = pos + vec3(warpX, warpY, warpZ);

      vec3 warp2Pos = warpedPos * 3.0;
      float warp2 = snoise(warp2Pos) * 0.08;
      warpedPos += vec3(warp2);

      // === BASE TEMPERATURE from warped latitude ===
      float warpedLat = asin(clamp(warpedPos.y / length(warpedPos), -1.0, 1.0)) / 1.5708;
      float warpedAbsLat = abs(warpedLat);

      float baseTemp = 1.0 - pow(warpedAbsLat, 1.5);

      // === SWIRLING COLD PATTERNS in polar regions ===
      float polarSwirl = snoise(warpedPos * 4.0) * 0.5 + 0.5;
      float polarMask = smoothstep(0.5, 0.8, absLat);
      baseTemp -= polarSwirl * polarMask * 0.3;

      // === VARIATION ===
      float variation = snoise(warpedPos * 5.0) * 0.1;
      baseTemp += variation * (1.0 - absLat * 0.5);

      pattern = clamp(baseTemp, 0.0, 1.0);

      // === COLOR: Purple (coldest) -> Blue -> Cyan -> Green -> Yellow -> Orange ===
      if (pattern < 0.15) {
        color = mix(vec3(0.95, 0.95, 1.0), vec3(0.6, 0.2, 0.6), pattern / 0.15);
      } else if (pattern < 0.3) {
        color = mix(vec3(0.6, 0.2, 0.6), vec3(0.3, 0.4, 0.8), (pattern - 0.15) / 0.15);
      } else if (pattern < 0.45) {
        color = mix(vec3(0.3, 0.4, 0.8), vec3(0.3, 0.7, 0.75), (pattern - 0.3) / 0.15);
      } else if (pattern < 0.6) {
        color = mix(vec3(0.3, 0.7, 0.75), vec3(0.45, 0.7, 0.3), (pattern - 0.45) / 0.15);
      } else if (pattern < 0.75) {
        color = mix(vec3(0.45, 0.7, 0.3), vec3(0.75, 0.75, 0.25), (pattern - 0.6) / 0.15);
      } else if (pattern < 0.88) {
        color = mix(vec3(0.75, 0.75, 0.25), vec3(0.9, 0.55, 0.2), (pattern - 0.75) / 0.13);
      } else {
        color = mix(vec3(0.9, 0.55, 0.2), vec3(0.85, 0.35, 0.15), (pattern - 0.88) / 0.12);
      }
    }
    else if (uLayerType == 2) {
      // WIND STREAMLINES - flowing curved lines
      float latitude = asin(pos.y) / 1.5708;
      float longitude = atan(pos.z, pos.x);

      // === WIND VECTOR FIELD ===
      vec3 fieldPos = pos * 3.0;

      float fx1 = snoise(fieldPos * 0.5 + vec3(17.0, 0.0, 0.0));
      float fy1 = snoise(fieldPos * 0.5 + vec3(0.0, 31.0, 0.0));
      float fx2 = snoise(fieldPos * 1.5 + vec3(43.0, 0.0, 0.0)) * 0.4;
      float fy2 = snoise(fieldPos * 1.5 + vec3(0.0, 67.0, 0.0)) * 0.4;

      vec2 flowField = vec2(fx1 + fx2, fy1 + fy2);

      // === ADD GLOBAL WIND PATTERNS ===
      float zonalFlow = 1.0;
      if (abs(latitude) < 0.3) zonalFlow = -0.8;
      if (abs(latitude) > 0.65) zonalFlow = -0.5;

      flowField.x += zonalFlow * 0.6;

      // === WIND SPEED ===
      float jetMeander = snoise(vec3(longitude * 2.0, 0.0, uTime * 0.01)) * 0.12;
      float jetStream = exp(-pow((abs(latitude) - 0.4 + jetMeander) * 5.0, 2.0));
      float tradeWinds = smoothstep(0.08, 0.18, abs(latitude)) * (1.0 - smoothstep(0.25, 0.35, abs(latitude))) * 0.4;
      float windSpeed = max(jetStream, tradeWinds);
      windSpeed = max(windSpeed, 0.15);

      // === ADVECT POSITION ALONG FLOW ===
      vec2 uv = vec2(longitude, latitude);
      float time = uTime * 0.5;

      vec2 advectedUV = uv;
      for (int i = 0; i < 3; i++) {
        vec3 samplePos = vec3(cos(advectedUV.x) * cos(advectedUV.y * 1.57),
                              sin(advectedUV.y * 1.57),
                              sin(advectedUV.x) * cos(advectedUV.y * 1.57)) * 3.0;
        float sfx = snoise(samplePos * 0.5 + vec3(17.0, 0.0, 0.0));
        float sfy = snoise(samplePos * 0.5 + vec3(0.0, 31.0, 0.0));
        advectedUV -= vec2(sfx + zonalFlow * 0.6, sfy) * 0.02;
      }

      // === CREATE STREAK PATTERN ===
      float streakScale = 80.0;
      vec2 streakUV = advectedUV * streakScale + time * flowField * 2.0;

      float lineNoise = snoise(vec3(streakUV.x * 0.3, streakUV.y * 2.0, 0.0));
      float lines = sin(streakUV.y + lineNoise * 3.0 + flowField.x * 5.0);
      lines = smoothstep(0.92, 0.98, abs(lines));

      float dashNoise = snoise(vec3(streakUV * 0.5, time * 0.3));
      float dashes = sin(streakUV.x * 2.0 + time * 3.0 + dashNoise * 2.0);
      dashes = smoothstep(0.3, 0.6, dashes);

      pattern = lines * dashes * (0.5 + windSpeed * 0.8);

      // === COLOR by wind speed ===
      vec3 slowColor = vec3(0.3, 0.5, 0.75);
      vec3 medColor = vec3(0.5, 0.75, 0.6);
      vec3 fastColor = vec3(0.9, 0.8, 0.35);
      vec3 jetColor = vec3(0.95, 0.4, 0.6);

      if (windSpeed < 0.3) {
        color = mix(slowColor, medColor, windSpeed / 0.3);
      } else if (windSpeed < 0.6) {
        color = mix(medColor, fastColor, (windSpeed - 0.3) / 0.3);
      } else {
        color = mix(fastColor, jetColor, clamp((windSpeed - 0.6) / 0.4, 0.0, 1.0));
      }

      pattern = clamp(pattern, 0.0, 1.0);
    }
    else if (uLayerType == 3) {
      // PRESSURE MAP - organic blobs
      float latitude = asin(pos.y) / 1.5708;
      float absLat = abs(latitude);

      // === DOMAIN WARPING for organic shapes ===
      vec3 warpPos = pos * 1.5;
      float warpX = snoise(warpPos + vec3(17.0, 0.0, 0.0)) * 0.2;
      float warpY = snoise(warpPos + vec3(0.0, 31.0, 0.0)) * 0.2;
      float warpZ = snoise(warpPos + vec3(0.0, 0.0, 43.0)) * 0.2;
      vec3 warpedPos = pos + vec3(warpX, warpY, warpZ);

      // === BASE PRESSURE FIELD ===
      float p1 = snoise(warpedPos * 2.0) * 0.5;
      float p2 = snoise(warpedPos * 4.0) * 0.3;
      float p3 = snoise(warpedPos * 8.0) * 0.15;
      float pressureField = p1 + p2 + p3;

      // === LOW PRESSURE CENTERS (blue blobs) ===
      float lowNoise = snoise(warpedPos * 2.5 + vec3(100.0, 0.0, 0.0));
      float lowCenters = smoothstep(0.4, 0.7, lowNoise);

      float lowZone = smoothstep(0.2, 0.5, absLat) * (1.0 - smoothstep(0.75, 0.9, absLat));
      lowCenters *= (0.5 + lowZone * 0.8);

      // === HIGH PRESSURE ===
      float highNoise = snoise(warpedPos * 2.0 + vec3(0.0, 100.0, 0.0));
      float highCenters = smoothstep(0.35, 0.65, highNoise);

      float polarHigh = smoothstep(0.6, 0.85, absLat);
      float subtropicalHigh = exp(-pow((absLat - 0.3) * 4.0, 2.0));
      highCenters *= (polarHigh * 0.9 + subtropicalHigh * 0.6 + 0.2);

      // === COMBINE INTO PRESSURE VALUE ===
      float pressure = 0.5 + pressureField * 0.2;
      pressure -= lowCenters * 0.4;
      pressure += highCenters * 0.35;
      pressure = clamp(pressure, 0.0, 1.0);

      pattern = 1.0;

      // === COLOR: Blue (low) -> Green -> Yellow (normal) -> Orange -> Red (high) ===
      if (pressure < 0.25) {
        color = mix(vec3(0.1, 0.2, 0.6), vec3(0.2, 0.4, 0.8), pressure / 0.25);
      } else if (pressure < 0.4) {
        color = mix(vec3(0.2, 0.4, 0.8), vec3(0.3, 0.7, 0.5), (pressure - 0.25) / 0.15);
      } else if (pressure < 0.6) {
        color = mix(vec3(0.3, 0.7, 0.5), vec3(0.85, 0.85, 0.3), (pressure - 0.4) / 0.2);
      } else if (pressure < 0.75) {
        color = mix(vec3(0.85, 0.85, 0.3), vec3(0.9, 0.55, 0.2), (pressure - 0.6) / 0.15);
      } else {
        color = mix(vec3(0.9, 0.55, 0.2), vec3(0.8, 0.25, 0.15), (pressure - 0.75) / 0.25);
      }
    }

    // Subtle day/night shading
    float daylight = dot(vNormal, uSunDirection) * 0.15 + 0.85;
    color *= daylight;

    float alpha = pattern * uOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

// =============================================================================
// WEATHER MESH
// =============================================================================

/** Weather mesh references */
export interface WeatherMeshRefs {
  geometry: THREE.SphereGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
}

/**
 * Create the weather overlay mesh.
 */
export function createWeatherOverlay(
  sunDirection: THREE.Vector3,
  opacity: number = 0.6
): WeatherMeshRefs {
  const geometry = new THREE.SphereGeometry(
    EARTH_RADIUS + WEATHER_ALTITUDE,
    64,
    64
  );

  const material = new THREE.ShaderMaterial({
    vertexShader: WEATHER_VERTEX_SHADER,
    fragmentShader: WEATHER_FRAGMENT_SHADER,
    uniforms: {
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffffff) },
      uLayerType: { value: 0 },
      uSunDirection: { value: sunDirection.clone().normalize() },
    },
    transparent: true,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1.2; // Below clouds but above surface
  mesh.visible = false; // Start hidden

  return { geometry, material, mesh };
}

/**
 * Set the weather layer type on a material.
 */
export function setWeatherLayerOnMaterial(
  material: THREE.ShaderMaterial,
  layerName: WeatherLayerName
): void {
  material.uniforms.uLayerType.value = WEATHER_LAYER_TYPES[layerName] || 0;
}

/**
 * Update weather animation time.
 */
export function updateWeatherTime(
  material: THREE.ShaderMaterial,
  time: number
): void {
  material.uniforms.uTime.value = time;
}

/**
 * Set weather opacity.
 */
export function setWeatherOpacity(
  material: THREE.ShaderMaterial,
  opacity: number
): void {
  material.uniforms.uOpacity.value = opacity;
}

/**
 * Sync weather sun direction.
 */
export function syncWeatherSun(
  material: THREE.ShaderMaterial,
  sunDirection: THREE.Vector3
): void {
  material.uniforms.uSunDirection.value = sunDirection.clone().normalize();
}

// =============================================================================
// ALIASES FOR BACKWARD COMPATIBILITY
// =============================================================================

// Store material reference for simplified setWeatherLayer
let _weatherMaterial: THREE.ShaderMaterial | null = null;

/** Alias for createWeatherOverlay with default sun direction */
export function createWeather(): WeatherMeshRefs {
  const refs = createWeatherOverlay(new THREE.Vector3(1, 1, 0), weatherParams.opacity);
  _weatherMaterial = refs.material;
  return refs;
}

/**
 * Simplified setWeatherLayer that takes just the layer name.
 * Uses internal material reference set by createWeather.
 */
export function setWeatherLayer(layerName: string): void {
  if (_weatherMaterial) {
    _weatherMaterial.uniforms.uLayerType.value = WEATHER_LAYER_TYPES[layerName as keyof typeof WEATHER_LAYER_TYPES] || 0;
  }
  weatherParams.layer = layerName as keyof typeof WEATHER_LAYER_TYPES;
}
