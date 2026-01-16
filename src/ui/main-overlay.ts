/**
 * Creates and injects the main SpaceX-style UI overlays into the DOM.
 */
export function createMainOverlay() {
  // Main overlay container
  const overlay = document.createElement("div");
  overlay.id = "spacex-overlay";
  overlay.innerHTML = `
    <!-- Viewport border -->
    <div id="viewport-border"></div>

    <!-- Crosshair/reticle at center -->
    <div id="crosshair">
      <div class="crosshair-h"></div>
      <div class="crosshair-v"></div>
      <div class="crosshair-circle"></div>
    </div>

    <!-- LIVE indicator top-left -->
    <div id="live-indicator">
      <span class="live-dot"></span>
      <span class="live-text">LIVE</span>
    </div>

    <!-- Telemetry overlay bottom-left -->
    <div id="telemetry">
      <div class="telemetry-row">
        <span class="telemetry-label">ALT</span>
        <span class="telemetry-value" id="tel-altitude">0.00</span>
        <span class="telemetry-unit">km</span>
      </div>
      <div class="telemetry-row">
        <span class="telemetry-label">LAT</span>
        <span class="telemetry-value" id="tel-lat">0.00°</span>
      </div>
      <div class="telemetry-row">
        <span class="telemetry-label">LON</span>
        <span class="telemetry-value" id="tel-lon">0.00°</span>
      </div>
      <div class="telemetry-row">
        <span class="telemetry-label">UNITS</span>
        <span class="telemetry-value" id="tel-units">0</span>
      </div>
      <div class="telemetry-row">
        <span class="telemetry-label">UTC</span>
        <span class="telemetry-value" id="tel-utc">00:00:00</span>
      </div>
    </div>

    <!-- Mission elapsed time top-center -->
    <div id="mission-time">
      <span class="mission-label">T+</span>
      <span class="mission-value" id="met-value">00:00:00</span>
    </div>

    <!-- Weather legend (bottom-right, above unit info) -->
    <div id="weather-legend" class="hidden">
      <div class="legend-header">
        <span class="legend-title" id="legend-title">PRECIPITATION</span>
      </div>
      <div class="legend-bar" id="legend-bar"></div>
      <div class="legend-labels" id="legend-labels">
        <span>LOW</span>
        <span>HIGH</span>
      </div>
    </div>

    <!-- Selected unit info panel (bottom-right) -->
    <div id="unit-info" class="hidden">
      <div class="unit-info-header">
        <span class="unit-info-type" id="unit-type">AIRCRAFT</span>
        <span class="unit-info-id" id="unit-id">#0000</span>
        <button class="unit-info-close" id="unit-close">×</button>
      </div>
      <div class="unit-info-body">
        <div class="unit-info-row">
          <span class="unit-info-label" id="unit-label-1">LAT</span>
          <span class="unit-info-value" id="unit-lat">0.00°</span>
        </div>
        <div class="unit-info-row">
          <span class="unit-info-label" id="unit-label-2">LON</span>
          <span class="unit-info-value" id="unit-lon">0.00°</span>
        </div>
        <div class="unit-info-row">
          <span class="unit-info-label" id="unit-label-3">HDG</span>
          <span class="unit-info-value" id="unit-hdg">000°</span>
        </div>
        <div class="unit-info-row">
          <span class="unit-info-label" id="unit-label-4">SPD</span>
          <span class="unit-info-value" id="unit-spd">0 kts</span>
        </div>
        <div class="unit-info-row">
          <span class="unit-info-label" id="unit-label-5">ALT</span>
          <span class="unit-info-value" id="unit-alt">0 ft</span>
        </div>
      </div>
    </div>

    <!-- Drone video feed panel -->
    <div id="drone-feed" class="hidden">
      <div class="drone-feed-header">
        <span class="drone-feed-title">LIVE FEED</span>
        <span class="drone-feed-status">● REC</span>
      </div>
      <div class="drone-feed-video">
        <video id="drone-video" autoplay loop muted playsinline>
          <source src="./earth/UAV_recon_low.mp4" type="video/mp4">
        </video>
        <div class="drone-feed-overlay">
          <div class="drone-feed-coords" id="drone-feed-coords">TGT: 00.0000° 00.0000°</div>
        </div>
      </div>
      <div class="drone-feed-footer">
        <span class="drone-feed-mode">IR/EO</span>
        <span class="drone-feed-zoom">4.0x</span>
      </div>
    </div>
  `;

  // Overlay styles are now in src/styles/overlays.css
  document.body.appendChild(overlay);
}
