SELECT
    hour,
    round(avg(flights), 2)
FROM (
    SELECT
        count(distinct icao) as flights,
        strftime('%Y-%m-%d %H', updated_at / 1000, 'unixepoch', 'localtime') as time,
        strftime('%H', updated_at / 1000, 'unixepoch', 'localtime') as hour
    FROM aircraft_data
    WHERE spot_name = 'home'
    GROUP BY time
)
GROUP BY hour
ORDER BY hour ASC;
