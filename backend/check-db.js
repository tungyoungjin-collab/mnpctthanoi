const Database = require("better-sqlite3");

const db = new Database("hydro.db");

const rows = db.prepare(`
    SELECT
        station_id,
        timestamp,
        water_level
    FROM water_levels
    WHERE station_id = 'F01391'
      AND timestamp BETWEEN '2026-08-21T11:40:00'
                         AND '2026-08-21T14:20:00'
    ORDER BY timestamp
`).all();

console.table(rows);

db.close();