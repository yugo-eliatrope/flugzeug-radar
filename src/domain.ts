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

export type AircraftData = {
  id: number;
  icao: string;
  flight: string | null;
  altitude: number | null;
  groundSpeed: number | null;
  track: number | null;
  lat: number | null;
  lon: number | null;
  verticalRate: number | null;
  inEmergency: boolean;
  isOnGround: boolean;
  spotName: string | null;
  updatedAt: Date;
};

export type UnsavedAircraftData = Omit<AircraftData, 'id'>;

export type ApiKey = {
  id: number;
  owner: string;
  token: string;
  createdAt: Date;
};

export type Coverage = {
  spotName: string;
  layers: {
    maxHeight: number;
    polygon: { lat: number; lon: number }[];
  }[];
};
