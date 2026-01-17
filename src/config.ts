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
  spotName: getEnvVar('SPOT_NAME'),
} as const;
