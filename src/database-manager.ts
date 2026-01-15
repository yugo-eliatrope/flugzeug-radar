import { PrismaClient } from '@prisma/client';

import { UnsavedAircraftData, AircraftData } from './domain';
import { ILogger } from './logger';

type SelectParams = {
  limit?: number;
  from?: Date;
  icao?: string;
};

export class DatabaseManager {
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
    return this.prisma.aircraftData.create({
      data,
    });
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

  public async getAllAircraftData(): Promise<AircraftData[]> {
    const rawData = await this.getAircraftData();
    return rawData.filter((data) => data.lat && data.lon);
  }
}
