// Настройки
const WS_PORT = 4000;
const WS_PATH = '/'; // если нужно менять — укажи здесь
const UPDATE_INTERVAL_MS = 1000; // как часто сервер шлёт обновления (в проекте 1s)
const STALE_MS = 30_000; // считать борты устаревшими, если не обновлялись

// Observable класс для управления событиями
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
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }
}

// Инициализация карты
const map = L.map('map').setView([52.52, 13.405], 7); // по умолчанию — Берлин
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

// Хранилище маркеров: hex -> { marker, lastUpdated }
const planes = new Map();

// Подключение к WebSocket (подставляет hostname текущей страницы)
const wsUrl = (() => {
  return `ws://localhost:4000`;
})();

let ws;
const wsStatusEl = document.getElementById('ws-status');
const eventBus = new Observable();

const setWsStatus = (txt, color) => {
  wsStatusEl.textContent = txt;
  wsStatusEl.style.color = color || 'black';
};

const historyPaths = new Map();
const colors = ['red', 'blue', 'green'];

// Экранируем простые HTML-символы для flight
const escapeHtml = (s) => {
  return String(s).replace(/[&<>"']/g, (c) => {
    const charMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return charMap[c];
  });
};

// Создаёт DivIcon с поворотом под track (deg) и подписью flight
const createPlaneIcon = (track = 0, flight = '') => {
  // SVG самолёта (простая плашка) — поворачиваем весь контейнер
  const svg = `
        <svg
          fill="#000000"
          viewBox="0 -0.5 25 25"
          xmlns="http://www.w3.org/2000/svg">
            <g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="m24.794 16.522-.281-2.748-10.191-5.131s.091-1.742 0-4.31c-.109-1.68-.786-3.184-1.839-4.339l.005.006h-.182c-1.048 1.15-1.726 2.653-1.834 4.312l-.001.021c-.091 2.567 0 4.31 0 4.31l-10.19 5.131-.281 2.748 6.889-2.074 3.491-.582c-.02.361-.031.783-.031 1.208 0 2.051.266 4.041.764 5.935l-.036-.162-2.728 1.095v1.798l3.52-.8c.155.312.3.566.456.812l-.021-.035v.282c.032-.046.062-.096.093-.143.032.046.061.096.094.143v-.282c.135-.21.28-.464.412-.726l.023-.051 3.52.8v-1.798l-2.728-1.095c.463-1.733.728-3.723.728-5.774 0-.425-.011-.847-.034-1.266l.003.058 3.492.582 6.888 2.074z"></path>
            </g>
        </svg>
      `;
  const html = `<div>
                      <div style="transform: rotate(${track}deg); display:flex; flex-direction:column; align-items:center;" class="plane-icon">${svg}</div>
                      ${flight ? `<div class="plane-label">${escapeHtml(flight)}</div>` : ''}
                    </div>`;
  return L.divIcon({
    html,
    className: '', // пустой, чтобы избежать дефолтных стилей
    iconSize: [28, 36],
    iconAnchor: [14, 18],
  });
};

// Обновление/добавление маркера
const upsertPlane = (rec) => {
  if (!rec.icao) return;
  if (rec.lat == null || rec.lon == null) return; // пропускаем, если нет координат

  const key = rec.icao;
  const latlng = [rec.lat, rec.lon];
  const track = Number.isFinite(rec.track) ? rec.track : 0;
  const flight = rec.flight ? rec.flight.trim() : '';

  const existing = planes.get(key);
  if (existing) {
    // Обновляем позицию и иконку (в Leaflet: setLatLng, setIcon)
    try {
      existing.marker.setLatLng(latlng);
      // создаём новый икон если flight/track изменились
      const newIcon = createPlaneIcon(track, flight);
      existing.marker.setIcon(newIcon);
      existing.lastUpdated = Date.now();
      existing.record = rec;
    } catch (e) {
      console.error('Update marker failed', e);
    }
  } else {
    // Создаём новый маркер
    const icon = createPlaneIcon(track, flight);
    const marker = L.marker(latlng, { icon }).addTo(map);
    const popupHtml = renderPopup(rec);
    marker.bindPopup(popupHtml, { maxWidth: 240 });

    planes.set(key, {
      marker,
      lastUpdated: Date.now(),
      record: rec,
    });
  }
};

const splitPathsByTime = (coords, minGapMs = 30_000) => {
  const segments = [];
  for (let i = 0; i < coords.length; ) {
    const segment = [coords[i]];
    let j = i + 1;
    while (j < coords.length) {
      const timeDiff = Math.abs(new Date(coords[j].time) - new Date(coords[j - 1].time));
      if (timeDiff > minGapMs) {
        break;
      }
      segment.push(coords[j]);
      j++;
    }
    if (segment.length >= 2) {
      segments.push(segment);
    }
    i = j;
  }
  return segments;
};

const renderHistoryPath = (coords, colorIndex = 0) => {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const latlngs = coords
    .map((c) => (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) ? [c.lat, c.lon] : null)
    .filter((c) => c !== null);
  if (latlngs.length < 2) return null;
  return L.polyline(latlngs, { color: colors[colorIndex], weight: 2, opacity: 0.5 }).addTo(map);
};

const clearHistoryPaths = () => {
  map.eachLayer((layer) => {
    if (layer instanceof L.Polyline && !(layer instanceof L.Marker)) {
      map.removeLayer(layer);
    }
  });
};

