import { SBSMessage } from './domain';

const parseNullableNumber = (value: string): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseGMTDate = (dateStr: string, timeStr: string): Date => {
  const y = parseInt(dateStr.substring(0, 4), 10);
  const m = parseInt(dateStr.substring(5, 7), 10) - 1;
  const d = parseInt(dateStr.substring(8, 10), 10);
  const h = parseInt(timeStr.substring(0, 2), 10);
  const min = parseInt(timeStr.substring(3, 5), 10);
  const s = parseInt(timeStr.substring(6, 8), 10);
  const ms = parseInt(timeStr.substring(9, 12), 10);
  return new Date(Date.UTC(y, m, d, h, min, s, ms));
};

export const parseSBSLine = (line: string): SBSMessage => {
  const f = line.split(',');
  return {
    messageType: f[0],
    transmissionType: parseNullableNumber(f[1]),
    icao: f[4]?.toLowerCase().trim(),
    generatedAt: parseGMTDate(f[6], f[7]),
    flight: f[10].trim(),
    altitude: parseNullableNumber(f[11]),
    groundSpeed: parseNullableNumber(f[12]),
    track: parseNullableNumber(f[13]),
    lat: parseNullableNumber(f[14]),
    lon: parseNullableNumber(f[15]),
    verticalRate: parseNullableNumber(f[16]),
    inEmergency: f[19].includes('1'),
    isOnGround: f[21].includes('1'),
  };
};
