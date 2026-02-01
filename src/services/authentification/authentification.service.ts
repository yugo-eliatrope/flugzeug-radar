import crypto from 'crypto';

interface DatabaseManager {
  allApiKeys: () => Promise<string[]>;
}

export class AuthentificationService {
  private sessionKeys = new Set<string>();

  constructor(
    private db: DatabaseManager,
    private authPassword: string | null
  ) {}

  public async isAuthenticated(sessionToken: string): Promise<boolean> {
    if (!this.authPassword) return true;
    if (!sessionToken) return false;
    return this.sessionKeys.has(sessionToken) || (await this.isValidApiKey(sessionToken));
  }

  public async login(password: string): Promise<string | null> {
    if (password !== this.authPassword) return null;
    const token = crypto.randomBytes(32).toString('hex');
    this.sessionKeys.add(token);
    return token;
  }

  public logout(token: string): void {
    this.sessionKeys.delete(token);
  }

  private async isValidApiKey(token: string): Promise<boolean> {
    const keys = await this.db.allApiKeys();
    return keys.includes(token);
  }
}
