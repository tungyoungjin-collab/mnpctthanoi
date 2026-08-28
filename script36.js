// Đường dẫn tương đối: hoạt động đúng cả khi chạy local (node server.js)
// lẫn khi đã deploy lên host thật, vì frontend và API cùng chung 1 domain.
const API_URL = "/api/stations";
const REFRESH_INTERVAL_MS = 60000;
 
// Dữ liệu 14 trạm mới nhất (được cập nhật mỗi lần fetch, kể cả khi tự động làm mới)
let allStationsData = [];
let waterChart = null;
 
 
// ========================================
// SỐ NGÀY HIỂN THỊ TRÊN BIỂU ĐỒ
// (theo lựa chọn ở bộ lọc thời gian)
// ========================================
 
function getChartDays() {
    const timeFilter = document.getElementById("timeFilter");
    const value = timeFilter ? timeFilter.value : "24";
 
    switch (value) {
        case "24": return 1;
        case "7": return 7;
        case "15": return 15;
        case "30": return 30;
        default: return 1;
    }
}
 
 
// ========================================
// MỐC THỜI GIAN MỚI NHẤT DÙNG CHUNG CHO 14 TRẠM
// ========================================
 
function getCommonLatestTime(data) {
    const timestamps = data
        .flatMap(station => station.history ? station.history.map(item => item.timestamp) : [])
        .map(timestamp => new Date(timestamp).getTime())
        .filter(time => !isNaN(time));
 
    if (timestamps.length === 0) {
        return null;
    }
 
    return new Date(Math.max(...timestamps));
}
 
 
// ========================================
// TẠO DỮ LIỆU BIỂU ĐỒ: CHỈ LẤY GIỜ TRÒN (:00)
// BỎ QUA 10', 20', 30', ... ĐỂ HIỂN THỊ THEO GIỜ
// ========================================
 
function createChartData(data, history, days) {

    const latestTime = getCommonLatestTime(data);

    if (!latestTime) {
        return {
            labels: [],
            values: [],
            history24h: [],
            timeline: [],
            latestTime: null,
            startTime: null
        };
    }

    const startTime = new Date(latestTime.getTime() - days * 24 * 60 * 60 * 1000);

    const history24h = (history || []).filter(item => {
        const itemTime = new Date(item.timestamp);
        return itemTime >= startTime && itemTime <= latestTime;
    });

    // ========================================
    // TẠO TIMELINE: mỗi giờ từ start đến end
    // ========================================
    const timeline = [];
    const firstHour = new Date(startTime);
    firstHour.setMinutes(0, 0, 0);

    const totalHours = days * 24;

    for (let i = 0; i <= totalHours; i++) {
        const time = new Date(firstHour);
        time.setHours(firstHour.getHours() + i);
        timeline.push(time);
    }

    // ========================================
    // TẠO LABELS
    // ========================================
    const labels = timeline.map(date => {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        return `${day}/${month} ${hours}:00`;
    });

    // ========================================
    // TẠO MAP: CHỈ NHẬN BẢN GHI ĐÚNG HH:00 (Vietnam time)
    // ========================================
    const historyMap = new Map();

    history24h.forEach(item => {
        const utcDate = new Date(item.timestamp);
        const vietnamDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);

        // Chỉ nhận phút 00
        if (vietnamDate.getUTCMinutes() !== 0) {
            return;
        }

        // Key: YYYY-MM-DD HH:00 (Vietnam time)
        const key =
            vietnamDate.getUTCFullYear() + "-" +
            String(vietnamDate.getUTCMonth() + 1).padStart(2, "0") + "-" +
            String(vietnamDate.getUTCDate()).padStart(2, "0") + " " +
            String(vietnamDate.getUTCHours()).padStart(2, "0") + ":00";

        historyMap.set(key, item.waterLevel);
    });

    // ========================================
    // GÁN MỰC NƯỚC VÀO TIMELINE → null nếu thiếu
    // ========================================
    const values = timeline.map(time => {
        const vietnamTime = new Date(time.getTime() + 7 * 60 * 60 * 1000);
        
        const key =
            vietnamTime.getUTCFullYear() + "-" +
            String(vietnamTime.getUTCMonth() + 1).padStart(2, "0") + "-" +
            String(vietnamTime.getUTCDate()).padStart(2, "0") + " " +
            String(vietnamTime.getUTCHours()).padStart(2, "0") + ":00";

        return historyMap.has(key) ? historyMap.get(key) : null;
    });

    return { labels, values, history24h, timeline, latestTime, startTime };
}
 
 

 
 
// ========================================
// TIỆN ÍCH HIỂN THỊ
// ========================================
 
