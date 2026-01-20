DELETE FROM AircraftData
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            updatedAt,
            lat,
            lon,
            LAG(updatedAt) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_time,
            LAG(lat) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_lat,
            LAG(lon) OVER (PARTITION BY icao ORDER BY updatedAt) as prev_lon
        FROM AircraftData
    )
    WHERE 
        lat = prev_lat 
        AND lon = prev_lon
        AND (updatedAt - prev_time) <= 240000
);
VACUUM;
