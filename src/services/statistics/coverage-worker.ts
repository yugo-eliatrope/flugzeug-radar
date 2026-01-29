import concaveman from 'concaveman';
import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';

import { Coverage } from '../../domain';

type WorkerProps = {
  spotName: string;
  minDotsInCellAllowed: number;
  concavity: number;
  dbPath: string;
};

const HEIGHT_LEVELS = [1000, 2000, 4000, 6000, 8000, 10000, 25000];

const isWorkerProps = (data: unknown): data is WorkerProps => {
  return (
    data !== null &&
    typeof data === 'object' &&
    'minDotsInCellAllowed' in data &&
    typeof (data as WorkerProps).minDotsInCellAllowed === 'number' &&
    'concavity' in data &&
    typeof (data as WorkerProps).concavity === 'number' &&
    'spotName' in data &&
    typeof (data as WorkerProps).spotName === 'string' &&
    'dbPath' in data &&
    typeof (data as WorkerProps).dbPath === 'string'
  );
};

const workerProps = (() => {
  if (!isWorkerProps(workerData)) {
    throw new Error(`Invalid worker data: ${JSON.stringify(workerData)}`);
  }
  return workerData;
})();

const db = new Database(workerProps.dbPath, { readonly: true });

const getDotsFromDB = (maxHeight: number): { lat: number; lon: number }[] => {
  const altitudeInFeet = maxHeight / 0.3048;

  const stmt = db.prepare(`
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
        altitude <= ? AND
        spot_name = ?
      GROUP BY stamp
    )
    SELECT lat, lon
    FROM grouped_data
    WHERE count >= ?
  `);

  const rows = stmt.all(altitudeInFeet, workerProps.spotName, workerProps.minDotsInCellAllowed) as {
    lat: number;
    lon: number;
  }[];

  console.log(`Height ${maxHeight} - fetched ${rows.length} dots`);

  return rows;
};

const calcCoverageForHeight = (dots: number[][]): { lat: number; lon: number }[] =>
  concaveman(dots, workerProps.concavity).map((point) => ({ lat: point[0], lon: point[1] }));

const calcCoverageForAllHeights = (): Coverage => {
  const layers = HEIGHT_LEVELS.map((maxHeight) => {
    const filteredByHeight = getDotsFromDB(maxHeight);
    const dots = filteredByHeight.map((dot) => [dot.lat, dot.lon]);
    if (dots.length < 3) return null;

    const polygon = calcCoverageForHeight(dots);
    return {
      maxHeight,
      polygon,
    };
  });

  return {
    spotName: workerProps.spotName,
    layers: layers.filter((layer): layer is NonNullable<typeof layer> => layer !== null),
  };
};

try {
  const coverage = calcCoverageForAllHeights();
  parentPort?.postMessage({ type: 'data', payload: coverage });
} catch (error) {
  parentPort?.postMessage({ type: 'error', payload: (error as Error).message });
} finally {
  db.close();
}
