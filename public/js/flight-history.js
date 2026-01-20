import { appState } from './state.js';

/**
 * Управление историей полетов
 */
export class FlightHistoryManager {
  constructor(mapAdapter) {
    this.mapAdapter = mapAdapter;
    this.lastLoadedHistoryCoords = [];
  }

  /**
   * Загрузить и отобразить историю полета для указанного ICAO
   */
  async fetchAndRenderHistory(icao) {
    this.mapAdapter.clearFlightHistory();
    this.lastLoadedHistoryCoords = [];
    if (!icao) return;

    try {
      const res = await fetch(`/aircraft-data?icao=${encodeURIComponent(icao)}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      const flights = data[icao] || [];
      this.mapAdapter.renderFlightHistory(flights);

      // Store coords for focus button
      this.lastLoadedHistoryCoords = flights.flatMap(f => 
        f.segments.map(s => ({ lat: s.lat, lon: s.lon, alt: s.altitude }))
      );
    } catch (e) {
      console.error('Error fetching history:', e);
    }
  }

  /**
   * Сфокусироваться на истории полета или самолете
   */
  focusOnFlightHistory(icao) {
    if (this.lastLoadedHistoryCoords.length > 1) {
      this.mapAdapter.focusOnHistory(this.lastLoadedHistoryCoords);
    } else {
      this.mapAdapter.focusOnAircraft(icao);
    }
  }
}
