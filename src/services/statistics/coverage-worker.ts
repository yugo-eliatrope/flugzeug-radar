import concaveman from 'concaveman';
import { parentPort, workerData } from 'worker_threads';
import { PrismaClient } from '@prisma/client';

import { Coverage } from '../../domain';

const prismaClient = new PrismaClient();

type WorkerProps = {
  spotName: string;
  minDotsInCellAllowed: number;
  concavity: number;
};

const HEIGHT_LEVELS = [1000, 2000, 4000, 6000, 8000, 10000, 25000];

const isWorkerProps = (data: any): data is WorkerProps => {
  return (
    data &&
    typeof data.minDotsInCellAllowed === 'number' &&
    typeof data.concavity === 'number' &&
    typeof data.spotName === 'string'
  );
}

const workerProps = (() => {
  if (!isWorkerProps(workerData)) {
    throw new Error(`Invalid worker data: ${JSON.stringify(workerData)}`);
  }
  return workerData;
})();

const getDotsFromDB = (maxHeight: number) => {
  return prismaClient.$queryRaw`
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
        spot_name = ${workerData.spotName}
      GROUP BY stamp
    )
    SELECT lat, lon
    FROM grouped_data
    WHERE count >= ${workerProps.minDotsInCellAllowed};
  ` as Promise<{ lat: number; lon: number }[]>;
};

const calcCoverageForHeight = (dots: number[][]): { lat: number; lon: number }[] =>
  concaveman(dots, workerProps.concavity).map((point) => ({ lat: point[0], lon: point[1] }));

const calcCoverageForAllHeghts = async (): Promise<Coverage> => {
  const promises = HEIGHT_LEVELS.map(async (maxHeight) => {
    const filteredByHeight = await getDotsFromDB(maxHeight);
    const dots = filteredByHeight.map((dot) => [dot.lat, dot.lon]);
    if (dots.length < 3) return null;

    const polygon = calcCoverageForHeight(dots);
    return {
      maxHeight,
      polygon,
    };
  });

  const results = await Promise.all(promises);

  return {
    spotName: workerData.spotName,
    layers: results.filter((layer): layer is NonNullable<typeof layer> => layer !== null),
  };
};

(async () => {
  try {
    const coverage = await calcCoverageForAllHeghts();
    parentPort?.postMessage({ type: 'data', payload: coverage });
  } catch (error) {
    parentPort?.postMessage({ type: 'error', payload: (error as Error).message });
  } finally {
    await prismaClient.$disconnect();
  }
})();