const renderPathOnClick = (icao) => {
  const segments = historyPaths.get(icao) || [];
  clearHistoryPaths();
  for (let i = 0; i < segments.length; i++) {
    renderHistoryPath(segments[i], i % colors.length);
  }
};

const renderPopup = (rec) => {
  const parts = [
    ['ICAO', rec.icao],
    ['Flight', rec.flight || '—'],
    ['Alt (ft)', rec.altitude != null ? rec.altitude : '—'],
    ['Ground speed (kt)', rec.groundSpeed != null ? rec.groundSpeed : '—'],
    ['Track (°)', rec.track != null ? rec.track : '—'],
    ['Lat/Lon', (rec.lat != null && rec.lon != null) ? `${rec.lat.toFixed(5)}, ${rec.lon.toFixed(5)}` : '—'],
  ];
  return `<div class="aircraft-popup">${parts.map((p) => `<b>${p[0]}:</b> ${escapeHtml(String(p[1]))}`).join('<br>')}<button onclick="renderPathOnClick('${rec.icao}')">Show History</button></div>`;
};

// Обработка пришедшего массива самолётов — заменить/обновить маркеры
const onAircraftArray = (arr) => {
  // arr: [{hex, flight, lat, lon, altitude, ...}, ...]
  // Добавляем/обновляем
  for (const rec of arr) {
    upsertPlane(rec);
  }

  // Удаляем устаревшие маркеры (если не обновлялись давно)
  const now = Date.now();
  for (const [key, obj] of planes.entries()) {
    if (now - obj.lastUpdated > STALE_MS) {
      map.removeLayer(obj.marker);
      planes.delete(key);
    }
  }
};

// Вспомогательная функция для создания кнопок
const createButton = (text, onClick, container) => {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.margin = '2px';
  btn.addEventListener('click', onClick);
  container.appendChild(btn);
};

// Обновление кнопок истории
const updateHistoryButtons = () => {
  const historyBtnsEl = document.getElementById('history-btns');
  historyBtnsEl.innerHTML = '';

  // Кнопки для каждого самолёта
  for (const [key, segments] of historyPaths.entries()) {
    createButton(key.toUpperCase(), () => {
      clearHistoryPaths();
      for (let i = 0; i < segments.length; i++) {
        renderHistoryPath(segments[i], i % colors.length);
      }
    }, historyBtnsEl);
  }

  // Кнопка "Show All"
  createButton('Show All', () => {
    historyPaths.forEach((segments) => {
      for (let i = 0; i < segments.length; i++) {
        renderHistoryPath(segments[i], i % colors.length);
      }
    });
  }, historyBtnsEl);

  // Кнопка "Clear All"
  createButton('Clear All', () => {
    clearHistoryPaths();
  }, historyBtnsEl);
};

const connect = () => {
  ws = new WebSocket(wsUrl);
  setWsStatus('connecting…', 'orange');

  ws.addEventListener('open', () => {
    setWsStatus('connected', 'green');
    console.info('WS connected', wsUrl);
    eventBus.emit('connected');
  });

  ws.addEventListener('message', (evt) => {
    try {
      const parsed = JSON.parse(evt.data);
      if (parsed.type === 'aircrafts') {
        eventBus.emit('aircrafts', parsed.payload);
      } else if (parsed.type === 'history') {
        eventBus.emit('history', parsed.payload);
      }
    } catch (e) {
      console.error('Bad WS data', e);
    }
  });

  ws.addEventListener('close', () => {
    setWsStatus('disconnected', 'red');
    console.warn('WS disconnected — reconnect in 3s');
    setTimeout(connect, 3000);
  });

  ws.addEventListener('error', (err) => {
    setWsStatus('error', 'red');
    console.error('WS error', err);
    ws.close();
  });
};

// Отказоустойчивость: если WS долго не получает данные — показать статус
let lastMsgAt = 0;

// Подписка на события через Observable
eventBus.on('aircrafts', (payload) => {
  lastMsgAt = Date.now();
  setWsStatus('connected', 'green');
  onAircraftArray(payload);
});

eventBus.on('history', (payload) => {
  historyPaths.clear();
  Object.entries(payload)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, coords]) => {
      const segments = splitPathsByTime(coords);
      historyPaths.set(key, segments);
    });
  updateHistoryButtons();
});

connect();

// Центрируем карту при первом появлении каких-то маркеров (опционально)
let first = true;
const observeFirst = setInterval(() => {
  if (planes.size > 0 && first) {
    // центрируем на среднем положении видимых самолётов
    const coords = [...planes.values()].map((p) => p.marker.getLatLng());
    if (coords.length) {
      const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
      const lon = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
      map.setView([lat, lon], 7);
      first = false;
      clearInterval(observeFirst);
    }
  }
}, 1000);

// Дополнительно: клавиши для масштабирования (напр., +/-)
document.addEventListener('keydown', (e) => {
  if (e.key === '+') map.zoomIn();
  if (e.key === '-') map.zoomOut();
});

setInterval(() => {
  if (Date.now() - lastMsgAt > 10_000) {
    // если не было сообщений 10+ сек — показываем "idle"
    if (ws && ws.readyState === WebSocket.OPEN) {
      setWsStatus('connected (idle)', 'orange');
    }
  }
}, 3000);

// Экспорт функции для использования в HTML (через onclick)
window.renderPathOnClick = renderPathOnClick;

