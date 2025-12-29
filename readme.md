# Earth Shaders

A Three.js-based 3D Earth visualization project featuring custom GLSL shaders, interactive camera controls, and a foundation for advanced rendering effects.

## Overview

This project renders an interactive, rotating Earth sphere in WebGL. It serves as a foundation for shader-based Earth rendering and demonstrates real-time 3D graphics with custom shader implementation.

### Features

- Custom GLSL vertex and fragment shaders
- Interactive camera controls (rotate, zoom, pan)
- Debug GUI for parameter adjustment
- Responsive fullscreen rendering
- Frame-independent animation

## Setup

Download [Bun](https://bun.sh/) (v1.0 or higher).

```bash
# Install dependencies (only the first time)
bun install

# Run the local server at localhost:5173
bun dev

# Build for production in the dist/ directory
bun run build

# Preview production build
bun run preview
```

## Project Structure

```
38-earth-shaders/
├── src/                          # Application source code
│   ├── script.js                # Main JavaScript application logic
│   ├── index.html               # HTML entry point
│   ├── style.css                # Global styling
│   └── shaders/                 # GLSL shader files
│       └── earth/
│           ├── vertex.glsl      # Vertex transformations
│           └── fragment.glsl    # Pixel color calculations
├── static/                       # Static assets (served as-is)
│   ├── earth/
│   │   ├── day.jpg              # Daytime Earth texture
│   │   ├── night.jpg            # Nighttime Earth texture
│   │   └── specularClouds.jpg   # Cloud and specular map
│   └── lenses/
│       ├── lensflare0.png       # Lens flare texture
│       └── lensflare1.png       # Lens flare texture
├── package.json                 # Project dependencies and scripts
├── vite.config.js              # Vite build configuration
└── readme.md                    # This file
```

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Bun | 1.0+ | JavaScript runtime and package manager |
| Three.js | 0.182.0 | 3D WebGL rendering |
| Vite | 7.3.0 | Build tool and dev server |
| lil-gui | 0.21.0 | Debug GUI for parameters |
| vite-plugin-glsl | 1.5.5 | GLSL shader imports |
| vite-plugin-restart | 2.0.0 | Dev server auto-restart |

## Architecture

### Main Components

1. **Scene Setup** (`script.js`)
   - Creates Three.js scene, camera, and renderer
   - Sets up OrbitControls for camera interaction
   - Manages responsive window resizing

2. **Earth Mesh**
   - Sphere geometry (radius=2, 64x64 segments)
   - Custom ShaderMaterial with GLSL shaders
   - Rotates continuously on Y-axis

3. **Shaders** (`src/shaders/earth/`)
   - **Vertex shader**: Transforms positions, passes UV/normals to fragment
   - **Fragment shader**: Currently outputs UV debug colors, ready for texturing

4. **Animation Loop**
   - Clock-based timing for frame-independent animation
   - Updates controls, rotates Earth, renders scene

### Data Flow

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Geometry   │───▶│ Vertex Shader │───▶│ Fragment Shader │
│  (Sphere)   │    │  (Positions)  │    │    (Colors)     │
└─────────────┘    └──────────────┘    └─────────────────┘
                          │                      │
                          ▼                      ▼
                   ┌─────────────────────────────────┐
                   │           WebGL Canvas          │
                   └─────────────────────────────────┘
```

### Shader Uniforms

The shaders use Three.js built-in uniforms:

| Uniform | Type | Description |
|---------|------|-------------|
| `modelMatrix` | mat4 | Object to world space transform |
| `viewMatrix` | mat4 | World to camera space transform |
| `projectionMatrix` | mat4 | Camera to clip space transform |
| `cameraPosition` | vec3 | Camera position in world space |

### Varyings (Vertex → Fragment)

| Varying | Type | Description |
|---------|------|-------------|
| `vUv` | vec2 | Texture coordinates (0-1) |
| `vNormal` | vec3 | Surface normal in world space |
| `vPosition` | vec3 | Fragment position in world space |

## Controls

| Input | Action |
|-------|--------|
| Left-click + drag | Rotate camera around Earth |
| Scroll wheel | Zoom in/out |
| Right-click + drag | Pan camera |

## Current State & Future Enhancements

The project is currently a **foundation** ready for extension. The shaders output UV coordinates as colors for debugging, demonstrating that the pipeline works correctly.

### Ready for Implementation

- **Day/night textures**: Blend between day.jpg and night.jpg based on sun position
- **Atmospheric effects**: Fresnel rim lighting for atmosphere glow
- **Specular highlights**: Ocean reflections using specularClouds.jpg
- **Cloud layer**: Animated cloud overlay
- **Lens flares**: Sun lens flare effects using lenses/ textures

### Example Shader Extensions

```glsl
// Sample day texture
uniform sampler2D uDayTexture;
vec3 dayColor = texture2D(uDayTexture, vUv).rgb;

// Fresnel effect for atmosphere
float fresnel = pow(1.0 - dot(normal, -viewDirection), 2.0);
vec3 atmosphereColor = mix(dayColor, vec3(0.3, 0.6, 1.0), fresnel);
```

## Performance Considerations

- Pixel ratio capped at 2x to reduce GPU load on high-DPI displays
- 64x64 sphere segments balance visual quality vs. vertex count
- Antialiasing enabled for smooth edges
- Damping on controls prevents computation spikes
