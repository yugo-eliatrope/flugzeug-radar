import { AircraftData } from './domain';

const FLIGHTS_GAP = 30 * 60 * 1000; // 30 min

const isLessThanFlightGap = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < FLIGHTS_GAP;

type ICAO = string;

export type AircraftHistoryStore = Record<ICAO, FlightHistory[]>;

type FlightHistory = {
  flight: string;
  from: Date;
  to: Date;
  segments: HistorySegment[];
};

type HistorySegment = {
  lat: number;
  lon: number;
  altitude: number;
  time: Date;
};

const toHistorySegment = (lat: number, lon: number, altitude: number, time: Date): HistorySegment => ({
  lat,
  lon,
  altitude,
  time,
});

const findHistoryForAD = (ad: AircraftData, histories: FlightHistory[]): FlightHistory | null => {
  if (histories.length) {
    const passedItem = histories.find(
      ({ from, to }) => isLessThanFlightGap(ad.updatedAt, from) || isLessThanFlightGap(ad.updatedAt, to)
    );
    if (passedItem) {
      if (!passedItem.flight && ad.flight) {
        passedItem.flight = ad.flight;
      }
      return passedItem;
    }
  }
  return null;
};

export const formAircraftHistoryStore = (data: AircraftData[]): AircraftHistoryStore => {
  const res: AircraftHistoryStore = {};
  for (const item of data) {
    const { icao } = item;
    if (!item.lat || !item.lon || !item.altitude) continue;
    if (!res[icao]) res[icao] = [];
    let passedHistory = findHistoryForAD(item, res[icao]);
    if (!passedHistory) {
      const length = res[icao].push({
        flight: item.flight || '',
        from: item.updatedAt,
        to: item.updatedAt,
        segments: [],
      });
      passedHistory = res[icao][length - 1];
    }
    const newLength = passedHistory.segments.push(toHistorySegment(item.lat, item.lon, item.altitude, item.updatedAt));
    passedHistory.to = passedHistory.segments[newLength - 1].time;
  }
  return res;
};
