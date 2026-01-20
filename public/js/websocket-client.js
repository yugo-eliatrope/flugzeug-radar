import { appState } from './state.js';

/**
 * WebSocket клиент для подключения к серверу
 */
export class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.lastMsgAt = 0;
    this.reconnectTimeout = null;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    appState.wsConnected.value = false;

    this.ws.addEventListener('open', () => {
      appState.wsConnected.value = true;
      console.info('WS connected', this.url);
      appState.eventBus.emit('connected');
    });

    this.ws.addEventListener('message', (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        if (parsed.type === 'aircrafts') {
          this.lastMsgAt = Date.now();
          appState.eventBus.emit('aircrafts', parsed.payload);
        } else if (parsed.type === 'initialState') {
          appState.eventBus.emit('initialState', parsed.payload);
        }
      } catch (e) {
        console.error('Bad WS data', e);
      }
    });

    this.ws.addEventListener('close', () => {
      appState.wsConnected.value = false;
      console.warn('WS disconnected — reconnect in 3s');
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    });

    this.ws.addEventListener('error', (err) => {
      appState.wsConnected.value = false;
      console.error('WS error', err);
      if (this.ws) {
        this.ws.close();
      }
    });
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getLastMessageTime() {
    return this.lastMsgAt;
  }
}
