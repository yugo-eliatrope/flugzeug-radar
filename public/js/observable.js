/**
 * Observable Value - реактивное значение
 */
export class ObservableValue {
  constructor(initialValue = null) {
    this._value = initialValue;
    this._listeners = new Set();
  }

  get value() {
    return this._value;
  }

  set value(newValue) {
    const oldValue = this._value;
    this._value = newValue;
    if (oldValue !== newValue) {
      this._listeners.forEach(cb => cb(newValue, oldValue));
    }
  }

  subscribe(callback) {
    this._listeners.add(callback);
    callback(this._value, null);
    return () => this._listeners.delete(callback);
  }
}

/**
 * Event Bus - система событий
 */
export class Observable {
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
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) callbacks.forEach(cb => cb(data));
  }
}
