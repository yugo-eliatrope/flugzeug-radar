import { EventEmitter } from 'events';
import { AircraftData, UnsavedAircraftData } from './domain';

export type AppEvents = {
  'readsb:data': string;
  'repeater:data': AircraftData;
  'state:updated': UnsavedAircraftData;
  'state:removed': UnsavedAircraftData;
};

export type EventName = keyof AppEvents;

export class EventBus extends EventEmitter {
  emit<K extends EventName>(event: K, data: AppEvents[K]): boolean {
    return super.emit(event, data);
  }

  on<K extends EventName>(event: K, listener: (data: AppEvents[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends EventName>(event: K, listener: (data: AppEvents[K]) => void): this {
    return super.once(event, listener);
  }

  off<K extends EventName>(event: K, listener: (data: AppEvents[K]) => void): this {
    return super.off(event, listener);
  }
}
