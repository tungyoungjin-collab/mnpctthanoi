const express = require("express");
const cors = require("cors");
const https = require("https");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Phục vụ luôn phần frontend tĩnh (index.html, style.css, script36.js, ...)
// nằm ở thư mục cha của backend/ -> chỉ cần 1 server, 1 URL duy nhất khi deploy.
app.use(express.static(path.join(__dirname, "..")));


// ========================================
// DATABASE
// ========================================

const db = new Database("hydro.db");
console.log("Database SQLite đã sẵn sàng.");

db.exec(`
    CREATE TABLE IF NOT EXISTS water_levels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        station_name TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        water_level REAL NOT NULL
    )
`);

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_station_timestamp
    ON water_levels (station_id, timestamp)
`);

const insertWaterLevel = db.prepare(`
    INSERT OR IGNORE INTO water_levels (
        station_id, station_name, date, time, timestamp, water_level
    )
    VALUES (?, ?, ?, ?, ?, ?)
`);

function saveStationDataToDatabase(data) {
    for (const station of data) {
        insertWaterLevel.run(
            station.stationId,
            station.stationName,
            station.date,
            station.time,
            station.timestamp,
            station.waterLevel
        );
    }

    console.log(`Đã lưu ${data.length} trạm vào database.`);
}

// Chỉ giữ lại các bản ghi mới hơn bản ghi mới nhất đã có trong DB của từng trạm
function filterNewStationData(data) {
    const newData = [];

    for (const station of data) {
        const latest = db.prepare(`
            SELECT timestamp
            FROM water_levels
            WHERE station_id = ?
            ORDER BY timestamp DESC
            LIMIT 1
        `).get(station.stationId);

        if (!latest || station.timestamp > latest.timestamp) {
            newData.push(station);
        }
    }

    return newData;
}


// ========================================
// DANH SÁCH TRẠM (mã, tên, toạ độ)
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

// Thứ tự trạm dùng khi duyệt tìm dữ liệu bị thiếu (giữ nguyên thứ tự đang dùng trong DB/báo cáo)
const stationIds = [
    "F01391", "F01532", "F01247", "F01771", "F01540", "F01254", "F01215",
    "F02031", "F01812", "F01905", "F01223", "F01238", "F01559", "F01828"
];


// ========================================
// LẤY DỮ LIỆU TỪ API NGUỒN (hydro-api)
// ========================================

let stationData = [];
let stationHistory = [];

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
            console.log("❌ Đã thử lại tối đa. Bỏ qua lần lấy dữ liệu này.");
        }
    };

    const req = https.request(options, response => {
        let body = "";
        response.on("data", chunk => { body += chunk; });

        response.on("end", () => {
            const trimmedBody = body.trim();

            // API báo không hoạt động: bỏ qua lần lấy dữ liệu này, không thử lại
            if (trimmedBody === "not.working") {
                console.log("⚠️ API đang không hoạt động (not.working).");
                return;
            }

            // API không trả đúng dữ liệu trạm (vd trả về trang lỗi HTML): thử lại
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

            const trulyNewData = filterNewStationData(newStationData);

            if (trulyNewData.length > 0) {
                stationData = trulyNewData;
                stationHistory.push(...trulyNewData);
                saveStationDataToDatabase(trulyNewData);
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
// PHÁT HIỆN MỐC DỮ LIỆU BỊ THIẾU (mỗi 10 phút/mốc)
// ========================================

function findMissingData(date) {
    const results = [];
    const now = new Date();
    const safeTime = new Date(now.getTime() - 3 * 60 * 1000);

    const [day, month, year] = date.split("/");
    const endOfDay = new Date(Number(year), Number(month) - 1, Number(day), 23, 50, 0);

    const isToday =
        date === `${String(now.getDate()).padStart(2, "0")}/` +
            `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    const endTime = isToday ? safeTime : endOfDay;

    for (const stationId of stationIds) {
        const rows = db.prepare(`
            SELECT station_id, station_name, timestamp
            FROM water_levels
            WHERE date = ? AND station_id = ?
            ORDER BY timestamp
        `).all(date, stationId);

        const missingTimes = [];

        for (let i = 1; i < rows.length; i++) {
            const previous = new Date(rows[i - 1].timestamp);
            const current = new Date(rows[i].timestamp);
            let expected = new Date(previous.getTime() + 10 * 60000);

            while (expected < current) {
                missingTimes.push(expected.toISOString());
                expected = new Date(expected.getTime() + 10 * 60000);
            }
        }

        if (rows.length > 0) {
            let expected = new Date(rows[rows.length - 1].timestamp);
            expected = new Date(expected.getTime() + 10 * 60000);

            while (expected <= endTime) {
                missingTimes.push(expected.toISOString());
                expected = new Date(expected.getTime() + 10 * 60000);
            }
        } else {
            missingTimes.push("Không có dữ liệu");
        }

        results.push({
            stationId,
            stationName: rows.length > 0 ? rows[0].station_name : stationId,
            missingTimes
        });
    }

    return results;
}

