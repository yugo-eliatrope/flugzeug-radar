DELETE FROM aircraft_data
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            updated_at,
            lat,
            lon,
            LAG(updated_at) OVER (PARTITION BY icao ORDER BY updated_at) as prev_time,
            LAG(lat) OVER (PARTITION BY icao ORDER BY updated_at) as prev_lat,
            LAG(lon) OVER (PARTITION BY icao ORDER BY updated_at) as prev_lon
        FROM aircraft_data
    )
    WHERE 
        lat = prev_lat 
        AND lon = prev_lon
        AND (updated_at - prev_time) <= 240000
);
VACUUM;
