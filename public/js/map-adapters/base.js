/**
 * Базовый класс для адаптеров карт
 * Определяет интерфейс, который должны реализовывать все адаптеры
 */
export class MapAdapter {
  constructor(containerId) {
    this.containerId = containerId;
    this.planes = new Map(); // icao -> { entity/marker, lastUpdated, record, groundLine }
  }

  // Абстрактные методы, которые должны быть реализованы в подклассах
  initialize() { 
    throw new Error('Must implement initialize()'); 
  }
  
  addOrUpdateAircraft(record) { 
    throw new Error('Must implement addOrUpdateAircraft()'); 
  }
  
  removeAircraft(icao) { 
    throw new Error('Must implement removeAircraft()'); 
  }
  
  updateAircraftSelection(icao, isSelected) { 
    throw new Error('Must implement updateAircraftSelection()'); 
  }
  
  renderFlightHistory(flights) { 
    throw new Error('Must implement renderFlightHistory()'); 
  }
  
  clearFlightHistory() { 
    throw new Error('Must implement clearFlightHistory()'); 
  }
  
  focusOnHistory(coords) { 
    throw new Error('Must implement focusOnHistory()'); 
  }
  
  focusOnAircraft(icao) { 
    throw new Error('Must implement focusOnAircraft()'); 
  }
  
  cleanup() { 
    throw new Error('Must implement cleanup()'); 
  }
  
  zoomIn() { 
    throw new Error('Must implement zoomIn()'); 
  }
  
  zoomOut() { 
    throw new Error('Must implement zoomOut()'); 
  }
  
  destroy() { 
    throw new Error('Must implement destroy()'); 
  }
  
  showSpotMarker(spot) { 
    throw new Error('Must implement showSpotMarker()'); 
  }
  
  removeSpotMarker() { 
    throw new Error('Must implement removeSpotMarker()'); 
  }

  // Общий метод для получения всех самолетов
  getAllAircraft() {
    return this.planes;
  }
}
