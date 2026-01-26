import concaveman from 'concaveman';
import { PrismaClient } from '@prisma/client';

import { Coverage } from './domain';

type Settings = {
  minDotsInCellAllowed: number;
};

const HEIGHT_LEVELS = [1000, 2000, 4000, 6000, 8000, 10000, 25000];

export class StatisticsManager {
  public concavity: number = 1.8;
  private prismaClient: PrismaClient = new PrismaClient();

  constructor(
    private readonly spotNames: string[],
    private readonly settings: Settings
  ) {}

  public coverage = async (spotName: string): Promise<Coverage> => {
    const res: Coverage = {
      spotName,
      layers: [],
    };
    if (!this.spotNames.includes(spotName)) {
      return res;
    }
    for (const maxHeight of HEIGHT_LEVELS) {
      const filteredByHeight = await this.selectDots(spotName, maxHeight);
      const filteredDots = filteredByHeight.map((dot) => [dot.lat, dot.lon]);
      if (filteredDots.length < 3) {
        continue;
      }
      const polygon = this.calcCoverageForHeight(filteredDots);
      res.layers.push({
        maxHeight,
        polygon,
      });
    }
    return res;
  };

  private selectDots = (spotName: string, maxHeight: number) => {
    return this.prismaClient.$queryRaw`
      WITH grouped_data AS (
        SELECT
          count(id) as count,
          round(lat, 2) as lat,
          round(lon, 2) as lon,
          round(lon, 2) * 10000 + round(lat, 2) as stamp
        FROM aircraft_data
        WHERE
          lat IS NOT NULL AND
          lon IS NOT NULL AND
          altitude <= ${maxHeight / 0.3048} AND
          spot_name = ${spotName}
        GROUP BY stamp
      )
      SELECT lat, lon
      FROM grouped_data
      WHERE count >= ${this.settings.minDotsInCellAllowed};
    ` as Promise<{ lat: number; lon: number }[]>;
  };

  private calcCoverageForHeight = (dots: number[][]): { lat: number; lon: number }[] =>
    concaveman(dots, this.concavity).map((point) => ({ lat: point[0], lon: point[1] }));
}