function getMissingDataFormatted(date) {
    const data = findMissingData(date);

    return data.map(station => ({
        stationId: station.stationId,
        stationName: station.stationName,
        totalMissing: station.missingTimes.length,
        missingTimes: station.missingTimes.map(time => {
            if (time === "Không có dữ liệu") {
                return time;
            }

            const vietnamTime = new Date(
                new Date(time).toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
            );

            const day = String(vietnamTime.getDate()).padStart(2, "0");
            const month = String(vietnamTime.getMonth() + 1).padStart(2, "0");
            const year = vietnamTime.getFullYear();
            const hour = String(vietnamTime.getHours()).padStart(2, "0");
            const minute = String(vietnamTime.getMinutes()).padStart(2, "0");

            return `${day}/${month}/${year} ${hour}:${minute}`;
        })
    }));
}


// ========================================
// TIỆN ÍCH DÙNG CHUNG CHO CÁC ROUTE
// ========================================

const DATE_DDMMYYYY_RE = /^\d{2}\/\d{2}\/\d{4}$/;

// Kiểm tra ngày/tháng/năm có tạo thành một ngày thật (vd: chặn 31/02/2026)
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

// Khoảng trống > 10 phút giữa các bản ghi liên tiếp (rows phải đã sắp theo timestamp)
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
// LỊCH TỰ ĐỘNG GỌI API NGUỒN
// (API nguồn cập nhật vào các phút :02 :12 :22 :32 :42 :52 mỗi giờ)
// ========================================

let lastAPISlot = null;

function getCurrentAPISlot(now) {
    const apiMinutes = [2, 12, 22, 32, 42, 52];
    const currentMinute = now.getMinutes();

    let slotMinute = null;
    for (const minute of apiMinutes) {
        if (currentMinute >= minute) {
            slotMinute = minute;
        }
    }
    if (slotMinute === null) {
        slotMinute = 52;
    }

    const slotTime = new Date(now);
    if (currentMinute < 2) {
        slotTime.setHours(now.getHours() - 1);
    }
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

        // Ghi nhận các mốc bị bỏ lỡ (nếu server bị treo/ngủ một lúc)
        const missedSlots = [];
        let nextSlot = new Date(lastAPISlot);
        nextSlot.setMinutes(nextSlot.getMinutes() + 10);

        while (nextSlot.getTime() < slotKey) {
            missedSlots.push(new Date(nextSlot));
            nextSlot.setMinutes(nextSlot.getMinutes() + 10);
        }

        if (missedSlots.length > 0) {
            console.log("Các mốc API bị bỏ lỡ:", missedSlots.map(s => s.toLocaleTimeString("vi-VN")));
        }

        getWaterLevelFromAPI();
        lastAPISlot = slotKey;
    }
}


// ========================================
// KHỞI ĐỘNG
// ========================================

console.log("HydroMonitoring Backend đang khởi động...");

getWaterLevelFromAPI();

setInterval(scheduleNextAPI, 5000);
scheduleNextAPI();


// ========================================
// API ROUTES
// ========================================

app.get("/", (req, res) => {
    res.send("Xin chào từ HydroMonitoring Backend!");
});

app.get("/api/water-level", (req, res) => {
    res.json(stationData);
});

app.get("/api/database-test", (req, res) => {
    const rows = db.prepare(`
        SELECT * FROM water_levels ORDER BY id ASC
    `).all();

    res.json(rows);
});

