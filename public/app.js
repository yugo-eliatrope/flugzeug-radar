// CONFIGURATION
// ============================================
// To switch between 2D (Leaflet) and 3D (Cesium) maps,
// change the MAP_TYPE constant below:
//   - 'leaflet' for 2D map visualization
//   - 'cesium' for 3D globe visualization
// Both implementations share the same interface and work identically
// with the rest of the application.
// ============================================

// ============================================
// Observable Value - реактивное значение
// ============================================
class ObservableValue {
  constructor(initialValue = null) {
    this._value = initialValue;
    this._listeners = new Set();
  }

  get value() {
    return this._value;
  }

  set value(newValue) {
    const oldValue = this._value;
    this._value = newValue;
    if (oldValue !== newValue) {
      this._listeners.forEach(cb => cb(newValue, oldValue));
    }
  }

  subscribe(callback) {
    this._listeners.add(callback);
    callback(this._value, null);
    return () => this._listeners.delete(callback);
  }
}

// ============================================
// Event Bus
// ============================================
class Observable {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) callbacks.forEach(cb => cb(data));
  }
}

// ============================================
// Global State
// ============================================
const STALE_MS = 30_000;

// Configuration: Map implementation ('leaflet' or 'cesium')
// Can be changed dynamically using the switcher in the side panel
let MAP_TYPE = 'cesium'; // Default to 3D globe

const eventBus = new Observable();
const selectedAircraft = new ObservableValue(null);
const wsConnected = new ObservableValue(false);
const aircraftICAOs = new Set();
const aircraftPhotosCache = new Map(); // icao -> { photo, photographer, link } | null
const coverageCache = new Map(); // spotName -> Coverage { spotName, layers: [{ maxHeight, polygon }] }
const colors = ['#00d9ff', '#3fb950', '#d29922'];
let spotLocation = null; // { name, lat, lon }

