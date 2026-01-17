import crypto from 'crypto';
import http from 'http';
import path from 'path';

import { ILogger } from './logger';
import { AircraftData } from './domain';
import { formAircraftHistoryStore } from './aircraft-history';

interface IStateProvider {
  getAircraftData: (params: { icao: string }) => Promise<AircraftData[]>;
}

interface IStatisticsProvider {
  coverage: () => Promise<{ lat: number; lon: number }[]>;
}

type Config = {
  port: number;
  authPassword: string | null;
};

export class HttpServer {
  public readonly server: http.Server;
  private sessions = new Set<string>();

  constructor(
    private readonly config: Config,
    private readonly logger: ILogger,
    private readonly stateProvider: IStateProvider,
    private readonly statisticsProvider: IStatisticsProvider,
    private readonly staticFiles: Record<string, Buffer>
  ) {
    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });
  }

  public start = () => {
    this.server.listen(this.config.port, () => {
      this.logger.info(`Listening on port ${this.config.port}`);
    });
  };

  public stop = (): Promise<void> =>
    new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          this.logger.error(`Error closing server: ${err.message}`);
          reject(err);
        } else {
          this.logger.info('Server closed');
          resolve();
        }
      });
    });

  public isAuthenticated = (req: http.IncomingMessage): boolean => {
    if (!this.config.authPassword) return true;
    const sessionToken = this.getSessionToken(req);
    return sessionToken !== null && this.sessions.has(sessionToken);
  };

  private getSessionToken = (req: http.IncomingMessage): string | null => {
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/session=([^;]+)/);
    return match ? match[1] : null;
  };

  private handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(`http://localhost${req.url}`);

    if (url.pathname === '/login' && req.method === 'POST') {
      await this.handleLoginRequest(req, res);
      return;
    }
    if (url.pathname === '/logout') {
      await this.handleLogoutRequest(req, res);
      return;
    }
    if (url.pathname === '/favicon.ico') {
      this.handleFaviconRequest(res);
      return;
    }

    const isAuthenticated = this.isAuthenticated(req);

    if (url.pathname === '/') {
      if (isAuthenticated) {
        res.statusCode = 302;
        res.setHeader('Location', '/app');
        res.end();
      } else {
        this.handleLoginPageRequest(res);
      }
      return;
    }

    if (!isAuthenticated) {
      res.statusCode = 302;
      res.setHeader('Location', '/');
      res.end();
      return;
    }

    switch (url.pathname) {
      case '/app': {
        this.handleAppRequest(res);
        break;
      }
      case '/aircraft-data': {
        this.handleAircraftDataRequest(req, res);
        break;
      }
      case '/statistics': {
        await this.handleStatisticsRequest(res);
        break;
      }
      default: {
        this.handleStaticFileRequest(res, url.pathname);
        break;
      }
    }
  };

  private handleLoginPageRequest = (res: http.ServerResponse) => {
    res.setHeader('Content-Type', 'text/html');
    res.statusCode = 200;
    res.write(this.staticFiles['public/index.html']);
    res.end();
  };

  private handleLoginRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const body = await this.readBody(req);
      const { password } = JSON.parse(body);

      if (password === this.config.authPassword) {
        const sessionToken = crypto.randomBytes(32).toString('hex');
        this.sessions.add(sessionToken);
        res.setHeader('Set-Cookie', `session=${sessionToken}; HttpOnly; Path=/; SameSite=Strict`);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true }));
      } else {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'Invalid password' }));
      }
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  };

  private handleLogoutRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const sessionToken = this.getSessionToken(req);
    if (sessionToken) {
      this.sessions.delete(sessionToken);
    }
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  };

  private readBody = (req: http.IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk.toString()));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });

  private handleAppRequest = (res: http.ServerResponse) => {
    res.setHeader('Content-Type', 'text/html');
    res.statusCode = 200;
    res.write(this.staticFiles['public/app.html']);
    res.end();
  };

  private handleStatisticsRequest = async (res: http.ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    const coverage = await this.statisticsProvider.coverage();
    res.end(JSON.stringify({ coverage }));
  }

  private handleAircraftDataRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(`http://localhost${req.url}`);
    const icao = url.searchParams.get('icao');
    if (!icao) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'ICAO is required' }));
      return;
    }
    const aircraftData = await this.stateProvider.getAircraftData({ icao });
    if (!aircraftData) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Aircraft data not found' }));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    const history = formAircraftHistoryStore(aircraftData.reverse());
    res.end(JSON.stringify(history));
  };

  private handleFaviconRequest = (res: http.ServerResponse) => {
    const favicon = this.staticFiles['public/favicon.svg'];
    if (favicon) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.statusCode = 200;
      res.write(favicon);
    } else {
      res.statusCode = 404;
    }
    res.end();
  };

  private handleStaticFileRequest = (res: http.ServerResponse, urlPathname: string) => {
    const filePath = urlPathname.replace(/^\//, '');
    const file = this.staticFiles[filePath];
    if (file) {
      res.setHeader('Content-Type', this.getMimeType(filePath));
      res.statusCode = 200;
      res.write(file);
    } else {
      res.statusCode = 404;
    }
    res.end();
  };

  private getMimeType = (filePath: string) => {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.html':
        return 'text/html';
      case '.css':
        return 'text/css';
      case '.js':
        return 'application/javascript';
      default:
        return 'application/octet-stream';
    }
  };
}
