import { AircraftData } from './domain';
import { DatabaseManager } from './database-manager';
import { EventBus } from './event-bus';
import { ILogger } from './logger';

export class AircraftDataRepeater {
  private readonly startDate: Date;

  constructor(
    startDate: string,
    private readonly dbManager: DatabaseManager,
    private readonly logger: ILogger,
    private readonly eventBus: EventBus
  ) {
    this.startDate = new Date(startDate);
  }

  public start() {
    this.logger.info('Starting up...');
    this.dbManager
      .getAircraftData({ from: this.startDate, icao: '3c6594' })
      .then((data) => {
        this.logger.info(`Repeating ${data.length} items from ${this.startDate.toISOString()}`);
        this.emit(data);
      })
      .catch(this.logger.error);
  }

  public stop() {
    this.logger.info('Aircraft data repeater stopped');
  }

  private emit(data: AircraftData[]) {
    let i = data.length - 1;
    const interval = setInterval(() => {
      if (i === -1) {
        clearInterval(interval);
        this.logger.info(`All ${data.length} items are repeated`);
        return;
      }
      this.eventBus.emit('repeater:data', data[i]);
      i--;
    }, 3_000);
  }
}
