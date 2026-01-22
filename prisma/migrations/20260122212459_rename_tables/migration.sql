ALTER TABLE "AircraftData" RENAME TO "aircraft_data";

ALTER TABLE "aircraft_data" RENAME COLUMN "groundSpeed" TO "ground_speed";
ALTER TABLE "aircraft_data" RENAME COLUMN "verticalRate" TO "vertical_rate";
ALTER TABLE "aircraft_data" RENAME COLUMN "inEmergency" TO "in_emergency";
ALTER TABLE "aircraft_data" RENAME COLUMN "isOnGround" TO "is_on_ground";
ALTER TABLE "aircraft_data" RENAME COLUMN "spotName" TO "spot_name";
ALTER TABLE "aircraft_data" RENAME COLUMN "updatedAt" TO "updated_at";
