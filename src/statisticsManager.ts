import concaveman from 'concaveman';

interface Database {
  getAllDots: (spotName: string) => Promise<{ lat: number; lon: number }[]>;
}

export class StatisticsManager {
  public concavity: number = 2;
  constructor(private readonly spotName: string, private readonly db: Database) {}

  public coverage = async (): Promise<{ lat: number; lon: number }[]> => {
    const dots = await this.db.getAllDots(this.spotName);
    if (dots.length < 3) {
      return [];
    }
    const points = dots.map((dot) => [dot.lon, dot.lat]);
    const hull = concaveman(points, this.concavity);
    return hull.map((point) => ({ lon: point[0], lat: point[1] }));
  };
}
