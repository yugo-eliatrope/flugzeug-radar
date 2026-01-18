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

  public async getAllIcaos(): Promise<string[]> {
    const rawData = await this.prisma.aircraftData.findMany({
      select: { icao: true },
      distinct: ['icao'],
    });
    return rawData.map((item) => item.icao);
  }

  public async getAllDots(spotName: string): Promise<{ lat: number; lon: number; altitude: number }[]> {
    const rawData = await this.prisma.aircraftData.findMany({
      where: { spotName, lat: { not: null }, lon: { not: null }, altitude: { not: null } },
      select: { lat: true, lon: true, altitude: true },
    });
    return rawData.filter((item): item is { lat: number; lon: number; altitude: number } => item.lat !== null && item.lon !== null && item.altitude !== null);
  }

  public async getAllSpotNames(): Promise<string[]> {
    const rawData = await this.prisma.aircraftData.findMany({
      select: { spotName: true },
      distinct: ['spotName'],
    });
    return rawData.map((item) => item.spotName).filter((item): item is string => item !== null);
  }
}
