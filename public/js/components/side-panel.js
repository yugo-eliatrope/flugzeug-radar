import { appState } from '../state.js';
import { escapeHtml, calculateDistance } from '../utils.js';

/**
 * Side Panel Web Component - боковая панель с информацией о самолетах
 */
export class SidePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.currentDisplayedIcao = null; // Track which ICAO is currently displayed
    this.mapAdapter = null;
    this.coveragePopup = null;
    this.switchMapTypeCallback = null;
    this.focusOnFlightHistoryCallback = null;
  }

  setMapAdapter(mapAdapter) {
    this.mapAdapter = mapAdapter;
  }

  setCoveragePopup(coveragePopup) {
    this.coveragePopup = coveragePopup;
  }

  setSwitchMapTypeCallback(callback) {
    this.switchMapTypeCallback = callback;
  }

  setFocusOnFlightHistoryCallback(callback) {
    this.focusOnFlightHistoryCallback = callback;
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
      appState.selectedAircraft.value = value || null;
    });

    // Map switcher button handlers
    this.mapBtnLeaflet.addEventListener('click', () => {
      if (this.switchMapTypeCallback) {
        this.switchMapTypeCallback('leaflet');
      }
    });

    this.mapBtnCesium.addEventListener('click', () => {
      if (this.switchMapTypeCallback) {
        this.switchMapTypeCallback('cesium');
      }
    });

    // Coverage button handler
    this.coverageBtn.addEventListener('click', () => {
      if (this.coveragePopup) {
        this.coveragePopup.toggle();
      }
    });

    // Update active state based on current map type
    appState.eventBus.on('map-type-changed', (type) => {
      this.mapBtnLeaflet.classList.toggle('active', type === 'leaflet');
      this.mapBtnCesium.classList.toggle('active', type === 'cesium');
      // Show coverage button only in 2D (leaflet) mode
      this.coverageBtn.style.display = type === 'leaflet' ? 'flex' : 'none';
    });
  }

  setupSubscriptions() {
    appState.wsConnected.subscribe((connected) => {
      this.statusDot.classList.toggle('connected', connected);
      this.statusText.textContent = connected ? 'Verbunden' : 'Getrennt';
    });

    appState.selectedAircraft.subscribe((icao) => {
      this.icaoSelect.value = icao || '';
      this.updateAircraftCard(icao);
    });

    appState.eventBus.on('initialState', (payload) => {
      setTimeout(() => {
        this.updateIcaoList();
        this.totalHistory.textContent = appState.aircraftICAOs.size;
      }, 0);
    });

    appState.eventBus.on('aircrafts', () => {
      if (this.mapAdapter) {
        this.totalAircraft.textContent = this.mapAdapter.getAllAircraft().size;
        // Update card if selected aircraft data changed
        if (appState.selectedAircraft.value) {
          this.updateAircraftCard(appState.selectedAircraft.value);
        }
      }
    });
  }

  updateIcaoList() {
    const currentValue = this.icaoSelect.value;
    const icaos = [...appState.aircraftICAOs.keys()].sort();

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
    if (!icao || !this.mapAdapter) {
      this.currentDisplayedIcao = null;
      this.aircraftCard.className = 'aircraft-card empty';
      this.aircraftCard.innerHTML = 'Wählen Sie ein Flugzeug aus';
      return;
    }

    const planeData = this.mapAdapter.getAllAircraft().get(icao);
    const rec = planeData?.record || {};
    const icaoChanged = this.currentDisplayedIcao !== icao;
    const spotLocation = appState.spotLocation;

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
        appState.selectedAircraft.value = null;
      });

      const focusBtn = this.aircraftCard.querySelector('#focus-btn');
      focusBtn.addEventListener('click', () => {
        if (this.focusOnFlightHistoryCallback) {
          this.focusOnFlightHistoryCallback(icao);
        }
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
    if (appState.aircraftPhotosCache.has(icao)) {
      const cached = appState.aircraftPhotosCache.get(icao);
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
          appState.aircraftPhotosCache.set(icao, {
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
          appState.aircraftPhotosCache.set(icao, null);
          this.showNoPhoto(photoContainer);
        }
      } else {
        appState.aircraftPhotosCache.set(icao, null);
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
