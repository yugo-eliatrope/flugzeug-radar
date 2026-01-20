WITH LaggedData AS (
    SELECT 
        id,
        icao,
        lat, 
        lon,
        updatedAt,
        LAG(updatedAt) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_time,
        LAG(lat) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_lat,
        LAG(lon) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_lon
    FROM AircraftData
)
SELECT count(*) as duplicate_count
FROM LaggedData
WHERE 
    lat = prev_lat 
    AND lon = prev_lon
    AND (updatedAt - prev_time) <= 240000;