// ============================================
// Side Panel Web Component
// ============================================
class SidePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.currentDisplayedIcao = null; // Track which ICAO is currently displayed
  }

  connectedCallback() {
    this.render();
    this.setupSubscriptions();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          width: 320px;
          height: 100%;
          background: linear-gradient(180deg, #12171f 0%, #0a0e14 100%);
          border-right: 1px solid #30363d;
          flex-shrink: 0;
        }

        .panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .panel-footer {
          flex-shrink: 0;
        }

        .logo {
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          font-weight: 600;
          color: #00d9ff;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .logo-icon {
          width: 24px;
          height: 24px;
          fill: #00d9ff;
        }

        .section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #6e7681;
          margin-bottom: 12px;
        }

        /* Connection Status (in footer) */
        .connection-status {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(0, 0, 0, 0.3);
          border-top: 1px solid #30363d;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #f85149;
          box-shadow: 0 0 6px #f85149;
          transition: all 0.3s;
        }

        .status-dot.connected {
          background: #3fb950;
          box-shadow: 0 0 6px #3fb950;
        }

        .status-text {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #6e7681;
        }

        /* Select */
        .select-wrapper {
          position: relative;
        }

        select {
          width: 100%;
          padding: 12px 40px 12px 16px;
          background: #1a2029;
          border: 1px solid #30363d;
          border-radius: 8px;
          color: #e6edf3;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          cursor: pointer;
          appearance: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        select:hover {
          border-color: #00d9ff;
        }

        select:focus {
          outline: none;
          border-color: #00d9ff;
          box-shadow: 0 0 0 3px rgba(0, 217, 255, 0.15);
        }

        select option {
          background: #1a2029;
          color: #e6edf3;
        }

        .select-arrow {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: #6e7681;
        }

        /* Aircraft Info Card */
        .aircraft-card {
          background: #1a2029;
          border: 1px solid #30363d;
          border-radius: 12px;
          overflow: hidden;
        }

        .aircraft-card.empty {
          padding: 32px 20px;
          text-align: center;
          color: #6e7681;
          font-size: 13px;
        }

        .card-header {
          background: linear-gradient(135deg, rgba(0, 217, 255, 0.1) 0%, rgba(0, 217, 255, 0.02) 100%);
          padding: 16px 20px;
          border-bottom: 1px solid #30363d;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-icao {
          font-family: 'JetBrains Mono', monospace;
          font-size: 18px;
          font-weight: 600;
          color: #00d9ff;
        }

        .card-flight {
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          color: #8b949e;
        }

        .reset-btn {
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid #30363d;
          border-radius: 6px;
          color: #8b949e;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .reset-btn:hover {
          background: rgba(248, 81, 73, 0.1);
          border-color: #f85149;
          color: #f85149;
        }

        .focus-btn {
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid #30363d;
          border-radius: 6px;
          color: #8b949e;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          margin-left: 8px;
        }

        .focus-btn:hover {
          background: rgba(0, 217, 255, 0.1);
          border-color: #00d9ff;
          color: #00d9ff;
        }

        .focus-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .focus-btn:disabled:hover {
          background: transparent;
          border-color: #30363d;
          color: #8b949e;
        }

        .card-body {
          padding: 16px 20px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid rgba(48, 54, 61, 0.5);
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-label {
          font-size: 12px;
          color: #6e7681;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: #e6edf3;
        }

        .info-value.highlight {
          color: #00d9ff;
        }

        /* Aircraft Photo */
        .aircraft-photo {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 10;
          background: #0a0e14;
          overflow: hidden;
        }

        .aircraft-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: opacity 0.3s;
        }

        .aircraft-photo.loading::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 24px;
          height: 24px;
          margin: -12px 0 0 -12px;
          border: 2px solid #30363d;
          border-top-color: #00d9ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .aircraft-photo .no-photo {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #6e7681;
          font-size: 12px;
          gap: 8px;
        }

        .aircraft-photo .no-photo svg {
          width: 32px;
          height: 32px;
          opacity: 0.5;
        }

        .photo-credit {
          font-size: 10px;
          color: #6e7681;
          padding: 6px 12px;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid #30363d;
        }

        .photo-credit a {
          color: #00d9ff;
          text-decoration: none;
        }

        .photo-credit a:hover {
          text-decoration: underline;
        }

        /* Stats footer */
        .stats {
          margin-top: auto;
          padding: 16px 20px;
          background: #0a0e14;
          border-top: 1px solid #30363d;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stat {
          text-align: center;
        }

        .stat-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 20px;
          font-weight: 600;
          color: #00d9ff;
        }

        .stat-label {
          font-size: 10px;
          color: #6e7681;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 4px;
        }

        /* Coverage button */
        .coverage-btn {
          width: 40px;
          height: 40px;
          background: #1a2029;
          border: 1px solid #30363d;
          border-radius: 8px;
          color: #8b949e;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .coverage-btn:hover {
          background: rgba(0, 217, 255, 0.1);
          border-color: #00d9ff;
          color: #00d9ff;
        }

        .coverage-btn.active {
          background: rgba(0, 217, 255, 0.15);
          border-color: #00d9ff;
          color: #00d9ff;
        }

        .coverage-btn svg {
          width: 20px;
          height: 20px;
        }

        /* Map Switcher */
        .map-switcher {
          padding: 12px 20px;
          background: #0a0e14;
          border-top: 1px solid #30363d;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .map-switcher-label {
          font-size: 11px;
          color: #6e7681;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          flex-shrink: 0;
        }

        .map-switcher-buttons {
          display: flex;
          gap: 8px;
          flex: 1;
        }

        .map-btn {
          flex: 1;
          padding: 8px 12px;
          background: #1a2029;
          border: 1px solid #30363d;
          border-radius: 6px;
          color: #8b949e;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .map-btn:hover {
          background: #242b36;
          border-color: #00d9ff;
          color: #00d9ff;
        }

        .map-btn.active {
          background: rgba(0, 217, 255, 0.1);
          border-color: #00d9ff;
          color: #00d9ff;
          font-weight: 600;
        }

        .map-btn svg {
          width: 14px;
          height: 14px;
        }

        /* Scrollbar */
        .panel-content::-webkit-scrollbar {
          width: 6px;
        }

        .panel-content::-webkit-scrollbar-track {
          background: transparent;
        }

        .panel-content::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 3px;
        }

        .panel-content::-webkit-scrollbar-thumb:hover {
          background: #484f58;
        }
      </style>

      <div class="panel-content">
        <div class="logo">
          <svg class="logo-icon" viewBox="0 -0.5 25 25" xmlns="http://www.w3.org/2000/svg">
            <path d="m24.794 16.522-.281-2.748-10.191-5.131s.091-1.742 0-4.31c-.109-1.68-.786-3.184-1.839-4.339l.005.006h-.182c-1.048 1.15-1.726 2.653-1.834 4.312l-.001.021c-.091 2.567 0 4.31 0 4.31l-10.19 5.131-.281 2.748 6.889-2.074 3.491-.582c-.02.361-.031.783-.031 1.208 0 2.051.266 4.041.764 5.935l-.036-.162-2.728 1.095v1.798l3.52-.8c.155.312.3.566.456.812l-.021-.035v.282c.032-.046.062-.096.093-.143.032.046.061.096.094.143v-.282c.135-.21.28-.464.412-.726l.023-.051 3.52.8v-1.798l-2.728-1.095c.463-1.733.728-3.723.728-5.774 0-.425-.011-.847-.034-1.266l.003.058 3.492.582 6.888 2.074z"/>
          </svg>
          Flugzeug Radar
        </div>

        <div class="section">
          <div class="section-title">Flugzeug auswählen</div>
          <div class="select-wrapper">
            <select id="icao-select">
              <option value="">— ICAO wählen —</option>
            </select>
            <span class="select-arrow">▼</span>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Flugzeugdaten</div>
          <div class="aircraft-card empty" id="aircraft-card">
            Wählen Sie ein Flugzeug aus
          </div>
        </div>
      </div>

      <div class="panel-footer">
        <div class="stats">
          <div class="stat">
            <div class="stat-value" id="total-aircraft">0</div>
            <div class="stat-label">Live</div>
          </div>
          <button class="coverage-btn" id="coverage-btn" title="Radarabdeckung anzeigen" style="display: none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <circle cx="12" cy="12" r="6"></circle>
              <circle cx="12" cy="12" r="2"></circle>
            </svg>
          </button>
          <div class="stat">
            <div class="stat-value" id="total-history">0</div>
            <div class="stat-label">Im Verlauf</div>
          </div>
        </div>
        <div class="map-switcher">
          <span class="map-switcher-label">Ansicht</span>
          <div class="map-switcher-buttons">
            <button class="map-btn" id="map-btn-leaflet" title="2D Karte">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
              <span>2D</span>
            </button>
            <button class="map-btn active" id="map-btn-cesium" title="3D Globus">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>3D</span>
            </button>
          </div>
        </div>
        <div class="connection-status">
          <div class="status-dot" id="status-dot"></div>
          <span class="status-text" id="status-text">Verbinden...</span>
        </div>
      </div>
    `;

    this.icaoSelect = this.shadowRoot.getElementById('icao-select');
    this.aircraftCard = this.shadowRoot.getElementById('aircraft-card');
    this.statusDot = this.shadowRoot.getElementById('status-dot');
    this.statusText = this.shadowRoot.getElementById('status-text');
    this.totalAircraft = this.shadowRoot.getElementById('total-aircraft');
    this.totalHistory = this.shadowRoot.getElementById('total-history');
    this.mapBtnLeaflet = this.shadowRoot.getElementById('map-btn-leaflet');
    this.mapBtnCesium = this.shadowRoot.getElementById('map-btn-cesium');
    this.coverageBtn = this.shadowRoot.getElementById('coverage-btn');

    this.icaoSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      selectedAircraft.value = value || null;
    });

    // Map switcher button handlers
    this.mapBtnLeaflet.addEventListener('click', () => {
      switchMapType('leaflet');
    });

    this.mapBtnCesium.addEventListener('click', () => {
      switchMapType('cesium');
    });

    // Coverage button handler
    this.coverageBtn.addEventListener('click', () => {
      toggleRadarCoverage();
    });

    // Update active state based on current map type
    eventBus.on('map-type-changed', (type) => {
      this.mapBtnLeaflet.classList.toggle('active', type === 'leaflet');
      this.mapBtnCesium.classList.toggle('active', type === 'cesium');
      // Show coverage button only in 2D (leaflet) mode
      this.coverageBtn.style.display = type === 'leaflet' ? 'flex' : 'none';
    });
  }

  setupSubscriptions() {
    wsConnected.subscribe((connected) => {
      this.statusDot.classList.toggle('connected', connected);
      this.statusText.textContent = connected ? 'Verbunden' : 'Getrennt';
    });

    selectedAircraft.subscribe((icao) => {
      this.icaoSelect.value = icao || '';
      this.updateAircraftCard(icao);
    });

    eventBus.on('initialState', (payload) => {
      setTimeout(() => {
        this.updateIcaoList();
        this.totalHistory.textContent = aircraftICAOs.size;
      }, 0);
    });

    eventBus.on('aircrafts', () => {
      this.totalAircraft.textContent = mapAdapter.getAllAircraft().size;
      // Update card if selected aircraft data changed
      if (selectedAircraft.value) {
        this.updateAircraftCard(selectedAircraft.value);
      }
    });
  }

  updateIcaoList() {
    const currentValue = this.icaoSelect.value;
    const icaos = [...aircraftICAOs.keys()].sort();

    this.icaoSelect.innerHTML = '<option value="">— ICAO wählen —</option>';
    for (const icao of icaos) {
      const opt = document.createElement('option');
      opt.value = icao;
      opt.textContent = icao.toUpperCase();
      this.icaoSelect.appendChild(opt);
    }

    if (currentValue && icaos.includes(currentValue)) {
      this.icaoSelect.value = currentValue;
    }
  }

  updateAircraftCard(icao) {
    if (!icao) {
      this.currentDisplayedIcao = null;
      this.aircraftCard.className = 'aircraft-card empty';
      this.aircraftCard.innerHTML = 'Wählen Sie ein Flugzeug aus';
      return;
    }

    const planeData = mapAdapter.getAllAircraft().get(icao);
    const rec = planeData?.record || {};
    const icaoChanged = this.currentDisplayedIcao !== icao;

    // Only rebuild full card if ICAO changed
    if (icaoChanged) {
      this.currentDisplayedIcao = icao;
      this.aircraftCard.className = 'aircraft-card';
      this.aircraftCard.innerHTML = `
        <div class="aircraft-photo loading" id="aircraft-photo"></div>
        <div class="photo-credit" id="photo-credit" style="display: none;"></div>
        <div class="card-header">
          <div>
            <div class="card-icao">${escapeHtml(icao.toUpperCase())}</div>
            <div class="card-flight" id="card-flight">${rec.flight?.trim() || '—'}</div>
          </div>
          <div style="display: flex; align-items: center;">
            <button class="focus-btn" id="focus-btn" title="Auf Flugroute fokussieren">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <button class="reset-btn" id="reset-btn" title="Auswahl aufheben">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="card-body">
          <div class="info-row">
            <span class="info-label">Höhe</span>
            <span class="info-value" id="val-altitude">${rec.altitude != null ? `${Math.round(rec.altitude * 0.3048)} m / ${rec.altitude} ft` : '—'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Geschwindigkeit</span>
            <span class="info-value" id="val-speed">${rec.groundSpeed != null ? `${Math.round(rec.groundSpeed * 1.852)} km/h` : '—'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Kurs</span>
            <span class="info-value" id="val-track">${rec.track != null ? `${rec.track}°` : '—'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Position</span>
            <span class="info-value highlight" id="val-position">${(rec.lat != null && rec.lon != null) ? `${rec.lat.toFixed(4)}, ${rec.lon.toFixed(4)}` : '—'}</span>
          </div>
          <div class="info-row" id="distance-row" style="${spotLocation ? '' : 'display: none;'}">
            <span class="info-label">Entfernung zum Spot</span>
            <span class="info-value" id="val-distance">—</span>
          </div>
          <div class="info-row">
            <span class="info-label">Steig-/Sinkrate</span>
            <span class="info-value" id="val-vrate">${rec.verticalRate != null ? `${rec.verticalRate} ft/min` : '—'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Am Boden</span>
            <span class="info-value" id="val-ground">${rec.isOnGround != null ? (rec.isOnGround ? 'Ja' : 'Nein') : '—'}</span>
          </div>
        </div>
      `;

      const resetBtn = this.aircraftCard.querySelector('#reset-btn');
      resetBtn.addEventListener('click', () => {
        selectedAircraft.value = null;
      });

      const focusBtn = this.aircraftCard.querySelector('#focus-btn');
      focusBtn.addEventListener('click', () => {
        focusOnFlightHistory(icao);
      });

      // Fetch aircraft photo only when ICAO changes
      this.renderAircraftPhoto(icao);
      
      // Update distance row visibility
      const distanceRow = this.aircraftCard.querySelector('#distance-row');
      if (distanceRow) {
        distanceRow.style.display = spotLocation ? '' : 'none';
      }
    } else {
      // Just update the values without rebuilding the entire card
      const updateEl = (id, value) => {
        const el = this.aircraftCard.querySelector(`#${id}`);
        if (el) el.textContent = value;
      };

      updateEl('card-flight', rec.flight?.trim() || '—');
      updateEl('val-altitude', rec.altitude != null ? `${Math.round(rec.altitude * 0.3048)} m / ${rec.altitude} ft` : '—');
      updateEl('val-speed', rec.groundSpeed != null ? `${Math.round(rec.groundSpeed * 1.852)} km/h` : '—');
      updateEl('val-track', rec.track != null ? `${rec.track}°` : '—');
      updateEl('val-position', (rec.lat != null && rec.lon != null) ? `${rec.lat.toFixed(4)}, ${rec.lon.toFixed(4)}` : '—');
      updateEl('val-vrate', rec.verticalRate != null ? `${rec.verticalRate} ft/min` : '—');
      updateEl('val-ground', rec.isOnGround != null ? (rec.isOnGround ? 'Ja' : 'Nein') : '—');
      
      // Update distance row visibility
      const distanceRow = this.aircraftCard.querySelector('#distance-row');
      if (distanceRow) {
        distanceRow.style.display = spotLocation ? '' : 'none';
      }
    }
    
    // Calculate and update distance if spot location is available
    if (spotLocation && rec.lat != null && rec.lon != null) {
      const distance = calculateDistance(spotLocation.lat, spotLocation.lon, rec.lat, rec.lon);
      const distanceEl = this.aircraftCard.querySelector('#val-distance');
      if (distanceEl) {
        distanceEl.textContent = `${distance.toFixed(2)} km`;
      }
    }
  }

  async renderAircraftPhoto(icao) {
    const photoContainer = this.shadowRoot.getElementById('aircraft-photo');
    const creditContainer = this.shadowRoot.getElementById('photo-credit');

    if (!photoContainer) return;

    // Check cache first
    if (aircraftPhotosCache.has(icao)) {
      const cached = aircraftPhotosCache.get(icao);
      photoContainer.classList.remove('loading');

      if (cached) {
        photoContainer.innerHTML = `<img src="${cached.imgSrc}" alt="Flugzeugfoto" />`;
        if (cached.photographer || cached.link) {
          creditContainer.style.display = 'block';
          creditContainer.innerHTML = `
            📷 ${cached.photographer ? escapeHtml(cached.photographer) : 'Unbekannt'}
            ${cached.link ? `· <a href="${cached.link}" target="_blank" rel="noopener">Auf Planespotters ansehen</a>` : ''}
          `;
        }
      } else {
        this.showNoPhoto(photoContainer);
      }
      return;
    }

    // Fetch from API
    try {
      const response = await fetch(`https://api.planespotters.net/pub/photos/hex/${icao.toLowerCase()}`);
      const data = await response.json();

      // Check if we're still displaying the same aircraft
      if (this.currentDisplayedIcao !== icao) return;

      photoContainer.classList.remove('loading');

      if (data.photos && data.photos.length > 0) {
        const photo = data.photos[0];
        const imgSrc = photo.thumbnail_large?.src || photo.thumbnail?.src;

        if (imgSrc) {
          // Cache the result
          aircraftPhotosCache.set(icao, {
            imgSrc,
            photographer: photo.photographer,
            link: photo.link
          });

          photoContainer.innerHTML = `<img src="${imgSrc}" alt="Flugzeugfoto" />`;

          if (photo.photographer || photo.link) {
            creditContainer.style.display = 'block';
            creditContainer.innerHTML = `
              📷 ${photo.photographer ? escapeHtml(photo.photographer) : 'Unbekannt'}
              ${photo.link ? `· <a href="${photo.link}" target="_blank" rel="noopener">Auf Planespotters ansehen</a>` : ''}
            `;
          }
        } else {
          aircraftPhotosCache.set(icao, null);
          this.showNoPhoto(photoContainer);
        }
      } else {
        aircraftPhotosCache.set(icao, null);
        this.showNoPhoto(photoContainer);
      }
    } catch (error) {
      console.error('Failed to fetch aircraft photo:', error);
      // Check if we're still displaying the same aircraft
      if (this.currentDisplayedIcao !== icao) return;
      photoContainer.classList.remove('loading');
      this.showNoPhoto(photoContainer);
    }
  }

  showNoPhoto(container) {
    container.innerHTML = `
      <div class="no-photo">
        <svg viewBox="0 -0.5 25 25" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
          <path d="m24.794 16.522-.281-2.748-10.191-5.131s.091-1.742 0-4.31c-.109-1.68-.786-3.184-1.839-4.339l.005.006h-.182c-1.048 1.15-1.726 2.653-1.834 4.312l-.001.021c-.091 2.567 0 4.31 0 4.31l-10.19 5.131-.281 2.748 6.889-2.074 3.491-.582c-.02.361-.031.783-.031 1.208 0 2.051.266 4.041.764 5.935l-.036-.162-2.728 1.095v1.798l3.52-.8c.155.312.3.566.456.812l-.021-.035v.282c.032-.046.062-.096.093-.143.032.046.061.096.094.143v-.282c.135-.21.28-.464.412-.726l.023-.051 3.52.8v-1.798l-2.728-1.095c.463-1.733.728-3.723.728-5.774 0-.425-.011-.847-.034-1.266l.003.058 3.492.582 6.888 2.074z"/>
        </svg>
        <span>Kein Foto verfügbar</span>
      </div>
    `;
  }
}

