import Database from 'better-sqlite3';

import { UnsavedAircraftData, AircraftData } from './domain';
import { ILogger } from './logger';

type SelectParams = {
  limit?: number;
  from?: Date;
  icao: string;
};

type AircraftDataRow = {
  id: number;
  icao: string;
  flight: string | null;
  altitude: number | null;
  ground_speed: number | null;
  track: number | null;
  lat: number | null;
  lon: number | null;
  vertical_rate: number | null;
  in_emergency: number;
  is_on_ground: number;
  spot_name: string | null;
  updated_at: string;
};

const rowToAircraftData = (row: AircraftDataRow): AircraftData => ({
  id: row.id,
  icao: row.icao,
  flight: row.flight,
  altitude: row.altitude,
  groundSpeed: row.ground_speed,
  track: row.track,
  lat: row.lat,
  lon: row.lon,
  verticalRate: row.vertical_rate,
  inEmergency: row.in_emergency === 1,
  isOnGround: row.is_on_ground === 1,
  spotName: row.spot_name,
  updatedAt: new Date(row.updated_at),
});

export class DatabaseManager {
  private db: Database.Database;

  constructor(private readonly logger: ILogger) {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './dev.db';
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  async connect(): Promise<void> {
    this.logger.info('Connected to database');
  }

  async disconnect(): Promise<void> {
    this.db.close();
    this.logger.info('Disconnected from database');
  }

  public async saveAircraftData(data: UnsavedAircraftData): Promise<AircraftData> {
    this.logger.info(`Saving aircraft data for ICAO: ${data.icao}`);

    const stmt = this.db.prepare(`
      INSERT INTO aircraft_data (icao, flight, altitude, ground_speed, track, lat, lon, vertical_rate, in_emergency, is_on_ground, spot_name, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.icao,
      data.flight,
      data.altitude,
      data.groundSpeed,
      data.track,
      data.lat,
      data.lon,
      data.verticalRate,
      data.inEmergency ? 1 : 0,
      data.isOnGround ? 1 : 0,
      data.spotName,
      data.updatedAt.toISOString()
    );

    return {
      id: result.lastInsertRowid as number,
      ...data,
    };
  }

  public async getAircraftData(params: SelectParams): Promise<AircraftData[]> {
    let query = 'SELECT * FROM aircraft_data WHERE icao = ?';
    const queryParams: (string | number)[] = [];
    queryParams.push(params.icao);

    if (params?.from) {
      query += ' AND updated_at >= ?';
      queryParams.push(params.from.toISOString());
    }

    query += ' ORDER BY updated_at DESC';

    if (params?.limit) {
      query += ' LIMIT ?';
      queryParams.push(params.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...queryParams) as AircraftDataRow[];
    return rows.map(rowToAircraftData);
  }

  public async getLastAircraftData(icao: string): Promise<AircraftData | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM aircraft_data
      WHERE icao = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    const row = stmt.get(icao) as AircraftDataRow | undefined;
    return row ? rowToAircraftData(row) : null;
  }

  public async getAllIcaos(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT DISTINCT icao FROM aircraft_data');
    const rows = stmt.all() as { icao: string }[];
    return rows.map((row) => row.icao);
  }

  public async getAllDots(spotName: string): Promise<{ lat: number; lon: number; altitude: number }[]> {
    const stmt = this.db.prepare(`
      SELECT lat, lon, altitude FROM aircraft_data
      WHERE spot_name = ?
        AND lat IS NOT NULL
        AND lon IS NOT NULL
        AND altitude IS NOT NULL
        AND flight IS NOT NULL
        AND ground_speed IS NOT NULL
    `);

    const rows = stmt.all(spotName) as { lat: number; lon: number; altitude: number }[];
    return rows;
  }

  public async getAllSpotNames(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT DISTINCT spot_name FROM aircraft_data WHERE spot_name IS NOT NULL');
    const rows = stmt.all() as { spot_name: string }[];
    return rows.map((row) => row.spot_name);
  }

  public async allApiKeys(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT token FROM api_keys');
    const rows = stmt.all() as { token: string }[];
    return rows.map((row) => row.token);
  }
}
