import { AircraftData } from './domain';

const FLIGHTS_GAP = 30 * 60 * 1000; // 30 min

const isLessThanFlightGap = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < FLIGHTS_GAP;

type ICAO = string;

type AircraftHistoryStore = Record<ICAO, FlightHistory[]>;

type FlightHistory = {
  flight: string;
  from: Date;
  to: Date;
  segments: HistorySegment[];
};

type HistorySegment = {
  lat: number;
  lon: number;
  time: Date;
};

const toHistorySegment = (lat: number, lon: number, time: Date): HistorySegment => ({ lat, lon, time });

const findHistoryForAD = (ad: AircraftData, histories: FlightHistory[]): FlightHistory | null => {
  if (histories.length) {
    const passedItem = histories.find(
      ({ from, to, flight }) => flight === ad.flight && (isLessThanFlightGap(ad.updatedAt, from) || isLessThanFlightGap(ad.updatedAt, to))
    );
    if (passedItem) return passedItem;
  }
  return null;
};

const segmentsWithoutFlight: Record<ICAO, HistorySegment[]> = {};

export const formAircraftHistoryStore = (data: AircraftData[]): AircraftHistoryStore => {
  const res: AircraftHistoryStore = {};
  for (const item of data) {
    const { icao } = item;
    if (!item.lat || !item.lon) continue;
    if (!res[icao]) res[icao] = [];
    if (!item.flight) {
      if (!segmentsWithoutFlight[icao]) segmentsWithoutFlight[icao] = [];
      segmentsWithoutFlight[icao].push(toHistorySegment(item.lat, item.lon, item.updatedAt));
    } else {
      let passedHistory = findHistoryForAD(item, res[icao]);
      if (!passedHistory) {
        res[icao].push({ flight: item.flight, from: item.updatedAt, to: item.updatedAt, segments: [] });
        passedHistory = res[icao][res[icao].length - 1];
      }
      if (segmentsWithoutFlight[icao]?.length) {
        for (const unwritten of segmentsWithoutFlight[icao]) {
          if (!passedHistory.segments.length || isLessThanFlightGap(unwritten.time, passedHistory.segments[passedHistory.segments.length - 1].time)) {
            passedHistory.segments.push(unwritten);
          }
        }
        segmentsWithoutFlight[icao] = [];
      }
      const newLength = passedHistory.segments.push(toHistorySegment(item.lat, item.lon, item.updatedAt));
      passedHistory.to = passedHistory.segments[newLength - 1].time;
    }
  }
  return res;
};
