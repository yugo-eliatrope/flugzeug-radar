import { parentPort, workerData } from 'worker_threads';

import { PrismaClient } from '@prisma/client';
import concaveman from 'concaveman';

import { Coverage } from '../../domain';
import { Logger } from '../../logger';

const prismaClient = new PrismaClient();
const logger = new Logger('CoverageWorker');

type WorkerProps = {
  spotName: string;
  minDotsInCellAllowed: number;
  concavity: number;
};

const HEIGHT_LEVELS = [1000, 2000, 4000, 6000, 8000, 10000, 25000];

const isWorkerProps = (data: unknown): data is WorkerProps =>
  typeof data === 'object' &&
  data !== null &&
  'minDotsInCellAllowed' in data &&
  typeof data.minDotsInCellAllowed === 'number' &&
  'concavity' in data &&
  typeof data.concavity === 'number' &&
  'spotName' in data &&
  typeof data.spotName === 'string';

const workerProps = (() => {
  if (!isWorkerProps(workerData)) {
    throw new Error(`Invalid worker data: ${JSON.stringify(workerData)}`);
  }
  return workerData;
})();

const getDotsFromDB = (maxHeight: number) =>
  prismaClient.$queryRaw`
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

const calcCoverageForHeight = (dots: number[][]): { lat: number; lon: number }[] =>
  concaveman(dots, workerProps.concavity).map((point) => ({ lat: point[0], lon: point[1] }));

const calcCoverageForAllHeghts = async (): Promise<Coverage> => {
  const promises = HEIGHT_LEVELS.map(async (maxHeight) => {
    logger.info(`Calculating coverage for height ${maxHeight}`);
    const d1 = Date.now();
    const filteredByHeight = await getDotsFromDB(maxHeight);
    logger.info(`Filtered dots for height ${maxHeight} in ${Date.now() - d1} ms`);
    const dots = filteredByHeight.map((dot) => [dot.lat, dot.lon]);
    if (dots.length < 3) return null;
    const d2 = Date.now();
    const polygon = calcCoverageForHeight(dots);
    logger.info(`Calculated coverage for height ${maxHeight} in ${Date.now() - d2} ms`);
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
    const timeout = setTimeout(() => process.exit(1), 15000);
    timeout.unref();
    await prismaClient.$disconnect();
    process.exit(0);
  }
})();
