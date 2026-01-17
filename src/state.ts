import { SBSMessage, UnsavedAircraftData } from './domain';
import { EventBus } from './event-bus';
import { ILogger } from './logger';

export class AircraftState {
  private readonly map = new Map<string, UnsavedAircraftData>();

  constructor(
    private readonly maxAgeMs: number,
    private readonly spotName: string | null,
    private readonly logger: ILogger,
    private readonly eventBus: EventBus
  ) {}

  public update(msg: SBSMessage) {
    if (!msg.icao) return;
    const prev = this.map.get(msg.icao);
    if (prev) {
      // this.logger.info(`Updating aircraft data for ICAO: ${msg.icao}`);
      const updated = this.apply(prev, msg);
      this.map.set(msg.icao, updated);
      this.eventBus.emit('state:updated', updated);
    } else {
      this.logger.info(`Creating new aircraft data for ICAO: ${msg.icao}`);
      const newAD = this.createNewAD(msg);
      this.map.set(msg.icao, newAD);
      this.eventBus.emit('state:updated', newAD);
    }
  }

  private apply(data: UnsavedAircraftData, msg: SBSMessage) {
    return {
      icao: data.icao,
      flight: msg.flight || data.flight || '',
      altitude: msg.altitude ?? data.altitude,
      groundSpeed: msg.groundSpeed ?? data.groundSpeed,
      track: msg.track ?? data.track,
      lat: msg.lat ?? data.lat,
      lon: msg.lon ?? data.lon,
      verticalRate: msg.verticalRate ?? data.verticalRate,
      inEmergency: msg.inEmergency ?? data.inEmergency,
      isOnGround: msg.isOnGround ?? data.isOnGround,
      spotName: this.spotName,
      updatedAt: msg.generatedAt,
    };
  }

  private createNewAD(msg: SBSMessage): UnsavedAircraftData {
    return {
      icao: msg.icao!,
      flight: msg.flight,
      altitude: msg.altitude,
      groundSpeed: msg.groundSpeed,
      track: msg.track,
      lat: msg.lat,
      lon: msg.lon,
      verticalRate: msg.verticalRate,
      inEmergency: msg.inEmergency,
      isOnGround: msg.isOnGround,
      spotName: this.spotName,
      updatedAt: msg.generatedAt,
    };
  }

  public getAll(): UnsavedAircraftData[] {
    return [...this.map.values()];
  }

  public cleanup() {
    const now = Date.now();
    for (const [icao, rec] of this.map.entries()) {
      if (now - rec.updatedAt.getTime() > this.maxAgeMs) {
        this.eventBus.emit('state:removed', { ...rec });
        this.map.delete(icao);
        this.logger.info(`Removed stale aircraft data for ICAO: ${icao}`);
      }
    }
  }
}