app.get("/api/database-check", (req, res) => {
    const rows = db.prepare(`
        SELECT station_id, station_name, date, time, timestamp, water_level
        FROM water_levels
        ORDER BY timestamp ASC
    `).all();

    res.json({ total: rows.length, data: rows });
});

app.get("/api/latest", (req, res) => {
    const rows = db.prepare(`
        SELECT
            station_id AS stationId,
            station_name AS stationName,
            date, time, timestamp,
            water_level AS waterLevel
        FROM water_levels
        WHERE (station_id, timestamp) IN (
            SELECT station_id, MAX(timestamp)
            FROM water_levels
            GROUP BY station_id
        )
        ORDER BY station_id
    `).all();

    const result = rows.map(station => {
        const diffMinutes = (Date.now() - new Date(station.timestamp).getTime()) / 60000;
        const status = diffMinutes <= 20 ? "Đang hoạt động" : "Mất kết nối";
        return { ...station, status };
    });

    res.json(result);
});

app.get("/api/statistics", (req, res) => {
    const rows = db.prepare(`
        SELECT
            station_id AS stationId,
            station_name AS stationName,
            COUNT(*) AS totalRecords,
            MIN(timestamp) AS firstRecord,
            MAX(timestamp) AS lastRecord
        FROM water_levels
        GROUP BY station_id
        ORDER BY station_id
    `).all();

    res.json(rows);
});

app.get("/api/statistics/today", (req, res) => {
    const todayString = getTodayDateString();

    const rows = db.prepare(`
        SELECT
            station_id AS stationId,
            station_name AS stationName,
            COUNT(*) AS totalRecords,
            MIN(timestamp) AS firstRecord,
            MAX(timestamp) AS lastRecord
        FROM water_levels
        WHERE timestamp LIKE ?
        GROUP BY station_id
        ORDER BY station_id
    `).all(`${todayString}%`);

    res.json(rows);
});

app.get("/api/statistics/today/detail", (req, res) => {
    const todayString = getTodayDateString();

    const rows = db.prepare(`
        SELECT
            station_id AS stationId,
            station_name AS stationName,
            date, time, timestamp,
            water_level AS waterLevel
        FROM water_levels
        WHERE timestamp LIKE ?
        ORDER BY station_id, timestamp ASC
    `).all(`${todayString}%`);

    res.json(rows);
});

app.get("/api/statistics/today/gaps", (req, res) => {
    const stationId = req.query.station;

    if (!stationId) {
        return res.status(400).json({ error: "Vui lòng truyền mã trạm." });
    }

    const todayString = getTodayDateString();

    const rows = db.prepare(`
        SELECT station_id AS stationId, station_name AS stationName, timestamp
        FROM water_levels
        WHERE station_id = ? AND timestamp LIKE ?
        ORDER BY timestamp ASC
    `).all(stationId, `${todayString}%`);

    res.json({
        stationId,
        totalRecords: rows.length,
        gaps: computeGaps(rows)
    });
});

app.get("/api/water-history", (req, res) => {
    const stationId = req.query.station;

    const baseSelect = `
        SELECT
            station_id AS stationId,
            station_name AS stationName,
            date, time, timestamp,
            water_level AS waterLevel
        FROM water_levels
    `;

    const rows = stationId
        ? db.prepare(`${baseSelect} WHERE station_id = ? ORDER BY timestamp ASC`).all(stationId)
        : db.prepare(`${baseSelect} ORDER BY timestamp ASC`).all();

    res.json(rows);
});

app.get("/api/water-gaps", (req, res) => {
    const date = req.query.date;

    if (!date || !DATE_DDMMYYYY_RE.test(date)) {
        return res.status(400).json({ error: "Ngày không hợp lệ. Định dạng đúng: DD/MM/YYYY" });
    }

    const [day, month, year] = date.split("/");

    if (!isRealCalendarDate(day, month, year)) {
        return res.status(400).json({ error: "Ngày không tồn tại." });
    }

    res.json(getMissingDataFormatted(date));
});

