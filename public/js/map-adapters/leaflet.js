import { MapAdapter } from './base.js';
import { appState } from '../state.js';
import { COLORS, STALE_MS } from '../state.js';
import { escapeHtml } from '../utils.js';

/**
 * Leaflet Map Adapter - реализация для 2D карты
 */
export class LeafletMapAdapter extends MapAdapter {
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
    const isSelected = appState.selectedAircraft.value === key;

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
        appState.selectedAircraft.value = key;
      });

      this.planes.set(key, { marker, lastUpdated: Date.now(), record: rec });
    }
  }

  _createPlaneIcon(track = 0, flight = '', isSelected = false) {
    const color = isSelected ? '#ff6b35' : '#00d9ff';
    const html = `
      <div>
        <div style="transform: rotate(${track}deg); display:flex; flex-direction:column; align-items:center;" class="plane-icon ${isSelected ? 'selected' : ''}">
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
        this._renderLine(richSegments, COLORS[colorIndex % COLORS.length]);
        richSegments = [];
      }
    }
    if (richSegments.length) this._renderLine(richSegments, COLORS[colorIndex % COLORS.length]);
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
