import concaveman from 'concaveman';

import { Coverage } from './domain';

type Dot = { lat: number; lon: number; altitude: number };

interface Database {
  getAllDots: (spotName: string) => Promise<Dot[]>;
}

type Settings = {
  mapPrecision: number;
  minDotsInCellAllowed: number;
};

const HEIGHT_LEVELS = [1000, 2000, 4000, 6000, 8000, 10000, 25000];

export class StatisticsManager {
  public concavity: number = 1.8;
  constructor(
    private readonly spotNames: string[],
    private readonly db: Database,
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
    const dots = await this.db.getAllDots(spotName);
    if (dots.length < 3) {
      return res;
    }
    for (const maxHeight of HEIGHT_LEVELS) {
      const filteredByHeight = dots.filter((dot) => dot.altitude * 0.3048 <= maxHeight);
      const filteredDots = this.removeWeakDots(filteredByHeight).map((dot) => [dot.lat, dot.lon]);
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

  private removeWeakDots = (dots: Dot[]): Dot[] => {
    const densityMap: Record<string, number> = {};
    dots.forEach((dot) => {
      const key = `${dot.lat.toFixed(this.settings.mapPrecision)}|${dot.lon.toFixed(this.settings.mapPrecision)}`;
      densityMap[key] = (densityMap[key] || 0) + 1;
    });
    return Object.entries(densityMap)
      .filter(([, count]) => count >= this.settings.minDotsInCellAllowed)
      .map(([key]) => {
        const [latStr, lonStr] = key.split('|');
        return { lat: Number(latStr), lon: Number(lonStr), altitude: 0 };
      });
  };

  private calcCoverageForHeight = (dots: number[][]): { lat: number; lon: number }[] =>
    concaveman(dots, this.concavity).map((point) => ({ lat: point[0], lon: point[1] }));
}