customElements.define('side-panel', SidePanel);

// ============================================
// Utility Functions
// ============================================
const escapeHtml = (s) => {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
};

// Calculate distance between two points in kilometers (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в километрах
  const dLat = (lat2 - lat1) * Math.PI / 180; // Разница широт (в радианах)
  const dLon = (lon2 - lon1) * Math.PI / 180; // Разница долгот (в радианах)

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Расстояние в километрах
  return distance;
}

// ============================================
// Map Adapter Interface & Implementations
// ============================================

/**
 * Abstract interface for map implementations
 * Both Leaflet and Cesium adapters implement this interface
 */
class MapAdapter {
  constructor(containerId) {
    this.containerId = containerId;
    this.planes = new Map(); // icao -> { entity/marker, lastUpdated, record, groundLine }
  }

  // Abstract methods to be implemented by subclasses
  initialize() { throw new Error('Must implement initialize()'); }
  addOrUpdateAircraft(record) { throw new Error('Must implement addOrUpdateAircraft()'); }
  removeAircraft(icao) { throw new Error('Must implement removeAircraft()'); }
  updateAircraftSelection(icao, isSelected) { throw new Error('Must implement updateAircraftSelection()'); }
  renderFlightHistory(flights) { throw new Error('Must implement renderFlightHistory()'); }
  clearFlightHistory() { throw new Error('Must implement clearFlightHistory()'); }
  focusOnHistory(coords) { throw new Error('Must implement focusOnHistory()'); }
  focusOnAircraft(icao) { throw new Error('Must implement focusOnAircraft()'); }
  cleanup() { throw new Error('Must implement cleanup()'); }
  zoomIn() { throw new Error('Must implement zoomIn()'); }
  zoomOut() { throw new Error('Must implement zoomOut()'); }
  destroy() { throw new Error('Must implement destroy()'); }
  showSpotMarker(spot) { throw new Error('Must implement showSpotMarker()'); }
  removeSpotMarker() { throw new Error('Must implement removeSpotMarker()'); }

