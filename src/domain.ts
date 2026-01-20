import { AircraftData } from '@prisma/client';

export type SBSMessage = {
  messageType: string;
  transmissionType: number | null;
  icao: string | null;
  generatedAt: Date;
  flight: string | null;
  altitude: number | null;
  groundSpeed: number | null;
  track: number | null;
  lat: number | null;
  lon: number | null;
  verticalRate: number | null;
  inEmergency: boolean;
  isOnGround: boolean;
};

export type UnsavedAircraftData = Omit<AircraftData, 'id'>;

export { AircraftData };

export type Coverage = {
  spotName: string;
  layers: {
    maxHeight: number;
    polygon: { lat: number; lon: number }[];
  }[];
};
