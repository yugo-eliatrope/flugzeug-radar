import { AircraftData } from '@prisma/client';

import { EventBus } from './event-bus';
import { ILogger } from './logger';

interface IDBProvider {
  getAircraftData: (params: { from: Date }) => Promise<AircraftData[]>;
}

export class AircraftDataRepeater {
  private readonly startDate: Date;

  constructor(
    startDate: string,
    private readonly db: IDBProvider,
    private readonly logger: ILogger,
    private readonly eventBus: EventBus
  ) {
    this.startDate = new Date(startDate);
  }

  public start() {
    this.logger.info('Starting up...');
    this.db
      .getAircraftData({ from: this.startDate })
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
