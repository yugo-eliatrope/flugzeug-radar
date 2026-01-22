WITH lagged_data AS (
    SELECT 
        id,
        icao,
        flight,
        lat, 
        lon,
        updated_at,
        LAG(updated_at) OVER (PARTITION BY icao ORDER BY updated_at) as prev_time,
        LAG(lat) OVER (PARTITION BY icao ORDER BY updated_at) as prev_lat,
        LAG(lon) OVER (PARTITION BY icao ORDER BY updated_at) as prev_lon
    FROM aircraft_data
    ORDER BY id ASC
)
SELECT id, icao, updated_at, lat, lon, flight
FROM lagged_data
WHERE 
    lat = prev_lat 
    AND lon = prev_lon
    AND (updated_at - prev_time) <= 240000;
