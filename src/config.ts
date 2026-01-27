import 'dotenv/config';

const getEnvVar = (name: string): string => {
  const value = process.env[name];
  if (typeof value === 'undefined') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getEnvVarAsInt = (name: string): number => {
  const value = getEnvVar(name);
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
};

const getEnvVarAsFloat = (name: string): number => {
  const value = getEnvVar(name);
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
};

export const config = {
  sbs: {
    port: getEnvVarAsInt('SBS_PORT'),
    host: getEnvVar('SBS_HOST'),
  },
  server: {
    port: getEnvVarAsInt('APP_PORT'),
    authPassword: process.env['APP_AUTH_PASSWORD'] || null,
  },
  state: {
    maxAgeMs: getEnvVarAsInt('STATE_MAX_AGE_MS'),
  },
  database: {
    url: getEnvVar('DATABASE_URL'),
  },
  statistics: {
    minDotsInCellAllowed: getEnvVarAsInt('STATISTICS_MIN_DOTS_IN_CELL_ALLOWED'),
    concavity: getEnvVarAsFloat('STATISTICS_CONCAVITY'),
  },
  spot: {
    name: getEnvVar('SPOT_NAME'),
    lat: getEnvVarAsFloat('SPOT_LAT'),
    lon: getEnvVarAsFloat('SPOT_LON'),
  },
  aircraftDataSaveIntervalMs: getEnvVarAsInt('AIRCRAFT_DATA_SAVE_INTERVAL_MS'),
} as const;
