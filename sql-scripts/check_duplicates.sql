WITH LaggedData AS (
    SELECT 
        id,
        icao,
        flight,
        lat, 
        lon,
        updatedAt,
        LAG(updatedAt) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_time,
        LAG(lat) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_lat,
        LAG(lon) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_lon
    FROM AircraftData
    ORDER BY id ASC
)
SELECT id, icao, updatedAt, lat, lon, flight
FROM LaggedData
WHERE 
    lat = prev_lat 
    AND lon = prev_lon
    AND (updatedAt - prev_time) <= 240000;
