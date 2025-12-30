# Earth Shaders

A Three.js Earth visualization with custom GLSL shaders, featuring GPU-based tracking icons for ships, aircraft, and satellites.

## Features

- Custom Earth shaders with day/night cycle, atmosphere, clouds, and ocean specular
- GPU-instanced tracking icons (supports 500K+ units)
- Orbital mechanics simulation for satellites
- SpaceX-inspired minimal UI with telemetry overlay
- Multiple texture presets and real-time color modes

## Getting Started

```bash
bun install
bun dev
```

## Texture Presets

| Preset | Description |
|--------|-------------|
| **Standard** | Default Earth textures |
| **Black Marble (NASA)** | 8K city lights imagery - great for night views |
| **Blue Marble (NASA)** | True color satellite imagery |
| **Topo + Bathymetry** | Elevation + ocean depth - tactical look |

## Color Modes

Real-time shader effects that work with any texture preset:

| Mode | Look |
|------|------|
| **Normal** | Standard colors |
| **Grayscale (Tactical)** | Desaturated military ops look |
| **Night Vision** | Green phosphor with brightness boost |
| **Thermal** | False color heat map (blue → purple → red → orange → yellow) |
| **Hologram** | Cyan/blue sci-fi with scanlines and edge glow |

## Best Combos for Military/Futuristic Aesthetics

| Combination | Effect |
|-------------|--------|
| Black Marble + Night Vision | Alien surveillance |
| Topo + Grayscale | Classic tactical ops |
| Standard + Thermal | Heat signature reconnaissance |
| Any + Hologram | Sci-fi command center |

## Adding Custom Textures

1. Add your texture files to `static/earth/`
2. Edit `texturePresets` in `src/script.js`:

```javascript
"My Custom Preset": {
  day: "/earth/my_day_texture.jpg",
  night: "/earth/my_night_texture.jpg",
  specularClouds: "/earth/specularClouds.jpg",
  description: "My custom Earth textures",
},
```

## Controls

- **Left click + drag**: Rotate globe
- **Scroll**: Zoom in/out
- **Right click + drag**: Pan

## Unit Types

| Type | Color | Description |
|------|-------|-------------|
| Ships | Teal | Maritime vessels at sea level |
| Aircraft | Amber | Aircraft at flight altitude |
| Satellites | Violet | Orbital objects (LEO/MEO/GEO) |

## License

MIT
