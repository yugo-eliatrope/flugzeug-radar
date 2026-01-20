import { CesiumMapAdapter } from './cesium.js';
import { LeafletMapAdapter } from './leaflet.js';

/**
 * Фабрика для создания адаптеров карт
 */
export function createMapAdapter(type, containerId) {
  switch (type) {
    case 'cesium':
      return new CesiumMapAdapter(containerId);
    case 'leaflet':
      return new LeafletMapAdapter(containerId);
    default:
      throw new Error(`Unknown map type: ${type}`);
  }
}

export { CesiumMapAdapter, LeafletMapAdapter };
