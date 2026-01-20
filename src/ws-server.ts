import http from 'http';
import { Duplex } from 'stream';

import { WebSocketServer as WsWebSocketServer, WebSocket } from 'ws';

import { UnsavedAircraftData } from './domain';
import { ILogger } from './logger';

interface IState {
  getAllIcaos: () => Promise<string[]>;
}

type OutgoingMessage =
  | {
      type: 'aircrafts';
      payload: UnsavedAircraftData[];
    }
  | {
      type: 'icaos';
      payload: string[];
    };

type AuthChecker = (req: http.IncomingMessage) => boolean;

export class WebSocketServer {
  private wss: WsWebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(
    private readonly state: IState,
    private readonly logger: ILogger,
    private readonly isAuthenticated: AuthChecker
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

  public handleUpgrade = (request: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(`http://localhost${request.url}`);
    if (url.pathname !== '/info') {
      socket.destroy();
      return;
    }

    if (!this.isAuthenticated(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  };

  private sendInitialState = async (ws: WebSocket) => {
    const message: OutgoingMessage = {
      type: 'icaos',
      payload: await this.state.getAllIcaos(),
    };
    ws.send(JSON.stringify(message));
  };

  public broadcastMessage = (message: OutgoingMessage) => {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  };

  public close = (): Promise<void> =>
    new Promise((resolve) => {
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
