-- CreateTable
CREATE TABLE "AircraftData" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "icao" TEXT NOT NULL,
    "flight" TEXT,
    "altitude" INTEGER,
    "groundSpeed" INTEGER,
    "track" REAL,
    "lat" REAL,
    "lon" REAL,
    "verticalRate" INTEGER,
    "inEmergency" BOOLEAN NOT NULL DEFAULT false,
    "isOnGround" BOOLEAN NOT NULL DEFAULT false,
    "spotName" TEXT,
    "updatedAt" DATETIME NOT NULL
);

