/**
 * Главный файл приложения
 * Инициализирует все модули и связывает их вместе
 */

import { appState } from './js/state.js';
import { WebSocketClient } from './js/websocket-client.js';
import { MapManager } from './js/map-manager.js';
import { FlightHistoryManager } from './js/flight-history.js';
import { CoveragePopup } from './js/coverage-popup.js';
import './js/components/side-panel.js';

// ============================================
// Инициализация модулей
// ============================================

// Инициализация менеджера карт
const mapManager = new MapManager('cesiumContainer');
const mapAdapter = mapManager.getMapAdapter();

// Инициализация менеджера истории полетов
const flightHistoryManager = new FlightHistoryManager(mapAdapter);

// Инициализация попапа покрытия
const coveragePopup = new CoveragePopup(mapAdapter);
coveragePopup.init();

// Инициализация WebSocket клиента
const wsUrl = `ws://${window.location.host}/info`;
const wsClient = new WebSocketClient(wsUrl);
wsClient.connect();

// Получение ссылки на компонент SidePanel
const sidePanel = document.querySelector('side-panel');
if (sidePanel) {
  sidePanel.setMapAdapter(mapAdapter);
  sidePanel.setCoveragePopup(coveragePopup);
  sidePanel.setSwitchMapTypeCallback((type) => mapManager.switchMapType(type));
  sidePanel.setFocusOnFlightHistoryCallback((icao) => flightHistoryManager.focusOnFlightHistory(icao));
}

// ============================================
// Обработчики событий
// ============================================

// Обработка изменения выбранного самолета
appState.selectedAircraft.subscribe((icao, oldIcao) => {
  // Update old aircraft selection state
  if (oldIcao) {
    mapAdapter.updateAircraftSelection(oldIcao, false);
  }

  // Update new aircraft selection state
  if (icao) {
    mapAdapter.updateAircraftSelection(icao, true);
  }

  // Fetch and render history for selected aircraft
  flightHistoryManager.fetchAndRenderHistory(icao);
});

// Обработка обновлений самолетов
appState.eventBus.on('aircrafts', (payload) => {
  for (const rec of payload) {
    mapAdapter.addOrUpdateAircraft(rec);
    if (!appState.aircraftICAOs.has(rec.icao)) {
      appState.aircraftICAOs.add(rec.icao);
    }
  }

  mapAdapter.cleanup();
});

// Обработка начального состояния
appState.eventBus.on('initialState', (payload) => {
  appState.aircraftICAOs.clear();
  payload.icaos.forEach(icao => appState.aircraftICAOs.add(icao));
  
  // Save and display spot location
  if (payload.spot && payload.spot.lat != null && payload.spot.lon != null) {
    appState.spotLocation = payload.spot;
    mapAdapter.showSpotMarker(appState.spotLocation);
  }
});

// ============================================
// Инициализация приложения
// ============================================

// Центрирование камеры на первом самолете
let first = true;
const observeFirst = setInterval(() => {
  if (mapAdapter.getAllAircraft().size > 0 && first) {
    if (mapAdapter.focusOnFirstAircraft) {
      mapAdapter.focusOnFirstAircraft();
    }
    first = false;
    clearInterval(observeFirst);
  }
}, 1000);

// Горячие клавиши
document.addEventListener('keydown', (e) => {
  if (e.key === '+' || e.key === '=') {
    mapAdapter.zoomIn();
  }
  if (e.key === '-' || e.key === '_') {
    mapAdapter.zoomOut();
  }
  if (e.key === 'Escape') {
    appState.selectedAircraft.value = null;
  }
});

// Проверка простоя соединения
setInterval(() => {
  if (appState.wsConnected.value && Date.now() - wsClient.getLastMessageTime() > 10_000) {
    // Could show idle status if needed
  }
}, 3000);