  // Common method
  getAllAircraft() {
    return this.planes;
  }
}

// ============================================
// Cesium Map Adapter
// ============================================

class CesiumMapAdapter extends MapAdapter {
  constructor(containerId) {
    super(containerId);
    this.viewer = null;
    this.historyEntities = [];
    this.clickHandler = null;
    this.spotMarker = null;
  }

  initialize() {
    // Disable Cesium Ion token requirement
    Cesium.Ion.defaultAccessToken = undefined;

    // Create viewer with OpenStreetMap imagery
    this.viewer = new Cesium.Viewer(this.containerId, {
      imageryProvider: false, // We'll add it after
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'), // Hide credits
      contextOptions: {
        webgl: {
          antialias: true,
          powerPreference: "high-performance"
        }
      }
    });

    this.viewer.resolutionScale = window.devicePixelRatio;
    this.viewer.scene.postProcessStages.fxaa.enabled = false;
    this.viewer.scene.globe.maximumScreenSpaceError = 1.5;
    this.viewer.scene.globe.enableLighting = true;

    // Add dark theme imagery layer (CartoDB Dark Matter)
    const darkProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c', 'd'],
      credit: '© OpenStreetMap contributors © CARTO',
    });

    this.viewer.imageryLayers.addImageryProvider(darkProvider);
    this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a0e14');

    console.info('CesiumJS: Dark theme imagery provider added');

    this.viewer.scene.globe.tileLoadProgressEvent.addEventListener((queueLength) => {
      if (queueLength === 0) {
        console.info('CesiumJS: All tiles loaded');
      }
    });

    this.viewer.scene.globe.depthTestAgainstTerrain = false;

    // Enable all camera controls
    this.viewer.scene.screenSpaceCameraController.enableRotate = true;
    this.viewer.scene.screenSpaceCameraController.enableTranslate = true;
    this.viewer.scene.screenSpaceCameraController.enableZoom = true;
    this.viewer.scene.screenSpaceCameraController.enableTilt = true;
    this.viewer.scene.screenSpaceCameraController.enableLook = true;

    // Set initial camera position
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(13.405, 52.52, 1000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0
      }
    });

    // Setup click handler for aircraft selection
    this.clickHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.clickHandler.setInputAction((click) => {
      const pickedObject = this.viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        if (entity.id && this.planes.has(entity.id)) {
          selectedAircraft.value = entity.id;
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  addOrUpdateAircraft(rec) {
    if (!rec.icao || rec.lat == null || rec.lon == null) return;

    const key = rec.icao;
    const track = Number.isFinite(rec.track) ? rec.track : 0;
    const altitude = rec.altitude != null ? rec.altitude * 0.3048 : 1000;
    const flight = rec.flight?.trim() || '';
    const isSelected = selectedAircraft.value === key;

    const position = Cesium.Cartesian3.fromDegrees(rec.lon, rec.lat, altitude);

    const existing = this.planes.get(key);
    if (existing) {
      // Update existing entity
      existing.entity.position = position;

      const heading = Cesium.Math.toRadians(track - 90);
      existing.entity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
        position,
        new Cesium.HeadingPitchRoll(heading, 0, 0)
      );

      const groundPosition = Cesium.Cartesian3.fromDegrees(rec.lon, rec.lat, 0);
      if (existing.groundLine) {
        existing.groundLine.polyline.positions = [position, groundPosition];
      }

      if (existing.entity.label) {
        existing.entity.label.text = flight ? flight.toUpperCase() : key.toUpperCase();
      }

      if (existing.entity.model) {
        existing.entity.model.color = isSelected
          ? Cesium.Color.fromCssColorString('#ff6b35')
          : Cesium.Color.fromCssColorString('#00d9ff');
      }

      existing.lastUpdated = Date.now();
      existing.record = rec;
    } else {
      // Create new entity
      const entity = this.viewer.entities.add({
        id: key,
        position: position,
        orientation: Cesium.Transforms.headingPitchRollQuaternion(
          position,
          new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(track - 90), 0, 0)
        ),
        model: {
          uri: '/public/airplane.glb',
          minimumPixelSize: 32,
          maximumScale: 20000,
          scale: 50.0,
          color: isSelected
            ? Cesium.Color.fromCssColorString('#ff6b35')
            : Cesium.Color.fromCssColorString('#00d9ff'),
          colorBlendMode: Cesium.ColorBlendMode.MIX,
          colorBlendAmount: 0.7,
        },
        label: {
          text: flight ? flight.toUpperCase() : key.toUpperCase(),
          font: '12px JetBrains Mono, monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -40),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      const groundPosition = Cesium.Cartesian3.fromDegrees(rec.lon, rec.lat, 0);
      const groundLine = this.viewer.entities.add({
        polyline: {
          positions: [position, groundPosition],
          width: 2,
          material: Cesium.Color.fromCssColorString('#6e7681').withAlpha(0.5),
          depthFailMaterial: Cesium.Color.fromCssColorString('#6e7681').withAlpha(0.2),
        },
      });

      this.planes.set(key, { entity, groundLine, lastUpdated: Date.now(), record: rec });
    }
  }

  removeAircraft(icao) {
    const plane = this.planes.get(icao);
    if (plane) {
      this.viewer.entities.remove(plane.entity);
      if (plane.groundLine) {
        this.viewer.entities.remove(plane.groundLine);
      }
      this.planes.delete(icao);
    }
  }

  updateAircraftSelection(icao, isSelected) {
    const plane = this.planes.get(icao);
    if (plane && plane.entity.model) {
      plane.entity.model.color = isSelected
        ? Cesium.Color.fromCssColorString('#ff6b35')
        : Cesium.Color.fromCssColorString('#00d9ff');
    }
  }

  renderFlightHistory(flights) {
    this.clearFlightHistory();

    for (let i = 0; i < flights.length; i++) {
      this._renderHistoryPath(flights[i].segments, i);
    }
  }

  _renderHistoryPath(coords, colorIndex = 0) {
    if (!Array.isArray(coords) || coords.length < 2) return;

    this._renderLine(coords, '#4a5568');
    const isSmallGap = (t1, t2) => Math.abs(new Date(t1).getTime() - new Date(t2).getTime()) < 60_000;

    let richSegments = [coords[0]];
    for (let i = 1; i < coords.length; ++i) {
      const a = coords[i - 1];
      const b = coords[i];
      if (isSmallGap(a.time, b.time)) {
        if (!richSegments.length) richSegments.push(a);
        richSegments.push(b);
      } else {
        this._renderLine(richSegments, colors[colorIndex % colors.length]);
        richSegments = [];
      }
    }
    if (richSegments.length) this._renderLine(richSegments, colors[colorIndex % colors.length]);
  }

  _renderLine(coords, color) {
    const positionsWithCoords = coords
      .map(c => {
        if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
          const alt = c.altitude != null ? c.altitude * 0.3048 : 1000;
          return {
            position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, alt),
            lat: c.lat,
            lon: c.lon,
            alt: alt
          };
        }
        return null;
      })
      .filter(p => p !== null);

    if (positionsWithCoords.length < 2) return;

    const positions = positionsWithCoords.map(p => p.position);

    // Create the main flight path polyline
    const entity = this.viewer.entities.add({
      polyline: {
        positions: positions,
        width: 3,
        material: Cesium.Color.fromCssColorString(color).withAlpha(0.8),
        clampToGround: false,
      },
    });

    this.historyEntities.push(entity);

    // Add transparent wall from flight path to ground
    this._addPathWall(positionsWithCoords, color);
  }

  _addPathWall(positionsWithCoords, pathColor) {
    if (positionsWithCoords.length < 2) return;

    // Create positions array for the wall (geographic positions with heights)
    const wallPositions = positionsWithCoords.map(p =>
      Cesium.Cartographic.fromDegrees(p.lon, p.lat, p.alt)
    );

    // Create a wall entity that extends from the flight path down to the ground
    const wallEntity = this.viewer.entities.add({
      wall: {
        positions: wallPositions.map(c =>
          Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height)
        ),
        minimumHeights: new Array(wallPositions.length).fill(0), // Ground level
        maximumHeights: wallPositions.map(c => c.height), // Flight path altitude
        material: Cesium.Color.ORANGE.withAlpha(0.15), // Transparent orange
        outline: false,
      },
    });

    this.historyEntities.push(wallEntity);
  }

  clearFlightHistory() {
    for (const entity of this.historyEntities) {
      this.viewer.entities.remove(entity);
    }
    this.historyEntities = [];
  }

  focusOnHistory(coords) {
    if (coords.length > 1) {
      const positions = coords.map(c => {
        const alt = c.alt != null ? c.alt * 0.3048 : 1000;
        return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, alt);
      });

      const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
      this.viewer.camera.flyToBoundingSphere(boundingSphere, {
        duration: 2.0,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), boundingSphere.radius * 3)
      });
    }
  }

  focusOnAircraft(icao) {
    const plane = this.planes.get(icao);
    if (plane && plane.record) {
      const { lat, lon, altitude } = plane.record;
      if (lat != null && lon != null) {
        const alt = altitude != null ? altitude * 0.3048 : 1000;
        this.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt + 50000),
          duration: 2.0,
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0.0
          }
        });
      }
    }
  }

  zoomIn() {
    const distance = this.viewer.camera.getMagnitude();
    this.viewer.camera.zoomIn(distance * 0.25);
  }

  zoomOut() {
    const distance = this.viewer.camera.getMagnitude();
    this.viewer.camera.zoomOut(distance * 0.25);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, obj] of this.planes.entries()) {
      if (now - obj.lastUpdated > STALE_MS) {
        this.removeAircraft(key);
      }
    }
  }

  focusOnFirstAircraft() {
    const planeArray = [...this.planes.values()];
    if (planeArray.length) {
      let totalLat = 0, totalLon = 0, totalAlt = 0;
      for (const p of planeArray) {
        totalLat += p.record.lat || 0;
        totalLon += p.record.lon || 0;
        totalAlt += (p.record.altitude || 0) * 0.3048;
      }
      const avgLat = totalLat / planeArray.length;
      const avgLon = totalLon / planeArray.length;
      const avgAlt = totalAlt / planeArray.length;

      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(avgLon, avgLat, avgAlt + 500000),
        duration: 3.0,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-60),
          roll: 0.0
        }
      });
    }
  }

  // Coverage methods (not supported in 3D mode, stubs for consistency)
  showCoveragePolygon(polygon) {
    // Coverage visualization not supported in 3D mode
  }

  hideCoverage() {
    // Coverage visualization not supported in 3D mode
  }

  hasCoverage() {
    return false;
  }

  setCurrentCoverageSpot(spotName) {
    // Coverage visualization not supported in 3D mode
  }

  getCurrentCoverageSpot() {
    return null;
  }

  showSpotMarker(spot) {
    if (!spot || spot.lat == null || spot.lon == null) return;
    
    // Remove existing spot marker if present
    this.removeSpotMarker();
    
    const position = Cesium.Cartesian3.fromDegrees(spot.lon, spot.lat, 0);
    
    this.spotMarker = this.viewer.entities.add({
      position: position,
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#f85149'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: spot.name || 'Spot',
        font: '12px JetBrains Mono, monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  
  removeSpotMarker() {
    if (this.spotMarker) {
      this.viewer.entities.remove(this.spotMarker);
      this.spotMarker = null;
    }
  }

  destroy() {
    // Clean up all entities
    this.clearFlightHistory();
    this.removeSpotMarker();
    for (const [icao] of this.planes) {
      this.removeAircraft(icao);
    }

    // Destroy click handler
    if (this.clickHandler) {
      this.clickHandler.destroy();
      this.clickHandler = null;
    }

    // Destroy Cesium viewer
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
  }
}

// ============================================
// Leaflet Map Adapter
// ============================================

class LeafletMapAdapter extends MapAdapter {
  constructor(containerId) {
    super(containerId);
    this.map = null;
    this.historyLayers = [];
    this.coverageLayer = null; // Current coverage polygon layer
    this.currentCoverageSpot = null; // Current spot name
    this.spotMarker = null; // Spot location marker
  }

  initialize() {
    this.map = L.map(this.containerId, {
      zoomControl: false
    }).setView([52.52, 13.405], 7);

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // CARTO Dark theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(this.map);

    console.info('Leaflet: Map initialized with dark theme');
  }

  addOrUpdateAircraft(rec) {
    if (!rec.icao || rec.lat == null || rec.lon == null) return;

    const key = rec.icao;
    const latlng = [rec.lat, rec.lon];
    const track = Number.isFinite(rec.track) ? rec.track : 0;
    const flight = rec.flight?.trim() || '';
    const isSelected = selectedAircraft.value === key;

    const existing = this.planes.get(key);
    if (existing) {
      try {
        existing.marker.setLatLng(latlng);
        existing.marker.setIcon(this._createPlaneIcon(track, flight, isSelected));
        existing.lastUpdated = Date.now();
        existing.record = rec;
      } catch (e) {
        console.error('Update marker failed', e);
      }
    } else {
      const icon = this._createPlaneIcon(track, flight, isSelected);
      const marker = L.marker(latlng, { icon }).addTo(this.map);

      marker.on('click', () => {
        selectedAircraft.value = key;
      });

      this.planes.set(key, { marker, lastUpdated: Date.now(), record: rec });
    }
  }

  _createPlaneIcon(track = 0, flight = '', isSelected = false) {
    const svg = `
      <svg viewBox="0 -0.5 25 25" xmlns="http://www.w3.org/2000/svg">
        <path d="m24.794 16.522-.281-2.748-10.191-5.131s.091-1.742 0-4.31c-.109-1.68-.786-3.184-1.839-4.339l.005.006h-.182c-1.048 1.15-1.726 2.653-1.834 4.312l-.001.021c-.091 2.567 0 4.31 0 4.31l-10.19 5.131-.281 2.748 6.889-2.074 3.491-.582c-.02.361-.031.783-.031 1.208 0 2.051.266 4.041.764 5.935l-.036-.162-2.728 1.095v1.798l3.52-.8c.155.312.3.566.456.812l-.021-.035v.282c.032-.046.062-.096.093-.143.032.046.061.096.094.143v-.282c.135-.21.28-.464.412-.726l.023-.051 3.52.8v-1.798l-2.728-1.095c.463-1.733.728-3.723.728-5.774 0-.425-.011-.847-.034-1.266l.003.058 3.492.582 6.888 2.074z"/>
      </svg>
    `;
    const selectedClass = isSelected ? 'selected' : '';
    const color = isSelected ? '#ff6b35' : '#00d9ff';
    const html = `
      <div>
        <div style="transform: rotate(${track}deg); display:flex; flex-direction:column; align-items:center;" class="plane-icon ${selectedClass}">
          <svg viewBox="0 -0.5 25 25" xmlns="http://www.w3.org/2000/svg" style="fill: ${color}; width: 28px; height: 28px; filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));">
            <path d="m24.794 16.522-.281-2.748-10.191-5.131s.091-1.742 0-4.31c-.109-1.68-.786-3.184-1.839-4.339l.005.006h-.182c-1.048 1.15-1.726 2.653-1.834 4.312l-.001.021c-.091 2.567 0 4.31 0 4.31l-10.19 5.131-.281 2.748 6.889-2.074 3.491-.582c-.02.361-.031.783-.031 1.208 0 2.051.266 4.041.764 5.935l-.036-.162-2.728 1.095v1.798l3.52-.8c.155.312.3.566.456.812l-.021-.035v.282c.032-.046.062-.096.093-.143.032.046.061.096.094.143v-.282c.135-.21.28-.464.412-.726l.023-.051 3.52.8v-1.798l-2.728-1.095c.463-1.733.728-3.723.728-5.774 0-.425-.011-.847-.034-1.266l.003.058 3.492.582 6.888 2.074z"/>
          </svg>
        </div>
        ${flight ? `<div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: #e6edf3; background: #12171f; padding: 2px 6px; border-radius: 4px; margin-top: 2px; display: inline-block; border: 1px solid #30363d; white-space: nowrap; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">${escapeHtml(flight)}</div>` : ''}
      </div>
    `;
    return L.divIcon({
      html,
      className: '',
      iconSize: [28, 36],
      iconAnchor: [14, 18],
    });
  }

  removeAircraft(icao) {
    const plane = this.planes.get(icao);
    if (plane) {
      this.map.removeLayer(plane.marker);
      this.planes.delete(icao);
    }
  }

  updateAircraftSelection(icao, isSelected) {
    const plane = this.planes.get(icao);
    if (plane) {
      const rec = plane.record;
      const track = Number.isFinite(rec.track) ? rec.track : 0;
      const flight = rec.flight?.trim() || '';
      plane.marker.setIcon(this._createPlaneIcon(track, flight, isSelected));
    }
  }

  renderFlightHistory(flights) {
    this.clearFlightHistory();

    for (let i = 0; i < flights.length; i++) {
      this._renderHistoryPath(flights[i].segments, i);
    }
  }

  _renderHistoryPath(coords, colorIndex = 0) {
    if (!Array.isArray(coords) || coords.length < 2) return;

    this._renderLine(coords, '#4a5568');
    const isSmallGap = (t1, t2) => Math.abs(new Date(t1).getTime() - new Date(t2).getTime()) < 60_000;

    let richSegments = [coords[0]];
    for (let i = 1; i < coords.length; ++i) {
      const a = coords[i - 1];
      const b = coords[i];
      if (isSmallGap(a.time, b.time)) {
        if (!richSegments.length) richSegments.push(a);
        richSegments.push(b);
      } else {
        this._renderLine(richSegments, colors[colorIndex % colors.length]);
        richSegments = [];
      }
    }
    if (richSegments.length) this._renderLine(richSegments, colors[colorIndex % colors.length]);
  }

  _renderLine(coords, color) {
    const latlngs = coords
      .map(c => (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) ? [c.lat, c.lon] : null)
      .filter(c => c !== null);
    if (latlngs.length < 2) return;

    const line = L.polyline(latlngs, { color, weight: 3, opacity: 0.8 }).addTo(this.map);
    this.historyLayers.push(line);
  }

  clearFlightHistory() {
    for (const layer of this.historyLayers) {
      this.map.removeLayer(layer);
    }
    this.historyLayers = [];
  }

  focusOnHistory(coords) {
    if (coords.length > 1) {
      const latlngs = coords.map(c => [c.lat, c.lon]);
      this.map.fitBounds(latlngs, { padding: [50, 50] });
    }
  }

  focusOnAircraft(icao) {
    const plane = this.planes.get(icao);
    if (plane && plane.record) {
      const { lat, lon } = plane.record;
      if (lat != null && lon != null) {
        this.map.setView([lat, lon], 12);
      }
    }
  }

  zoomIn() {
    this.map.zoomIn();
  }

  zoomOut() {
    this.map.zoomOut();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, obj] of this.planes.entries()) {
      if (now - obj.lastUpdated > STALE_MS) {
        this.removeAircraft(key);
      }
    }
  }

  focusOnFirstAircraft() {
    const planeArray = [...this.planes.values()];
    if (planeArray.length) {
      const coords = planeArray.map(p => p.marker.getLatLng());
      if (coords.length) {
        const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
        const lon = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
        this.map.setView([lat, lon], 7);
      }
    }
  }

  showCoveragePolygon(polygon) {
    // Remove existing coverage layer if present
    this.hideCoverage();

    if (polygon && polygon.length > 0) {
      const latlngs = polygon.map(p => [p.lat, p.lon]);
      this.coverageLayer = L.polygon(latlngs, {
        color: '#00d9ff',
        fillColor: '#00d9ff',
        fillOpacity: 0.15,
        weight: 2,
        opacity: 0.6
      }).addTo(this.map);
    }
  }

  hideCoverage() {
    if (this.coverageLayer) {
      this.map.removeLayer(this.coverageLayer);
      this.coverageLayer = null;
    }
  }

  hasCoverage() {
    return this.coverageLayer !== null;
  }

  setCurrentCoverageSpot(spotName) {
    this.currentCoverageSpot = spotName;
  }

  getCurrentCoverageSpot() {
    return this.currentCoverageSpot;
  }
  
  showSpotMarker(spot) {
    if (!spot || spot.lat == null || spot.lon == null) return;
    
    // Remove existing spot marker if present
    this.removeSpotMarker();
    
    const icon = L.divIcon({
      html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="width: 12px; height: 12px; background: #f85149; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(248, 81, 73, 0.6);"></div>
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: #f85149; background: #12171f; padding: 2px 6px; border-radius: 4px; margin-top: 4px; display: inline-block; border: 1px solid #f85149; white-space: nowrap; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">${escapeHtml(spot.name || 'Spot')}</div>
        </div>
      `,
      className: '',
      iconSize: [100, 40],
      iconAnchor: [50, 20],
    });
    
    this.spotMarker = L.marker([spot.lat, spot.lon], { icon }).addTo(this.map);
  }
  
  removeSpotMarker() {
    if (this.spotMarker) {
      this.map.removeLayer(this.spotMarker);
      this.spotMarker = null;
    }
  }

  destroy() {
    // Clean up all markers and layers
    this.clearFlightHistory();
    this.removeSpotMarker();
    for (const [icao] of this.planes) {
      this.removeAircraft(icao);
    }

    // Remove Leaflet map
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}

// ============================================
// Map Adapter Factory & Initialization
// ============================================

function createMapAdapter(type, containerId) {
  switch (type) {
    case 'cesium':
      return new CesiumMapAdapter(containerId);
    case 'leaflet':
      return new LeafletMapAdapter(containerId);
    default:
      throw new Error(`Unknown map type: ${type}`);
  }
}

// Initialize the selected map adapter
let mapAdapter = createMapAdapter(MAP_TYPE, 'cesiumContainer');
mapAdapter.initialize();
console.info(`✈️  Flugzeug Radar - Map adapter initialized: ${MAP_TYPE.toUpperCase()}`);

// Function to switch map types dynamically
function switchMapType(newType) {
  if (newType === MAP_TYPE) {
    console.info(`Already using ${newType} map`);
    return;
  }

  console.info(`🔄 Switching map from ${MAP_TYPE} to ${newType}...`);

  // Clear current selection
  selectedAircraft.value = null;

  // Close coverage popup if open when switching from leaflet
  if (MAP_TYPE === 'leaflet') {
    const isPopupOpen = coveragePopup.popup?.classList.contains('show');
    if (isPopupOpen) {
      coveragePopup.close();
    }
  }

  // Store aircraft data before destroying old adapter
  const oldPlanes = new Map(mapAdapter.getAllAircraft());

  // Destroy old adapter (cleans up DOM elements, event handlers, etc.)
  mapAdapter.destroy();

  // Update map type
  MAP_TYPE = newType;

  // Create and initialize new adapter
  mapAdapter = createMapAdapter(MAP_TYPE, 'cesiumContainer');
  mapAdapter.initialize();

  // Re-add all aircraft to the new map
  for (const [icao, planeData] of oldPlanes.entries()) {
    mapAdapter.addOrUpdateAircraft(planeData.record);
  }
  
  // Re-add spot marker if available
  if (spotLocation) {
    mapAdapter.showSpotMarker(spotLocation);
  }

  // Emit event to update UI (buttons, etc.)
  eventBus.emit('map-type-changed', MAP_TYPE);

  console.info(`✅ Switched to ${MAP_TYPE.toUpperCase()} map successfully`);
}

// Emit initial map type
eventBus.emit('map-type-changed', MAP_TYPE);

// ============================================
// Unified Functions Using Map Adapter
// ============================================

// Store last loaded history for focus functionality
let lastLoadedHistoryCoords = [];

const fetchAndRenderHistory = async (icao) => {
  mapAdapter.clearFlightHistory();
  lastLoadedHistoryCoords = [];
  if (!icao) return;

  try {
    const res = await fetch(`/aircraft-data?icao=${encodeURIComponent(icao)}`);
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const flights = data[icao] || [];
    mapAdapter.renderFlightHistory(flights);

    // Store coords for focus button
    lastLoadedHistoryCoords = flights.flatMap(f => f.segments.map(s => ({ lat: s.lat, lon: s.lon, alt: s.altitude })));
  } catch (e) {
    console.error('Error fetching history:', e);
  }
};

const focusOnFlightHistory = (icao) => {
  if (lastLoadedHistoryCoords.length > 1) {
    mapAdapter.focusOnHistory(lastLoadedHistoryCoords);
  } else {
    mapAdapter.focusOnAircraft(icao);
  }
};

// ============================================
// Coverage Popup Management
// ============================================
const HEIGHT_LEVELS = [2000, 4000, 6000, 8000, 10000, 25000];
let currentCoverageData = null; // Store current coverage data

const coveragePopup = {
  popup: null,
  form: null,
  sliderContainer: null,
  spotNameInput: null,
  submitBtn: null,
  closeBtn: null,
  slider: null,
  heightValue: null,
  currentSpotDisplay: null,
  loadingText: null,

  init() {
    this.popup = document.getElementById('coverage-popup');
    this.form = document.getElementById('coverage-form');
    this.sliderContainer = document.getElementById('coverage-slider-container');
    this.spotNameInput = document.getElementById('spot-name-input');
    this.submitBtn = document.getElementById('coverage-submit-btn');
    this.closeBtn = document.getElementById('coverage-popup-close');
    this.slider = document.getElementById('coverage-height-slider');
    this.heightValue = document.getElementById('coverage-height-value');
    this.currentSpotDisplay = document.getElementById('coverage-current-spot');
    this.loadingText = document.getElementById('coverage-loading');

    // Event listeners
    this.submitBtn.addEventListener('click', () => this.handleSubmit());
    this.closeBtn.addEventListener('click', () => this.close());
    this.slider.addEventListener('input', (e) => this.handleSliderChange(e));
    this.spotNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSubmit();
    });
  },

  open() {
    this.popup.classList.add('show');
    this.showForm();
    this.spotNameInput.focus();
  },

  close() {
    this.popup.classList.remove('show');
    // Hide coverage and reset state
    if (mapAdapter.hideCoverage) {
      mapAdapter.hideCoverage();
    }
    if (mapAdapter.setCurrentCoverageSpot) {
      mapAdapter.setCurrentCoverageSpot(null);
    }
    currentCoverageData = null;
    this.reset();
    
    // Update button state
    const sidePanel = document.querySelector('side-panel');
    const coverageBtn = sidePanel?.shadowRoot?.getElementById('coverage-btn');
    if (coverageBtn) {
      coverageBtn.classList.remove('active');
    }
  },

  reset() {
    this.spotNameInput.value = '';
    this.slider.value = 0;
    this.showForm();
  },

  showForm() {
    this.form.style.display = 'block';
    this.sliderContainer.classList.remove('show');
    this.loadingText.style.display = 'none';
  },

  showSlider() {
    this.form.style.display = 'none';
    this.sliderContainer.classList.add('show');
  },

  setLoading(loading) {
    this.submitBtn.disabled = loading;
    this.spotNameInput.disabled = loading;
    this.loadingText.style.display = loading ? 'block' : 'none';
  },

  async handleSubmit() {
    const spotName = this.spotNameInput.value.trim();
    if (!spotName) return;

    // Check cache first
    if (coverageCache.has(spotName)) {
      const cachedData = coverageCache.get(spotName);
      this.loadCoverageData(spotName, cachedData);
      return;
    }

    // Fetch from server
    this.setLoading(true);
    try {
      const response = await fetch(`/statistics?spotName=${encodeURIComponent(spotName)}`);
      
      if (response.status === 400) {
        alert('Ошибка: не указано название точки');
        this.setLoading(false);
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch statistics');
      }
      
      const data = await response.json();
      
      // Cache the result
      coverageCache.set(spotName, data.coverage);
      
      this.loadCoverageData(spotName, data.coverage);
    } catch (error) {
      console.error('Error fetching radar coverage:', error);
      alert('Ошибка при загрузке данных покрытия радара');
      this.setLoading(false);
    }
  },

  loadCoverageData(spotName, coverageData) {
    this.setLoading(false);
    
    if (!coverageData || !coverageData.layers || coverageData.layers.length === 0) {
      alert(`Нет данных покрытия для точки "${spotName}"`);
      return;
    }

    currentCoverageData = coverageData;
    if (mapAdapter.setCurrentCoverageSpot) {
      mapAdapter.setCurrentCoverageSpot(spotName);
    }

    // Show slider UI
    this.currentSpotDisplay.textContent = `Точка: ${spotName}`;
    this.slider.max = coverageData.layers.length - 1;
    this.slider.value = 0;
    this.showSlider();

    // Display first height level
    this.updateCoverage(0);
    
    // Update button state
    const sidePanel = document.querySelector('side-panel');
    const coverageBtn = sidePanel?.shadowRoot?.getElementById('coverage-btn');
    if (coverageBtn) {
      coverageBtn.classList.add('active');
    }
  },

  handleSliderChange(event) {
    const index = parseInt(event.target.value);
    this.updateCoverage(index);
  },

  updateCoverage(index) {
    if (!currentCoverageData || !currentCoverageData.layers) return;
    
    const heightLevel = currentCoverageData.layers[index];
    if (!heightLevel) return;

    // Update height display
    this.heightValue.textContent = `${heightLevel.maxHeight} м`;

    // Update map
    if (mapAdapter.showCoveragePolygon) {
      mapAdapter.showCoveragePolygon(heightLevel.polygon);
    }
  }
};

