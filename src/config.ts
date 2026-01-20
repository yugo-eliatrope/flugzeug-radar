import 'dotenv/config';

const getEnvVar = (name: string): string => {
  const value = process.env[name];
  if (typeof value === 'undefined') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getEnvVarAsNumber = (name: string): number => {
  const value = getEnvVar(name);
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
};

export const config = {
  sbs: {
    port: getEnvVarAsNumber('SBS_PORT'),
    host: getEnvVar('SBS_HOST'),
  },
  server: {
    port: getEnvVarAsNumber('APP_PORT'),
    authPassword: process.env['APP_AUTH_PASSWORD'] || null,
  },
  state: {
    maxAgeMs: getEnvVarAsNumber('STATE_MAX_AGE_MS'),
  },
  database: {
    url: getEnvVar('DATABASE_URL'),
  },
  statistics: {
    mapPrecision: getEnvVarAsNumber('STATISTICS_MAP_PRECISION'),
    minDotsInCellAllowed: getEnvVarAsNumber('STATISTICS_MIN_DOTS_IN_CELL_ALLOWED'),
  },
  spot: {
    name: getEnvVar('SPOT_NAME'),
    lat: getEnvVarAsNumber('SPOT_LAT'),
    lon: getEnvVarAsNumber('SPOT_LON'),
  },
  aircraftDataSaveIntervalMs: getEnvVarAsNumber('AIRCRAFT_DATA_SAVE_INTERVAL_MS'),
} as const;
