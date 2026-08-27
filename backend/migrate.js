const sqlite3 = require("better-sqlite3");
const { Pool } = require("pg");

const localDb = new sqlite3("hydro.db");
const pool = new Pool({
    connectionString: "postgresql://hydrouser:Bnr6hT8gQmc4Jb5HORQ1rWvFx76Wg0gG@dpg-da7qrcp5efls73eavblg-a.singapore-postgres.render.com:5432/hydromonitoring",
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log("🔄 Bắt đầu migrate...");
        const rows = localDb.prepare("SELECT * FROM water_levels").all();
        console.log(`📊 Tìm thấy ${rows.length} bản ghi từ SQLite`);

        for (const row of rows) {
            await pool.query(`
                INSERT INTO water_levels (station_id, station_name, date, time, timestamp, water_level)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (station_id, timestamp) DO NOTHING
            `, [row.station_id, row.station_name, row.date, row.time, row.timestamp, row.water_level]);
        }

        console.log(`✅ Đã migrate ${rows.length} bản ghi sang PostgreSQL!`);
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error("❌ Lỗi migrate:", error.message);
        process.exit(1);
    }
}

migrate();