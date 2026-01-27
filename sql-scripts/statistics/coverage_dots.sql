WITH grouped_data AS (
  SELECT
    count(id) as count,
    round(lat, 2) as lat,
    round(lon, 2) as lon,
    round(lon, 2) * 10000 + round(lat, 2) as stamp
  FROM aircraft_data
  WHERE
    lat IS NOT NULL AND
    lon IS NOT NULL AND
    altitude <= 3281 AND
    spot_name = "home"
  GROUP BY stamp
)
SELECT lat, lon
FROM grouped_data
WHERE count >= 5;
-- This query aggregates aircraft data points by rounding their latitude and longitude