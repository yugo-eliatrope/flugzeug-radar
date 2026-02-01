import http from 'http';
import { Duplex } from 'stream';

import { WebSocketServer as WsWebSocketServer, WebSocket } from 'ws';

import { UnsavedAircraftData } from './domain';
import { ILogger } from './logger';
import { extractToken } from './utils';

interface IState {
  getAllIcaos: () => Promise<string[]>;
}

interface IAuthService {
  isAuthenticated: (token: string) => Promise<boolean>;
}

type OutgoingMessage =
  | {
      type: 'aircrafts';
      payload: UnsavedAircraftData[];
    }
  | {
      type: 'initialState';
      payload: {
        icaos: string[];
        spot: {
          name: string;
          lat: number;
          lon: number;
        };
      };
    };

export class WebSocketServer {
  private wss: WsWebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(
    private readonly state: IState,
    private readonly logger: ILogger,
    private readonly authService: IAuthService,
    private readonly spot: {
      name: string;
      lat: number;
      lon: number;
    }
  ) {
    this.wss = new WsWebSocketServer({ noServer: true });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      this.logger.info(`Client connected. Total clients: ${this.clients.size}`);

      this.sendInitialState(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
        this.logger.info(`Client disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        this.logger.error(`WebSocket error: ${error.message}`);
        this.clients.delete(ws);
      });
    });
  }

  public async handleUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(`http://localhost${request.url}`);
    if (url.pathname !== '/info') {
      socket.destroy();
      return;
    }

    const token = extractToken(request);
    if (!token || !(await this.authService.isAuthenticated(token))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  private async sendInitialState(ws: WebSocket): Promise<void> {
    const message: OutgoingMessage = {
      type: 'initialState',
      payload: {
        icaos: await this.state.getAllIcaos(),
        spot: this.spot,
      },
    };
    ws.send(JSON.stringify(message));
  }

  public broadcastMessage(message: OutgoingMessage): void {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  }

  public async close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();
      this.wss.close(() => {
        this.logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}
