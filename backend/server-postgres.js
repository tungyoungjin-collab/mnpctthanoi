const express = require("express");
const cors = require("cors");
const https = require("https");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://hydrouser:Bnr6hT8gQmc4Jb5HORQ1rWvFx76Wg0gG@dpg-da7qrcp5efls73eavblg-a/hydromonitoring",
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.static(path.join(__dirname, "..")));
app.use((req, res, next) => {
    if (req.url.endsWith('.js')) {
        res.type('application/javascript');
    }
    next();
});

// ========================================
// KHỞI TẠO DATABASE
// ========================================

async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS water_levels (
                id SERIAL PRIMARY KEY,
                station_id VARCHAR(20) NOT NULL,
                station_name VARCHAR(255) NOT NULL,
                date VARCHAR(10) NOT NULL,
                time VARCHAR(8) NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                water_level NUMERIC(10,2) NOT NULL
            )
        `);

        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_station_timestamp
            ON water_levels (station_id, timestamp)
        `);

        console.log("✅ Database PostgreSQL đã sẵn sàng.");
    } catch (error) {
        console.error("❌ Lỗi khởi tạo database:", error.message);
    }
}

// ========================================
// DANH SÁCH TRẠM
// ========================================

const STATIONS = [
    { stationId: "F01391", stationName: "Trung Hà", lat: 21.234812, lon: 105.352965 },
    { stationId: "F01559", stationName: "Thuỷ văn Hà Nội", lat: 21.045556, lon: 105.863590 },
    { stationId: "F01812", stationName: "An Cảnh", lat: 20.830429, lon: 105.909473 },
    { stationId: "F01771", stationName: "Liên Mạc", lat: 21.089672, lon: 105.770596 },
    { stationId: "F01540", stationName: "Cầu Kim Quan", lat: 21.051912, lon: 105.572375 },
    { stationId: "F01254", stationName: "TB Vĩnh Phúc", lat: 20.981412, lon: 105.595035 },
    { stationId: "F01532", stationName: "TV Ba Thá", lat: 20.805633, lon: 105.708087 },
    { stationId: "F01223", stationName: "Mạnh Tân", lat: 21.177300, lon: 105.897578 },
    { stationId: "F01215", stationName: "Lương Phúc", lat: 21.24668031083425, lon: 105.9335023294307 },
    { stationId: "F01247", stationName: "Yên Duyệt", lat: 20.880088, lon: 105.669048 },
    { stationId: "F01905", stationName: "Đồng Quan", lat: 20.794617, lon: 105.837148 },
    { stationId: "F02031", stationName: "Nhật Tựu", lat: 20.638857, lon: 105.901471 },
    { stationId: "F01238", stationName: "TB Hoà Lạc", lat: 20.655680, lon: 105.721355 },
    { stationId: "F01828", stationName: "TB Đình Thông", lat: 21.329425, lon: 105.866009 }
];

const STATION_NAMES = Object.fromEntries(
    STATIONS.map(station => [station.stationId, station.stationName])
);

const stationIds = [
    "F01391", "F01532", "F01247", "F01771", "F01540", "F01254", "F01215",
    "F02031", "F01812", "F01905", "F01223", "F01238", "F01559", "F01828"
];

// ========================================
// TIỆN ÍCH
// ========================================

const DATE_DDMMYYYY_RE = /^\d{2}\/\d{2}\/\d{4}$/;

function isRealCalendarDate(day, month, year) {
    const testDate = new Date(Number(year), Number(month) - 1, Number(day));
    return (
        testDate.getFullYear() === Number(year) &&
        testDate.getMonth() === Number(month) - 1 &&
        testDate.getDate() === Number(day)
    );
}

function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function computeGaps(rows, thresholdMinutes = 10) {
    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
        const previous = new Date(rows[i - 1].timestamp);
        const current = new Date(rows[i].timestamp);
        const diffMinutes = (current.getTime() - previous.getTime()) / 60000;

        if (diffMinutes > thresholdMinutes) {
            gaps.push({
                from: rows[i - 1].timestamp,
                to: rows[i].timestamp,
                gapMinutes: diffMinutes
            });
        }
    }
    return gaps;
}

// ========================================
// LẤY DỮ LIỆU TỪ API NGUỒN
// ========================================

async function saveStationDataToDatabase(data) {
    for (const station of data) {
        try {
            await pool.query(`
                INSERT INTO water_levels (station_id, station_name, date, time, timestamp, water_level)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (station_id, timestamp) DO NOTHING
            `, [
                station.stationId,
                station.stationName,
                station.date,
                station.time,
                station.timestamp,
                station.waterLevel
            ]);
        } catch (error) {
            console.error(`Lỗi lưu trạm ${station.stationId}:`, error.message);
        }
    }
    console.log(`✅ Đã lưu ${data.length} trạm vào database.`);
}

async function filterNewStationData(data) {
    const newData = [];
    for (const station of data) {
        try {
            const result = await pool.query(`
                SELECT timestamp FROM water_levels
                WHERE station_id = $1
                ORDER BY timestamp DESC LIMIT 1
            `, [station.stationId]);

            const latest = result.rows[0];
            // Convert to Date objects for proper comparison
            const newTime = new Date(station.timestamp).getTime();
            const latestTime = latest ? new Date(latest.timestamp).getTime() : 0;
            
            console.log(`Station ${station.stationId}: new=${newTime}, latest=${latestTime}`);
            
            if (!latest || newTime > latestTime) {
                newData.push(station);
            }
        } catch (error) {
            console.error(`Lỗi kiểm tra trạm ${station.stationId}:`, error.message);
        }
    }
    return newData;
}