app.get("/api/water-levels", (req, res) => {
    const stationId = req.query.station;
    const date = req.query.date;

    if (date && !DATE_DDMMYYYY_RE.test(date)) {
        return res.status(400).json({ error: "Ngày không hợp lệ. Định dạng đúng: DD/MM/YYYY" });
    }

    if (date) {
        const [day, month, year] = date.split("/");
        if (!isRealCalendarDate(day, month, year)) {
            return res.status(400).json({ error: "Ngày không tồn tại." });
        }
    }

    let sql = `
        SELECT
            station_id AS stationId,
            station_name AS stationName,
            date, time, timestamp,
            water_level AS waterLevel
        FROM water_levels
        WHERE 1 = 1
    `;

    const params = [];

    if (stationId) {
        sql += " AND station_id = ?";
        params.push(stationId);
    }

    if (date) {
        sql += " AND date = ?";
        params.push(date);
    }

    sql += " ORDER BY timestamp ASC";

    res.json(db.prepare(sql).all(...params));
});

app.get("/api/water-levels/latest", (req, res) => {
    const stationId = req.query.station;

    if (stationId && !stationIds.includes(stationId)) {
        return res.status(404).json({ error: "Không tìm thấy trạm." });
    }

    if (stationId) {
        const rows = db.prepare(`
            SELECT
                station_id AS stationId,
                station_name AS stationName,
                date, time, timestamp,
                water_level AS waterLevel
            FROM water_levels
            WHERE station_id = ?
            ORDER BY timestamp DESC
            LIMIT 1
        `).all(stationId);

        if (rows.length === 0) {
            return res.json({ stationId, stationName: stationId, data: null });
        }

        return res.json({ data: rows });
    }

    const rows = db.prepare(`
        SELECT
            station_id AS stationId,
            station_name AS stationName,
            date, time, timestamp,
            water_level AS waterLevel
        FROM water_levels
        WHERE timestamp = (
            SELECT MAX(timestamp)
            FROM water_levels AS w2
            WHERE w2.station_id = water_levels.station_id
        )
        ORDER BY station_id
    `).all();

    res.json({ data: rows });
});

app.get("/api/stations", (req, res) => {
    const stations = STATIONS.map(station => ({ ...station }));

    for (const station of stations) {
        // Lịch sử 24 giờ gần nhất
        const history = db.prepare(`
            SELECT time, water_level AS waterLevel, timestamp
            FROM water_levels
            WHERE station_id = ?
            AND timestamp >= datetime('now', '-24 hours', 'localtime')
            ORDER BY timestamp ASC
        `).all(station.stationId);

        // Bản ghi mới nhất -> mực nước + trạng thái hiện tại
        const latest = db.prepare(`
            SELECT water_level AS waterLevel, timestamp
            FROM water_levels
            WHERE station_id = ?
            ORDER BY timestamp DESC
            LIMIT 1
        `).get(station.stationId);

        station.waterLevel = latest ? latest.waterLevel : null;
        station.status = latest ? "Đang hoạt động" : "Mất kết nối";
        station.history = history;
    }

    res.json(stations);
});

app.get("/api/water-levels/latest-time", (req, res) => {
    const rows = db.prepare(`
        SELECT
            station_id AS stationId,
            station_name AS stationName,
            MAX(timestamp) AS lastUpdate
        FROM water_levels
        GROUP BY station_id
        ORDER BY station_id
    `).all();

    res.json({ data: rows });
});

app.get("/api/statistics/today/summary", (req, res) => {
    const summaryStations = [
        { stationId: "F01391", stationName: "Hà Nội" },
        { stationId: "F01559", stationName: "Hưng Yên" },
        { stationId: "F01812", stationName: "Nam Định" }
    ];

    const todayString = getTodayDateString();

    const summary = summaryStations.map(station => {
        const rows = db.prepare(`
            SELECT timestamp
            FROM water_levels
            WHERE station_id = ? AND timestamp LIKE ?
            ORDER BY timestamp ASC
        `).all(station.stationId, `${todayString}%`);

        const gaps = computeGaps(rows);

        return {
            stationId: station.stationId,
            stationName: station.stationName,
            totalRecords: rows.length,
            gapCount: gaps.length,
            gaps
        };
    });

    res.json(summary);
});


app.listen(PORT, () => {
    console.log(`HydroMonitoring Server đang chạy tại http://localhost:${PORT}`);
});
