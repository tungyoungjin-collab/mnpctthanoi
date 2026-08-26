const Database = require("better-sqlite3");

const db = new Database("./hydro.db");

const result = db.prepare(`
    SELECT
        station_id,
        station_name,
        timestamp,
        water_level
    FROM water_levels
    WHERE station_id = ?
      AND timestamp = ?
`).all(
    "F01391",
    "2026-08-22T11:20:00"
);

console.log("===== KIỂM TRA BÀI 49.13.2 =====");
console.log(result);
console.log("=================================");

db.close();