const toggleRadarCoverage = () => {
  // Only works with Leaflet adapter
  if (MAP_TYPE !== 'leaflet') return;

  const isPopupOpen = coveragePopup.popup.classList.contains('show');
  
  if (isPopupOpen) {
    coveragePopup.close();
  } else {
    coveragePopup.open();
  }
};

// ============================================
// Selection Change Handler
// ============================================
selectedAircraft.subscribe((icao, oldIcao) => {
  // Update old aircraft selection state
  if (oldIcao) {
    mapAdapter.updateAircraftSelection(oldIcao, false);
  }

  // Update new aircraft selection state
  if (icao) {
    mapAdapter.updateAircraftSelection(icao, true);
  }

  // Fetch and render history for selected aircraft
  fetchAndRenderHistory(icao);
});

// ============================================
// WebSocket Connection
// ============================================
const wsUrl = `ws://${window.location.host}/info`;
let ws;
let lastMsgAt = 0;

const connect = () => {
  ws = new WebSocket(wsUrl);
  wsConnected.value = false;

  ws.addEventListener('open', () => {
    wsConnected.value = true;
    console.info('WS connected', wsUrl);
    eventBus.emit('connected');
  });

  ws.addEventListener('message', (evt) => {
    try {
      const parsed = JSON.parse(evt.data);
      if (parsed.type === 'aircrafts') {
        lastMsgAt = Date.now();
        eventBus.emit('aircrafts', parsed.payload);
      } else if (parsed.type === 'initialState') {
        eventBus.emit('initialState', parsed.payload);
      }
    } catch (e) {
      console.error('Bad WS data', e);
    }
  });

  ws.addEventListener('close', () => {
    wsConnected.value = false;
    console.warn('WS disconnected — reconnect in 3s');
    setTimeout(connect, 3000);
  });

  ws.addEventListener('error', (err) => {
    wsConnected.value = false;
    console.error('WS error', err);
    ws.close();
  });
};

