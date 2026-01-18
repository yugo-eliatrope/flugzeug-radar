import concaveman from 'concaveman';
import { Coverage } from './domain';

interface Database {
  getAllDots: (spotName: string) => Promise<{ lat: number; lon: number; altitude: number }[]>;
}

const HEIGHT_LEVELS = [2000, 4000, 6000, 8000, 10000, 25000];

export class StatisticsManager {
  public concavity: number = 2;
  constructor(
    private readonly spotNames: string[],
    private readonly db: Database
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
      const filteredDots = dots
        .filter((dot) => dot.altitude * 0.3048 <= maxHeight)
        .map((dot) => [dot.lat, dot.lon]);
      if (filteredDots.length < 3) {
        continue;
      }
      const polygon = this.calcCoverageForHeight(filteredDots, maxHeight);
      res.layers.push({
        maxHeight,
        polygon,
      });
    }
    return res;
  };

  private calcCoverageForHeight = (dots: number[][], maxHeight: number): { lat: number; lon: number }[] => {
    return concaveman(dots, this.concavity).map((point) => ({ lat: point[0], lon: point[1] }));
  };
}
