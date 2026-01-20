import { createMapAdapter } from './map-adapters/index.js';
import { appState } from './state.js';

/**
 * Менеджер для управления адаптерами карт
 */
export class MapManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.mapAdapter = null;
    this.initialize();
  }

  initialize() {
    const initialMapType = appState.mapType.value;
    this.mapAdapter = createMapAdapter(initialMapType, this.containerId);
    this.mapAdapter.initialize();
    console.info(`✈️  Flugzeug Radar - Map adapter initialized: ${initialMapType.toUpperCase()}`);

    // Emit initial map type
    appState.eventBus.emit('map-type-changed', initialMapType);
  }

  /**
   * Переключить тип карты
   */
  switchMapType(newType) {
    if (newType === appState.mapType.value) {
      console.info(`Already using ${newType} map`);
      return;
    }

    console.info(`🔄 Switching map from ${appState.mapType.value} to ${newType}...`);

    // Clear current selection
    appState.selectedAircraft.value = null;

    // Store aircraft data before destroying old adapter
    const oldPlanes = new Map(this.mapAdapter.getAllAircraft());

    // Destroy old adapter (cleans up DOM elements, event handlers, etc.)
    this.mapAdapter.destroy();

    // Update map type in state
    appState.mapType.value = newType;

    // Create and initialize new adapter
    this.mapAdapter = createMapAdapter(newType, this.containerId);
    this.mapAdapter.initialize();

    // Re-add all aircraft to the new map
    for (const [icao, planeData] of oldPlanes.entries()) {
      this.mapAdapter.addOrUpdateAircraft(planeData.record);
    }
    
    // Re-add spot marker if available
    if (appState.spotLocation) {
      this.mapAdapter.showSpotMarker(appState.spotLocation);
    }

    // Emit event to update UI (buttons, etc.)
    appState.eventBus.emit('map-type-changed', newType);

    console.info(`✅ Switched to ${newType.toUpperCase()} map successfully`);
  }

  getMapAdapter() {
    return this.mapAdapter;
  }
}