// ============================================
// Event Handlers
// ============================================
eventBus.on('aircrafts', (payload) => {
  for (const rec of payload) {
    mapAdapter.addOrUpdateAircraft(rec);
    aircraftICAOs.has(rec.icao) || aircraftICAOs.add(rec.icao);
  }

  mapAdapter.cleanup();
});

eventBus.on('initialState', (payload) => {
  aircraftICAOs.clear();
  payload.icaos.forEach(icao => aircraftICAOs.add(icao));
  
  // Save and display spot location
  if (payload.spot && payload.spot.lat != null && payload.spot.lon != null) {
    spotLocation = payload.spot;
    mapAdapter.showSpotMarker(spotLocation);
  }
});

// ============================================
// Initialization
// ============================================
coveragePopup.init();
connect();

// Center camera on first aircraft appearance
let first = true;
const observeFirst = setInterval(() => {
  if (mapAdapter.getAllAircraft().size > 0 && first) {
    mapAdapter.focusOnFirstAircraft();
    first = false;
    clearInterval(observeFirst);
  }
}, 1000);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === '+' || e.key === '=') {
    mapAdapter.zoomIn();
  }
  if (e.key === '-' || e.key === '_') {
    mapAdapter.zoomOut();
  }
  if (e.key === 'Escape') {
    selectedAircraft.value = null;
  }
});

// Idle detection
setInterval(() => {
  if (wsConnected.value && Date.now() - lastMsgAt > 10_000) {
    // Could show idle status if needed
  }
}, 3000);
