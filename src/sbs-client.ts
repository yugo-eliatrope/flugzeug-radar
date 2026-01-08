import net from 'node:net';

import { EventBus } from './event-bus';
import { ILogger } from './logger';

export interface SBSClientOptions {
  host: string;
  port: number;
}

export class SBSClient {
  private host: string;
  private port: number;
  private socket?: net.Socket;

  constructor(
    options: SBSClientOptions,
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

    let buffer = '';

    this.socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          this.eventBus.emit('readsb:data', trimmed);
        }
      }
    });

    this.socket.on('end', () => this.logger.info('Stream closed'));
    this.socket.on('error', (err) => this.logger.error(err));
  }

  stop() {
    if (!this.socket) return;
    this.socket.end();
    this.socket.destroy();
    this.logger.info('SBS client stopped');
  }
}