function getWaterLevelFromAPI(retryCount = 0) {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 3000;

    const options = {
        hostname: "hydro-api.tung-youngjin.workers.dev",
        path: "/api/getmn.aspx?key=mocnhttcphong;",
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0" }
    };

    const retry = () => {
        if (retryCount < MAX_RETRIES) {
            console.log(`🔄 Thử lại API ${retryCount + 1}/${MAX_RETRIES} sau ${RETRY_DELAY / 1000}s...`);
            setTimeout(() => getWaterLevelFromAPI(retryCount + 1), RETRY_DELAY);
        } else {
            console.log("❌ Đã thử lại tối đa.");
        }
    };

    const req = https.request(options, response => {
        let body = "";
        response.on("data", chunk => { body += chunk; });

        response.on("end", async () => {
            const trimmedBody = body.trim();

            if (trimmedBody === "not.working") {
                console.log("⚠️ API đang không hoạt động.");
                return;
            }

            if (trimmedBody.startsWith("not.working") || trimmedBody.startsWith("<!DOCTYPE html")) {
                console.log("⚠️ API không trả dữ liệu trạm.");
                retry();
                return;
            }

            const lines = body.split(/<br\s*\/?>/i);
            const newStationData = [];

            for (const line of lines) {
                if (!line.includes(";")) continue;
                const parts = line.split(";");
                const stationId = parts[0];
                const date = parts[1];
                const time = parts[2];
                const valueCm = Number(parts[3].replace("value=", ""));
                const waterLevel = Number((valueCm / 100).toFixed(2));

                newStationData.push({
                    stationId,
                    stationName: STATION_NAMES[stationId] || stationId,
                    date,
                    time,
                    timestamp: `${date.split("/")[2]}-${date.split("/")[1]}-${date.split("/")[0]}T${time}:00`,
                    waterLevel
                });
            }

            const trulyNewData = await filterNewStationData(newStationData);
            if (trulyNewData.length > 0) {
                await saveStationDataToDatabase(trulyNewData);
            } else {
                console.log("API có phản hồi nhưng chưa có dữ liệu mới.");
            }
        });
    });

    req.on("error", error => {
        console.error("❌ Lỗi HTTP:", error.message);
        retry();
    });

    req.setTimeout(5000, () => {
        console.log("⏱️ API timeout sau 5 giây.");
        req.destroy();
    });

    req.end();
}

// ========================================
// SCHEDULER
// ========================================

let lastAPISlot = null;

function getCurrentAPISlot(now) {
    const apiMinutes = [2, 12, 22, 32, 42, 52];
    const currentMinute = now.getMinutes();
    let slotMinute = null;

    for (const minute of apiMinutes) {
        if (currentMinute >= minute) slotMinute = minute;
    }
    if (slotMinute === null) slotMinute = 52;

    const slotTime = new Date(now);
    if (currentMinute < 2) slotTime.setHours(now.getHours() - 1);
    slotTime.setMinutes(slotMinute, 0, 0);

    return slotTime;
}

function scheduleNextAPI() {
    const now = new Date();
    const currentSlot = getCurrentAPISlot(now);
    const slotKey = currentSlot.getTime();

    if (lastAPISlot === null) {
        lastAPISlot = slotKey;
        console.log("Khởi động Scheduler. Mốc API hiện tại:", currentSlot.toLocaleTimeString("vi-VN"));
        return;
    }

    if (slotKey > lastAPISlot) {
        console.log("Phát hiện mốc API mới:", currentSlot.toLocaleTimeString("vi-VN"));
        getWaterLevelFromAPI();
        lastAPISlot = slotKey;
    }
}

// ========================================
// KHỞI ĐỘNG
// ========================================

async function startup() {
    console.log("HydroMonitoring Backend đang khởi động...");
    await initializeDatabase();
    getWaterLevelFromAPI();
    setInterval(scheduleNextAPI, 5000);
    scheduleNextAPI();
}

startup();

// ========================================
// API ROUTES
// ========================================

app.get("/", (req, res) => {
    res.send("Xin chào từ HydroMonitoring Backend!");
});

app.get("/api/stations", async (req, res) => {
    try {
        const stations = STATIONS.map(station => ({ ...station }));

        for (const station of stations) {
            const historyResult = await pool.query(`
                SELECT time, water_level AS "waterLevel", timestamp
                FROM water_levels
                WHERE station_id = $1
                AND timestamp >= NOW() - INTERVAL '24 hours'
                ORDER BY timestamp ASC
            `, [station.stationId]);

            const latestResult = await pool.query(`
                SELECT water_level AS "waterLevel", timestamp
                FROM water_levels
                WHERE station_id = $1
                ORDER BY timestamp DESC
                LIMIT 1
            `, [station.stationId]);

            const latest = latestResult.rows[0];
            station.waterLevel = latest ? latest.waterLevel : null;
            station.status = latest ? "Đang hoạt động" : "Mất kết nối";
            station.history = historyResult.rows;
        }

        res.json(stations);
    } catch (error) {
        console.error("Lỗi /api/stations:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ HydroMonitoring Server đang chạy tại http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
    console.log("Đóng kết nối database...");
    await pool.end();
    process.exit(0);
});