function findStation(data, stationId) {
    return data.find(station => station.stationId === stationId);
}
 
function getStatusClass(status) {
    if (status === "Đang hoạt động") return "status-normal";
    if (status === "Cảnh báo") return "status-warning";
    return "status-danger";
}
 
function formatUpdateTime(record) {
    const date = new Date(record.timestamp);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `Cập nhật lúc: ${record.time} ngày ${day}/${month}/${year}`;
}
 
// Cập nhật khối thông tin trạm (mực nước, trạng thái, thời gian cập nhật).
function updateStationCard(station, { updateName = true, updateStatusClass = true } = {}) {
 
    document.getElementById("water-level").textContent = station.waterLevel + " m";
    document.getElementById("station-status").textContent = station.status;
 
    if (updateName) {
        document.getElementById("station-name").textContent = station.stationName;
    }
 
    if (updateStatusClass) {
        document.getElementById("station-status").className = getStatusClass(station.status);
    }
 
    const latestRecord = station.history[station.history.length - 1];
    document.getElementById("update-time").textContent = formatUpdateTime(latestRecord);
}
 
function buildChartConfig(chartData, stationName) {
    return {
        type: "line",
        data: {
            labels: chartData.labels,
            datasets: [{
                label: "Mực nước (m)",
                data: chartData.values,
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 6,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                spanGaps: false
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: "Diễn biến mực nước - Trạm " + stationName }
            },
            scales: {
                y: { title: { display: true, text: "Mực nước (m)" } },
                x: { title: { display: true, text: "Thời gian" }, ticks: { autoSkip: true, maxTicksLimit: 12 } }
            }
        }
    };
}

function applyChartData(chartData, stationName) {
    waterChart.data.labels = chartData.labels;
    waterChart.data.datasets[0].data = chartData.values;
    waterChart.options.plugins.title.text = "Diễn biến mực nước - Trạm " + stationName;
    waterChart.update();
}
 
 
// ========================================
// LẦN TẢI ĐẦU TIÊN
// ========================================
 
fetch(API_URL)
    .then(response => response.json())
    .then(data => {
 
        allStationsData = data;
 
        // Gửi dữ liệu 14 trạm sang Windy (hoặc chờ Windy khởi tạo xong)
        if (window.showAllStationsOnWindy) {
            window.showAllStationsOnWindy(data);
        } else {
            window.pendingWindyStations = data;
        }
 
        const stationSelect = document.getElementById("station");
        const timeFilter = document.getElementById("timeFilter");
 
        const currentStation = findStation(data, stationSelect.value);
 
        updateStationCard(currentStation);
 
        const chartData = createChartData(data, currentStation.history, getChartDays());
 
        const ctx = document.getElementById("waterChart");
        waterChart = new Chart(ctx, buildChartConfig(chartData, currentStation.stationName));
 
        // Đổi khoảng thời gian biểu đồ
        timeFilter.addEventListener("change", function () {
            const station = findStation(allStationsData, stationSelect.value);
            if (!station) return;
 
            const updatedChartData = createChartData(allStationsData, station.history, getChartDays());
            applyChartData(updatedChartData, station.stationName);
        });
 
        // Đổi trạm đang xem
        stationSelect.addEventListener("change", function () {
            const station = findStation(allStationsData, stationSelect.value);
            if (!station) return;
 
            const updatedChartData = createChartData(allStationsData, station.history || [], getChartDays());
            applyChartData(updatedChartData, station.stationName);
 
            updateStationCard(station);
 
            // Đưa bản đồ Windy về vị trí trạm vừa chọn
            if (window.windyMap) {
                window.windyMap.map.setView([station.lat, station.lon], 12);
            }
        });
 
    })
    .catch(error => {
        console.error("Lỗi API:", error);
    });
 
 
// ========================================
// TỰ ĐỘNG LÀM MỚI DỮ LIỆU MỖI 60 GIÂY
// ========================================
 
setInterval(() => {
 
    fetch(API_URL)
        .then(response => response.json())
        .then(data => {
 
            allStationsData = data;
 
            const stationSelect = document.getElementById("station");
            const currentStation = findStation(data, stationSelect.value);
 
            if (!currentStation) {
                console.error("Không tìm thấy trạm:", stationSelect.value);
                return;
            }
 
            updateStationCard(currentStation, { updateName: false, updateStatusClass: false });
 
            const chartData = createChartData(data, currentStation.history, getChartDays());
            applyChartData(chartData, currentStation.stationName);
        })
        .catch(error => {
            console.error("Lỗi cập nhật API:", error);
        });
 
}, REFRESH_INTERVAL_MS);