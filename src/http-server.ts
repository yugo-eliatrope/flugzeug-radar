import http from 'http';
import path from 'path';

import { formAircraftHistoryStore } from './aircraft-history';
import { AircraftData, Coverage } from './domain';
import { ILogger } from './logger';
import { extractToken } from './utils';

interface IStateProvider {
  getAircraftData: (params: { icao: string }) => Promise<AircraftData[]>;
  allApiKeys: () => Promise<string[]>;
}

interface IAuthService {
  isAuthenticated: (token: string) => Promise<boolean>;
  login: (password: string) => Promise<string | null>;
  logout: (token: string) => void;
}

interface IStatisticsProvider {
  coverage: (spotName: string) => Promise<Coverage>;
}

type Config = {
  port: number;
};

export class HttpServer {
  public readonly server: http.Server;

  constructor(
    private readonly config: Config,
    private readonly logger: ILogger,
    private readonly authService: IAuthService,
    private readonly stateProvider: IStateProvider,
    private readonly statisticsProvider: IStatisticsProvider,
    private readonly staticFiles: Record<string, Buffer>
  ) {
    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });
  }

  public start(): void {
    this.server.listen(this.config.port, () => {
      this.logger.info(`Listening on port ${this.config.port}`);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
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
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = this.formURL(req);

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

    const token = extractToken(req);
    const isAuthenticated = token ? await this.authService.isAuthenticated(token) : false;

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
        await this.handleStatisticsRequest(req, res);
        break;
      }
      default: {
        this.handleStaticFileRequest(res, url.pathname);
        break;
      }
    }
  }

  private handleLoginPageRequest(res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'text/html');
    res.statusCode = 200;
    res.write(this.staticFiles['public/index.html']);
    res.end();
  }

  private async handleLoginRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { password } = JSON.parse(body);
    const sessionToken = await this.authService.login(password);
    if (sessionToken) {
      res.setHeader('Set-Cookie', `session=${sessionToken}; HttpOnly; Path=/; SameSite=Strict`);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    } else {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Invalid password' }));
    }
  }

  private async handleLogoutRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const sessionToken = extractToken(req);
    if (sessionToken) this.authService.logout(sessionToken);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk.toString()));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private handleAppRequest(res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'text/html');
    res.statusCode = 200;
    res.write(this.staticFiles['public/app.html']);
    res.end();
  }

  private formURL(req: http.IncomingMessage): URL {
    return new URL(`http://ooo${req.url}`);
  }

  private async handleStatisticsRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = this.formURL(req);
    const spotName = url.searchParams.get('spotName');
    if (!spotName) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Spot name is required' }));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    const coverage = await this.statisticsProvider.coverage(spotName);
    res.end(JSON.stringify({ coverage }));
  }

  private async handleAircraftDataRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = this.formURL(req);
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
  }

  private handleFaviconRequest(res: http.ServerResponse): void {
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
  }

  private handleStaticFileRequest(res: http.ServerResponse, urlPathname: string): void {
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
  }

  private getMimeType(filePath: string): string {
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
  }
}
