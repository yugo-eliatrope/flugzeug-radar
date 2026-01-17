import concaveman from 'concaveman';

interface Database {
  getAllDots: (spotName: string) => Promise<{ lat: number; lon: number }[]>;
}

export class StatisticsManager {
  public concavity: number = 2;
  constructor(
    private readonly spotNames: string[],
    private readonly db: Database
  ) {}

  public coverage = async (spotName: string): Promise<{ lat: number; lon: number }[]> => {
    if (!this.spotNames.includes(spotName)) {
      return [];
    }
    const dots = await this.db.getAllDots(spotName);
    if (dots.length < 3) {
      return [];
    }
    const points = dots.map((dot) => [dot.lon, dot.lat]);
    const hull = concaveman(points, this.concavity);
    return hull.map((point) => ({ lon: point[0], lat: point[1] }));
  };
}
