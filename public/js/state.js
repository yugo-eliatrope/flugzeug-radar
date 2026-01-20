import { ObservableValue, Observable } from './observable.js';

/**
 * Константы конфигурации
 */
export const STALE_MS = 30_000;
export const COLORS = ['#00d9ff', '#3fb950', '#d29922'];

/**
 * Глобальное состояние приложения
 */
class AppState {
  constructor() {
    // Реактивные значения
    this._selectedAircraft = new ObservableValue(null);
    this._wsConnected = new ObservableValue(false);
    this._mapType = new ObservableValue('cesium'); // 'cesium' или 'leaflet'
    
    // Event bus для межмодульной коммуникации
    this._eventBus = new Observable();
    
    // Коллекции данных
    this._aircraftICAOs = new Set();
    this._aircraftPhotosCache = new Map(); // icao -> { photo, photographer, link } | null
    this._coverageCache = new Map(); // spotName -> Coverage { spotName, layers: [{ maxHeight, polygon }] }
    
    // Текущее местоположение спота
    this._spotLocation = null; // { name, lat, lon }
  }

  // Геттеры для удобного доступа
  get selectedAircraft() {
    return this._selectedAircraft;
  }

  get wsConnected() {
    return this._wsConnected;
  }

  get mapType() {
    return this._mapType;
  }

  get eventBus() {
    return this._eventBus;
  }

  get aircraftICAOs() {
    return this._aircraftICAOs;
  }

  get aircraftPhotosCache() {
    return this._aircraftPhotosCache;
  }

  get coverageCache() {
    return this._coverageCache;
  }

  get spotLocation() {
    return this._spotLocation;
  }

  set spotLocation(value) {
    this._spotLocation = value;
  }
}

// Экспортируем единственный экземпляр состояния
export const appState = new AppState();
