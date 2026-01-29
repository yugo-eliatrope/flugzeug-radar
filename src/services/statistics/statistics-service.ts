import { Coverage } from '../../domain';

import { Worker } from 'worker_threads';
import path from 'path';
import { ILogger } from '../../logger';

type Settings = {
  minDotsInCellAllowed: number;
  concavity: number;
};

export class StatisticsService {
  private readonly dbPath: string;

  constructor(
    private readonly spotNames: string[],
    private readonly settings: Settings,
    private readonly logger: ILogger
  ) {
    this.dbPath = process.env.DATABASE_URL?.replace('file:', '') || './dev.db';
  }

  public coverage = async (spotName: string): Promise<Coverage> => {
    if (!this.spotNames.includes(spotName)) {
      this.logger.error(`Spot name "${spotName}" not found`);
      return { spotName, layers: [] };
    }
    return new Promise<Coverage>((resolve, reject) => {
      this.logger.info(`Starting coverage calculation for spot "${spotName}"`);
      const startDate = Date.now();
      const worker = new Worker(path.resolve(__dirname, 'coverage-worker.js'), {
        workerData: {
          spotName,
          minDotsInCellAllowed: this.settings.minDotsInCellAllowed,
          concavity: this.settings.concavity,
          dbPath: this.dbPath,
        },
      });

      worker.on('message', (message) => {
        if (message.type === 'data') {
          this.logger.info(`Coverage calculation for spot "${spotName}" completed in ${Date.now() - startDate} ms`);
          resolve(message.payload);
        } else if (message.type === 'error') {
          this.logger.error(`Coverage calculation for spot "${spotName}" failed: ${message.payload}`);
          reject(new Error(message.payload));
        }
      });

      worker.on('error', (error) => {
        this.logger.error(`Coverage calculation for spot "${spotName}" encountered an error: ${error.message}`);
        reject(error);
      });
    });
  };
}
