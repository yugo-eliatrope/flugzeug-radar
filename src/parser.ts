import { SBSMessage } from './domain';

const parseNullableNumber = (value: string): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseGMTDate = (dateStr: string, timeStr: string): Date => {
  const dateTimeStr = `${`${dateStr} ${timeStr}`.replace(/\//g, '-').replace(' ', 'T')}Z`;
  return new Date(dateTimeStr);
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
