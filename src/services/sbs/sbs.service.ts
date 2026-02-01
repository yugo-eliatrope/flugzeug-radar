import net from 'node:net';
import readline from 'node:readline';

import { EventBus } from '../../event-bus';
import { ILogger } from '../../logger';

interface SBSServiceOptions {
  host: string;
  port: number;
}

export class SBSService {
  private host: string;
  private port: number;
  private socket?: net.Socket;
  private rl?: readline.Interface;

  constructor(
    options: SBSServiceOptions,
    private readonly logger: ILogger,
    private readonly eventBus: EventBus
  ) {
    this.host = options.host;
    this.port = options.port;
  }

  start() {
    this.socket = net.connect(this.port, this.host, () => {
      this.logger.info(`Connected to ${this.host}:${this.port}`);
    });

    this.rl = readline.createInterface({
      input: this.socket,
      terminal: false,
    });

    let processedInInterval = 0;

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        this.eventBus.emit('readsb:data', trimmed);
      }
      processedInInterval++;
    });

    const interval = setInterval(() => {
      const perSecond = Math.round(processedInInterval / 10);
      this.logger.debug(`Traffic density: ~${perSecond} msg/sec`);
      processedInInterval = 0;
    }, 10_000);
    interval.unref();

    this.socket.on('end', () => this.logger.info('Stream closed'));

    this.socket.on('error', (err) => {
      this.logger.error(err);
      this.stop();
    });
  }

  stop() {
    if (!this.socket) return;
    this.rl?.close();
    this.socket.end();
    this.socket.destroy();
    this.logger.info('SBS client stopped');
  }
}
