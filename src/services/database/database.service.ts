/**
 * WARNING!!!
 * Some requests to DB are raw SQL queries because of Prisma performance
 * issues with millions of records.
 *
 * ВНИМАНИЕ!!!
 * Некоторые запросы к БД выполняются с помощью сырых SQL-запросов из-за
 * проблем с производительностью Prisma при работе с миллионами записей.
 */

import { PrismaClient } from '@prisma/client';

import { UnsavedAircraftData, AircraftData } from '../../domain';
import { ILogger } from '../../logger';

type SelectParams = {
  limit?: number;
  from?: Date;
  icao?: string;
};

export class DatabaseService {
  private prisma: PrismaClient;

  constructor(private readonly logger: ILogger) {
    this.prisma = new PrismaClient();
  }

  async connect(): Promise<void> {
    await this.prisma.$connect();
    this.logger.info('Connected to database');
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.info('Disconnected from database');
  }

  public async saveAircraftData(data: UnsavedAircraftData): Promise<AircraftData> {
    this.logger.info(`Saving aircraft data for ICAO: ${data.icao}`);
    return this.prisma.aircraftData.create({ data });
  }

  public async getAircraftData(params?: SelectParams): Promise<AircraftData[]> {
    const timeParameter = params?.from ? { updatedAt: { gte: params.from.toISOString() } } : undefined;
    return this.prisma.aircraftData.findMany({
      orderBy: { updatedAt: 'desc' },
      take: params?.limit,
      where: { ...timeParameter, icao: params?.icao },
    });
  }

  public async getLastAircraftData(icao: string): Promise<AircraftData | null> {
    return this.prisma.aircraftData.findFirst({
      orderBy: { updatedAt: 'desc' },
      where: { icao },
    });
  }

  public async getAllIcaos(): Promise<string[]> {
    const rawData = await this.prisma.$queryRaw<{ icao: string }[]>`
      SELECT DISTINCT icao FROM aircraft_data
    `;
    return rawData.map((item) => item.icao);
  }

  public async getAllSpotNames(): Promise<string[]> {
    const rawData = await this.prisma.$queryRaw<{ spot_name: string }[]>`
      SELECT DISTINCT spot_name FROM aircraft_data WHERE spot_name IS NOT NULL
    `;
    return rawData.map((item) => item.spot_name);
  }

  public async allApiKeys(): Promise<string[]> {
    const rawData = await this.prisma.apiKey.findMany({
      select: { token: true },
    });
    return rawData.map((item) => item.token);
  }
}
